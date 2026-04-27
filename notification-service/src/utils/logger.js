export const logger = {
  info: (...args) => console.log('[notification-service]', ...args),
  warn: (...args) => console.warn('[notification-service]', ...args),
  error: (...args) => console.error('[notification-service]', ...args),
};
