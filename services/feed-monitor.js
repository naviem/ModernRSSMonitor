const Parser = require('rss-parser');
const { WebhookClient, EmbedBuilder } = require('discord.js');
const db = require('../db');
const crypto = require('crypto');

const parser = new Parser();
const activeFeeds = new Map();

function generateId() {
  return crypto.randomBytes(16).toString('hex');
}

async function checkFeed(feed) {
  try {
    const parsed = await parser.parseURL(feed.url);
    const latestArticles = await db.all(
      'SELECT url FROM articles WHERE feed_id = ? ORDER BY pub_date DESC LIMIT ?',
      [feed.id, parsed.items.length]
    );
    const existingUrls = new Set(latestArticles.map(a => a.url));

    for (const item of parsed.items) {
      if (existingUrls.has(item.link)) continue;

      // Apply filters if configured
      if (feed.title_filter || feed.content_filter) {
        const titleMatch = !feed.title_filter || new RegExp(feed.title_filter, 'i').test(item.title);
        const contentMatch = !feed.content_filter || new RegExp(feed.content_filter, 'i').test(item.content);
        
        if (!feed.filter_mode_any && !(titleMatch && contentMatch)) continue;
        if (feed.filter_mode_any && !(titleMatch || contentMatch)) continue;
      }

      // Store article
      const article = {
        id: generateId(),
        feed_id: feed.id,
        title: item.title,
        description: item.contentSnippet || '',
        content: item.content || '',
        url: item.link,
        pub_date: new Date(item.pubDate || item.isoDate).toISOString()
      };

      await db.run(
        'INSERT INTO articles (id, feed_id, title, description, content, url, pub_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [article.id, article.feed_id, article.title, article.description, article.content, article.url, article.pub_date]
      );

      // Send Discord notification if configured
      if (feed.webhook_url) {
        const webhook = new WebhookClient({ url: feed.webhook_url });
        
        if (feed.use_embeds) {
          const embed = new EmbedBuilder()
            .setTitle(item.title)
            .setURL(item.link)
            .setColor(0x3b82f6)
            .setTimestamp(new Date(item.pubDate || item.isoDate));

          if (feed.include_preview && item.contentSnippet) {
            embed.setDescription(item.contentSnippet);
          }

          await webhook.send({
            username: feed.webhook_username || feed.title,
            avatarURL: feed.webhook_avatar,
            embeds: [embed]
          });
        } else {
          let content = `**${item.title}**\n${item.link}`;
          if (feed.include_preview && item.contentSnippet) {
            content += `\n\n${item.contentSnippet}`;
          }

          await webhook.send({
            username: feed.webhook_username || feed.title,
            avatarURL: feed.webhook_avatar,
            content
          });
        }
      }
    }

    // Update last check time
    await db.run(
      'UPDATE feeds SET last_check = CURRENT_TIMESTAMP WHERE id = ?',
      [feed.id]
    );
  } catch (err) {
    console.error(`Error checking feed ${feed.title}:`, err);
  }
}

async function startFeedMonitor(feed) {
  if (activeFeeds.has(feed.id)) {
    clearInterval(activeFeeds.get(feed.id));
  }

  if (!feed.paused) {
    await checkFeed(feed);
    const interval = setInterval(() => checkFeed(feed), feed.interval * 60 * 1000);
    activeFeeds.set(feed.id, interval);
  }
}

async function stopFeedMonitor(feedId) {
  if (activeFeeds.has(feedId)) {
    clearInterval(activeFeeds.get(feedId));
    activeFeeds.delete(feedId);
  }
}

async function start() {
  const feeds = await db.all('SELECT * FROM feeds');
  for (const feed of feeds) {
    await startFeedMonitor(feed);
  }
}

async function stop() {
  for (const interval of activeFeeds.values()) {
    clearInterval(interval);
  }
  activeFeeds.clear();
}

module.exports = {
  start,
  stop,
  startFeedMonitor,
  stopFeedMonitor,
  checkFeed
}; 