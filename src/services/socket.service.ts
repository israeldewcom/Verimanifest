import { Server, Socket } from 'socket.io';
import http from 'http';
import redis from '../config/redis';
import { environment } from '../config/environment';
import jwt from 'jsonwebtoken';
import prisma from '../config/database';
import logger from '../config/logger';

let io: Server;

export function initializeWebSocket(server: http.Server) {
  io = new Server(server, {
    cors: {
      origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
      methods: ['GET', 'POST'],
    },
    pingInterval: environment.WS_HEARTBEAT_INTERVAL,
    pingTimeout: 10000,
    maxHttpBufferSize: 1e6,
    transports: ['websocket', 'polling'],
  });

  io.use(async (socket: Socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token;
    
    if (!token) {
      return next(new Error('Authentication token required'));
    }

    try {
      const decoded = jwt.verify(token as string, environment.JWT_SECRET) as any;
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, companyId: true, role: true, isActive: true },
      });

      if (!user || !user.isActive) {
        return next(new Error('User not found or inactive'));
      }

      (socket as any).user = user;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = (socket as any).user;
    logger.info(`WebSocket client connected`, {
      socketId: socket.id,
      userId: user.id,
      companyId: user.companyId,
    });

    socket.join(`company:${user.companyId}`);
    socket.join(`user:${user.id}`);

    socket.on('manifest:subscribe', (manifestId: string) => {
      socket.join(`manifest:${manifestId}`);
    });

    socket.on('manifest:unsubscribe', (manifestId: string) => {
      socket.leave(`manifest:${manifestId}`);
    });

    socket.on('location:update', async (data: any) => {
      // Driver location update via WebSocket
      const { locationService } = await import('../services/location.service');
      await locationService.updateLocation({
        driverId: user.id,
        manifestId: data.manifestId,
        lat: data.lat,
        lng: data.lng,
        accuracy: data.accuracy,
        timestamp: new Date(),
      });
    });

    socket.on('disconnect', () => {
      logger.info(`WebSocket client disconnected`, {
        socketId: socket.id,
        userId: user.id,
      });
    });
  });

  const subscriber = redis.duplicate();
  subscriber.subscribe('ws:broadcast');
  subscriber.subscribe('ws:company:*');
  subscriber.subscribe('ws:manifest:*');

  subscriber.on('message', (channel, message) => {
    try {
      const data = JSON.parse(message);
      
      if (channel === 'ws:broadcast') {
        io.emit(data.event, data.payload);
      } else if (channel.startsWith('ws:company:')) {
        const companyId = channel.replace('ws:company:', '');
        io.to(`company:${companyId}`).emit(data.event, data.payload);
      } else if (channel.startsWith('ws:manifest:')) {
        const manifestId = channel.replace('ws:manifest:', '');
        io.to(`manifest:${manifestId}`).emit(data.event, data.payload);
      }
    } catch (error) {
      logger.error('WebSocket broadcast error', { error });
    }
  });

  logger.info('WebSocket server initialized');
}

export function broadcastToCompany(companyId: string, event: string, payload: any) {
  redis.publish(`ws:company:${companyId}`, JSON.stringify({ event, payload }));
}

export function broadcastToManifest(manifestId: string, event: string, payload: any) {
  redis.publish(`ws:manifest:${manifestId}`, JSON.stringify({ event, payload }));
}

export const webSocketService = {
  close: () => io?.close(),
  getIO: () => io,
};
