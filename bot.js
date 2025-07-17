require('dotenv').config()
const { Telegraf, Markup } = require('telegraf')
const crypto = require('crypto')

// Инициализация бота
const bot = new Telegraf(process.env.BOT_TOKEN)

// Админы (учителя) из переменных окружения
const ADMIN_IDS = process.env.ADMIN_CHAT_IDS
    ? process.env.ADMIN_CHAT_IDS.split(',').map(id => parseInt(id.trim()))
    : []
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default_encryption_key'

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
    pendingMessages: new Map(),
    messageCounter: 0,
    awaitingResponse: new Map(),
    questionHistory: new Map(),
}

// Улучшенная функция escapeMarkdownV2
function escapeMarkdownV2(text) {
    if (!text) return '';
    return text.replace(/([_*[\]()~`>#+-=|{}.!])/g, '\\$1');
}

// Альтернативная функция для простого текста без Markdown
function plainText(text) {
    if (!text) return '';
    return text;
}

// Функции шифрования/дешифрования
function encryptData(text) {
    const cipher = crypto.createCipher('aes-256-cbc', ENCRYPTION_KEY)
    let encrypted = cipher.update(text, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    return encrypted
}

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
        `🆔 Ваши данные:\n\n` +
        `👤 User ID: ${userId}\n` +
        `💬 Chat ID: ${chatId}\n` +
        `👤 Username: @${username}\n` +
        `📝 Имя: ${firstName}\n\n` +
        `📋 Для настройки в качестве админа используйте Chat ID`
    )
})

// Команда для проверки статуса админа
bot.command('status', async ctx => {
    const userId = ctx.from.id
    const chatId = ctx.chat.id
    const isUserAdmin = isAdmin(userId)
    const isChatAdmin = isAdmin(chatId)

    await ctx.reply(
        `📊 Статус пользователя:\n\n` +
        `👤 User ID: ${userId}\n` +
        `💬 Chat ID: ${chatId}\n` +
        `🔑 Админ (по User ID): ${isUserAdmin ? '✅' : '❌'}\n` +
        `🔑 Админ (по Chat ID): ${isChatAdmin ? '✅' : '❌'}\n\n` +
        `📋 Настроенные админы: ${ADMIN_IDS.join(', ')}`
    )
})

bot.start(async ctx => {
    const userId = ctx.from.id
    const chatId = ctx.chat.id

    if (isAdmin(userId) || isAdmin(chatId)) {
        await ctx.reply(
            `┌─────────────────────┐\n` +
            `│ 🎓 Добро пожаловать, учитель! │\n` +
            `└─────────────────────┘\n\n` +
            `📊 Панель управления активна\n\n` +
            `🆔 Ваш Chat ID: ${chatId}`
        )
    } else {
        await ctx.reply(
            `┌─────────────────┐\n` +
            `│ 🌟 Assalomu alaykum! 🌟  │\n` +
            `└─────────────────┘\n\n` +
            `📚 O'qituvchi-O'quvchi Botga xush kelibsiz!\n\n` +
            `🔹 Savol berish uchun tugmani bosing:`,
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

    await ctx.reply(
        `┌─────────────────────┐\n` +
        `│ ✍️ Savolingizni yozing │\n` +
        `└─────────────────────┘\n\n` +
        `📝 O'qituvchiga yo'naltirmoqchi bo'lgan savolingizni yozing yoki faylni (foto/video sarlavha bilan) yuboring.`,
        {
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
    await ctx.answerCbQuery()
})

// Отмена вопроса
bot.action('cancel_question', async ctx => {
    const userId = ctx.from.id
    tempData.pendingMessages.delete(userId)

    await ctx.reply(
        `┌─────────────────────┐\n` +
        `│ ❌ Savol bekor qilindi │\n` +
        `└─────────────────────┘\n\n` +
        `Yana savol berish uchun tugmani bosing:`,
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✍️ Savol berish', callback_data: 'ask_question' }],
                ],
            },
        }
    )
    await ctx.answerCbQuery('❌ Отменено')
})

// Обработка кнопки ответа
bot.action(/reply_(\d+)/, async ctx => {
    const questionId = parseInt(ctx.match[1])
    const adminId = ctx.from.id

    if (!isAdmin(adminId)) {
        await ctx.answerCbQuery('❌ Нет доступа!', { show_alert: true })
        return
    }

    const questionData = tempData.questionHistory.get(questionId);
    if (!questionData) {
        await ctx.answerCbQuery('❌ Вопрос не найден или устарел!', {
            show_alert: true,
        })
        return
    }

    tempData.awaitingResponse.set(adminId, {
        questionId: questionId,
        studentId: questionData.studentId,
        studentName: questionData.studentName,
        studentUsername: questionData.studentUsername,
        originalQuestion: questionData.originalQuestion,
        photoId: questionData.photoId,
        videoId: questionData.videoId,
        caption: questionData.caption,
    });

    const studentInfo =
        questionData.studentUsername !== "yo'q"
            ? `${questionData.studentName} (@${questionData.studentUsername})`
            : questionData.studentName

    let questionContent = '';
    if (questionData.originalQuestion) {
        questionContent = `💭 Вопрос:\n${questionData.originalQuestion}\n\n`;
    } else if (questionData.photoId) {
        questionContent = `🖼️ Вопрос (фото${questionData.caption ? ' с подписью' : ''}):\n`;
    } else if (questionData.videoId) {
        questionContent = `📹 Вопрос (видео${questionData.caption ? ' с подписью' : ''}):\n`;
    }

    await ctx.reply(
        `┌─────────────────────┐\n` +
        `│ ✍️ Режим ответа │\n` +
        `└─────────────────────┘\n\n` +
        `👤 От: ${studentInfo}\n` +
        questionContent +
        `📝 Напишите ваш ответ следующим сообщением (можно с фото/видео с подписью)`,
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '❌ Отменить', callback_data: `cancel_reply_${questionId}` }],
                ],
            },
        }
    )
    await ctx.answerCbQuery('✍️ Напишите ответ следующим сообщением')
})

// Обработка отмены ответа
bot.action(/cancel_reply_(\d+)/, async ctx => {
    const questionId = parseInt(ctx.match[1])
    const adminId = ctx.from.id

    const awaitingResponse = tempData.awaitingResponse.get(adminId)
    if (awaitingResponse && awaitingResponse.questionId === questionId) {
        const studentInfo =
            awaitingResponse.studentUsername !== "yo'q"
                ? `${awaitingResponse.studentName} (@${awaitingResponse.studentUsername})`
                : awaitingResponse.studentName

        const baseCaption = `┌─────────────────────┐\n│ 💬 Новое сообщение │\n└─────────────────────┘\n\n👤 От: ${studentInfo}`;

        if (awaitingResponse.originalQuestion) {
            await ctx.reply(
                baseCaption +
                `\n💭 Сообщение:\n${awaitingResponse.originalQuestion}`,
                {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '📝 Ответить', callback_data: `reply_${questionId}` }],
                        ],
                    },
                }
            );
        } else if (awaitingResponse.photoId) {
            await ctx.telegram.sendPhoto(ctx.chat.id, awaitingResponse.photoId, {
                caption: baseCaption + (awaitingResponse.caption ? `\n\nПодпись: ${awaitingResponse.caption}` : ''),
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📝 Ответить', callback_data: `reply_${questionId}` }],
                    ],
                },
            });
        } else if (awaitingResponse.videoId) {
            await ctx.telegram.sendVideo(ctx.chat.id, awaitingResponse.videoId, {
                caption: baseCaption + (awaitingResponse.caption ? `\n\nПодпись: ${awaitingResponse.caption}` : ''),
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📝 Ответить', callback_data: `reply_${questionId}` }],
                    ],
                },
            });
        }
        tempData.awaitingResponse.delete(adminId);
        await ctx.answerCbQuery('❌ Ответ отменён');
    } else {
        await ctx.answerCbQuery('❌ Режим ответа не активен или устарел.', { show_alert: true });
    }
})

// Обработка всех типов сообщений (текст, фото, видео)
bot.on(['text', 'photo', 'video'], async ctx => {
    const userId = ctx.from.id
    const messageText = ctx.message.text
    const messagePhoto = ctx.message.photo
    const messageVideo = ctx.message.video
    const messageCaption = ctx.message.caption

    if (isAdmin(userId)) {
        const awaitingResponse = tempData.awaitingResponse.get(userId)
        if (awaitingResponse) {
            await handleTeacherResponse(ctx, awaitingResponse, messageText, messagePhoto, messageVideo, messageCaption)
            return
        }

        await ctx.reply(
            `┌─────────────────────┐\n` +
            `│ 🎓 Панель администратора │\n` +
            `└─────────────────────┘\n\n` +
            `🔄 Ожидаю вопросы от учеников...\n\n` +
            `Чтобы ответить на конкретный вопрос, нажмите кнопку 'Ответить' под сообщением ученика.`
        )
        return
    }

    const pendingQuestion = tempData.pendingMessages.get(userId)
    if (!pendingQuestion || pendingQuestion.status !== 'waiting_question') {
        await ctx.reply(
            `┌─────────────────────┐\n` +
            `│ 💬 Savol berish │\n` +
            `└─────────────────────┘\n\n` +
            `Savol berish uchun tugmani bosing:`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✍️ Savol berish', callback_data: 'ask_question' }],
                    ],
                },
            }
        )
        return
    }

    const questionId = generateMessageId()
    const studentName = ctx.from.first_name || "Noma'lum"
    const studentUsername = ctx.from.username || "yo'q"

    const messageData = {
        id: questionId,
        studentId: userId,
        studentName: studentName,
        studentUsername: studentUsername,
        originalQuestion: messageText,
        photoId: messagePhoto ? messagePhoto[messagePhoto.length - 1].file_id : null,
        videoId: messageVideo ? messageVideo.file_id : null,
        caption: messageCaption,
        timestamp: Date.now(),
        answered: false,
    }

    tempData.questionHistory.set(questionId, messageData);
    tempData.pendingMessages.delete(userId)

    let notificationsSent = 0
    let errors = []

    const studentInfo =
        studentUsername !== "yo'q"
            ? `${studentName} (@${studentUsername})`
            : studentName

    for (const adminId of ADMIN_IDS) {
        try {
            let adminMessageCaption =
                `┌─────────────────────┐\n` +
                `│ 💬 Новое сообщение │\n` +
                `└─────────────────────┘\n\n` +
                `👤 От: ${studentInfo}\n`;

            if (messageText) {
                adminMessageCaption += `💭 Сообщение:\n${messageText}`;
                await bot.telegram.sendMessage(
                    adminId,
                    adminMessageCaption,
                    {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '📝 Ответить', callback_data: `reply_${questionId}` }],
                            ],
                        },
                    }
                );
            } else if (messagePhoto) {
                adminMessageCaption += `🖼️ Фотография:`;
                await bot.telegram.sendPhoto(
                    adminId,
                    messagePhoto[messagePhoto.length - 1].file_id,
                    {
                        caption: adminMessageCaption + (messageCaption ? `\n\nПодпись: ${messageCaption}` : ''),
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '📝 Ответить', callback_data: `reply_${questionId}` }],
                            ],
                        },
                    }
                );
            } else if (messageVideo) {
                adminMessageCaption += `📹 Видео:`;
                await bot.telegram.sendVideo(
                    adminId,
                    messageVideo.file_id,
                    {
                        caption: adminMessageCaption + (messageCaption ? `\n\nПодпись: ${messageCaption}` : ''),
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '📝 Ответить', callback_data: `reply_${questionId}` }],
                            ],
                        },
                    }
                );
            }
            notificationsSent++
        } catch (error) {
            console.error(`Ошибка отправки админу ${adminId}:`, error.message)
            errors.push(`Admin ${adminId}: ${error.message}`)
        }
    }

    let studentConfirmationMessage =
        `┌─────────────────────┐\n` +
        `│ ✅ Savolingiz yuborildi! │\n` +
        `└─────────────────────┘\n\n` +
        `📊 Qabul qilgan o'qituvchilar: ${notificationsSent}\n` +
        `⏰ Keyingi savol: Darhol yuborishingiz mumkin.`;

    if (messageText) {
        studentConfirmationMessage += `\n\n📤 Savolingiz:\n${messageText}`;
        await ctx.reply(studentConfirmationMessage, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✍️ Yana savol berish', callback_data: 'ask_question' }],
                ],
            },
        });
    } else if (messagePhoto) {
        studentConfirmationMessage += `\n\n📤 Savolingiz (фото):`;
        await ctx.replyWithPhoto(messagePhoto[messagePhoto.length - 1].file_id, {
            caption: studentConfirmationMessage + (messageCaption ? `\nПодпись: ${messageCaption}` : ''),
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✍️ Yana savol berish', callback_data: 'ask_question' }],
                ],
            },
        });
    } else if (messageVideo) {
        studentConfirmationMessage += `\n\n📤 Savolingiz (видео):`;
        await ctx.replyWithVideo(messageVideo.file_id, {
            caption: studentConfirmationMessage + (messageCaption ? `\nПодпись: ${messageCaption}` : ''),
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✍️ Yana savol berish', callback_data: 'ask_question' }],
                ],
            },
        });
    }
});

// Обработка ответа учителя
async function handleTeacherResponse(ctx, awaitingResponse, responseText, responsePhoto, responseVideo, responseCaption) {
    const {
        studentId,
        questionId,
        originalQuestion,
        photoId,
        videoId,
        caption: originalCaption
    } = awaitingResponse

    try {
        let studentMessageContent =
            `┌─────────────────────┐\n` +
            `│ 📨 Javob keldi! │\n` +
            `└─────────────────────┘\n\n`;

        if (originalQuestion) {
            studentMessageContent += `❓ Sizning savolingiz:\n${originalQuestion}\n\n`;
        } else if (photoId) {
            await bot.telegram.sendPhoto(studentId, photoId, {
                caption: `❓ Sizning savolingiz (foto):${originalCaption ? `\nПодпись: ${originalCaption}` : ''}`
            });
        } else if (videoId) {
            await bot.telegram.sendVideo(studentId, videoId, {
                caption: `❓ Sizning savolingiz (video):${originalCaption ? `\nПодпись: ${originalCaption}` : ''}`
            });
        }

        if (responseText) {
            studentMessageContent += `👨‍🏫 O'qituvchi javobi:\n${responseText}\n`;
        } else if (responsePhoto) {
            studentMessageContent += `👨‍🏫 O'qituvchi javobi (foto${responseCaption ? ' с подписью' : ''}):\n`;
        } else if (responseVideo) {
            studentMessageContent += `👨‍🏫 O'qituvchi javobi (video${responseCaption ? ' с подписью' : ''}):\n`;
        }

        const replyMarkup = {
            inline_keyboard: [
                [{ text: '✍️ Yana savol berish', callback_data: 'ask_question' }],
            ],
        };

        if (responseText) {
            await bot.telegram.sendMessage(studentId, studentMessageContent.trim(), {
                reply_markup: replyMarkup,
            });
        } else if (responsePhoto) {
            await bot.telegram.sendPhoto(studentId, responsePhoto[responsePhoto.length - 1].file_id, {
                caption: studentMessageContent.trim() + (responseCaption ? `\nПодпись: ${responseCaption}` : ''),
                reply_markup: replyMarkup,
            });
        } else if (responseVideo) {
            await bot.telegram.sendVideo(studentId, responseVideo.file_id, {
                caption: studentMessageContent.trim() + (responseCaption ? `\nПодпись: ${responseCaption}` : ''),
                reply_markup: replyMarkup,
            });
        }

        let adminConfirmationMessage =
            `┌─────────────────────┐\n` +
            `│ ✅ Ответ отправлен! │\n` +
            `└─────────────────────┘\n\n` +
            `👤 Получатель: ${awaitingResponse.studentName}${awaitingResponse.studentUsername !== "yo'q" ? ` (@${awaitingResponse.studentUsername})` : ''}\n`;

        if (responseText) {
            adminConfirmationMessage += `📤 Ваш ответ:\n${responseText}\n`;
            await ctx.reply(adminConfirmationMessage.trim());
        } else if (responsePhoto) {
            adminConfirmationMessage += `📤 Ваш ответ (фото):\n`;
            await ctx.replyWithPhoto(responsePhoto[responsePhoto.length - 1].file_id, {
                caption: adminConfirmationMessage.trim() + (responseCaption ? `\nПодпись: ${responseCaption}` : '')
            });
        } else if (responseVideo) {
            adminConfirmationMessage += `📤 Ваш ответ (видео):\n`;
            await ctx.replyWithVideo(responseVideo.file_id, {
                caption: adminConfirmationMessage.trim() + (responseCaption ? `\nПодпись: ${responseCaption}` : '')
            });
        }

        tempData.awaitingResponse.delete(ctx.from.id)
    } catch (error) {
        console.error(`Ошибка отправки ответа ученику ${studentId}:`, error)

        let errorMessage
        if (error.code === 403) {
            errorMessage = 'Ученик заблокировал бота или остановил чат.'
        } else if (error.code === 400) {
            errorMessage = 'Некорректный запрос. Возможно, неверный ID чата или файл.'
        } else {
            errorMessage = 'Техническая ошибка при отправке сообщения.'
        }

        await ctx.reply(
            `❌ Ошибка отправки!\n\n${errorMessage}\n\nПопробуйте связаться с учеником другим способом.`
        )

        tempData.awaitingResponse.delete(ctx.from.id)
    }
}

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