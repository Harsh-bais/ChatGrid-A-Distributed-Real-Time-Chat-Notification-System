import { io } from 'socket.io-client';
import { API_URL } from './api.js';

export const createSocket = (token) =>
  io(API_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  });
