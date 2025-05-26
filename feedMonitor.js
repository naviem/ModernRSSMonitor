const db = require('./db');
const Parser = require('rss-parser');
const parser = new Parser();
const notifier = require('./notifier');
const logger = require('./logger');
const fs = require('fs');

let lastChecks = new Map(); // Store last check times for each feed
let lastArticles = new Map(); // Store last seen articles for each feed

// --- Helper: Record a log entry for a feed (for analytics/details page) ---
async function recordFeedLog(feedId, level, message) {
  if (db.addFeedLog) {
    try {
      await db.addFeedLog(feedId, level, message);
    } catch (err) {
      console.error('Error recording feed log:', err);
    }
  }
}

// --- Poll a single feed and record stats/logs ---
async function pollFeed(feed, io) {
  const nowStr = new Date().toLocaleString();
  let scanStart = Date.now();
  try {
    console.log(`[${nowStr}] Scanning feed: "${feed.title}"`);
    await recordFeedLog(feed.id, 'info', `Scan started`);
    let parsed;
    if (feed.url.startsWith('file://') || /^[a-zA-Z]:\\/.test(feed.url)) {
      const filePath = feed.url.replace('file://', '');
      const xml = fs.readFileSync(filePath, 'utf8');
      parsed = await parser.parseString(xml);
    } else {
      parsed = await parser.parseURL(feed.url);
    }

    feed.recentArticles = parsed.items.slice(0, 10);

    // Detect new articles (not previously sent)
    let newArticles = [];
    for (const item of parsed.items) {
      const articleId = item.guid || item.id || item.link;
      if (!articleId) continue; // Skip articles without an identifier
      
      const alreadySent = await db.notificationExists(feed.id, articleId);
      if (!alreadySent) {
        newArticles.push(item);
        // Mark article as sent immediately to prevent duplicates
        await db.run(
          'INSERT INTO notifications (feed_id, article_url) VALUES (?, ?)',
          [feed.id, articleId]
        );
      }
    }

    if (newArticles.length === 0) {
      console.log(`[${nowStr}] No new articles for feed: "${feed.title}"`);
      await recordFeedLog(feed.id, 'info', `No new articles`);
    } else {
      console.log(`[${nowStr}] Found ${newArticles.length} new article(s) for feed: "${feed.title}"`);
      await recordFeedLog(feed.id, 'info', `Found ${newArticles.length} new articles`);
      
      // Parse integrations from feed settings
      let integrations = [];
      try {
        integrations = JSON.parse(feed.integrations || '[]');
      } catch (err) {
        logger.error('FeedMonitor', `Error parsing integrations for ${feed.title}: ${err.message}`);
        return;
      }

      // Send each new article through each integration
      for (const article of newArticles) {
        for (const integration of integrations) {
          try {
            // Convert single integration to array for sendNotification
            await notifier.sendNotification(feed, article, [integration], io);
            console.log(`[${nowStr}] Sent article "${article.title || article.link}" through ${integration.service}`);
            await recordFeedLog(feed.id, 'info', `Sent article "${article.title || article.link}" through ${integration.service}`);
          } catch (err) {
            logger.error('FeedMonitor', `Failed to send notification for ${feed.title} through ${integration.service}: ${err.message}`);
            await recordFeedLog(feed.id, 'error', `Failed to send through ${integration.service}: ${err.message}`);
          }
        }
      }
    }

    // Update last_checked in the database
    await db.updateFeedLastChecked(feed.id, new Date().toISOString());
    const scanDuration = Date.now() - scanStart;
    
    // Add feed stats
    await db.addFeedStat(feed.id, {
      scan_duration: scanDuration,
      new_articles: newArticles.length
    });
    
    await recordFeedLog(feed.id, 'info', `Scan complete`);

    io && io.emit('feed-update', { feedId: feed.id, items: parsed.items });
  } catch (e) {
    console.error(`[${nowStr}] Error scanning feed "${feed.title}": ${e.message}`);
    await recordFeedLog(feed.id, 'error', `Scan error: ${e.message}`);
  }
}

// --- Poll all feeds (respects individual intervals) ---
async function pollAllFeeds(io, options = {}) {
  const { force = false, onlyFeedId = null } = options;
  const feeds = await db.getFeeds();
  
  for (const feed of feeds) {
    // Skip if feed is paused
    if (feed.is_paused) continue;

    // Skip if not forced and not time to check yet
    const now = Date.now();
    const lastCheck = await db.getFeedLastChecked(feed.id);
    const interval = feed.interval * 60 * 1000; // Convert minutes to milliseconds
    
    if (!force && lastCheck && now - new Date(lastCheck).getTime() < interval) {
      console.log(`Skipping feed "${feed.title}" - not time to check yet`);
      continue;
    }
    if (onlyFeedId && feed.id !== onlyFeedId) continue;

    await pollFeed(feed, io);
  }
}

module.exports = { pollAllFeeds };
