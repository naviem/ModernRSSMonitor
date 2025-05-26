const fs = require('fs');
const db = require('./db');

// Log levels and their numeric values
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4
};

let currentLogLevel = 'debug'; // Default log level. TEMPORARILY SET TO DEBUG FOR TESTING.
let logStream = null; // <-- Added for file stream

// Initialize the logger with the saved setting
async function initialize() {
  try {
    const savedLevel = await db.getSetting('log_level');
    if (savedLevel && LOG_LEVELS[savedLevel] !== undefined) {
      currentLogLevel = savedLevel;
    }
    // Create/open the log file stream
    logStream = fs.createWriteStream('app.log', { flags: 'a' }); // <-- Added
    logStream.write(`\n--- Log session started at ${new Date().toISOString()} ---\n`); // <-- Added session start marker
  } catch (error) {
    console.error('Error loading log level setting or creating log stream:', error);
    // Fallback if file stream fails but console might still work
    if (!logStream && fs && fs.createWriteStream) { 
        try { logStream = fs.createWriteStream('app.log.error', { flags: 'a' }); } catch(e){}
    }
  }
}

// Update the current log level
async function setLogLevel(level) {
  if (LOG_LEVELS[level] === undefined) {
    throw new Error(`Invalid log level: ${level}`);
  }
  currentLogLevel = level;
  await db.setSetting('log_level', level);
  if (logStream) logStream.write(`[${new Date().toISOString()}] [SYSTEM] Log level set to ${level}\n`); // <-- Log level change to file
}

// Get the current log level
function getLogLevel() {
  return currentLogLevel;
}

// Main logging function
function log(level, module, message, ...args) {
  if (LOG_LEVELS[level] === undefined) {
    level = 'info';
  }

  if (LOG_LEVELS[level] <= LOG_LEVELS[currentLogLevel]) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}] [${module}]`;
    
    let consoleArgs = [...args];
    let fileMessage = `${prefix} ${message}`;

    if (typeof message === 'object' && message !== null) {
      // If message itself is an object, stringify for file, keep for console
      fileMessage = `${prefix} ${JSON.stringify(message, null, 2)}`;
    } else if (typeof message !== 'string') {
      fileMessage = `${prefix} ${String(message)}`; // Ensure message is a string for file
    }

    args.forEach(arg => {
      if (typeof arg === 'object' && arg !== null) {
        fileMessage += ` ${JSON.stringify(arg, null, 2)}`;
      } else {
        fileMessage += ` ${arg}`;
      }
    });

    // Log to console (original behavior)
    if (typeof message === 'string') {
      console.log(prefix, message, ...consoleArgs);
    } else {
      console.log(prefix, message); // Log the primary message object/value
      if (consoleArgs.length > 0) { // Then log additional arguments if any
        consoleArgs.forEach(arg => {
          if (typeof arg === 'object') {
            console.log(JSON.stringify(arg, null, 2));
          } else {
            console.log(arg);
          }
        });
      }
    }

    // Log to file
    if (logStream) {
      logStream.write(`${fileMessage.replace(/\x1b\[[0-9;]*m/g, '')}\n`); // Remove ANSI color codes for file
    }
  }
}

// Convenience methods for different log levels
const logger = {
  error: (module, message, ...args) => log('error', module, message, ...args),
  warn: (module, message, ...args) => log('warn', module, message, ...args),
  info: (module, message, ...args) => log('info', module, message, ...args),
  debug: (module, message, ...args) => log('debug', module, message, ...args),
  trace: (module, message, ...args) => log('trace', module, message, ...args),
  setLevel: setLogLevel,
  getLevel: getLogLevel,
  initialize
};

module.exports = logger;

// Graceful shutdown for log stream
process.on('exit', (code) => {
  if (logStream) {
    logStream.write(`--- Log session ended at ${new Date().toISOString()}, exit code: ${code} ---\n`);
    logStream.end();
  }
});
process.on('SIGINT', () => process.exit(0)); // Handle Ctrl+C
process.on('SIGTERM', () => process.exit(0)); // Handle kill 