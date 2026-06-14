import { Server } from 'socket.io';
import http from 'http';
import redis from '../config/redis';
import logger from '../config/logger';

let io: Server;

export function initializeWebSocket(server: http.Server) {
  io = new Server(server, {
    cors: { origin: '*' },
  });
  logger.info('WebSocket server initialized');
}

export function broadcastToManifest(manifestId: string, event: string, payload: any) {
  if (io) {
    io.to(`manifest:${manifestId}`).emit(event, payload);
  }
  redis.publish(`ws:manifest:${manifestId}`, JSON.stringify({ event, payload }));
}

export function broadcastToCompany(companyId: string, event: string, payload: any) {
  if (io) {
    io.to(`company:${companyId}`).emit(event, payload);
  }
  redis.publish(`ws:company:${companyId}`, JSON.stringify({ event, payload }));
}

export const webSocketService = {
  getIO: () => io,
  close: () => io?.close(),
};
