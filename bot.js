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
    pendingMessages: new Map(), // For student's question initiation
    messageCounter: 0, // Unique ID for questions
    awaitingResponse: new Map(), // AdminId -> { studentId, originalQuestion, etc. }
    questionHistory: new Map(), // Stores question details by messageId for direct reply
}

// Функция для экранирования Markdown символов
function escapeMarkdown(text) {
    if (typeof text !== 'string') {
        return '';
    }
    // Escape all special Markdown v2 characters
    return text.replace(/([_*\[\]\(\)~`>#+\-=|{}.!\\])/g, '\\$1')
}

// Функция шифрования (не используется в текущей логике, но оставлена)
function encryptData(text) {
    const cipher = crypto.createCipher('aes-256-cbc', ENCRYPTION_KEY)
    let encrypted = cipher.update(text, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    return encrypted
}

// Функция дешифрования (не используется в текущей логике, но оставлена)
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

    await ctx.reply(
        `┌─────────────────────┐\n` +
        `│ ✍️ *Savolingizni yozing* │\n` +
        `└─────────────────────┘\n\n` +
        `📝 O'qituvchiga yo'naltirmoqchi bo'lgan savolingizni yozing yoki faylni (foto/video sarlavha bilan) yuboring.`,
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
    await ctx.answerCbQuery()
})

// Отмена вопроса
bot.action('cancel_question', async ctx => {
    const userId = ctx.from.id
    tempData.pendingMessages.delete(userId)

    await ctx.reply(
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
    await ctx.answerCbQuery('❌ Отменено')
})

// Обработка кнопки ответа
bot.action(/reply_(\d+)/, async ctx => {
    const questionId = parseInt(ctx.match[1]) // This is the unique ID we generated for the question
    const adminId = ctx.from.id

    if (!isAdmin(adminId)) {
        await ctx.answerCbQuery('❌ Нет доступа!', { show_alert: true })
        return
    }

    // Retrieve the full question data from history
    const questionData = tempData.questionHistory.get(questionId);

    if (!questionData) {
        await ctx.answerCbQuery('❌ Вопрос не найден или устарел!', {
            show_alert: true,
        })
        return
    }

    // Store the context for the admin's current reply session
    tempData.awaitingResponse.set(adminId, {
        questionId: questionId, // Keep the ID for reference
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
            ? `${escapeMarkdown(questionData.studentName)} (@${escapeMarkdown(
                questionData.studentUsername
            )})`
            : escapeMarkdown(questionData.studentName)

    let questionContent = '';
    if (questionData.originalQuestion) {
        questionContent = `💭 *Вопрос:*\n\`\`\`\n${escapeMarkdown(questionData.originalQuestion)}\n\`\`\`\n\n`;
    } else if (questionData.photoId) {
        questionContent = `🖼️ *Вопрос (фото${questionData.caption ? ' с подписью' : ''}):*\n`;
    } else if (questionData.videoId) {
        questionContent = `📹 *Вопрос (видео${questionData.caption ? ' с подписью' : ''}):*\n`;
    }

    await ctx.reply(
        `┌─────────────────────┐\n` +
        `│ ✍️ *Режим ответа* │\n` +
        `└─────────────────────┘\n\n` +
        `👤 *От:* ${studentInfo}\n` +
        questionContent +
        `📝 *Напишите ваш ответ следующим сообщением (можно с фото/видео с подписью)*`,
        {
            parse_mode: 'Markdown',
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
    // Check if the current awaiting response for this admin matches the cancelled question
    if (awaitingResponse && awaitingResponse.questionId === questionId) {
        const studentInfo =
            awaitingResponse.studentUsername !== "yo'q"
                ? `${escapeMarkdown(awaitingResponse.studentName)} (@${escapeMarkdown(
                    awaitingResponse.studentUsername
                )})`
                : escapeMarkdown(awaitingResponse.studentName)

        const baseCaption = `┌─────────────────────┐\n│ 💬 *Новое сообщение* │\n└─────────────────────┘\n\n👤 *От:* ${studentInfo}`;

        // Re-send the original question message to the admin, with the 'Reply' button
        if (awaitingResponse.originalQuestion) {
            await ctx.reply(
                baseCaption +
                `\n💭 *Сообщение:*\n\`\`\`\n${escapeMarkdown(awaitingResponse.originalQuestion)}\n\`\`\``,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '📝 Ответить', callback_data: `reply_${questionId}` }],
                        ],
                    },
                }
            );
        } else if (awaitingResponse.photoId) {
            await ctx.telegram.sendPhoto(ctx.chat.id, awaitingResponse.photoId, {
                caption: baseCaption + (awaitingResponse.caption ? `\n\n*Подпись:* ${escapeMarkdown(awaitingResponse.caption)}` : ''),
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📝 Ответить', callback_data: `reply_${questionId}` }],
                    ],
                },
            });
        } else if (awaitingResponse.videoId) {
            await ctx.telegram.sendVideo(ctx.chat.id, awaitingResponse.videoId, {
                caption: baseCaption + (awaitingResponse.caption ? `\n\n*Подпись:* ${escapeMarkdown(awaitingResponse.caption)}` : ''),
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📝 Ответить', callback_data: `reply_${questionId}` }],
                    ],
                },
            });
        }
        tempData.awaitingResponse.delete(adminId); // Clear the awaiting response for this admin
        await ctx.answerCbQuery('❌ Ответ отменён');
    } else {
        await ctx.answerCbQuery('❌ Режим ответа не активен или устарел.', { show_alert: true });
    }
})

// Обработка всех типов сообщений (текст, фото, видео)
bot.on(['text', 'photo', 'video'], async ctx => {
    const userId = ctx.from.id
    const messageText = ctx.message.text // Текст, если есть
    const messagePhoto = ctx.message.photo // Массив объектов фото, если есть
    const messageVideo = ctx.message.video // Объект видео, если есть
    const messageCaption = ctx.message.caption // Подпись к фото/видео

    if (isAdmin(userId)) {
        const awaitingResponse = tempData.awaitingResponse.get(userId)
        if (awaitingResponse) {
            // Admin is in reply mode for a specific question
            await handleTeacherResponse(ctx, awaitingResponse, messageText, messagePhoto, messageVideo, messageCaption)
            return
        }

        // If admin sends a message not in reply mode
        await ctx.reply(
            `┌─────────────────────┐\n` +
            `│ 🎓 *Панель администратора* │\n` +
            `└─────────────────────┘\n\n` +
            `🔄 *Ожидаю вопросы от учеников...*\n\n` +
            `_Чтобы ответить на конкретный вопрос, нажмите кнопку 'Ответить' под сообщением ученика._`,
            { parse_mode: 'Markdown' }
        )
        return
    }

    const pendingQuestion = tempData.pendingMessages.get(userId)
    if (!pendingQuestion || pendingQuestion.status !== 'waiting_question') {
        await ctx.reply(
            `┌─────────────────────┐\n` +
            `│ 💬 *Savol berish* │\n` +
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

    const questionId = generateMessageId() // Unique ID for this specific question
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

    // Store the question data in history
    tempData.questionHistory.set(questionId, messageData);
    tempData.pendingMessages.delete(userId) // Clear student's pending state

    let notificationsSent = 0
    let errors = []

    const studentInfo =
        studentUsername !== "yo'q"
            ? `${escapeMarkdown(studentName)} (@${escapeMarkdown(studentUsername)})`
            : escapeMarkdown(studentName)

    for (const adminId of ADMIN_IDS) {
        try {
            let adminMessageCaption =
                `┌─────────────────────┐\n` +
                `│ 💬 *Новое сообщение* │\n` +
                `└─────────────────────┘\n\n` +
                `👤 *От:* ${studentInfo}\n`;

            if (messageText) {
                adminMessageCaption += `💭 *Сообщение:*\n\`\`\`\n${escapeMarkdown(messageText)}\n\`\`\``;
                await bot.telegram.sendMessage(
                    adminId,
                    adminMessageCaption,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '📝 Ответить', callback_data: `reply_${questionId}` }], // Use questionId here
                            ],
                        },
                    }
                );
            } else if (messagePhoto) {
                adminMessageCaption += `🖼️ *Фотография:*\n`;
                await bot.telegram.sendPhoto(
                    adminId,
                    messagePhoto[messagePhoto.length - 1].file_id,
                    {
                        caption: adminMessageCaption + (messageCaption ? `\n\n*Подпись:* ${escapeMarkdown(messageCaption)}` : ''),
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '📝 Ответить', callback_data: `reply_${questionId}` }], // Use questionId here
                            ],
                        },
                    }
                );
            } else if (messageVideo) {
                adminMessageCaption += `📹 *Видео:*\n`;
                await bot.telegram.sendVideo(
                    adminId,
                    messageVideo.file_id,
                    {
                        caption: adminMessageCaption + (messageCaption ? `\n\n*Подпись:* ${escapeMarkdown(messageCaption)}` : ''),
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '📝 Ответить', callback_data: `reply_${questionId}` }], // Use questionId here
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
        `│ ✅ *Savolingiz yuborildi!* │\n` +
        `└─────────────────────┘\n\n` +
        `📊 *Qabul qilgan o'qituvchilar:* ${notificationsSent}\n` +
        `⏰ *Keyingi savol:* Darhol yuborishingiz mumkin.`;

    if (messageText) {
        studentConfirmationMessage += `\n\n📤 *Savolingiz:*\n\`\`\`\n${messageText}\n\`\`\``;
        await ctx.reply(studentConfirmationMessage, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✍️ Yana savol berish', callback_data: 'ask_question' }],
                ],
            },
        });
    } else if (messagePhoto) {
        studentConfirmationMessage += `\n\n📤 *Savolingiz (фото):*\n`;
        await ctx.replyWithPhoto(messagePhoto[messagePhoto.length - 1].file_id, {
            caption: studentConfirmationMessage + (messageCaption ? `\n*Подпись:* ${messageCaption}` : ''),
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✍️ Yana savol berish', callback_data: 'ask_question' }],
                ],
            },
        });
    } else if (messageVideo) {
        studentConfirmationMessage += `\n\n📤 *Savolingiz (видео):*\n`;
        await ctx.replyWithVideo(messageVideo.file_id, {
            caption: studentConfirmationMessage + (messageCaption ? `\n*Подпись:* ${messageCaption}` : ''),
            parse_mode: 'Markdown',
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
        questionId, // The unique ID of the original question
        originalQuestion,
        photoId,
        videoId,
        caption: originalCaption
    } = awaitingResponse

    try {
        const escapedOriginalQuestion = escapeMarkdown(originalQuestion || '');
        const escapedResponseText = escapeMarkdown(responseText || '');
        const escapedOriginalCaption = escapeMarkdown(originalCaption || '');
        const escapedResponseCaption = escapeMarkdown(responseCaption || '');

        let studentMessageContent =
            `┌─────────────────────┐\n` +
            `│ 📨 *Javob keldi!* │\n` +
            `└─────────────────────┘\n\n`;

        // Add original question or media info
        if (originalQuestion) {
            studentMessageContent += `❓ *Sizning savolingiz:*
\`\`\`
${escapedOriginalQuestion}
\`\`\`\n\n`;
        } else if (photoId) {
            // If it was a photo question, send the photo first to the student
            await bot.telegram.sendPhoto(studentId, photoId, {
                caption: `❓ *Sizning savolingiz (foto):*${escapedOriginalCaption ? `\n*Подпись:* ${escapedOriginalCaption}` : ''}`,
                parse_mode: 'Markdown',
            });
        } else if (videoId) {
            // If it was a video question, send the video first to the student
            await bot.telegram.sendVideo(studentId, videoId, {
                caption: `❓ *Sizning savolingiz (video):*${escapedOriginalCaption ? `\n*Подпись:* ${escapedOriginalCaption}` : ''}`,
                parse_mode: 'Markdown',
            });
        }

        // Add teacher's response (text/photo/video)
        if (responseText) {
            studentMessageContent += `👨‍🏫 *O'qituvchi javobi:*\n\`\`\`\n${escapedResponseText}\n\`\`\`\n`;
        } else if (responsePhoto) {
            studentMessageContent += `👨‍🏫 *O'qituvchi javobi (foto${responseCaption ? ' с подписью' : ''}):*\n`;
        } else if (responseVideo) {
            studentMessageContent += `👨‍🏫 *O'qituvchi javobi (video${responseCaption ? ' с подписью' : ''}):*\n`;
        }

        const replyMarkup = {
            inline_keyboard: [
                [{ text: '✍️ Yana savol berish', callback_data: 'ask_question' }],
            ],
        };

        // Send the teacher's response to the student
        if (responseText) {
            await bot.telegram.sendMessage(studentId, studentMessageContent.trim(), {
                parse_mode: 'Markdown',
                reply_markup: replyMarkup,
            });
        } else if (responsePhoto) {
            await bot.telegram.sendPhoto(studentId, responsePhoto[responsePhoto.length - 1].file_id, {
                caption: studentMessageContent.trim() + (escapedResponseCaption ? `\n*Подпись:* ${escapedResponseCaption}` : ''),
                parse_mode: 'Markdown',
                reply_markup: replyMarkup,
            });
        } else if (responseVideo) {
            await bot.telegram.sendVideo(studentId, responseVideo.file_id, {
                caption: studentMessageContent.trim() + (escapedResponseCaption ? `\n*Подпись:* ${escapedResponseCaption}` : ''),
                parse_mode: 'Markdown',
                reply_markup: replyMarkup,
            });
        }

        // Confirmation to the teacher
        let adminConfirmationMessage =
            `┌─────────────────────┐\n` +
            `│ ✅ *Ответ отправлен!* │\n` +
            `└─────────────────────┘\n\n` +
            `👤 *Получатель:* ${escapeMarkdown(awaitingResponse.studentName)}${awaitingResponse.studentUsername !== "yo'q" ? ` (@${escapeMarkdown(awaitingResponse.studentUsername)})` : ''}\n`;

        if (responseText) {
            adminConfirmationMessage += `📤 *Ваш ответ:*\n\`\`\`\n${escapedResponseText}\n\`\`\`\n`;
            await ctx.replyWithMarkdown(adminConfirmationMessage.trim());
        } else if (responsePhoto) {
            adminConfirmationMessage += `📤 *Ваш ответ (фото):*\n`;
            await ctx.replyWithPhoto(responsePhoto[responsePhoto.length - 1].file_id, {
                caption: adminConfirmationMessage.trim() + (escapedResponseCaption ? `\n*Подпись:* ${escapedResponseCaption}` : ''),
                parse_mode: 'Markdown',
            });
        } else if (responseVideo) {
            adminConfirmationMessage += `📤 *Ваш ответ (видео):*\n`;
            await ctx.replyWithVideo(responseVideo.file_id, {
                caption: adminConfirmationMessage.trim() + (escapedResponseCaption ? `\n*Подпись:* ${escapedResponseCaption}` : ''),
                parse_mode: 'Markdown',
            });
        }


        // Remove from awaiting responses for this admin
        tempData.awaitingResponse.delete(ctx.from.id)
        // Optionally, remove the question from history if it's considered "answered" and no longer needed for direct replies
        // tempData.questionHistory.delete(questionId);
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

        await ctx.replyWithMarkdown(
            `
❌ *Ошибка отправки!*

${errorMessage}

Попробуйте связаться с учеником другим способом.
        `.trim()
        )

        // Remove the invalid awaiting response for this admin
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