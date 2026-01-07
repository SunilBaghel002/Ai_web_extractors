/**
 * Logging utilities
 */

/**
 * Create a logger with prefix
 */
export function createLogger(prefix) {
  return {
    info: (message, ...args) => {
      console.log(`[${prefix}] ℹ️ ${message}`, ...args);
    },
    success: (message, ...args) => {
      console.log(`[${prefix}] ✅ ${message}`, ...args);
    },
    warning: (message, ...args) => {
      console.warn(`[${prefix}] ⚠️ ${message}`, ...args);
    },
    error: (message, ...args) => {
      console.error(`[${prefix}] ❌ ${message}`, ...args);
    },
    debug: (message, ...args) => {
      if (process.env.DEBUG) {
        console.log(`[${prefix}] 🔍 ${message}`, ...args);
      }
    },
  };
}
