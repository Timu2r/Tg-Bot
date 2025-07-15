require('dotenv').config();

module.exports = {
  BOT_TOKEN: process.env.BOT_TOKEN,
  ADMIN_CHAT_ID: '@Timu2r, @Buva112',
  PORT: process.env.PORT || 3000,
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  IV_LENGTH: 16
};