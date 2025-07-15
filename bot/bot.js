const TelegramBot = require('node-telegram-bot-api')
const { encrypt } = require('./encryption')
const { BOT_TOKEN, ADMIN_CHAT_ID } = require('../config')
const { storeMessage, storeUser, getDeletedChats } = require('../storage')

const bot = new TelegramBot(BOT_TOKEN, { polling: true })
const ADMIN_CHAT_IDS = process.env.ADMIN_CHAT_ID.split(',').map(id => id.trim());

function setupBotHandlers() {
	bot.onText(/\/start/, handleStartCommand)
	bot.on('message', handleIncomingMessage)
}

function handleStartCommand(msg) {
	const chatId = msg.chat.id
	const user = msg.from

	if (getDeletedChats().has(chatId)) {
		return
	}

	storeUser(chatId, user)

	const welcomeMessage = `
🎉 Добро пожаловать, ${user.first_name}!
🤖 Я бот для связи с администратором...
  `.trim()

	bot.sendMessage(chatId, welcomeMessage)

	if (!ADMIN_CHAT_IDS.includes(chatId.toString())) {
		const userInfo = formatUserInfo(user)
		bot.sendMessage(
			ADMIN_CHAT_ID,
			`🆕 Новый пользователь!\n👤 ${userInfo}\n🆔 Chat ID: ${chatId}`
		)
	}
}

function handleIncomingMessage(msg) {
	if (msg.text === '/start') return

	const chatId = msg.chat.id
	if (getDeletedChats().has(chatId)) return

	const user = msg.from
	storeUser(chatId, user)

	const messageObj = {
		id: msg.message_id,
		chatId,
		text: encrypt(msg.text),
		user: {
			id: user.id,
			username: user.username,
			firstName: user.first_name,
			lastName: user.last_name,
		},
		timestamp: new Date(msg.date * 1000),
		replied: false,
	}

	storeMessage(messageObj)

	if (chatId.toString() !== ADMIN_CHAT_ID) {
		const userInfo = formatUserInfo(user)
		bot.sendMessage(
			ADMIN_CHAT_ID,
			`📩 Новое сообщение от: ${userInfo}\n💬 Текст: ${msg.text}`
		)
		bot.sendMessage(chatId, '✅ Ваше сообщение получено!')
	}
}

function formatUserInfo(user) {
	return `${user.first_name} ${user.last_name || ''} ${
		user.username ? '@' + user.username : ''
	}`.trim()
}

module.exports = {
	bot,
	setupBotHandlers,
}
