/**
 * Type declarations for fastify-socket.io
 * Adds Socket.IO server to Fastify instance
 */

import type { Server as SocketIOServer } from 'socket.io';
import 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    io: SocketIOServer;
  }
}
