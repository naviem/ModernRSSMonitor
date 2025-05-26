const express = require('express');
const Parser = require('rss-parser');
const { WebhookClient } = require('discord.js');
const crypto = require('crypto');
const db = require('../db');
const feedMonitor = require('../services/feed-monitor');

const router = express.Router();
const parser = new Parser();

function generateId() {
  return crypto.randomBytes(16).toString('hex');
}

// Get all feeds
router.get('/feeds', async (req, res) => {
  try {
    const feeds = await db.all('SELECT * FROM feeds ORDER BY created_at DESC');
    res.json(feeds);
  } catch (err) {
    console.error('Error getting feeds:', err);
    res.status(500).json({ error: 'Failed to get feeds' });
  }
});

// Get single feed
router.get('/feeds/:id', async (req, res) => {
  try {
    const feed = await db.get('SELECT * FROM feeds WHERE id = ?', [req.params.id]);
    if (!feed) return res.status(404).json({ error: 'Feed not found' });
    res.json(feed);
  } catch (err) {
    console.error('Error getting feed:', err);
    res.status(500).json({ error: 'Failed to get feed' });
  }
});

// Create new feed
router.post('/feeds', async (req, res) => {
  try {
    const { title, url, interval } = req.body;
    
    // Validate feed URL
    await parser.parseURL(url);
    
    const id = generateId();
    await db.run(
      'INSERT INTO feeds (id, title, url, interval) VALUES (?, ?, ?, ?)',
      [id, title, url, interval]
    );
    
    const feed = await db.get('SELECT * FROM feeds WHERE id = ?', [id]);
    await feedMonitor.startFeedMonitor(feed);
    
    res.status(201).json(feed);
  } catch (err) {
    console.error('Error creating feed:', err);
    res.status(400).json({ error: err.message });
  }
});

// Get all connections
router.get('/connections', async (req, res) => {
  try {
    const connections = await db.all('SELECT * FROM connections ORDER BY created_at DESC');
    res.json(connections);
  } catch (err) {
    console.error('Error getting connections:', err);
    res.status(500).json({ error: 'Failed to get connections' });
  }
});

// Get single connection
router.get('/connections/:id', async (req, res) => {
  try {
    const connection = await db.get('SELECT * FROM connections WHERE id = ?', [req.params.id]);
    if (!connection) return res.status(404).json({ error: 'Connection not found' });
    res.json(connection);
  } catch (err) {
    console.error('Error getting connection:', err);
    res.status(500).json({ error: 'Failed to get connection' });
  }
});

// Update feed
/*
router.put('/feeds/:id', async (req, res) => {
  try {
    const feed = await db.get('SELECT * FROM feeds WHERE id = ?', [req.params.id]);
    if (!feed) return res.status(404).json({ error: 'Feed not found' });

    const {
      title,
      url,
      interval,
      integrations
    } = req.body;

    // Validate feed URL if changed
    if (url !== feed.url) {
      await parser.parseURL(url);
    }

    // Validate integrations
    if (integrations && Array.isArray(integrations)) {
      for (const integration of integrations) {
        if (integration.service === 'discord' && !integration.connection_id) {
          // Validate webhook URL if provided
          if (integration.webhook_url) {
            try {
              const webhook = new WebhookClient({ url: integration.webhook_url });
              await webhook.delete(); // This seems like a destructive check, should be careful
            } catch (err) {
              return res.status(400).json({ error: 'Invalid webhook URL' });
            }
          }
        }
      }
    }

    // Update feed
    await db.run(`
      UPDATE feeds SET
        title = ?,
        url = ?,
        interval = ?,
        integrations = ?
      WHERE id = ?
    `, [
      title,
      url,
      interval,
      JSON.stringify(integrations || []),
      req.params.id
    ]);

    const updatedFeed = await db.get('SELECT * FROM feeds WHERE id = ?', [req.params.id]);
    await feedMonitor.startFeedMonitor(updatedFeed);

    res.json(updatedFeed);
  } catch (err) {
    console.error('Error updating feed:', err);
    res.status(400).json({ error: err.message });
  }
});
*/

// Delete feed
router.delete('/feeds/:id', async (req, res) => {
  try {
    const feed = await db.get('SELECT * FROM feeds WHERE id = ?', [req.params.id]);
    if (!feed) return res.status(404).json({ error: 'Feed not found' });

    await feedMonitor.stopFeedMonitor(feed.id);
    await db.run('DELETE FROM feeds WHERE id = ?', [req.params.id]);

    res.status(204).end();
  } catch (err) {
    console.error('Error deleting feed:', err);
    res.status(500).json({ error: 'Failed to delete feed' });
  }
});

// Toggle feed status
router.post('/feeds/:id/toggle', async (req, res) => {
  try {
    const feed = await db.get('SELECT * FROM feeds WHERE id = ?', [req.params.id]);
    if (!feed) return res.status(404).json({ error: 'Feed not found' });

    const paused = !feed.paused;
    await db.run('UPDATE feeds SET paused = ? WHERE id = ?', [paused ? 1 : 0, req.params.id]);

    if (paused) {
      await feedMonitor.stopFeedMonitor(feed.id);
    } else {
      const updatedFeed = await db.get('SELECT * FROM feeds WHERE id = ?', [req.params.id]);
      await feedMonitor.startFeedMonitor(updatedFeed);
    }

    res.json({ paused });
  } catch (err) {
    console.error('Error toggling feed:', err);
    res.status(500).json({ error: 'Failed to toggle feed' });
  }
});

// Get feed preview
router.get('/feeds/:id/preview', async (req, res) => {
  try {
    const feed = await db.get('SELECT * FROM feeds WHERE id = ?', [req.params.id]);
    if (!feed) return res.status(404).json({ error: 'Feed not found' });

    const parsed = await parser.parseURL(feed.url);
    res.json({
      title: parsed.title,
      description: parsed.description,
      items: parsed.items.slice(0, 5).map(item => ({
        title: item.title,
        description: item.contentSnippet || '',
        pubDate: item.pubDate || item.isoDate
      }))
    });
  } catch (err) {
    console.error('Error getting feed preview:', err);
    res.status(500).json({ error: 'Failed to get feed preview' });
  }
});

// Get feed articles
router.get('/feeds/:id/articles', async (req, res) => {
  try {
    const feed = await db.get('SELECT * FROM feeds WHERE id = ?', [req.params.id]);
    if (!feed) return res.status(404).json({ error: 'Feed not found' });

    const articles = await db.all(
      'SELECT * FROM articles WHERE feed_id = ? ORDER BY pub_date DESC LIMIT 10',
      [req.params.id]
    );

    res.json(articles);
  } catch (err) {
    console.error('Error getting feed articles:', err);
    res.status(500).json({ error: 'Failed to get feed articles' });
  }
});

// Test notification
router.post('/feeds/:id/test', async (req, res) => {
  try {
    const feed = await db.get('SELECT * FROM feeds WHERE id = ?', [req.params.id]);
    if (!feed) return res.status(404).json({ error: 'Feed not found' });

    if (!feed.webhook_url) {
      return res.status(400).json({ error: 'No webhook URL configured' });
    }

    const parsed = await parser.parseURL(feed.url);
    const item = parsed.items[0];

    if (!item) {
      return res.status(400).json({ error: 'No articles found' });
    }

    const webhook = new WebhookClient({ url: feed.webhook_url });

    if (feed.use_embeds) {
      await webhook.send({
        username: feed.webhook_username || feed.title,
        avatarURL: feed.webhook_avatar,
        embeds: [{
          title: item.title,
          description: feed.include_preview ? (item.contentSnippet || '') : undefined,
          url: item.link,
          color: 0x3b82f6,
          timestamp: new Date(item.pubDate || item.isoDate),
          footer: {
            text: '🔔 Test Notification'
          }
        }]
      });
    } else {
      let content = `**${item.title}**\n${item.link}`;
      if (feed.include_preview && item.contentSnippet) {
        content += `\n\n${item.contentSnippet}`;
      }
      content += '\n\n🔔 *Test Notification*';

      await webhook.send({
        username: feed.webhook_username || feed.title,
        avatarURL: feed.webhook_avatar,
        content
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error sending test notification:', err);
    res.status(500).json({ error: 'Failed to send test notification' });
  }
});

// Test specific article
router.post('/feeds/:id/test/:articleId', async (req, res) => {
  try {
    const feed = await db.get('SELECT * FROM feeds WHERE id = ?', [req.params.id]);
    if (!feed) return res.status(404).json({ error: 'Feed not found' });

    if (!feed.webhook_url) {
      return res.status(400).json({ error: 'No webhook URL configured' });
    }

    const article = await db.get(
      'SELECT * FROM articles WHERE id = ? AND feed_id = ?',
      [req.params.articleId, req.params.id]
    );

    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }

    const webhook = new WebhookClient({ url: feed.webhook_url });

    if (feed.use_embeds) {
      await webhook.send({
        username: feed.webhook_username || feed.title,
        avatarURL: feed.webhook_avatar,
        embeds: [{
          title: article.title,
          description: feed.include_preview ? article.description : undefined,
          url: article.url,
          color: 0x3b82f6,
          timestamp: new Date(article.pub_date),
          footer: {
            text: '🔔 Test Notification'
          }
        }]
      });
    } else {
      let content = `**${article.title}**\n${article.url}`;
      if (feed.include_preview && article.description) {
        content += `\n\n${article.description}`;
      }
      content += '\n\n🔔 *Test Notification*';

      await webhook.send({
        username: feed.webhook_username || feed.title,
        avatarURL: feed.webhook_avatar,
        content
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error sending test notification:', err);
    res.status(500).json({ error: 'Failed to send test notification' });
  }
});

// Test embed only - sends only embed data
router.post('/test-embed', async (req, res) => {
  try {
    console.log('🧪 Testing ONLY embed configuration...');
    const { connection_id, webhook_url, username, avatar_url, embed_settings } = req.body;
    
    if (!embed_settings || !embed_settings.embeds || embed_settings.embeds.length === 0) {
      return res.status(400).json({ error: 'No embed configuration provided' });
    }

    // Sample data for testing embeds
    const sampleData = {
      title: 'Sample Article Title - Test Embed',
      description: 'This is a sample article description to test how your embed will look with real RSS feed data.',
      content: 'Full content of the sample article would appear here with more details about the topic.',
      link: 'https://example.com/sample-article',
      pubDate: new Date().toISOString(),
      author: 'Sample Author',
      categories: ['Technology', 'RSS', 'Testing'],
      guid: 'sample-' + Date.now(),
      thumbnail: 'https://via.placeholder.com/150x150?text=Thumbnail',
      image: 'https://via.placeholder.com/600x300?text=Article+Image'
    };

    // Function to interpolate variables
    function interpolate(template, data) {
      if (!template) return '';
      return template.replace(/\$\{(\w+)\}/g, (match, key) => data[key] || match);
    }

    // Process embeds with sample data
    const embeds = embed_settings.embeds.map(embed => {
      const processedEmbed = {
        title: interpolate(embed.title || '', sampleData),
        description: interpolate(embed.description || '', sampleData),
        color: embed.color ? parseInt(embed.color.toString().replace('#', ''), 16) : 0x5865F2,
      };

      // Add URL if available
      if (embed.url) {
        processedEmbed.url = interpolate(embed.url, sampleData);
      } else if (sampleData.link) {
        processedEmbed.url = sampleData.link;
      }

      // Add footer if specified
      if (embed.footer) {
        processedEmbed.footer = { text: interpolate(embed.footer, sampleData) };
      }

      // Add thumbnail if specified
      if (embed.thumbnail) {
        processedEmbed.thumbnail = { url: interpolate(embed.thumbnail, sampleData) };
      }

      // Add image if specified
      if (embed.image) {
        processedEmbed.image = { url: interpolate(embed.image, sampleData) };
      }

      // Add author if specified
      if (embed.author) {
        processedEmbed.author = { name: interpolate(embed.author, sampleData) };
      }

      return processedEmbed;
    });

    // Clean up embeds - remove empty fields
    embeds.forEach(embed => {
      Object.keys(embed).forEach(key => {
        if (embed[key] === undefined || embed[key] === null || 
            (typeof embed[key] === 'string' && embed[key].trim() === '')) {
          delete embed[key];
        }
      });
    });

    console.log('💎 Testing embed payload:', { embeds });

    // Determine webhook URL
    let finalWebhookUrl = webhook_url;
    let finalUsername = username || 'RSS Monitor';
    let finalAvatarUrl = avatar_url;

    if (connection_id) {
      // Get connection from database
      const connections = await db.getConnections();
      const connection = connections.find(c => c.id === parseInt(connection_id));
      if (!connection) {
        return res.status(404).json({ error: 'Integration not found' });
      }
      if (connection.service !== 'discord') {
        return res.status(400).json({ error: 'Only Discord integrations support embeds' });
      }
      finalWebhookUrl = connection.config;
      // Use default username/avatar for existing integrations
    }

    if (!finalWebhookUrl) {
      return res.status(400).json({ error: 'No webhook URL provided' });
    }

    // Validate webhook URL format
    if (!/^https:\/\/discord\.com\/api\/webhooks\//.test(finalWebhookUrl)) {
      return res.status(400).json({ error: 'Invalid Discord webhook URL' });
    }

    // Send ONLY embeds to Discord
    const discordPayload = {
      content: '', // Empty content so only embeds show
      embeds: embeds,
      username: finalUsername,
      avatar_url: finalAvatarUrl
    };

    console.log('📤 Sending test embed to Discord:', JSON.stringify(discordPayload, null, 2));

    const response = await fetch(finalWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(discordPayload)
    });

    const responseText = await response.text();
    console.log('Discord response:', response.status, responseText);

    if (!response.ok) {
      throw new Error(`Discord API error: ${response.status} ${responseText}`);
    }

    res.json({ success: true, message: 'Test embed sent successfully!' });
  } catch (err) {
    console.error('❌ Test embed error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router; 