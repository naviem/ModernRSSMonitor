const axios = require('axios');

module.exports = {
  send: async (config, message) => {
    if (!config.webhookUrl) throw new Error('Slack webhook URL missing');
    await axios.post(config.webhookUrl, { text: message.text });
  }
};
