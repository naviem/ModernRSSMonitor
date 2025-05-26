const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

let db = null;

async function init() {
  if (!db) {
    db = new sqlite3.Database('rssmonitor.sqlite');
  }

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Enable foreign keys
      db.run('PRAGMA foreign_keys = ON');

      // Create feeds table
      db.run(`CREATE TABLE IF NOT EXISTS feeds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        url TEXT UNIQUE NOT NULL,
        interval INTEGER DEFAULT 5,
        last_check DATETIME,
        is_paused INTEGER DEFAULT 0,
        webhook_url TEXT,
        webhook_username TEXT,
        webhook_avatar TEXT,
        use_embeds INTEGER DEFAULT 0,
        include_preview INTEGER DEFAULT 0,
        fields_to_send TEXT,
        integrations TEXT,
        preview_settings TEXT,
        filters TEXT
      )`);

      // Add new columns to existing tables if they don't exist
      db.all("PRAGMA table_info(feeds)", (err, rows) => {
        if (err) {
          console.error('Error checking feeds table schema:', err);
          return;
        }
        
        const hasPreviewSettings = rows.some(row => row.name === 'preview_settings');
        if (!hasPreviewSettings) {
          db.run(`ALTER TABLE feeds ADD COLUMN preview_settings TEXT`);
        }
        
        const hasFilters = rows.some(row => row.name === 'filters');
        if (!hasFilters) {
          db.run(`ALTER TABLE feeds ADD COLUMN filters TEXT`);
        }
      });

      // Create connections table
      db.run(`CREATE TABLE IF NOT EXISTS connections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        service TEXT NOT NULL,
        label TEXT NOT NULL,
        config TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // Add config column if it doesn't exist
      db.all("PRAGMA table_info(connections)", (err, rows) => {
        if (err) {
          console.error('Error checking connections table schema:', err);
          return;
        }
        
        const hasConfig = rows.some(row => row.name === 'config');
        if (!hasConfig) {
          db.run(`ALTER TABLE connections ADD COLUMN config TEXT`);
        }
      });

      // Create settings table
      db.run(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      )`);

      // Create logs table
      db.run(`CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        feed_id INTEGER,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (feed_id) REFERENCES feeds(id) ON DELETE CASCADE
      )`);

      // Create feed_logs table
      db.run(`CREATE TABLE IF NOT EXISTS feed_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        feed_id INTEGER,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (feed_id) REFERENCES feeds(id) ON DELETE CASCADE
      )`);

      // Create feed_stats table
      db.run(`CREATE TABLE IF NOT EXISTS feed_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        feed_id INTEGER,
        scan_duration INTEGER,
        new_articles INTEGER,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (feed_id) REFERENCES feeds(id) ON DELETE CASCADE
      )`);

      // Create notifications table
      db.run(`CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        feed_id INTEGER NOT NULL,
        article_url TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (feed_id) REFERENCES feeds(id) ON DELETE CASCADE,
        UNIQUE(feed_id, article_url)
      )`);

      resolve();
    });
  });
}

// Helper functions to ensure database is initialized
async function ensureDb() {
  if (!db) {
    await init();
  }
  return db;
}

async function all(query, params = []) {
  const database = await ensureDb();
  return new Promise((resolve, reject) => {
    database.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function get(query, params = []) {
  const database = await ensureDb();
  return new Promise((resolve, reject) => {
    database.get(query, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function run(query, params = []) {
  const database = await ensureDb();
  return new Promise((resolve, reject) => {
    database.run(query, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

async function getSetting(key) {
  const database = await ensureDb();
  return new Promise((resolve, reject) => {
    database.get('SELECT value FROM settings WHERE key = ?', [key], (err, row) => {
      if (err) reject(err);
      else resolve(row ? row.value : null);
    });
  });
}

async function setSetting(key, value) {
  const database = await ensureDb();
  return new Promise((resolve, reject) => {
    database.run(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      [key, value],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

async function getFeeds() {
  const database = await ensureDb();
  return new Promise((resolve, reject) => {
    database.all('SELECT * FROM feeds', [], (err, rows) => {
      if (err) reject(err);
      else {
        // Parse JSON fields for each feed
        const processedRows = rows.map(row => {
          const feed = { ...row };
          
          // Parse JSON fields
          try {
            feed.integrations = JSON.parse(feed.integrations || '[]');
          } catch (err) {
            feed.integrations = [];
          }
          
          try {
            feed.fields_to_send = JSON.parse(feed.fields_to_send || '[]');
          } catch (err) {
            feed.fields_to_send = [];
          }
          
          try {
            feed.preview_settings = JSON.parse(feed.preview_settings || '{}');
          } catch (err) {
            feed.preview_settings = {};
          }
          
          try {
            feed.filters = JSON.parse(feed.filters || '{}');
          } catch (err) {
            feed.filters = {};
          }
          
          return feed;
        });
        
        resolve(processedRows);
      }
    });
  });
}

async function getFeed(id) {
  const database = await ensureDb();
  return new Promise((resolve, reject) => {
    database.get('SELECT * FROM feeds WHERE id = ?', [id], (err, row) => {
      if (err) reject(err);
      else {
        if (!row) {
          resolve(null);
          return;
        }
        
        const feed = { ...row };
        
        // Parse JSON fields
        try {
          feed.integrations = JSON.parse(feed.integrations || '[]');
        } catch (err) {
          feed.integrations = [];
        }
        
        try {
          feed.fields_to_send = JSON.parse(feed.fields_to_send || '[]');
        } catch (err) {
          feed.fields_to_send = [];
        }
        
        try {
          feed.preview_settings = JSON.parse(feed.preview_settings || '{}');
        } catch (err) {
          feed.preview_settings = {};
        }
        
        try {
          feed.filters = JSON.parse(feed.filters || '{}');
        } catch (err) {
          feed.filters = {};
        }
        
        resolve(feed);
      }
    });
  });
}

async function notificationExists(feedId, articleUrl) {
  const database = await ensureDb();
  return new Promise((resolve, reject) => {
    database.get(
      'SELECT 1 FROM notifications WHERE feed_id = ? AND article_url = ?',
      [feedId, articleUrl],
      (err, row) => {
        if (err) reject(err);
        else resolve(!!row);
      }
    );
  });
}

async function getFeedLastChecked(feedId) {
  const database = await ensureDb();
  return new Promise((resolve, reject) => {
    database.get('SELECT last_check FROM feeds WHERE id = ?', [feedId], (err, row) => {
      if (err) reject(err);
      else resolve(row ? row.last_check : null);
    });
  });
}

async function updateFeedLastChecked(feedId, timestamp) {
  const database = await ensureDb();
  return new Promise((resolve, reject) => {
    database.run(
      'UPDATE feeds SET last_check = ? WHERE id = ?',
      [timestamp, feedId],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

async function getConnections() {
  const database = await ensureDb();
  return new Promise((resolve, reject) => {
    database.all('SELECT * FROM connections', [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function addFeedLog(feedId, level, message) {
  if (!level || !message) {
    console.error('Missing required parameters for feed log:', { feedId, level, message });
    return;
  }

  const database = await ensureDb();
  return new Promise((resolve, reject) => {
    database.run(
      'INSERT INTO feed_logs (feed_id, level, message) VALUES (?, ?, ?)',
      [feedId, level, message],
      (err) => {
        if (err) {
          console.error('Error adding feed log:', err);
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
}

async function getFeedLogs(feedId, options = {}) {
  const database = await ensureDb();
  const { limit = 100, sinceDays = 7 } = options;
  
  return new Promise((resolve, reject) => {
    database.all(
      `SELECT * FROM feed_logs 
       WHERE feed_id = ? 
       AND timestamp >= datetime('now', '-${sinceDays} days')
       ORDER BY timestamp DESC
       LIMIT ?`,
      [feedId, limit],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
}

async function addFeedStat(feedId, stats) {
  const database = await ensureDb();
  const { scan_duration, new_articles } = stats;
  
  return new Promise((resolve, reject) => {
    database.run(
      'INSERT INTO feed_stats (feed_id, scan_duration, new_articles) VALUES (?, ?, ?)',
      [feedId, scan_duration, new_articles],
      (err) => {
        if (err) {
          console.error('Error adding feed stat:', err);
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
}

async function getFeedStats(feedId, options = {}) {
  const database = await ensureDb();
  const { days = 7 } = options;
  
  return new Promise((resolve, reject) => {
    database.all(
      `SELECT * FROM feed_stats 
       WHERE feed_id = ? 
       AND timestamp >= datetime('now', '-${days} days')
       ORDER BY timestamp DESC`,
      [feedId],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
}

async function addConnection(data) {
  const database = await ensureDb();
  return new Promise((resolve, reject) => {
    const { service, label, config } = data;
    database.run(
      'INSERT INTO connections (service, label, config) VALUES (?, ?, ?)',
      [service, label, config],
      function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID });
      }
    );
  });
}

async function updateConnection(id, data) {
  const database = await ensureDb();
  return new Promise((resolve, reject) => {
    const { service, label, config } = data;
    database.run(
      'UPDATE connections SET service = ?, label = ?, config = ? WHERE id = ?',
      [service, label, config, id],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

async function deleteConnection(id) {
  const database = await ensureDb();
  return new Promise((resolve, reject) => {
    database.run('DELETE FROM connections WHERE id = ?', [id], function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

async function getFeedSettings(id) {
  const database = await ensureDb();
  return new Promise((resolve, reject) => {
    database.get('SELECT * FROM feeds WHERE id = ?', [id], (err, feed) => {
      if (err) reject(err);
      else {
        if (!feed) resolve(null);
        else {
          // Parse the integrations JSON
          let integrations = [];
          try {
            integrations = JSON.parse(feed.integrations || '[]');
          } catch (err) {
            console.error('Error parsing integrations:', err);
          }
          resolve({ integrations });
        }
      }
    });
  });
}

async function updateFeedSettings(id, settings) {
  const database = await ensureDb();
  const { integrations } = settings;
  
  return new Promise((resolve, reject) => {
    database.run(
      'UPDATE feeds SET integrations = ? WHERE id = ?',
      [JSON.stringify(integrations), id],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

async function updateFeed(id, data) {
  const database = await ensureDb();
  const { 
    title, 
    url, 
    interval, 
    integrations = [],
    fields_to_send = [],
    preview_settings = {},
    filters = {}
  } = data;

  // Process integrations to ensure proper format
  const processedIntegrations = integrations.map(integration => {
    const processed = { ...integration };

    // Handle Discord embed settings
    if (processed.service === 'discord' && processed.embed_settings) {
      // If embed_settings is a string, try to parse it
      if (typeof processed.embed_settings === 'string') {
        try {
          processed.embed_settings = JSON.parse(processed.embed_settings);
        } catch (err) {
          console.error('Error parsing embed settings:', err);
          processed.embed_settings = null;
        }
      }
      
      // Validate embed settings structure
      if (processed.embed_settings && !processed.embed_settings.embeds) {
        processed.embed_settings = {
          enabled: true,
          embeds: Array.isArray(processed.embed_settings) ? processed.embed_settings : [processed.embed_settings]
        };
      }
    }

    return processed;
  });

  return new Promise((resolve, reject) => {
    database.run(
      `UPDATE feeds SET 
        title = ?, 
        url = ?, 
        interval = ?, 
        integrations = ?,
        fields_to_send = ?,
        preview_settings = ?,
        filters = ?
      WHERE id = ?`,
      [
        title, 
        url, 
        interval, 
        JSON.stringify(processedIntegrations),
        JSON.stringify(fields_to_send),
        JSON.stringify(preview_settings),
        JSON.stringify(filters),
        id
      ],
      (err) => {
        if (err) {
          console.error('Error updating feed:', err);
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
}

async function addFeed(feed) {
  const database = await ensureDb();
  return new Promise((resolve, reject) => {
    database.run(
      `INSERT INTO feeds (
        title, 
        url, 
        interval, 
        integrations
      ) VALUES (?, ?, ?, ?)`,
      [
        feed.title,
        feed.url,
        feed.interval || 5,
        JSON.stringify(feed.integrations || [])
      ],
      function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID });
      }
    );
  });
}

async function toggleFeedPause(id) {
  const database = await ensureDb();
  return new Promise((resolve, reject) => {
    // First get current state
    database.get('SELECT is_paused FROM feeds WHERE id = ?', [id], (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      
      // Toggle the state
      const newState = row && row.is_paused ? 0 : 1;
      database.run(
        'UPDATE feeds SET is_paused = ? WHERE id = ?',
        [newState, id],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  });
}

async function deleteFeed(id) {
  const database = await ensureDb();
  return new Promise((resolve, reject) => {
    database.run('DELETE FROM feeds WHERE id = ?', [id], function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

module.exports = {
  init,
  all,
  get,
  run,
  getSetting,
  setSetting,
  getFeeds,
  getFeed,
  notificationExists,
  getFeedLastChecked,
  updateFeedLastChecked,
  getConnections,
  addFeedLog,
  addFeedStat,
  addConnection,
  updateConnection,
  deleteConnection,
  getFeedSettings,
  updateFeedSettings,
  updateFeed,
  addFeed,
  toggleFeedPause,
  deleteFeed,
  getFeedLogs,
  getFeedStats
};
