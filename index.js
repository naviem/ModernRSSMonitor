require('dotenv').config();

const express = require('express');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { Server } = require('socket.io');
const db = require('./db');
const logger = require('./logger');
const { pollAllFeeds } = require('./feedMonitor');
const Parser = require('rss-parser');
const parser = new Parser();
const notifier = require('./notifier');
const { WebhookClient } = require('discord.js');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const dbFile = path.join(__dirname, 'rssmonitor.sqlite');

// Initialize database and logger
db.init();
logger.initialize();

app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public', {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    } else if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    } else if (filePath.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png');
    } else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
      res.setHeader('Content-Type', 'image/jpeg');
    }
  }
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(async (req, res, next) => {
  try {
    res.locals.connections = await db.getConnections();
    next();
  } catch (err) {
    res.locals.connections = [];
    next();
  }
});

// --- ROUTES ---

app.get('/', async (req, res) => {
  const feeds = await db.getFeeds();
  for (const feed of feeds) {
    try {
      let parsed;
      if (feed.url.startsWith('file://') || /^[a-zA-Z]:\\/.test(feed.url)) {
        const filePath = feed.url.replace('file://', '');
        const xml = fs.readFileSync(filePath, 'utf8');
        parsed = await parser.parseString(xml);
      } else {
        parsed = await parser.parseURL(feed.url);
      }
      feed.recentArticles = parsed.items.slice(0, 10);
    } catch {
      feed.recentArticles = [];
    }
  }
  res.render('index', { feeds, connections: res.locals.connections });
});

app.get('/settings', async (req, res) => {
  try {
    const [
      logLevel,
      defaultChannel,
      desktopNotifications,
      defaultInterval,
      autoPauseFailedFeeds,
      theme
    ] = await Promise.all([
      db.getSetting('log_level'),
      db.getSetting('default_channel'),
      db.getSetting('desktop_notifications'),
      db.getSetting('default_interval'),
      db.getSetting('auto_pause_failed_feeds'),
      db.getSetting('theme')
    ]);

    res.render('settings', {
      connections: res.locals.connections,
      currentLogLevel: logLevel || 'info',
      defaultChannel: defaultChannel || 'none',
      desktopNotifications: desktopNotifications === 'true',
      defaultInterval: parseInt(defaultInterval) || 5,
      autoPauseFailedFeeds: autoPauseFailedFeeds === 'true',
      theme: theme || 'light'
    });
  } catch (err) {
    console.error('Error loading settings:', err);
    res.render('settings', {
      connections: res.locals.connections,
      error: err.message
    });
  }
});

app.get('/integrations', async (req, res) => {
  res.render('integrations', { connections: res.locals.connections });
});

app.get('/help', async (req, res) => {
  res.render('help', { connections: res.locals.connections });
});

app.get('/changelog', async (req, res) => {
  res.render('changelog', { connections: res.locals.connections });
});

// --- INTEGRATIONS API ENDPOINTS ---

app.get('/api/integrations', async (req, res) => {
  try {
    const connections = await db.getConnections();
    res.json(connections);
  } catch (err) {
    console.error('Error fetching integrations:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/integrations/add', async (req, res) => {
  try {
    await db.addConnection(req.body);
    io.emit('integration-update');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/integrations/:id', async (req, res) => {
  try {
    const { service, label, config } = req.body;
    await db.updateConnection(req.params.id, { service, label, config });
    io.emit('integration-update');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/integrations/delete/:id', async (req, res) => {
  try {
    await db.deleteConnection(req.params.id);
    io.emit('integration-update');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/integrations/:id', async (req, res) => {
  try {
    const connections = await db.getConnections();
    const conn = connections.find(c => c.id == req.params.id);
    if (!conn) {
      return res.status(404).json({ error: 'Integration not found' });
    }
    res.json(conn);
  } catch (err) {
    console.error('Error fetching integration:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/integrations/:id/test', async (req, res) => {
  const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
  const connections = await db.getConnections();
  const conn = connections.find(c => c.id == req.params.id);
  if (!conn) return res.json({ success: false, error: "Integration not found" });
  try {
    if (conn.service === 'discord' || conn.service === 'slack') {
      if (!/^https?:\/\//.test(conn.config)) {
        return res.json({ success: false, error: "Invalid webhook URL." });
      }
    }
    if (conn.service === 'telegram') {
      if (!conn.config.includes(':')) {
        return res.json({ success: false, error: "Telegram config must be BOT_TOKEN:CHAT_ID" });
      }
    }
    if (conn.service === 'discord') {
      await fetch(conn.config, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '🧪 Test notification from Modern RSS Monitor!' })
      });
      return res.json({ success: true, message: "Test message sent to Discord!" });
    }
    if (conn.service === 'slack') {
      await fetch(conn.config, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '🧪 Test notification from Modern RSS Monitor!' })
      });
      return res.json({ success: true, message: "Test message sent to Slack!" });
    }
    if (conn.service === 'telegram') {
      const [botToken, chatId] = conn.config.split(':');
      const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: '🧪 Test notification from Modern RSS Monitor!' })
      });
      return res.json({ success: true, message: "Test message sent to Telegram!" });
    }
    res.json({ success: false, error: "Test not implemented for this service." });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// --- FEEDS API ENDPOINTS ---

app.get('/api/feeds', async (req, res) => {
  try {
    const feeds = await db.getFeeds();
    res.json(feeds);
  } catch (err) {
    console.error('Error fetching feeds:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/feeds', async (req, res) => {
  try {
    const { title, url, interval, integrations } = req.body;

    // Validate required fields
    if (!title || !url) {
      return res.status(400).json({
        success: false,
        error: 'Title and URL are required'
      });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch (e) {
      return res.status(400).json({
        success: false,
        error: 'Invalid URL format'
      });
    }

    // Create the feed
    const result = await db.addFeed({
      title,
      url,
      interval: interval || 5,
      integrations: integrations || []
    });

    // Notify connected clients
    io.emit('feed-update');

    res.json({ 
      success: true, 
      id: result.lastID 
    });

  } catch (err) {
    console.error('Error creating feed:', err);
    
    // Check for duplicate URL error
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({
        success: false,
        error: 'A feed with this URL already exists'
      });
    }

    res.status(500).json({
      success: false,
      error: err.message || 'Failed to create feed'
    });
  }
});

app.post('/api/feeds/scan-all', async (req, res) => {
  await pollAllFeeds(io, { force: true });
  res.json({ success: true });
});

app.post('/api/feeds/:id/scan-now', async (req, res) => {
  await pollAllFeeds(io, { force: true, onlyFeedId: Number(req.params.id) });
  res.json({ success: true });
});

app.post('/api/feeds/test', async (req, res) => {
  try {
    const url = req.body.url;
    if (url.startsWith('file://') || /^[a-zA-Z]:\\/.test(url)) {
      const filePath = url.replace('file://', '');
      const xml = fs.readFileSync(filePath, 'utf8');
      await parser.parseString(xml);
    } else {
      await parser.parseURL(url);
    }
    res.json({ valid: true });
  } catch {
    res.json({ valid: false });
  }
});

app.post('/api/feeds/detect-fields', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const parser = new Parser();
    const feed = await parser.parseURL(url);
    
    if (!feed || !feed.items || !feed.items[0]) {
      return res.status(400).json({ error: 'No items found in feed' });
    }

    // Get all unique fields from the first item
    const fields = Object.keys(feed.items[0]).filter(field => 
      // Filter out internal fields and functions
      typeof feed.items[0][field] !== 'function' && 
      !field.startsWith('_') &&
      !['constructor', 'prototype'].includes(field)
    );

    res.json({ fields });
  } catch (err) {
    console.error('Error detecting fields:', err);
    res.status(500).json({ error: err.message || 'Failed to detect fields' });
  }
});

app.post('/api/feeds/send-test', async (req, res) => {
  try {
    const {
      url,
      title,
      interval,
      filters,
      integrations, // This comes from testEmbed's testData.integrations
      fields_to_send,
      test_item,
      embed_settings, // This is feed.embed_settings (raw templates)
      message         // This is feed.message (client-interpolated embeds)
    } = req.body;

    console.log('\n--- Test Notification API Call ---');
    console.log('[API /api/feeds/send-test] Received req.body.integrations:', JSON.stringify(integrations, null, 2));
    console.log('[API /api/feeds/send-test] Received req.body.message:', JSON.stringify(message, null, 2));
    console.log('[API /api/feeds/send-test] Received req.body.embed_settings:', JSON.stringify(embed_settings, null, 2));
    console.log('[API /api/feeds/send-test] Received req.body.test_item:', JSON.stringify(test_item, null, 2));

    const feedObjectForNotifier = { 
      title: title || 'Test Feed',
      url: url || 'http://example.com/feed.xml',
      interval: interval || 5,
      filters: filters || {},
      fields_to_send: fields_to_send || [],
      embed_settings: embed_settings, // The raw templates from the form
      message: message, // The client-side interpolated embeds
      // No 'integrations' property on feedObjectForNotifier itself for this call type
    };

    console.log('[API /api/feeds/send-test] feedObjectForNotifier (1st arg to notifier):', JSON.stringify(feedObjectForNotifier, null, 2));
    console.log('[API /api/feeds/send-test] integrations argument (3rd arg to notifier):', JSON.stringify(integrations, null, 2));

    const itemForNotifier = test_item && Object.keys(test_item).length > 0 ? test_item : {};
    
    // `integrations` from req.body directly becomes `selectedChannels` for the notifier
    await notifier.sendNotification(feedObjectForNotifier, itemForNotifier, integrations || [], null, true);
    
    console.log('[API /api/feeds/send-test] Successfully called notifier.sendNotification');
    res.json({ success: true, message: 'Test notification process initiated.' });

  } catch (e) {
    console.error('[API /api/feeds/send-test] Error:', e.message, e.stack);
    res.json({ success: false, error: e.message });
  }
});

app.get('/api/feeds/:id', async (req, res) => {
  try {
    const feedId = req.params.id;
    const feed = await db.getFeed(feedId);

    if (!feed) {
      return res.status(404).json({ error: 'Feed not found' });
    }

    res.json(feed);
  } catch (err) {
    console.error(`Error fetching feed ${req.params.id}:`, err);
    res.status(500).json({ error: 'Failed to fetch feed' });
  }
});

app.put('/api/feeds/:id', async (req, res) => {
  try {
    const { 
      title, 
      url, 
      interval, 
      integrations,
      use_embeds,
      include_preview,
      fields_to_send,
      preview_settings,
      filters
    } = req.body;
    
    // Validate required fields
    if (!title || !url || !interval) {
      return res.status(400).json({ 
        success: false, 
        error: 'Title, URL, and interval are required' 
      });
    }

    // Process integrations to ensure embed settings are properly handled
    const processedIntegrations = (integrations || []).map(integration => {
      if (integration.service === 'discord' && integration.embed_settings) {
        // Ensure embed_settings is properly formatted
        if (typeof integration.embed_settings === 'string') {
          try {
            integration.embed_settings = JSON.parse(integration.embed_settings);
          } catch (err) {
            // Use logger for error
            logger.error('API', 'Error parsing embed settings in PUT /api/feeds/:id:', err, integration.embed_settings);
          }
        }
        // Validate embed settings structure
        if (integration.embed_settings && !integration.embed_settings.embeds) {
          integration.embed_settings = {
            enabled: true,
            embeds: Array.isArray(integration.embed_settings) ? integration.embed_settings : [integration.embed_settings]
          };
        }
      }
      return integration;
    });

    const feedDataToUpdate = {
      title,
      url,
      interval,
      integrations: processedIntegrations,
      use_embeds: use_embeds === true ? 1 : 0,
      include_preview: include_preview === true ? 1 : 0,
      fields_to_send: fields_to_send || [],
      preview_settings: preview_settings || {},
      filters: filters || {}
    };

    // Use logger.debug or logger.info for this important log
    logger.info('API_UPDATE_FEED', `Data for db.updateFeed (ID: ${req.params.id}):`, feedDataToUpdate);

    // Update the feed
    await db.updateFeed(req.params.id, feedDataToUpdate);

    // Emit update to connected clients
    io.emit('feed-update');
    
    res.json({ success: true });
  } catch (err) {
    // Use logger for error
    logger.error('API_UPDATE_FEED', `Error updating feed (ID: ${req.params.id}):`, err, req.body);
    res.status(500).json({ 
      success: false, 
      error: err.message || 'Failed to update feed'
    });
  }
});

app.post('/api/feeds/:id/pause', async (req, res) => {
  await db.toggleFeedPause(req.params.id);
  const feeds = await db.getFeeds();
  const feed = feeds.find(f => f.id == req.params.id);
  io.emit('feed-update');
  res.json({ success: true, is_paused: feed && feed.is_paused ? true : false });
});

app.post('/api/feeds/:id/toggle', async (req, res) => {
  try {
    await db.toggleFeedPause(req.params.id);
    const feeds = await db.getFeeds();
    const feed = feeds.find(f => f.id == req.params.id);
    io.emit('feed-update');
    res.json({ success: true, paused: feed && feed.is_paused ? true : false });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/feeds/:id', async (req, res) => {
  await db.deleteFeed(req.params.id);
  io.emit('feed-update');
  res.json({ success: true });
});

// --- RESET ENDPOINTS ---

app.post('/api/reset-all', async (req, res) => {
  try {
    await new Promise((resolve, reject) => {
      db.db.serialize(() => {
        db.db.run('DELETE FROM feeds', err => {
          if (err) return reject(err);
          db.db.run('DELETE FROM connections', err2 => {
            if (err2) return reject(err2);
            resolve();
          });
        });
      });
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/wipe-database', async (req, res) => {
  try {
    if (fs.existsSync(dbFile)) {
      db.db.close(() => {
        fs.unlinkSync(dbFile);
        db.initialize();
        res.json({ success: true });
      });
    } else {
      db.initialize();
      res.json({ success: true });
    }
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// --- POLLING SETUP ---
setInterval(() => pollAllFeeds(io), 60 * 1000);
pollAllFeeds(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`ModernRSSMonitor running at http://localhost:${PORT}`);
});

// === FEED DETAILS PAGE ROUTE (NEW, APPENDED) ===
app.get('/feed/:id', async (req, res) => {
  const feedId = req.params.id;
  const feed = await db.getFeed(feedId);
  if (!feed) return res.status(404).send('Feed not found');

  // Gather stats/logs for this feed
  const logs = await db.getFeedLogs(feedId, { limit: 10, sinceDays: 7 });
  const stats = await db.getFeedStats(feedId, { days: 7 });

  // Calculate stats for UI
  const lastScan = logs.find(l => l.message === 'Scan complete');
  const errors24h = logs.filter(l => l.level === 'error' && new Date(l.timestamp) > Date.now() - 24*60*60*1000);
  const articles24h = stats.filter(s => new Date(s.timestamp) > Date.now() - 24*60*60*1000)
    .reduce((sum, s) => sum + (s.new_articles || 0), 0);
  const avgScanDuration = stats.length ? Math.round(stats.reduce((a, s) => a + (s.scan_duration || 0), 0) / stats.length) : 0;
  const uptime = stats.length ? Math.round(100 * (stats.length - errors24h.length) / stats.length) : 100;

  res.render('feed-details', {
    feed,
    logs,
    stats: {
      lastScan: lastScan ? lastScan.timestamp : 'Never',
      errors24h: errors24h.length,
      articles24h,
      avgScanDuration,
      uptime,
    }
  });
});

// Add new API endpoints for log level
app.get('/api/settings/log-level', async (req, res) => {
  try {
    const level = await db.getSetting('log_level');
    res.json({ level: level || 'info' });
  } catch (error) {
    logger.error('API', 'Error getting log level:', error);
    res.status(500).json({ error: 'Failed to get log level' });
  }
});

app.post('/api/settings/log-level', async (req, res) => {
  try {
    const { level } = req.body;
    await logger.setLevel(level);
    res.json({ success: true });
  } catch (error) {
    logger.error('API', 'Error setting log level:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test embed only - sends only embed data
app.post('/api/test-embed', async (req, res) => {
  try {
    console.log('🧪 Testing ONLY embed configuration with LIVE data...');
    const { feed_id, connection_id, webhook_url, username, avatar_url, embed_settings } = req.body;
    
    if (!embed_settings || !embed_settings.embeds || embed_settings.embeds.length === 0) {
      return res.status(400).json({ success: false, error: 'No embed configuration provided' });
    }

    let liveArticleData = {
      title: 'Fallback: Sample Article Title',
      description: 'Fallback: This is a sample description from the RSS feed.',
      link: 'https://example.com/fallback-article',
      pubDate: new Date().toISOString(),
      author: 'Fallback: Author Name',
      // Add any other fields your placeholders might use, with fallback values
      guid: 'fallback-guid-' + Date.now(),
      category: 'Fallback Category',
      content: 'Fallback: Full article content here.',
      thumbnail: '', // Placeholder, ideally a real fallback image URL
      image: ''      // Placeholder
    };

    if (feed_id) {
      try {
        const feed = await db.getFeed(feed_id);
        if (feed && feed.url) {
          console.log(`[Test Embed] Fetching live data from feed URL: ${feed.url}`);
          const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
          const response = await fetch(feed.url);
          if (!response.ok) {
            throw new Error(`Failed to fetch feed XML from ${feed.url}: ${response.statusText}`);
          }
          const feedXml = await response.text();
          const parsedFeed = await parser.parseStringPromise(feedXml);
          
          let items = [];
          if (parsedFeed.rss && parsedFeed.rss.channel && parsedFeed.rss.channel.item) {
            items = Array.isArray(parsedFeed.rss.channel.item) ? parsedFeed.rss.channel.item : [parsedFeed.rss.channel.item];
          } else if (parsedFeed.feed && parsedFeed.feed.entry) { // Atom feed
            items = Array.isArray(parsedFeed.feed.entry) ? parsedFeed.feed.entry : [parsedFeed.feed.entry];
            // Remap Atom fields to a common structure if necessary
            items = items.map(entry => ({
              title: entry.title && typeof entry.title === 'object' ? entry.title._ : entry.title,
              link: entry.link && typeof entry.link === 'object' && entry.link.href ? entry.link.href : (Array.isArray(entry.link) ? entry.link[0]?.href : entry.link),
              pubDate: entry.updated || entry.published,
              author: entry.author && entry.author.name ? entry.author.name : 'N/A',
              description: entry.summary && typeof entry.summary === 'object' ? entry.summary._ : (entry.content && typeof entry.content === 'object' ? entry.content._ : (entry.summary || entry.content || '')),
              guid: entry.id,
              category: Array.isArray(entry.category) ? entry.category.map(c => c.$.term).join(', ') : (entry.category ? entry.category.$.term : ''),
              content: entry.content && typeof entry.content === 'object' ? entry.content._ : entry.content,
              // Atom doesn't have direct thumbnail/image in the same way, might need custom logic or use media:thumbnail
              thumbnail: entry['media:thumbnail']?.$?.url || entry['media:group']?.['media:thumbnail']?.$?.url || '',
              image: entry['media:content']?.$?.url && entry['media:content']?.$?.type?.startsWith('image/') ? entry['media:content'].$.url : ''
            }));
          }

          if (items.length > 0) {
            liveArticleData = items[0]; // Use the most recent item
            console.log('[Test Embed] Successfully fetched and parsed live article data:', liveArticleData);
          } else {
            console.warn('[Test Embed] Feed fetched but no items found, using fallback data.');
          }
        } else {
          console.warn(`[Test Embed] Feed with id ${feed_id} not found or has no URL, using fallback data.`);
        }
      } catch (error) {
        console.error('[Test Embed] Error fetching or parsing live feed data:', error);
        // Keep using fallback data in case of error
      }
    } else {
      console.log('[Test Embed] No feed_id provided, using fallback data for interpolation.');
    }

    // Function to interpolate variables
    function interpolate(template, data) {
      if (typeof template !== 'string' || !template) return '';
      // Regex to match ${variableName} or ${variableName|fallback text}
      return template.replace(/\$\{([^}]+)\}/g, (match, expression) => {
        const parts = expression.split('|');
        const key = parts[0].trim();
        const fallback = parts.length > 1 ? parts.slice(1).join('|').trim() : match;
        // Ensure data properties are accessed safely and are strings
        let value = data[key];
        if (typeof value === 'object' && value !== null) { // Handle cases like title: {_: 'Actual Title Text'}
          value = value._ || value.toString();
        }
        return value !== undefined && value !== null && String(value).trim() !== '' ? String(value) : fallback;
      });
    }
    
    console.log('[Embed Loop] Interpolating with data:', liveArticleData);
    const processedEmbeds = embed_settings.embeds.map(embed => {
      const currentProcessedEmbed = {};

      if (embed.title) currentProcessedEmbed.title = interpolate(embed.title, liveArticleData);
      if (embed.description) currentProcessedEmbed.description = interpolate(embed.description, liveArticleData);
      if (embed.url) currentProcessedEmbed.url = interpolate(embed.url, liveArticleData);
      
      currentProcessedEmbed.color = typeof embed.color === 'string' 
                                      ? parseInt(embed.color.replace('#', ''), 16) 
                                      : (typeof embed.color === 'number' ? embed.color : parseInt('5865F2', 16)); // Default color

      if (embed.author) { // Assuming author is an object {name, url, icon_url}
        currentProcessedEmbed.author = {
          name: interpolate(embed.author.name || '', liveArticleData),
          url: interpolate(embed.author.url || '', liveArticleData),
          icon_url: interpolate(embed.author.icon_url || '', liveArticleData)
        };
        if (!currentProcessedEmbed.author.name) delete currentProcessedEmbed.author; // Remove author if name is empty
      }
      
      if (embed.footer) { // Assuming footer is an object {text, icon_url}
        currentProcessedEmbed.footer = {
          text: interpolate(embed.footer.text || '', liveArticleData),
          icon_url: interpolate(embed.footer.icon_url || '', liveArticleData)
        };
        if (!currentProcessedEmbed.footer.text) delete currentProcessedEmbed.footer; // Remove footer if text is empty
      }

      if (embed.thumbnail && embed.thumbnail.url) {
        currentProcessedEmbed.thumbnail = { url: interpolate(embed.thumbnail.url, liveArticleData) };
        if (!currentProcessedEmbed.thumbnail.url) delete currentProcessedEmbed.thumbnail;
      }
      
      if (embed.image && embed.image.url) {
        currentProcessedEmbed.image = { url: interpolate(embed.image.url, liveArticleData) };
        if (!currentProcessedEmbed.image.url) delete currentProcessedEmbed.image;
      }
      
      if (embed.fields && Array.isArray(embed.fields)) {
        currentProcessedEmbed.fields = embed.fields.map(field => ({
          name: interpolate(field.name || '', liveArticleData),
          value: interpolate(field.value || '', liveArticleData),
          inline: field.inline || false
        })).filter(f => f.name && f.value); // Filter out fields with no name or value
        if (currentProcessedEmbed.fields.length === 0) delete currentProcessedEmbed.fields;
      }
      
      // Add timestamp if embed.timestamp is true or a valid ISO string
      if (embed.timestamp) {
        if (embed.timestamp === true || embed.timestamp === 'true') {
          currentProcessedEmbed.timestamp = new Date().toISOString();
        } else if (typeof embed.timestamp === 'string' && !isNaN(new Date(embed.timestamp).valueOf())) {
          currentProcessedEmbed.timestamp = new Date(embed.timestamp).toISOString();
        } else { // Try to interpolate if it's a placeholder like ${pubDate}
            const interpolatedTimestamp = interpolate(embed.timestamp, liveArticleData);
            if (!isNaN(new Date(interpolatedTimestamp).valueOf())) {
                currentProcessedEmbed.timestamp = new Date(interpolatedTimestamp).toISOString();
            }
        }
      }
      return currentProcessedEmbed;
    }).filter(embed => Object.keys(embed).length > 1 || (Object.keys(embed).length === 1 && embed.color !== undefined)); // Ensure embed has more than just color, or just color if that's all

    if (processedEmbeds.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid embeds to send after processing (all might be empty)' });
    }
    
    let finalWebhookUrl = webhook_url;
    let finalUsername = username || 'RSS Monitor (Test)';
    let finalAvatarUrl = avatar_url;

    if (connection_id) {
      console.log(`[Test Embed] Using connection ID: ${connection_id}`);
      const connection = await db.getDiscordConnection(connection_id); // Assumes this function exists
      if (!connection) {
        return res.status(404).json({ success: false, error: 'Discord connection not found' });
      }
      finalWebhookUrl = connection.webhook_url; // Override with connection's webhook
      // Optionally use connection's username/avatar if provided ones are empty
      finalUsername = username || connection.username || 'RSS Monitor (Test)';
      finalAvatarUrl = avatar_url || connection.avatar_url;
      console.log(`[Test Embed] Overriding with connection details - Webhook: ${finalWebhookUrl ? '******' : 'Not Set'}, User: ${finalUsername}`);
    }

    if (!finalWebhookUrl) {
        return res.status(400).json({ success: false, error: 'Discord webhook URL is missing.' });
    }

    const discordPayload = {
      content: embed_settings.content || "", // Allow top-level content message
      embeds: processedEmbeds,
      username: finalUsername,
      avatar_url: finalAvatarUrl || undefined // Ensure it's undefined if empty, not an empty string
    };

    console.log('💎 Testing embed payload (final after filtering and live data):', JSON.stringify(discordPayload, null, 2));
    
    const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
    const response = await fetch(finalWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(discordPayload)
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Discord API error response:', errorBody);
      // Try to parse as JSON, but fallback to text if not
      let errorDetail = errorBody;
      try {
        const jsonError = JSON.parse(errorBody);
        // Discord often sends errors in a structured way, e.g. jsonError.message or jsonError.embeds
        errorDetail = jsonError.message || JSON.stringify(jsonError); 
      } catch (e) { /* was not JSON */ }
      throw new Error(`Discord API error: ${response.status} ${errorDetail}`);
    }
    
    // Handle 204 No Content success
    if (response.status === 204) {
        console.log('✅ Test embed sent successfully to Discord (204 No Content)');
        return res.json({ success: true, message: 'Test embed sent successfully!' });
    }

    const result = await response.json(); // If not 204, try to parse JSON
    console.log('✅ Test embed response from Discord:', result);
    res.json({ success: true, message: 'Test embed sent successfully!', details: result });

  } catch (error) {
    console.error('❌ Test embed error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Feed preview endpoint
app.get('/api/feeds/:id/preview', async (req, res) => {
  try {
    const feeds = await db.getFeeds();
    const feed = feeds.find(f => f.id == req.params.id);
    if (!feed) return res.status(404).json({ error: 'Feed not found' });

    let parsed;
    if (feed.url.startsWith('file://') || /^[a-zA-Z]:\\/.test(feed.url)) {
      const filePath = feed.url.replace('file://', '');
      const xml = fs.readFileSync(filePath, 'utf8');
      parsed = await parser.parseString(xml);
    } else {
      parsed = await parser.parseURL(feed.url);
    }

    res.json({
      title: parsed.title,
      description: parsed.description,
      items: parsed.items.slice(0, 5).map(item => ({
        title: item.title,
        description: item.contentSnippet || item.description || '',
        content: item.content || '',
        link: item.link || item.url || '',
        author: item.author || item.creator || '',
        categories: item.categories || [],
        pubDate: item.pubDate || item.isoDate,
        guid: item.guid || item.id || '',
        comments: item.comments || '',
        enclosure: item.enclosure || null,
        ...item // Include any other fields that might be present
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Feed articles endpoint
app.get('/api/feeds/:id/articles', async (req, res) => {
  try {
    const feeds = await db.getFeeds();
    const feed = feeds.find(f => f.id == req.params.id);
    if (!feed) return res.status(404).json({ error: 'Feed not found' });

    let parsed;
    if (feed.url.startsWith('file://') || /^[a-zA-Z]:\\/.test(feed.url)) {
      const filePath = feed.url.replace('file://', '');
      const xml = fs.readFileSync(filePath, 'utf8');
      parsed = await parser.parseString(xml);
    } else {
      parsed = await parser.parseURL(feed.url);
    }

    res.json(parsed.items.slice(0, 10).map(item => ({
      id: item.guid || item.id || item.link,
      title: item.title,
      description: item.contentSnippet || item.description || '',
      pubDate: item.pubDate || item.isoDate
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/feeds/:id/send-test', async (req, res) => {
  try {
    logger.info('API', `Received test notification request for feed ${req.params.id}`);
    logger.debug('API', 'Request body:', req.body);

    // Get the feed using db.get directly
    const feed = await db.get('SELECT * FROM feeds WHERE id = ?', [req.params.id]);
    if (!feed) {
      logger.error('API', `Feed not found: ${req.params.id}`);
      return res.status(404).json({ success: false, error: 'Feed not found' });
    }
    logger.debug('API', 'Found feed:', feed);

    // Use integrations from request if provided, otherwise parse from feed
    let integrations = req.body.integrations || [];
    if (integrations.length === 0) {
      try {
        integrations = JSON.parse(feed.integrations || '[]');
      } catch (err) {
        logger.error('API', 'Failed to parse feed integrations:', err);
        return res.status(400).json({ success: false, error: 'Invalid feed configuration' });
      }
    }
    logger.debug('API', 'Using integrations:', integrations);

    if (integrations.length === 0) {
      logger.error('API', 'No integrations configured for feed');
      return res.status(400).json({ success: false, error: 'No integrations configured' });
    }

    // Get fields to send
    const fields_to_send = req.body.fields_to_send || [];
    logger.debug('API', 'Fields to send:', fields_to_send);

    // Create test article with all available fields
    const testArticle = {
      title: 'Test Article',
      link: feed.url,
      description: 'This is a test notification from RSS Monitor',
      pubDate: new Date().toISOString(),
      author: 'RSS Monitor',
      content: 'This is a test notification with full content from RSS Monitor',
      contentSnippet: 'This is a test notification snippet',
      guid: 'test-article-' + Date.now(),
      categories: ['Test'],
      isoDate: new Date().toISOString()
    };

    // Override with any provided test item fields
    if (req.body.test_item) {
      Object.assign(testArticle, req.body.test_item);
    }
    logger.debug('API', 'Test article:', testArticle);

    // Send test notification through each integration
    for (const integration of integrations) {
      try {
        logger.info('API', `Sending test notification through ${integration.service}`);
        
        // Add fields_to_send to the feed object for the notification
        const feedWithFields = {
          ...feed,
          fields_to_send,
          integrations: [integration] // Send to one integration at a time
        };
        logger.debug('API', 'Feed with fields:', feedWithFields);

        await notifier.sendNotification(feedWithFields, testArticle, [integration], null, true);
        logger.info('API', `Successfully sent test notification through ${integration.service}`);
      } catch (err) {
        logger.error('API', `Failed to send test notification through ${integration.service}:`, err);
        return res.status(500).json({ success: false, error: `Failed to send test notification: ${err.message}` });
      }
    }

    res.json({ success: true, message: 'Test notification sent successfully' });
  } catch (err) {
    logger.error('API', 'Test notification error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- SETTINGS API ENDPOINTS ---

app.post('/api/settings', async (req, res) => {
  try {
    const {
      defaultChannel,
      desktopNotifications,
      defaultInterval,
      autoPauseFailedFeeds,
      theme
    } = req.body;

    await Promise.all([
      db.setSetting('default_channel', defaultChannel),
      db.setSetting('desktop_notifications', desktopNotifications),
      db.setSetting('default_interval', defaultInterval),
      db.setSetting('auto_pause_failed_feeds', autoPauseFailedFeeds),
      theme && db.setSetting('theme', theme)
    ]);

    res.json({ success: true });
  } catch (err) {
    console.error('Error saving settings:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/settings/:key', async (req, res) => {
  try {
    const value = await db.getSetting(req.params.key);
    res.json({ success: true, value });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
