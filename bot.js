require('dotenv').config()
const { Telegraf, Markup } = require('telegraf')
const crypto = require('crypto')

// Инициализация бота
const bot = new Telegraf(process.env.BOT_TOKEN)

// Админы (учителя) из переменных окружения
const ADMIN_IDS = process.env.ADMIN_CHAT_IDS
    ? process.env.ADMIN_CHAT_IDS.split(',').map(id => parseInt(id.trim()))
    : []
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default_encryption_key' // Добавлено значение по умолчанию

// Проверка конфигурации при запуске
if (!process.env.BOT_TOKEN) {
    console.error('❌ ОШИБКА: BOT_TOKEN не найден в переменных окружения')
    process.exit(1)
}

if (!process.env.ADMIN_CHAT_IDS) {
    console.error('❌ ОШИБКА: ADMIN_CHAT_IDS не найден в переменных окружения')
    process.exit(1)
}

if (ADMIN_IDS.length === 0) {
    console.error('❌ ОШИБКА: Не удалось парсить ADMIN_CHAT_IDS')
    process.exit(1)
}

// Временное хранилище данных
const tempData = {
    lastMessageTime: new Map(),
    pendingMessages: new Map(),
    messageCounter: 0,
    awaitingResponse: new Map(),
}

// Функция для экранирования Markdown символов
function escapeMarkdown(text) {
    return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1')
}

// Функция шифрования
function encryptData(text) {
    const cipher = crypto.createCipher('aes-256-cbc', ENCRYPTION_KEY)
    let encrypted = cipher.update(text, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    return encrypted
}

// Функция дешифрования
function decryptData(encryptedText) {
    const decipher = crypto.createDecipher('aes-256-cbc', ENCRYPTION_KEY)
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
}

// Проверка является ли пользователь админом
function isAdmin(userId) {
    return ADMIN_IDS.includes(userId)
}

// Проверка задержки сообщений (30 секунд)
function canSendMessage(userId) {
    const lastTime = tempData.lastMessageTime.get(userId)
    if (!lastTime) return true
    return Date.now() - lastTime >= 30000
}

// Получение времени до следующего сообщения
function getTimeUntilNextMessage(userId) {
    const lastTime = tempData.lastMessageTime.get(userId)
    if (!lastTime) return 0
    const timeLeft = 30000 - (Date.now() - lastTime)
    return Math.max(0, Math.ceil(timeLeft / 1000))
}

// Форматирование времени на узбекском
function formatTime(seconds) {
    if (seconds < 60) return `${seconds} soniya`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes} daqiqa ${remainingSeconds} soniya`
}

// Генерация уникального ID для сообщения
function generateMessageId() {
    return ++tempData.messageCounter
}

// Middleware для логирования
bot.use(async (ctx, next) => {
    const userId = ctx.from?.id
    const userType = isAdmin(userId) ? 'ADMIN' : 'STUDENT'
    const action = ctx.message?.text || ctx.callbackQuery?.data || 'unknown'

    console.log(`[${new Date().toISOString()}] ${userType} ${userId}: ${action}`)
    return next()
})

// Команда для получения chat_id
bot.command('myid', async ctx => {
    const userId = ctx.from.id
    const chatId = ctx.chat.id
    const username = ctx.from.username || 'отсутствует'
    const firstName = ctx.from.first_name || 'отсутствует'

    await ctx.reply(
        `🆔 *Ваши данные:*\n\n` +
        `👤 User ID: \`${userId}\`\n` +
        `💬 Chat ID: \`${chatId}\`\n` +
        `👤 Username: @${username}\n` +
        `📝 Имя: ${firstName}\n\n` +
        `📋 *Для настройки в качестве админа используйте Chat ID*`,
        { parse_mode: 'Markdown' }
    )
})

// Команда для проверки статуса админа
bot.command('status', async ctx => {
    const userId = ctx.from.id
    const chatId = ctx.chat.id
    const isUserAdmin = isAdmin(userId)
    const isChatAdmin = isAdmin(chatId)

    await ctx.reply(
        `📊 *Статус пользователя:*\n\n` +
        `👤 User ID: ${userId}\n` +
        `💬 Chat ID: ${chatId}\n` +
        `🔑 Админ (по User ID): ${isUserAdmin ? '✅' : '❌'}\n` +
        `🔑 Админ (по Chat ID): ${isChatAdmin ? '✅' : '❌'}\n\n` +
        `📋 *Настроенные админы:* ${ADMIN_IDS.join(', ')}`,
        { parse_mode: 'Markdown' }
    )
})

bot.start(async ctx => {
    const userId = ctx.from.id
    const chatId = ctx.chat.id

    if (isAdmin(userId) || isAdmin(chatId)) {
        await ctx.replyWithMarkdown(
            `┌─────────────────────┐\n` +
            `│ 🎓 *Добро пожаловать, учитель!* │\n` +
            `└─────────────────────┘\n\n` +
            `📊 *Панель управления активна*\n\n` +
            `🆔 *Ваш Chat ID:* \`${chatId}\``
        )
    } else {
        await ctx.replyWithMarkdown(
            `┌─────────────────┐\n` +
            `│ 🌟 *Assalomu alaykum!* 🌟  │\n` +
            `└─────────────────┘\n\n` +
            `📚 *O'qituvchi-O'quvchi Bot*ga xush kelibsiz!\n\n` +
            `🔹 *Savol berish uchun tugmani bosing:*`,
            Markup.inlineKeyboard([
                [Markup.button.callback('✍️ Savol berish', 'ask_question')],
            ])
        )
    }
})

// Задать вопрос
bot.action('ask_question', async ctx => {
    const userId = ctx.from.id

    if (isAdmin(userId)) {
        await ctx.answerCbQuery('❌ Вы администратор!', { show_alert: true })
        return
    }

    if (!canSendMessage(userId)) {
        const timeLeft = getTimeUntilNextMessage(userId)
        await ctx.answerCbQuery(
            `⏰ Keyingi savol berish uchun ${formatTime(timeLeft)} kutishingiz kerak!`,
            { show_alert: true }
        )
        return
    }

    await ctx.editMessageText(
        `┌─────────────────────┐\n` +
        `│ ✍️ *Savolingizni yozing* │\n` +
        `└─────────────────────┘\n\n` +
        `📝 O'qituvchiga yo'naltirmoqchi bo'lgan savolingizni yozing.`,
        {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '❌ Bekor qilish', callback_data: 'cancel_question' }],
                ],
            },
        }
    )

    tempData.pendingMessages.set(userId, {
        status: 'waiting_question',
        timestamp: Date.now(),
    })
})

// Отмена вопроса
bot.action('cancel_question', async ctx => {
    const userId = ctx.from.id
    tempData.pendingMessages.delete(userId)

    await ctx.editMessageText(
        `┌─────────────────────┐\n` +
        `│ ❌ *Savol bekor qilindi* │\n` +
        `└─────────────────────┘\n\n` +
        `Yana savol berish uchun tugmani bosing:`,
        {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✍️ Savol berish', callback_data: 'ask_question' }],
                ],
            },
        }
    )
})

// Обработка кнопки ответа
bot.action(/reply_(\d+)/, async ctx => {
    const messageId = parseInt(ctx.match[1])
    const adminId = ctx.from.id

    if (!isAdmin(adminId)) {
        await ctx.answerCbQuery('❌ Нет доступа!', { show_alert: true })
        return
    }

    const awaitingResponse = tempData.awaitingResponse.get(adminId)
    if (!awaitingResponse || awaitingResponse.messageId !== messageId) {
        await ctx.answerCbQuery('❌ Сообщение не найдено или устарело!', {
            show_alert: true,
        })
        return
    }

    const studentInfo = awaitingResponse.studentUsername !== "yo'q"
        ? `${escapeMarkdown(awaitingResponse.studentName)} (@${escapeMarkdown(awaitingResponse.studentUsername)})`
        : escapeMarkdown(awaitingResponse.studentName)

    await ctx.editMessageText(
        `┌─────────────────────┐\n` +
        `│ ✍️ *Режим ответа*    │\n` +
        `└─────────────────────┘\n\n` +
        `👤 *От:* ${studentInfo}\n` +
        `💭 *Вопрос:*\n` +
        `\`\`\`\n${escapeMarkdown(awaitingResponse.originalQuestion)}\n\`\`\`\n\n` +
        `📝 *Напишите ваш ответ следующим сообщением*`,
        {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '❌ Отменить', callback_data: `cancel_reply_${messageId}` }],
                ],
            },
        }
    )

    await ctx.answerCbQuery('✍️ Напишите ответ следующим сообщением')
})

// Обработка отмены ответа
bot.action(/cancel_reply_(\d+)/, async ctx => {
    const messageId = parseInt(ctx.match[1])
    const adminId = ctx.from.id

    const awaitingResponse = tempData.awaitingResponse.get(adminId)
    if (awaitingResponse && awaitingResponse.messageId === messageId) {
        const studentInfo = awaitingResponse.studentUsername !== "yo'q"
            ? `${escapeMarkdown(awaitingResponse.studentName)} (@${escapeMarkdown(awaitingResponse.studentUsername)})`
            : escapeMarkdown(awaitingResponse.studentName)

        await ctx.editMessageText(
            `┌─────────────────────┐\n` +
            `│ 💬 *Новое сообщение* │\n` +
            `└─────────────────────┘\n\n` +
            `👤 *От:* ${studentInfo}\n` +
            `💭 *Сообщение:*\n` +
            `\`\`\`\n${escapeMarkdown(awaitingResponse.originalQuestion)}\n\`\`\``,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📝 Ответить', callback_data: `reply_${messageId}` }],
                    ],
                },
            }
        )

        await ctx.answerCbQuery('❌ Ответ отменён')
    }
})

// Обработка текстовых сообщений
bot.on('text', async ctx => {
    const userId = ctx.from.id
    const messageText = ctx.message.text

    if (isAdmin(userId)) {
        const awaitingResponse = tempData.awaitingResponse.get(userId)
        if (awaitingResponse) {
            await handleTeacherResponse(ctx, awaitingResponse, messageText)
            return
        }

        await ctx.reply(
            `┌─────────────────────┐\n` +
            `│ 🎓 *Панель администратора* │\n` +
            `└─────────────────────┘\n\n` +
            `🔄 *Ожидаю вопросы от учеников...*`,
            { parse_mode: 'Markdown' }
        )
        return
    }

    const pendingQuestion = tempData.pendingMessages.get(userId)
    if (!pendingQuestion || pendingQuestion.status !== 'waiting_question') {
        await ctx.reply(
            `┌─────────────────────┐\n` +
            `│ 💬 *Savol berish*    │\n` +
            `└─────────────────────┘\n\n` +
            `Savol berish uchun tugmani bosing:`,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✍️ Savol berish', callback_data: 'ask_question' }],
                    ],
                },
            }
        )
        return
    }

    if (!canSendMessage(userId)) {
        const timeLeft = getTimeUntilNextMessage(userId)
        await ctx.reply(
            `⏰ Keyingi savol berish uchun ${formatTime(timeLeft)} kutishingiz kerak!`
        )
        return
    }

    const messageId = generateMessageId()
    const studentName = ctx.from.first_name || "Noma'lum"
    const studentUsername = ctx.from.username || "yo'q"

    const messageData = {
        id: messageId,
        studentId: userId,
        studentName: studentName,
        studentUsername: studentUsername,
        text: messageText,
        timestamp: Date.now(),
        answered: false,
    }

    tempData.lastMessageTime.set(userId, Date.now())
    tempData.pendingMessages.delete(userId)

    let notificationsSent = 0
    let errors = []

    for (const adminId of ADMIN_IDS) {
        try {
            const escapedMessageText = escapeMarkdown(messageText)
            const escapedStudentName = escapeMarkdown(studentName)
            const escapedStudentUsername = escapeMarkdown(studentUsername)

            const studentInfo = studentUsername !== "yo'q"
                ? `${escapedStudentName} (@${escapedStudentUsername})`
                : escapedStudentName

            await bot.telegram.sendMessage(
                adminId,
                `┌─────────────────────┐\n` +
                `│ 💬 *Новое сообщение* │\n` +
                `└─────────────────────┘\n\n` +
                `👤 *От:* ${studentInfo}\n` +
                `💭 *Сообщение:*\n` +
                `\`\`\`\n${escapedMessageText}\n\`\`\``,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '📝 Ответить', callback_data: `reply_${messageId}` }],
                        ],
                    },
                }
            )

            tempData.awaitingResponse.set(adminId, {
                messageId: messageId,
                studentId: userId,
                studentName: studentName,
                studentUsername: studentUsername,
                originalQuestion: messageText,
                timestamp: Date.now(),
            })

            notificationsSent++
        } catch (error) {
            console.error(`Ошибка отправки админу ${adminId}:`, error.message)
            errors.push(`Admin ${adminId}: ${error.message}`)
        }
    }

    await ctx.reply(
        `┌─────────────────────┐\n` +
        `│ ✅ *Savolingiz yuborildi!* │\n` +
        `└─────────────────────┘\n\n` +
        `📤 *Savolingiz:*\n` +
        `\`\`\`\n${messageText}\n\`\`\`\n\n` +
        `📊 *Qabul qilgan o'qituvchilar:* ${notificationsSent}\n` +
        `⏰ *Keyingi savol:* 30 soniya kutish`,
        {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✍️ Yana savol berish', callback_data: 'ask_question' }],
                ],
            },
        }
    )
})

// Обработка ответа учителя
async function handleTeacherResponse(ctx, awaitingResponse, responseText) {
    const { messageId, studentId, studentName, studentUsername, originalQuestion } = awaitingResponse;

    try {
        // Экранируем текст для безопасного отображения
        const escapedOriginalQuestion = escapeMarkdown(originalQuestion);
        const escapedResponseText = escapeMarkdown(responseText);
        const escapedStudentName = escapeMarkdown(studentName);
        const escapedStudentUsername = studentUsername !== "yo'q" 
            ? escapeMarkdown(studentUsername) 
            : null;

        // Формируем сообщение для ученика
        const studentMessage = `
┌─────────────────────┐
│ 📨 *Javob keldi!*    │
└─────────────────────┘

❓ *Sizning savolingiz:*
\`\`\`
${escapedOriginalQuestion}
\`\`\`

👨‍🏫 *O'qituvchi javobi:*
\`\`\`
${escapedResponseText}
\`\`\`
        `.trim();

        // Отправляем ответ ученику
        await bot.telegram.sendMessage(
            studentId,
            studentMessage,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✍️ Yana savol berish', callback_data: 'ask_question' }],
                    ],
                },
            }
        );

        // Формируем информацию о студенте для отчета учителю
        const studentInfo = escapedStudentUsername 
            ? `${escapedStudentName} (@${escapedStudentUsername})` 
            : escapedStudentName;

        // Отправляем подтверждение учителю
        await ctx.replyWithMarkdown(`
┌─────────────────────┐
│ ✅ *Ответ отправлен!* │
└─────────────────────┘

👤 *Получатель:* ${studentInfo}
📤 *Ваш ответ:*
\`\`\`
${escapedResponseText}
\`\`\`
        `.trim());

        // Удаляем из ожидающих ответов
        tempData.awaitingResponse.delete(ctx.from.id);

    } catch (error) {
        console.error(`Ошибка отправки ответа ученику ${studentId}:`, error);
        
        // Определяем тип ошибки для более информативного сообщения
        let errorMessage;
        if (error.code === 403) {
            errorMessage = 'Ученик заблокировал бота или остановил чат.';
        } else if (error.code === 400) {
            errorMessage = 'Некорректный запрос. Возможно, неверный ID чата.';
        } else {
            errorMessage = 'Техническая ошибка при отправке сообщения.';
        }

        await ctx.replyWithMarkdown(`
❌ *Ошибка отправки!*

${errorMessage}

Попробуйте связаться с учеником другим способом.
        `.trim());

        // Удаляем недействительный ожидающий ответ
        tempData.awaitingResponse.delete(ctx.from.id);
    }
}

// Очистка старых данных
setInterval(() => {
    const now = Date.now()
    const tenMinutes = 10 * 60 * 1000

    for (const [key, value] of tempData.pendingMessages) {
        if (value.timestamp && now - value.timestamp > tenMinutes) {
            tempData.pendingMessages.delete(key)
        }
    }

    for (const [key, value] of tempData.awaitingResponse) {
        if (value.timestamp && now - value.timestamp > tenMinutes) {
            tempData.awaitingResponse.delete(key)
        }
    }
}, 10 * 60 * 1000)

// Обработка ошибок
bot.catch((err, ctx) => {
    console.error('Ошибка бота:', err)
    if (ctx.reply) {
        ctx.reply('❌ Произошла ошибка. Попробуйте позже.')
    }
})

// Запуск бота
bot.launch().then(() => {
    console.log('🚀 Бот запущен успешно!')
    console.log(`👥 Админы: ${ADMIN_IDS.join(', ')}`)
})

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))