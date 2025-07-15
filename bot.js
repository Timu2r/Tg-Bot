require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const crypto = require('crypto');

// Инициализация бота
const bot = new Telegraf(process.env.BOT_TOKEN);

// Админы (учителя) из переменных окружения
const ADMIN_IDS = process.env.ADMIN_CHAT_IDS ? process.env.ADMIN_CHAT_IDS.split(',').map(id => parseInt(id.trim())) : [];
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

// Проверка конфигурации при запуске
if (!process.env.BOT_TOKEN) {
    console.error('❌ ОШИБКА: BOT_TOKEN не найден в переменных окружения');
    process.exit(1);
}

if (!process.env.ADMIN_CHAT_IDS) {
    console.error('❌ ОШИБКА: ADMIN_CHAT_IDS не найден в переменных окружения');
    process.exit(1);
}

if (ADMIN_IDS.length === 0) {
    console.error('❌ ОШИБКА: Не удалось парсить ADMIN_CHAT_IDS');
    process.exit(1);
}

// Временное хранилище данных (очищается при перезапуске)
const tempData = {
    lastMessageTime: new Map(), // Время последнего сообщения ученика
    pendingMessages: new Map(), // Ожидающие ответа сообщения
    messageCounter: 0, // Счетчик сообщений
    awaitingResponse: new Map() // Ожидающие ответа от учителя
};

// Функция для экранирования Markdown символов
function escapeMarkdown(text) {
    // Экранируем специальные символы для Markdown v1
    return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

// Функция шифрования (для защиты данных в памяти)
function encryptData(text) {
    const cipher = crypto.createCipher('aes-256-cbc', ENCRYPTION_KEY);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
}

// Функция дешифрования
function decryptData(encryptedText) {
    const decipher = crypto.createDecipher('aes-256-cbc', ENCRYPTION_KEY);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

// Проверка является ли пользователь админом
function isAdmin(userId) {
    const result = ADMIN_IDS.includes(userId);
    console.log(`Проверка админа: userId=${userId}, ADMIN_IDS=${ADMIN_IDS}, result=${result}`);
    return result;
}

// Проверка задержки сообщений (30 секунд)
function canSendMessage(userId) {
    const lastTime = tempData.lastMessageTime.get(userId);
    if (!lastTime) return true;
    return Date.now() - lastTime >= 30000; // 30 секунд
}

// Получение времени до следующего сообщения
function getTimeUntilNextMessage(userId) {
    const lastTime = tempData.lastMessageTime.get(userId);
    if (!lastTime) return 0;
    const timeLeft = 30000 - (Date.now() - lastTime);
    return Math.max(0, Math.ceil(timeLeft / 1000));
}

// Форматирование времени на узбекском
function formatTime(seconds) {
    if (seconds < 60) return `${seconds} soniya`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes} daqiqa ${remainingSeconds} soniya`;
}

// Генерация уникального ID для сообщения
function generateMessageId() {
    return ++tempData.messageCounter;
}

// Middleware для логирования
bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;
    const userType = isAdmin(userId) ? 'ADMIN' : 'STUDENT';
    const action = ctx.message?.text || ctx.callbackQuery?.data || 'unknown';
    
    console.log(`[${new Date().toISOString()}] ${userType} ${userId}: ${action}`);
    
    return next();
});

// Команда для получения chat_id (для настройки админов)
bot.command('myid', async (ctx) => {
    const userId = ctx.from.id;
    const chatId = ctx.chat.id;
    const username = ctx.from.username || 'отсутствует';
    const firstName = ctx.from.first_name || 'отсутствует';
    
    await ctx.reply(
        `🆔 *Ваши данные:*\n\n` +
        `👤 User ID: \`${userId}\`\n` +
        `💬 Chat ID: \`${chatId}\`\n` +
        `👤 Username: @${username}\n` +
        `📝 Имя: ${firstName}\n\n` +
        `📋 *Для настройки в качестве админа используйте Chat ID*`,
        { parse_mode: 'Markdown' }
    );
});

// Команда для проверки статуса админа
bot.command('status', async (ctx) => {
    const userId = ctx.from.id;
    const chatId = ctx.chat.id;
    const isUserAdmin = isAdmin(userId);
    const isChatAdmin = isAdmin(chatId);
    
    await ctx.reply(
        `📊 *Статус пользователя:*\n\n` +
        `👤 User ID: ${userId}\n` +
        `💬 Chat ID: ${chatId}\n` +
        `🔑 Админ (по User ID): ${isUserAdmin ? '✅' : '❌'}\n` +
        `🔑 Админ (по Chat ID): ${isChatAdmin ? '✅' : '❌'}\n\n` +
        `📋 *Настроенные админы:* ${ADMIN_IDS.join(', ')}\n\n` +
        `💡 *Совет:* Используйте Chat ID для настройки админов`,
        { parse_mode: 'Markdown' }
    );
});

bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const chatId = ctx.chat.id;
    
    console.log(`Пользователь запустил бота: userId=${userId}, chatId=${chatId}`);
    
    // Проверка на админа (используем и userId и chatId)
    if (isAdmin(userId) || isAdmin(chatId)) {
        console.log(`Админ подключился: ${userId} (chatId: ${chatId})`);
        
        const welcomeMessage = `
┌─────────────────────┐
│ 🎓 *Добро пожаловать, учитель!* │
└─────────────────────┘

📊 *Панель управления активна*

✅ Вы будете получать уведомления о новых вопросах
✅ Отвечайте на вопросы через кнопки
✅ Бот готов к работе

🆔 *Ваш Chat ID:* \`${chatId}\`
        `;
        
        await ctx.replyWithMarkdown(welcomeMessage);
    } else {
        console.log(`Ученик подключился: ${userId} (chatId: ${chatId})`);
        
        // Обычный пользователь (ученик)
        const welcomeMessage = `
┌─────────────────┐
│ 🌟 *Assalomu alaykum!* 🌟 │
└─────────────────┘

📚 *O'qituvchi-O'quvchi Bot*ga xush kelibsiz!

✨ *Imkoniyatlar:*
• O'qituvchiga savollar berish
• Tezkor javob olish
• Oson foydalanish

⚠️ *Muhim:* Ma'lumotlar xavfsiz saqlanadi

🔹 *Savol berish uchun tugmani bosing:*
        `;
        
        await ctx.replyWithMarkdown(welcomeMessage, 
            Markup.inlineKeyboard([
                [Markup.button.callback('✍️ Savol berish', 'ask_question')]
            ])
        );
    }
});

// Задать вопрос (только для учеников)
bot.action('ask_question', async (ctx) => {
    const userId = ctx.from.id;
    
    // Проверка на админа
    if (isAdmin(userId)) {
        await ctx.answerCbQuery('❌ Вы администратор!', { show_alert: true });
        return;
    }
    
    if (!canSendMessage(userId)) {
        const timeLeft = getTimeUntilNextMessage(userId);
        await ctx.answerCbQuery(
            `⏰ Keyingi savol berish uchun ${formatTime(timeLeft)} kutishingiz kerak!`,
            { show_alert: true }
        );
        return;
    }
    
    await ctx.editMessageText(
        `┌─────────────────────┐\n` +
        `│ ✍️ *Savolingizni yozing* │\n` +
        `└─────────────────────┘\n\n` +
        `📝 O'qituvchiga yo'naltirmoqchi bo'lgan savolingizni yozing.\n\n` +
        `⏰ *Eslatma:* Har 30 soniyada faqat bitta savol berish mumkin.`,
        { 
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '❌ Bekor qilish', callback_data: 'cancel_question' }]
                ]
            }
        }
    );
    
    // Установка состояния ожидания вопроса
    tempData.pendingMessages.set(userId, { 
        status: 'waiting_question', 
        timestamp: Date.now() 
    });
});

// Отмена вопроса
bot.action('cancel_question', async (ctx) => {
    const userId = ctx.from.id;
    tempData.pendingMessages.delete(userId);
    
    await ctx.editMessageText(
        `┌─────────────────────┐\n` +
        `│ ❌ *Savol bekor qilindi* │\n` +
        `└─────────────────────┘\n\n` +
        `Yana savol berish uchun tugmani bosing:`,
        {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✍️ Savol berish', callback_data: 'ask_question' }]
                ]
            }
        }
    );
});

// Обработка кнопки ответа
bot.action(/reply_(\d+)/, async (ctx) => {
    const messageId = parseInt(ctx.match[1]);
    const adminId = ctx.from.id;
    
    // Проверка на админа
    if (!isAdmin(adminId)) {
        await ctx.answerCbQuery('❌ Нет доступа!', { show_alert: true });
        return;
    }
    
    // Находим данные сообщения
    const awaitingResponse = tempData.awaitingResponse.get(adminId);
    if (!awaitingResponse || awaitingResponse.messageId !== messageId) {
        await ctx.answerCbQuery('❌ Сообщение не найдено или устарело!', { show_alert: true });
        return;
    }
    
    // Обновляем сообщение с инструкцией
    await ctx.editMessageText(
        `┌─────────────────────┐\n` +
        `│ ✍️ *Режим ответа*    │\n` +
        `└─────────────────────┘\n\n` +
        `👤 *От:* ${escapeMarkdown(awaitingResponse.studentName)}\n` +
        `💭 *Вопрос:*\n` +
        `\`\`\`\n${escapeMarkdown(awaitingResponse.originalQuestion)}\n\`\`\`\n\n` +
        `📝 *Напишите ваш ответ следующим сообщением*`,
        {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '❌ Отменить', callback_data: `cancel_reply_${messageId}` }]
                ]
            }
        }
    );
    
    await ctx.answerCbQuery('✍️ Напишите ответ следующим сообщением');
});

// Обработка отмены ответа
bot.action(/cancel_reply_(\d+)/, async (ctx) => {
    const messageId = parseInt(ctx.match[1]);
    const adminId = ctx.from.id;
    
    const awaitingResponse = tempData.awaitingResponse.get(adminId);
    if (awaitingResponse && awaitingResponse.messageId === messageId) {
        // Возвращаем исходное сообщение
        await ctx.editMessageText(
            `┌─────────────────────┐\n` +
            `│ 💬 *Новое сообщение* │\n` +
            `└─────────────────────┘\n\n` +
            `👤 *От:* ${escapeMarkdown(awaitingResponse.studentName)}\n` +
            `💭 *Сообщение:*\n` +
            `\`\`\`\n${escapeMarkdown(awaitingResponse.originalQuestion)}\n\`\`\``,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📝 Ответить', callback_data: `reply_${messageId}` }]
                    ]
                }
            }
        );
        
        await ctx.answerCbQuery('❌ Ответ отменён');
    }
});

// Обработка текстовых сообщений
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const messageText = ctx.message.text;
    
    // Проверка на админа
    if (isAdmin(userId)) {
        // Если админ отвечает на вопрос
        const awaitingResponse = tempData.awaitingResponse.get(userId);
        if (awaitingResponse) {
            await handleTeacherResponse(ctx, awaitingResponse, messageText);
            return;
        }
        
        // Если админ написал сообщение без контекста
        await ctx.reply(
            `┌─────────────────────┐\n` +
            `│ 🎓 *Панель администратора* │\n` +
            `└─────────────────────┘\n\n` +
            `🔄 *Ожидаю вопросы от учеников...*`,
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    // Обработка вопроса от ученика
    const pendingQuestion = tempData.pendingMessages.get(userId);
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
                        [{ text: '✍️ Savol berish', callback_data: 'ask_question' }]
                    ]
                }
            }
        );
        return;
    }
    
    if (!canSendMessage(userId)) {
        const timeLeft = getTimeUntilNextMessage(userId);
        await ctx.reply(
            `⏰ Keyingi savol berish uchun ${formatTime(timeLeft)} kutishingiz kerak!`
        );
        return;
    }
    
    // Создание сообщения
    const messageId = generateMessageId();
    const studentName = ctx.from.first_name || 'Noma\'lum';
    const studentUsername = ctx.from.username || 'yo\'q';
    
    const messageData = {
        id: messageId,
        studentId: userId,
        studentName: studentName,
        studentUsername: studentUsername,
        text: messageText,
        timestamp: Date.now(),
        answered: false
    };
    
    tempData.lastMessageTime.set(userId, Date.now());
    tempData.pendingMessages.delete(userId);
    
    // Отправка уведомления всем админам
    let notificationsSent = 0;
    let errors = [];
    
    console.log(`Отправка уведомлений ${ADMIN_IDS.length} админам: ${ADMIN_IDS.join(', ')}`);
    
    for (const adminId of ADMIN_IDS) {
        try {
            console.log(`Отправка уведомления админу ${adminId}...`);
            
            // Экранируем пользовательский текст для безопасного использования в Markdown
            const escapedMessageText = escapeMarkdown(messageText);
            const escapedStudentName = escapeMarkdown(studentName);
            const escapedStudentUsername = escapeMarkdown(studentUsername);
            
            const sentMessage = await bot.telegram.sendMessage(adminId,
                `┌─────────────────────┐\n` +
                `│ 💬 *Новое сообщение* │\n` +
                `└─────────────────────┘\n\n` +
                `👤 *От:* ${escapedStudentName}\n` +
                `💭 *Сообщение:*\n` +
                `\`\`\`\n${escapedMessageText}\n\`\`\``,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '📝 Ответить', callback_data: `reply_${messageId}` }]
                        ]
                    }
                }
            );
            
            console.log(`✅ Уведомление отправлено админу ${adminId}, message_id: ${sentMessage.message_id}`);
            
            // Сохранение данных для ответа
            tempData.awaitingResponse.set(adminId, {
                messageId: messageId,
                studentId: userId,
                studentName: studentName,
                originalQuestion: messageText,
                timestamp: Date.now()
            });
            
            notificationsSent++;
        } catch (error) {
            console.error(`❌ Ошибка отправки уведомления админу ${adminId}:`, error.message);
            errors.push(`Admin ${adminId}: ${error.message}`);
        }
    }
    
    console.log(`Результат отправки: ${notificationsSent}/${ADMIN_IDS.length} успешно`);
    if (errors.length > 0) {
        console.log(`Ошибки: ${errors.join('; ')}`);
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
                    [{ text: '✍️ Yana savol berish', callback_data: 'ask_question' }]
                ]
            }
        }
    );
});

// Обработка ответа учителя
async function handleTeacherResponse(ctx, awaitingResponse, responseText) {
    const { messageId, studentId, studentName, originalQuestion } = awaitingResponse;
    
    // Отправка ответа ученику
    try {
        // Экранируем текст для безопасного использования в Markdown
        const escapedOriginalQuestion = escapeMarkdown(originalQuestion);
        const escapedResponseText = escapeMarkdown(responseText);
        
        await bot.telegram.sendMessage(studentId,
            `┌─────────────────────┐\n` +
            `│ 📨 *Javob keldi!*    │\n` +
            `└─────────────────────┘\n\n` +
            `❓ *Sizning savolingiz:*\n` +
            `\`\`\`\n${escapedOriginalQuestion}\n\`\`\`\n\n` +
            `👨‍🏫 *O'qituvchi javobi:*\n` +
            `\`\`\`\n${escapedResponseText}\n\`\`\``,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✍️ Yana savol berish', callback_data: 'ask_question' }]
                    ]
                }
            }
        );
        
        await ctx.reply(
            `┌─────────────────────┐\n` +
            `│ ✅ *Ответ отправлен!* │\n` +
            `└─────────────────────┘\n\n` +
            `👤 *Получатель:* ${studentName}\n` +
            `📤 *Ваш ответ:*\n` +
            `\`\`\`\n${responseText}\n\`\`\`\n\n` +
            `🔄 *Ожидаю новые вопросы...*`,
            { parse_mode: 'Markdown' }
        );
        
        // Очистка состояния ожидания ответа
        tempData.awaitingResponse.delete(ctx.from.id);
        
    } catch (error) {
        console.error(`Ошибка отправки ответа ученику ${studentId}:`, error);
        await ctx.reply(
            `❌ *Ошибка отправки!*\n\n` +
            `Не удалось отправить ответ ученику. Возможно:\n` +
            `• Ученик заблокировал бота\n` +
            `• Технические проблемы\n\n` +
            `Попробуйте позже.`,
            { parse_mode: 'Markdown' }
        );
    }
}

// Очистка старых данных каждые 10 минут
setInterval(() => {
    const now = Date.now();
    const tenMinutes = 10 * 60 * 1000;
    
    // Очистка старых ожидающих сообщений
    for (const [key, value] of tempData.pendingMessages) {
        if (value.timestamp && now - value.timestamp > tenMinutes) {
            tempData.pendingMessages.delete(key);
        }
    }
    
    // Очистка старых ожидающих ответов от учителей
    for (const [key, value] of tempData.awaitingResponse) {
        if (value.timestamp && now - value.timestamp > tenMinutes) {
            tempData.awaitingResponse.delete(key);
        }
    }
    
    console.log(`[${new Date().toISOString()}] Очистка памяти завершена`);
}, 10 * 60 * 1000);

// Обработка ошибок
bot.catch((err, ctx) => {
    console.error('Ошибка бота:', err);
    if (ctx.reply) {
        ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
    }
});

// Запуск бота
bot.launch().then(() => {
    console.log('🚀 Бот запущен успешно!');
    console.log(`👥 Админы: ${ADMIN_IDS.join(', ')}`);
    console.log('🔒 Данные учеников не сохраняются на диск');
});

// Graceful shutdown
process.once('SIGINT', () => {
    console.log('🛑 Остановка бота...');
    bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
    console.log('🛑 Остановка бота...');
    bot.stop('SIGTERM');
});