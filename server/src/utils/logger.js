import { env } from '../config/env.js';

const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const activeLevel = LEVELS[env.logLevel] ?? LEVELS.info;

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Error);

const serializeError = (error) => {
  if (!error) return undefined;

  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
};

const normalizeMeta = (meta) => {
  if (meta instanceof Error) {
    return { error: serializeError(meta) };
  }

  if (!isPlainObject(meta)) {
    return meta === undefined ? {} : { value: meta };
  }

  const normalized = {};
  for (const [key, value] of Object.entries(meta)) {
    normalized[key] = value instanceof Error ? serializeError(value) : value;
  }
  return normalized;
};

const writeLog = (level, message, meta = {}) => {
  if ((LEVELS[level] ?? LEVELS.info) < activeLevel) return;

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: 'server',
    instanceId: env.instanceId,
    message,
    ...normalizeMeta(meta),
  };

  const line = JSON.stringify(entry);

  if (level === 'error') {
    console.error(line);
    return;
  }

  if (level === 'warn') {
    console.warn(line);
    return;
  }

  console.log(line);
};

const child = (defaults = {}) => ({
  debug: (message, meta) => writeLog('debug', message, { ...defaults, ...normalizeMeta(meta) }),
  info: (message, meta) => writeLog('info', message, { ...defaults, ...normalizeMeta(meta) }),
  warn: (message, meta) => writeLog('warn', message, { ...defaults, ...normalizeMeta(meta) }),
  error: (message, meta) => writeLog('error', message, { ...defaults, ...normalizeMeta(meta) }),
  child: (meta) => child({ ...defaults, ...normalizeMeta(meta) }),
});

export const logger = child();
