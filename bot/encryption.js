const crypto = require('crypto');
const { ENCRYPTION_KEY, IV_LENGTH } = require('../config');

module.exports = {
  encrypt(text) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  },

  decrypt(text) {
    try {
      const textParts = text.split(':');
      const iv = Buffer.from(textParts.shift(), 'hex');
      const authTag = Buffer.from(textParts.shift(), 'hex');
      const encryptedText = Buffer.from(textParts.join(':'), 'hex');
      const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
      return decrypted.toString();
    } catch (error) {
      console.error("Ошибка дешифрования:", error);
      return "[Не удалось расшифровать сообщение]";
    }
  }
};