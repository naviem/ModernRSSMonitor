const axios = require('axios');

module.exports = {
  send: async (config, message) => {
    if (!config.botToken || !config.chatId) throw new Error('Telegram config missing');
    await axios.post(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      chat_id: config.chatId,
      text: message.text
    });
  }
};
