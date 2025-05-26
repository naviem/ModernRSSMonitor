const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const logger = require('../logger');

module.exports.send = async function(config, message) {
  console.log('[ENTRY LOG] channels.discord.send CALLED.');
  console.log('[ENTRY LOG] channels.discord.send - config:', JSON.stringify(config, null, 2));
  console.log('[ENTRY LOG] channels.discord.send - message:', JSON.stringify(message, null, 2));

  const url = typeof config === 'string' ? config : config.webhook_url || '';
  logger.debug('Discord', 'Using webhook URL:', url);
  
  if (!/^https:\/\/discord\.com\/api\/webhooks\//.test(url)) {
    logger.error('Discord', 'Invalid webhook URL format:', url);
    throw new Error('Invalid Discord webhook URL');
  }

  logger.debug('Discord', 'Received message:', message);

  let payload = {};

  // Add username and avatar_url from config if they exist (for webhook override)
  if (config && typeof config === 'object') {
    if (config.username) {
      payload.username = config.username;
    }
    if (config.avatar_url) {
      payload.avatar_url = config.avatar_url;
    }
  }

  // Handle both embed and regular message formats
  if (message.embeds) {
    // Using embeds
    logger.debug('Discord', 'Message has embeds, content before processing:', message.content);
    
    payload.content = message.content === undefined ? '' : message.content;
    payload.embeds = message.embeds.map(embed => {
      // Ensure required fields are present and not empty
      if (!embed.title && !embed.description) {
        embed.description = message.text || message.subject || 'New notification';
      }
      return embed;
    });
  } else {
    // Regular text message
    const content = message.text || message.subject || '';
    payload.content = content || 'New notification';
  }

  logger.debug('Discord', 'Final payload:', JSON.stringify(payload, null, 2));

  try {
    logger.debug('Discord', 'Sending request to Discord...');
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const text = await response.text();
    logger.debug('Discord', `Webhook response status: ${response.status}`);
    logger.debug('Discord', `Webhook response body: ${text}`);
    
    if (!response.ok) {
      logger.error('Discord', `Discord webhook error: ${response.status} ${text}`);
      throw new Error(`Discord webhook error: ${response.status} ${text}`);
    }

    logger.info('Discord', 'Message sent successfully');
  } catch (error) {
    logger.error('Discord', 'Error sending message:', error);
    throw error;
  }
};
