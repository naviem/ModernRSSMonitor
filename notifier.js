const db = require('./db');
const channels = require('./channels');

// Helper for variable interpolation in templates
function interpolate(template, item) {
  if (!template) return '';
  return template.replace(/\$\{(\w+)\}/g, (_, key) => item[key] || '');
}

async function sendNotification(feed, item, selectedChannels, io, isTest = false) {
  console.log('\n--- Notifier Entry Point ---');
  console.log('[NOTIFIER] sendNotification CALLED. isTest:', isTest);
  console.log('[NOTIFIER] feed argument (1st arg):', JSON.stringify(feed, null, 2));
  console.log('[NOTIFIER] item argument (2nd arg):', JSON.stringify(item, null, 2));
  console.log('[NOTIFIER] selectedChannels argument (3rd arg):', JSON.stringify(selectedChannels, null, 2));

  const connections = await db.getConnections();
  let fieldsToSend = [];
  try {
    fieldsToSend = Array.isArray(feed.fields_to_send)
      ? feed.fields_to_send
      : JSON.parse(feed.fields_to_send || '[]');
  } catch {
    fieldsToSend = [];
  }
  if (fieldsToSend.length === 0) {
    fieldsToSend = Object.keys(item);
  }

  for (const sel of selectedChannels) {
    // Determine the service type and configuration
    let service = '';
    let config = null;

    if (typeof sel === 'object') {
      // Direct configuration case
      if (sel.service === 'discord' && sel.webhook_url) {
        service = 'discord';
        config = sel;
      } else if (sel.webhook_url) {
        service = 'discord';
        config = sel;
      } else if (sel.connection_id) {
        const connection = connections.find(c => c.id === Number(sel.connection_id));
        if (!connection) continue;
        service = connection.service;
        if (service === 'telegram') {
          if (connection.config && connection.config.includes(':')) {
            const [botToken, chatId] = connection.config.split(':');
            config = { botToken, chatId };
          } else {
            console.error('Invalid Telegram connection config format:', connection.config);
            config = {}; // Ensure it's an object to avoid downstream errors, though send will fail
          }
        } else {
          config = connection.service === 'discord' ? connection.config : JSON.parse(connection.config || '{}');
        }
      } else if (sel.service) {
        service = sel.service;
        config = sel;
        // If the service is Telegram and we have a direct config object (unsaved settings from modal)
        // we need to map 'token' to 'botToken' and 'chat_id' to 'chatId'
        // for compatibility with channels/telegram.js
        if (service === 'telegram' && config && config.token && config.chat_id) {
          config = {
            botToken: config.token,
            chatId: config.chat_id
            // Preserve any other properties that might be on config, though unlikely for Telegram
            // ...Object.fromEntries(Object.entries(config).filter(([key]) => key !== 'token' && key !== 'chat_id'))
          };
        }
      }
    } else {
      // Legacy case - direct connection ID
      const connection = connections.find(c => c.id === Number(sel));
      if (!connection) continue;
      service = connection.service;
      config = connection.service === 'discord' ? connection.config : JSON.parse(connection.config || '{}');
    }

    if (!service || !config) {
      console.error('Invalid integration configuration:', sel);
      continue;
    }

    // --- Discord Embed Support ---
    let embed_settings = feed.embed_settings;
    if (typeof embed_settings === 'string') {
      try { embed_settings = JSON.parse(embed_settings); } catch { embed_settings = {}; }
    }

    if (service === 'discord' && embed_settings && embed_settings.enabled) {
      // If we have a pre-formatted message object, use it directly
      if (feed.message && feed.message.embeds) {
        console.log('[Notifier] Received message content:', JSON.stringify(feed.message.content));
        console.log('[Notifier] Full feed message:', JSON.stringify(feed.message, null, 2));
        
        const discordMessage = {
          content: feed.message.content === undefined ? '' : feed.message.content,  // Ensure undefined becomes empty string
          embeds: feed.message.embeds
        };
        
        console.log('[Notifier] Processed message content:', JSON.stringify(discordMessage.content));
        console.log('[Notifier] Full Discord message:', JSON.stringify(discordMessage, null, 2));
        
        try {
          await channels.discord.send(config, discordMessage);
          if (!isTest) {
            await db.addNotification({
              feedId: feed.id,
              title: item.title,
              link: item.link,
              status: 'sent',
              channel: service
            });
            if (io) io.emit('feed-update');
          }
          console.log(
            `Sent Discord message for feed "${feed.title}" article "${item.title || item.link}" to channel [${service}]`
          );
        } catch (e) {
          console.error('Error sending Discord message:', e.message);
          throw e;
        }
        continue;
      }

      let embeds = [];
      
      // Handle both new multi-embed format and legacy single embed format
      if (Array.isArray(embed_settings.embeds)) {
        embeds = embed_settings.embeds.map(embed => {
          // Create a new embed object with interpolated values
          const processedEmbed = {
            title: interpolate(embed.title || '', item),
            description: interpolate(embed.description || '', item),
            color: parseInt((embed.color || '#5865F2').replace('#', ''), 16),
          };

          // Add URL if available
          if (item.link) {
            processedEmbed.url = item.link;
          }

          // Add footer if specified
          if (embed.footer) {
            processedEmbed.footer = { text: interpolate(embed.footer, item) };
          }

          return processedEmbed;
        });
      } else {
        // Legacy single embed format
        const embed = {
          title: interpolate(embed_settings.title || '', item),
          description: interpolate(embed_settings.description || '', item),
          color: parseInt((embed_settings.color || '#5865F2').replace('#', ''), 16),
        };
        if (item.link) {
          embed.url = item.link;
        }
        if (embed_settings.footer) {
          embed.footer = { text: interpolate(embed_settings.footer, item) };
        }
        embeds = [embed];
      }

      // Remove undefined/null/empty fields from all embeds
      embeds.forEach(embed => {
        Object.keys(embed).forEach(key => {
          if (
            embed[key] === undefined ||
            embed[key] === null ||
            (typeof embed[key] === 'string' && embed[key].trim() === '') ||
            (typeof embed[key] === 'object' && Object.keys(embed[key]).length === 0)
          ) {
            delete embed[key];
          }
        });
      });

      // Debug log for outgoing payload
      const discordMessage = { content: '', embeds };
      console.log('Discord payload:', JSON.stringify(discordMessage, null, 2));

      try {
        await channels.discord.send(config, discordMessage);
        if (!isTest) {
          await db.addNotification({
            feedId: feed.id,
            title: item.title,
            link: item.link,
            status: 'sent',
            channel: service
          });
          if (io) io.emit('feed-update');
        }
        console.log(
          `Sent Discord embed for feed "${feed.title}" article "${item.title || item.link}" to channel [${service}]`
        );
      } catch (e) {
        if (!isTest) {
          await db.addNotification({
            feedId: feed.id,
            title: item.title,
            link: item.link,
            status: 'failed',
            channel: service
          });
        }
        console.error(`Error sending Discord embed:`, e.message);
      }
      continue; // skip plain text for this channel
    }

    // --- Plain Text Fallback ---
    let textParts = [];
    fieldsToSend.forEach(field => {
      if (typeof item[field] !== 'undefined') {
        if (field === 'link') {
          textParts.push(item[field]);
        } else {
          textParts.push(`${field}: ${item[field]}`);
        }
      } else {
        textParts.push(`${field}: [not set]`);
      }
    });
    const text = textParts.join('\n');
    const message = {
      text,
      subject: `[${feed.title}] ${item.title || ''}`,
      html: textParts.map(p => `<div>${p}</div>`).join(''),
    };

    try {
      await channels[service].send(config, message);
      if (!isTest) {
        await db.addNotification({
          feedId: feed.id,
          title: item.title,
          link: item.link,
          status: 'sent',
          channel: service
        });
        if (io) io.emit('feed-update');
      }
      console.log(
        `Sent notification for feed "${feed.title}" article "${item.title || item.link}" to channel [${service}]`
      );
    } catch (e) {
      if (!isTest) {
        await db.addNotification({
          feedId: feed.id,
          title: item.title,
          link: item.link,
          status: 'failed',
          channel: service
        });
      }
      console.error(`Error sending to ${service}:`, e.message);
      throw e;
    }
  }
}

module.exports = { sendNotification };
