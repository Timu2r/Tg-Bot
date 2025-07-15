const messages = [];
const users = new Map();
const deletedChats = new Set();

function storeMessage(message) {
  messages.unshift(message);
}

function storeUser(chatId, user) {
  users.set(chatId, {
    id: chatId,
    username: user.username,
    firstName: user.first_name,
    lastName: user.last_name,
    lastActive: new Date(),
  });
}

function deleteChat(chatId) {
  deletedChats.add(chatId);
  users.delete(chatId);
}

function getMessages() {
  return messages.filter(msg => !deletedChats.has(msg.chatId));
}

function getUsers() {
  return Array.from(users.values()).filter(user => !deletedChats.has(user.id));
}

function getDeletedChats() {
  return deletedChats;
}

module.exports = {
  storeMessage,
  storeUser,
  deleteChat,
  getMessages,
  getUsers,
  getDeletedChats
};