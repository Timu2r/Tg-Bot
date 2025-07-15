const express = require('express');
const { decrypt } = require('../bot/encryption');
const { bot } = require('../bot/bot');
const { getMessages, getUsers, deleteChat } = require('../storage');

const router = express.Router();

router.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../admin-panel/index.html'));
});

router.get('/api/messages', (req, res) => {
  const activeMessages = getMessages()
    .map(msg => ({
      ...msg,
      text: decrypt(msg.text),
    }));
  res.json(activeMessages);
});

router.get('/api/users', (req, res) => {
  res.json(getUsers());
});

router.post('/api/reply', (req, res) => {
  const { chatId, message } = req.body;
  const messageWithSignature = `👨‍🏫 Ustoz :\n\n${message}`;

  bot.sendMessage(chatId, messageWithSignature)
    .then(() => {
      res.json({ success: true });
    })
    .catch(error => {
      res.status(500).json({ error: 'Ошибка отправки сообщения' });
    });
});

router.post('/api/delete-chat', (req, res) => {
  const { chatId } = req.body;
  deleteChat(chatId);
  res.json({ success: true });
});

module.exports = router;