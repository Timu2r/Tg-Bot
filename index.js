const TelegramBot = require('node-telegram-bot-api')
const express = require('express')
const http = require('http')
const socketIO = require('socket.io')
const path = require('path')
const crypto = require('crypto')
require('dotenv').config()

// Конфигурация
const BOT_TOKEN = process.env.BOT_TOKEN // Замените на ваш токен
const ADMIN_CHAT_ID = '@Timu2r, @Buva112' // ID админа (можно получить от @userinfobot)
const PORT = process.env.PORT || 3000

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY // 32-байтный ключ для AES-256
const IV_LENGTH = 16 // Для AES, это 16 байт

// Функция для шифрования
function encrypt(text) {
    const iv = crypto.randomBytes(IV_LENGTH)
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), iv)
    const encrypted = Buffer.concat([cipher.update(text), cipher.final()])
    const authTag = cipher.getAuthTag()
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

// Функция для дешифрования
function decrypt(text) {
    try {
        const textParts = text.split(':')
        const iv = Buffer.from(textParts.shift(), 'hex')
        const authTag = Buffer.from(textParts.shift(), 'hex')
        const encryptedText = Buffer.from(textParts.join(':'), 'hex')
        const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), iv)
        decipher.setAuthTag(authTag)
        const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()])
        return decrypted.toString()
    } catch (error) {
        console.error("Ошибка дешифрования:", error)
        return "[Не удалось расшифровать сообщение]"
    }
}

// Создаем бота
const bot = new TelegramBot(BOT_TOKEN, { polling: true })

// Создаем Express приложение
const app = express()
const server = http.createServer(app)
const io = socketIO(server)

// Middleware
app.use(express.static('public'))
app.use(express.json())

// Хранилище сообщений и пользователей (в продакшене используйте базу данных)
const messages = []
const users = new Map()
const deletedChats = new Set() // Для хранения удаленных чатов

// Обработчик команды /start (приветственное сообщение)
bot.onText(/\/start/, msg => {
	const chatId = msg.chat.id
	const user = msg.from

	// Проверяем, не удален ли чат
	if (deletedChats.has(chatId)) {
		return
	}

	// Сохраняем информацию о пользователе
	users.set(chatId, {
		id: chatId,
		username: user.username,
		firstName: user.first_name,
		lastName: user.last_name,
		lastActive: new Date(),
	})

	// Приветственное сообщение
	const welcomeMessage = `
🎉 Добро пожаловать, ${user.first_name}!

🤖 Я бот для связи с администратором. Вы можете написать мне любое сообщение, и администратор обязательно вам ответит.

📝 Что вы можете делать:
• Задавать вопросы
• Получать помощь
• Связываться с поддержкой

✅ Просто напишите ваше сообщение, и я передам его администратору!

________________________________

🎉 Хush kelibsiz, ${user.first_name}!

🤖 Men administrator bilan bog'lanish uchun botman. Siz menga istalgan xabarni yuborishingiz mumkin va administrator sizga albatta javob beradi.

📝 Siz nima qila olasiz:
• Savol bering
• Yordam oling
• Yordam bilan bog'laning

✅ Xabaringizni yozing va men uni administratorga yetkazaman!
	`.trim()

	// Отправляем приветственное сообщение
	bot.sendMessage(chatId, welcomeMessage)

	// Уведомляем админа о новом пользователе
	const userInfo = `${user.first_name} ${user.last_name || ''} ${
		user.username ? '@' + user.username : ''
	}`.trim()

	const adminNotification = `🆕 Новый пользователь запустил бота!\n👤 Пользователь: ${userInfo}\n🆔 Chat ID: ${chatId}`

	if (chatId.toString() !== ADMIN_CHAT_ID) {
		bot.sendMessage(ADMIN_CHAT_ID, adminNotification)
	}
})

// Обработчик входящих сообщений
bot.on('message', msg => {
	const chatId = msg.chat.id
	const messageText = msg.text
	const user = msg.from

	// Игнорируем команду /start (она уже обработана выше)
	if (messageText === '/start') {
		return
	}

	// Проверяем, не удален ли чат
	if (deletedChats.has(chatId)) {
		return
	}

	// Сохраняем информацию о пользователе
	users.set(chatId, {
		id: chatId,
		username: user.username,
		firstName: user.first_name,
		lastName: user.last_name,
		lastActive: new Date(),
	})

	// Создаем объект сообщения
	const messageObj = {
		id: msg.message_id,
		chatId: chatId,
		text: encrypt(messageText), // Шифруем сообщение
		user: {
			id: user.id,
			username: user.username,
			firstName: user.first_name,
			lastName: user.last_name,
		},
		timestamp: new Date(msg.date * 1000),
		replied: false,
	}

	// Сохраняем сообщение
	messages.unshift(messageObj)

	// Отправляем уведомление админу
	const userInfo = `${user.first_name} ${user.last_name || ''} ${
		user.username ? '@' + user.username : ''
	}`.trim()
	const adminNotification = `📩 Новое сообщение от: ${userInfo}\n💬 Текст: ${messageText}\n🆔 Chat ID: ${chatId}`

	// Отправляем уведомление в админ-чат
	if (chatId.toString() !== ADMIN_CHAT_ID) {
		bot.sendMessage(ADMIN_CHAT_ID, adminNotification)
	}

	// Отправляем данные через WebSocket
	io.emit('newMessage', messageObj)

	// Отправляем автоответ пользователю
	if (chatId.toString() !== ADMIN_CHAT_ID) {
		bot.sendMessage(
			chatId,
			`✅ Ваше сообщение получено! Администратор ответит вам в ближайшее время. 
✅ Sizning xabaringiz qabul qilindi! Administrator sizga tez orada javob beradi`
		)
	}
})

// API маршруты
app.get('/api/messages', (req, res) => {
	// Фильтруем сообщения, исключая удаленные чаты
	const activeMessages = messages
		.filter(msg => !deletedChats.has(msg.chatId))
		.map(msg => ({
			...msg,
			text: decrypt(msg.text), // Расшифровываем сообщение
		}))
	res.json(activeMessages)
})

app.get('/api/users', (req, res) => {
	// Фильтруем пользователей, исключая удаленные чаты
	const activeUsers = Array.from(users.values()).filter(
		user => !deletedChats.has(user.id)
	)
	res.json(activeUsers)
})

app.post('/api/reply', (req, res) => {
	const { chatId, message } = req.body

	if (!chatId || !message) {
		return res.status(400).json({ error: 'Chat ID и сообщение обязательны' })
	}

	// Проверяем, не удален ли чат
	if (deletedChats.has(chatId)) {
		return res.status(400).json({ error: 'Чат удален' })
	}

	// Добавляем подпись "Учитель:" в начало сообщения
	const messageWithSignature = `👨‍🏫 Ustoz :\n\n${message}`

	bot
		.sendMessage(chatId, messageWithSignature)
		.then(() => {
			// Помечаем сообщение как отвеченное
			const messageIndex = messages.findIndex(msg => msg.chatId === chatId)
			if (messageIndex !== -1) {
				messages[messageIndex].replied = true
			}

			io.emit('messageReplied', { chatId, message: messageWithSignature })
			res.json({ success: true })
		})
		.catch(error => {
			console.error('Ошибка отправки сообщения:', error)
			res.status(500).json({ error: 'Ошибка отправки сообщения' })
		})
})

// Новый API для удаления чата
app.post('/api/delete-chat', (req, res) => {
	const { chatId } = req.body

	if (!chatId) {
		return res.status(400).json({ error: 'Chat ID обязателен' })
	}

	// Добавляем чат в список удаленных
	deletedChats.add(chatId)

	// Удаляем пользователя из списка активных
	users.delete(chatId)

	// Отправляем уведомление через WebSocket
	io.emit('chatDeleted', { chatId })

	res.json({ success: true })
})

// HTML страница админ-панели
app.get('/', (req, res) => {
	res.send(`
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Админ-панель Telegram Bot</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background-color: #f5f5f5;
            padding: 10px;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            overflow: hidden;
        }

        .header {
            background: #0088cc;
            color: white;
            padding: 15px 20px;
            text-align: center;
        }

        .header h1 {
            font-size: 1.5rem;
            margin-bottom: 5px;
        }

        .header p {
            font-size: 0.9rem;
            opacity: 0.9;
        }

        .tabs {
            display: flex;
            background: #f8f9fa;
            border-bottom: 1px solid #dee2e6;
            overflow-x: auto;
        }

        .tab {
            padding: 12px 20px;
            cursor: pointer;
            border: none;
            background: none;
            font-size: 14px;
            transition: background-color 0.3s;
            white-space: nowrap;
            flex-shrink: 0;
        }

        .tab.active {
            background: white;
            border-bottom: 2px solid #0088cc;
        }

        .tab-content {
            display: none;
            padding: 15px;
        }

        .tab-content.active {
            display: block;
        }

        .message-item {
            background: #f8f9fa;
            margin: 10px 0;
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid #0088cc;
            position: relative;
        }

        .message-item.replied {
            border-left-color: #28a745;
            background: #f8fff8;
        }

        .message-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 10px;
            gap: 10px;
        }

        .user-info {
            font-weight: bold;
            color: #0088cc;
            flex: 1;
            min-width: 0;
        }

        .timestamp {
            color: #6c757d;
            font-size: 12px;
            flex-shrink: 0;
        }

        .message-text {
            margin: 10px 0;
            padding: 10px;
            background: white;
            border-radius: 5px;
            border: 1px solid #dee2e6;
            word-wrap: break-word;
        }

        .message-actions {
            display: flex;
            gap: 10px;
            margin-top: 10px;
            flex-wrap: wrap;
        }

        .delete-btn {
            background: #dc3545;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 12px;
            transition: background-color 0.3s;
        }

        .delete-btn:hover {
            background: #c82333;
        }

        .reply-section {
            margin-top: 10px;
        }

        .reply-input {
            width: 100%;
            padding: 10px;
            border: 1px solid #dee2e6;
            border-radius: 5px;
            resize: vertical;
            min-height: 60px;
            font-size: 14px;
        }

        .reply-btn {
            background: #0088cc;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 5px;
            cursor: pointer;
            margin-top: 10px;
            transition: background-color 0.3s;
            font-size: 14px;
        }

        .reply-btn:hover {
            background: #006ba3;
        }

        .reply-btn:disabled {
            background: #6c757d;
            cursor: not-allowed;
        }

        .user-item {
            background: #f8f9fa;
            margin: 10px 0;
            padding: 15px;
            border-radius: 8px;
            position: relative;
        }

        .user-item-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 10px;
        }

        .user-details {
            flex: 1;
            min-width: 0;
        }

        .user-name {
            font-weight: bold;
            color: #0088cc;
            margin-bottom: 5px;
        }

        .user-username {
            color: #6c757d;
            font-size: 12px;
            margin-bottom: 2px;
        }

        .user-id {
            color: #6c757d;
            font-size: 11px;
        }

        .user-actions {
            display: flex;
            flex-direction: column;
            gap: 5px;
            flex-shrink: 0;
        }

        .message-user-btn {
            background: #28a745;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 5px;
            cursor: pointer;
            transition: background-color 0.3s;
            font-size: 12px;
        }

        .message-user-btn:hover {
            background: #218838;
        }

        .status-indicator {
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            margin-right: 5px;
        }

        .status-new {
            background: #dc3545;
        }

        .status-replied {
            background: #28a745;
        }

        .modal {
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.5);
        }

        .modal-content {
            background-color: white;
            margin: 10% auto;
            padding: 20px;
            border-radius: 10px;
            width: 90%;
            max-width: 500px;
            max-height: 80vh;
            overflow-y: auto;
        }

        .close {
            color: #aaa;
            float: right;
            font-size: 28px;
            font-weight: bold;
            cursor: pointer;
            line-height: 1;
        }

        .close:hover {
            color: black;
        }

        .confirm-modal {
            text-align: center;
        }

        .confirm-buttons {
            display: flex;
            justify-content: center;
            gap: 10px;
            margin-top: 20px;
        }

        .confirm-btn {
            padding: 10px 20px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
        }

        .confirm-btn.danger {
            background: #dc3545;
            color: white;
        }

        .confirm-btn.secondary {
            background: #6c757d;
            color: white;
        }

        .empty-state {
            text-align: center;
            padding: 40px 20px;
            color: #6c757d;
        }

        .empty-state h3 {
            margin-bottom: 10px;
            color: #495057;
        }

        /* Мобильная адаптация */
        @media (max-width: 768px) {
            body {
                padding: 0;
            }

            .container {
                margin: 0;
                border-radius: 0;
                min-height: 100vh;
            }

            .header {
                padding: 10px 15px;
            }

            .header h1 {
                font-size: 1.2rem;
            }

            .tabs {
                justify-content: space-around;
            }

            .tab {
                flex: 1;
                text-align: center;
                padding: 10px 5px;
                font-size: 12px;
            }

            .tab-content {
                padding: 10px;
            }

            .message-item {
                padding: 12px;
                margin: 8px 0;
            }

            .message-header {
                flex-direction: column;
                align-items: flex-start;
                gap: 5px;
            }

            .user-info {
                font-size: 14px;
            }

            .timestamp {
                font-size: 11px;
            }

            .message-text {
                font-size: 14px;
                padding: 8px;
            }

            .message-actions {
                flex-direction: column;
                gap: 5px;
            }

            .reply-input {
                font-size: 16px; /* Предотвращает зум на iOS */
            }

            .user-item {
                padding: 12px;
            }

            .user-item-header {
                flex-direction: column;
                align-items: flex-start;
                gap: 10px;
            }

            .user-actions {
                flex-direction: row;
                width: 100%;
            }

            .message-user-btn {
                flex: 1;
                padding: 8px;
            }

            .modal-content {
                margin: 5% auto;
                padding: 15px;
                width: 95%;
                max-height: 90vh;
            }

            .empty-state {
                padding: 20px 15px;
            }
        }

        @media (max-width: 480px) {
            .header h1 {
                font-size: 1.1rem;
            }

            .header p {
                font-size: 0.8rem;
            }

            .tab {
                padding: 8px 3px;
                font-size: 11px;
            }

            .message-item {
                padding: 10px;
            }

            .user-item {
                padding: 10px;
            }

            .modal-content {
                padding: 10px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🤖 Админ-панель Telegram Bot</h1>
            <p>Управление сообщениями и пользователями</p>
        </div>

        <div class="tabs">
            <button class="tab active" onclick="showTab('messages')">💬 Сообщения</button>
            <button class="tab" onclick="showTab('users')">👥 Пользователи</button>
        </div>

        <div id="messages-tab" class="tab-content active">
            <div id="messages-list"></div>
        </div>

        <div id="users-tab" class="tab-content">
            <div id="users-list"></div>
        </div>
    </div>

    <!-- Модальное окно для отправки сообщения -->
    <div id="messageModal" class="modal">
        <div class="modal-content">
            <span class="close">&times;</span>
            <h2>Отправить сообщение</h2>
            <div id="modal-user-info"></div>
            <textarea id="modal-message" class="reply-input" placeholder="Введите сообщение..."></textarea>
            <button id="modal-send-btn" class="reply-btn">Отправить</button>
        </div>
    </div>

    <!-- Модальное окно подтверждения удаления -->
    <div id="confirmModal" class="modal">
        <div class="modal-content confirm-modal">
            <h3>Подтверждение удаления</h3>
            <p>Вы уверены, что хотите удалить этот чат?</p>
            <p style="font-size: 12px; color: #666; margin-top: 10px;">Это действие нельзя отменить.</p>
            <div class="confirm-buttons">
                <button id="confirm-delete-btn" class="confirm-btn danger">Удалить</button>
                <button id="cancel-delete-btn" class="confirm-btn secondary">Отмена</button>
            </div>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let currentUserId = null;
        let chatToDelete = null;

        // Загрузка сообщений
        function loadMessages() {
            fetch('/api/messages')
                .then(response => response.json())
                .then(messages => {
                    const messagesList = document.getElementById('messages-list');
                    messagesList.innerHTML = '';
                    
                    if (messages.length === 0) {
                        messagesList.innerHTML = \`
                            <div class="empty-state">
                                <h3>📭 Нет сообщений</h3>
                                <p>Здесь будут отображаться входящие сообщения</p>
                            </div>
                        \`;
                        return;
                    }
                    
                    messages.forEach(message => {
                        const messageElement = createMessageElement(message);
                        messagesList.appendChild(messageElement);
                    });
                });
        }

        // Загрузка пользователей
        function loadUsers() {
            fetch('/api/users')
                .then(response => response.json())
                .then(users => {
                    const usersList = document.getElementById('users-list');
                    usersList.innerHTML = '';
                    
                    if (users.length === 0) {
                        usersList.innerHTML = \`
                            <div class="empty-state">
                                <h3>👥 Нет пользователей</h3>
                                <p>Здесь будут отображаться активные пользователи</p>
                            </div>
                        \`;
                        return;
                    }
                    
                    users.forEach(user => {
                        const userElement = createUserElement(user);
                        usersList.appendChild(userElement);
                    });
                });
        }

        // Создание элемента сообщения
        function createMessageElement(message) {
            const div = document.createElement('div');
            div.className = 'message-item' + (message.replied ? ' replied' : '');
            
            const userInfo = [message.user.firstName, message.user.lastName].filter(Boolean).join(' ');
            const username = message.user.username ? '@' + message.user.username : 'без username';
            
            div.innerHTML = \`
                <div class="message-header">
                    <div class="user-info">
                        <span class="status-indicator \${message.replied ? 'status-replied' : 'status-new'}"></span>
                        \${userInfo} (\${username})
                    </div>
                    <div class="timestamp">\${new Date(message.timestamp).toLocaleString('ru-RU')}</div>
                </div>
                <div class="message-text">\${message.text}</div>
                <div class="user-details" style="font-size: 11px; color: #666; margin: 5px 0;">
                    <strong>👤 Пользователь:</strong> \${userInfo}<br>
                    <strong>📝 Username:</strong> \${username}<br>
                    <strong>🆔 Chat ID:</strong> \${message.chatId}<br>
                    <strong>🆔 User ID:</strong> \${message.user.id}
                </div>
                <div class="message-actions">
                    <button class="delete-btn" onclick="confirmDeleteChat(\${message.chatId})">🗑️ Удалить чат</button>
                </div>
                <div class="reply-section">
                    <textarea class="reply-input" placeholder="Ответить пользователю..." id="reply-\${message.chatId}"></textarea>
                    <button class="reply-btn" onclick="replyToMessage(\${message.chatId})">Ответить</button>
                </div>
            \`;
            
            return div;
        }

        // Создание элемента пользователя
        function createUserElement(user) {
            const div = document.createElement('div');
            div.className = 'user-item';
            
            const userInfo = [user.firstName, user.lastName].filter(Boolean).join(' ');
            const username = user.username ? '@' + user.username : 'без username';
            
            div.innerHTML = \`
                <div class="user-item-header">
                    <div class="user-details">
                        <div class="user-name">\${userInfo} (\${username})</div>
                        <div class="user-id">🆔 Chat ID: \${user.id}</div>
                        <div class="user-id">🆔 User ID: \${user.id}</div>
                        <div class="user-username">📅 Последняя активность: \${new Date(user.lastActive).toLocaleString('ru-RU')}</div>
                    </div>
                    <div class="user-actions">
                        <button class="message-user-btn" onclick="openMessageModal(\${user.id}, '\${userInfo}', '\${username}')">
                            📩 Написать
                        </button>
                        <button class="delete-btn" onclick="confirmDeleteChat(\${user.id})">
                            🗑️ Удалить
                        </button>
                    </div>
                </div>
            \`;
            
            return div;
        }

        // Подтверждение удаления чата
        function confirmDeleteChat(chatId) {
            chatToDelete = chatId;
            document.getElementById('confirmModal').style.display = 'block';
        }

        // Удаление чата
        function deleteChat(chatId) {
            fetch('/api/delete-chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ chatId }),
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    loadMessages();
                    loadUsers();
                    document.getElementById('confirmModal').style.display = 'none';
                } else {
                    alert('Ошибка удаления чата');
                }
            });
        }

        // Ответ на сообщение
        function replyToMessage(chatId) {
            const textarea = document.getElementById(\`reply-\${chatId}\`);
            const message = textarea.value.trim();
            
            if (!message) {
                alert('Введите сообщение');
                return;
            }
            
            fetch('/api/reply', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ chatId, message }),
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    textarea.value = '';
                    loadMessages();
                } else {
                    alert('Ошибка отправки сообщения');
                }
            });
        }

        // Открытие модального окна
        function openMessageModal(userId, userInfo, username) {
            currentUserId = userId;
            document.getElementById('modal-user-info').innerHTML = \`
                <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                    <p><strong>👤 Получатель:</strong> \${userInfo}</p>
                    <p><strong>📝 Username:</strong> \${username}</p>
                    <p><strong>🆔 Chat ID:</strong> \${userId}</p>
                    <p><strong>🆔 User ID:</strong> \${userId}</p>
                </div>
            \`;
            document.getElementById('messageModal').style.display = 'block';
        }

        // Отправка сообщения из модального окна
        document.getElementById('modal-send-btn').addEventListener('click', function() {
            const message = document.getElementById('modal-message').value.trim();
            
            if (!message) {
                alert('Введите сообщение');
                return;
            }
            
            fetch('/api/reply', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ chatId: currentUserId, message }),
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    document.getElementById('modal-message').value = '';
                    document.getElementById('messageModal').style.display = 'none';
                    loadMessages();
                    loadUsers();
                } else {
                    alert('Ошибка отправки сообщения');
                }
            });
        });

        // Переключение вкладок
        function showTab(tabName) {
            // Скрываем все вкладки
            document.querySelectorAll('.tab-content').forEach(tab => {
                tab.classList.remove('active');
            });
            
            // Убираем активность у всех кнопок
            document.querySelectorAll('.tab').forEach(tab => {
                tab.classList.remove('active');
            });
            
            // Показываем нужную вкладку
            document.getElementById(tabName + '-tab').classList.add('active');
            
            // Активируем нужную кнопку
            event.target.classList.add('active');
            
            // Загружаем данные для вкладки
            if (tabName === 'messages') {
                loadMessages();
            } else if (tabName === 'users') {
                loadUsers();
            }
        }

        // Закрытие модальных окон
        document.querySelector('.close').addEventListener('click', function() {
            document.getElementById('messageModal').style.display = 'none';
        });

        document.getElementById('cancel-delete-btn').addEventListener('click', function() {
            document.getElementById('confirmModal').style.display = 'none';
            chatToDelete = null;
        });

        document.getElementById('confirm-delete-btn').addEventListener('click', function() {
            if (chatToDelete) {
                deleteChat(chatToDelete);
                chatToDelete = null;
            }
        });

        // Закрытие модального окна при клике вне его
        window.addEventListener('click', function(event) {
            const messageModal = document.getElementById('messageModal');
            const confirmModal = document.getElementById('confirmModal');
            
            if (event.target === messageModal) {
                messageModal.style.display = 'none';
            }
            
            if (event.target === confirmModal) {
                confirmModal.style.display = 'none';
                chatToDelete = null;
            }
        });

        // WebSocket обработчики
        socket.on('newMessage', function(message) {
            loadMessages();
            loadUsers();
        });

        socket.on('messageReplied', function(data) {
            loadMessages();
        });

        socket.on('chatDeleted', function(data) {
            loadMessages();
            loadUsers();
        });

        // Обработка Enter в текстовых полях
        document.addEventListener('keydown', function(event) {
            if (event.key === 'Enter' && event.ctrlKey) {
                if (event.target.id === 'modal-message') {
                    document.getElementById('modal-send-btn').click();
                } else if (event.target.classList.contains('reply-input')) {
                    const chatId = event.target.id.split('-')[1];
                    replyToMessage(chatId);
                }
            }
        });

        // Инициализация
        loadMessages();
        loadUsers();
    </script>
</body>
</html>
    `)
})

// Запуск сервера
server.listen(PORT, () => {
	console.log(`🚀 Сервер запущен на порте ${PORT}`)
	console.log(`📱 Telegram Bot готов к работе`)
	console.log(`🔗 Админ-панель: http://localhost:${PORT}`)
})

// Обработка ошибок
process.on('unhandledRejection', (reason, promise) => {
	console.error('Unhandled Rejection at:', promise, 'reason:', reason)
})

process.on('uncaughtException', error => {
	console.error('Uncaught Exception:', error)
})

// Graceful shutdown
process.on('SIGTERM', () => {
	console.log('SIGTERM received, shutting down gracefully')
	server.close(() => {
		console.log('Process terminated')
	})
})

process.on('SIGINT', () => {
	console.log('SIGINT received, shutting down gracefully')
	server.close(() => {
		console.log('Process terminated')
	})
})
