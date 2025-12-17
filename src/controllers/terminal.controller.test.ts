import { describe, test, expect, beforeEach } from 'bun:test';
import Fastify, { FastifyInstance } from 'fastify';
import { registerControllers } from '../utils/route-loader';
import { TerminalController } from './terminal.controller';

describe('TerminalController', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    // Don't clear metadata since TerminalController is imported and decorators
    // are executed only once during module load
    registerControllers(app, [TerminalController]);
  });

  describe('POST /api/terminal/queryData', () => {
    test('should accept valid query data and return ok status', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/terminal/queryData',
        payload: {
          data: {
            mac: '00:11:22:33:44:55',
            pid: 1,
            protocol: 'modbus',
            type: 1,
            content: 'test content',
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
    });

    test('should respond in less than 10ms', async () => {
      const start = Date.now();

      await app.inject({
        method: 'POST',
        url: '/api/terminal/queryData',
        payload: {
          data: {
            mac: '00:11:22:33:44:56',
            pid: 1,
            protocol: 'modbus',
            type: 1,
            content: 'test content',
          },
        },
      });

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(10); // Should be <10ms
    });

    test('should skip duplicate requests for same mac:pid', async () => {
      const payload = {
        data: {
          mac: '00:11:22:33:44:57',
          pid: 1,
          protocol: 'modbus',
          type: 1,
          content: 'test content',
        },
      };

      // First request
      const response1 = await app.inject({
        method: 'POST',
        url: '/api/terminal/queryData',
        payload,
      });

      expect(response1.statusCode).toBe(200);
      expect(JSON.parse(response1.body).status).toBe('ok');

      // Second request (should be skipped)
      const response2 = await app.inject({
        method: 'POST',
        url: '/api/terminal/queryData',
        payload,
      });

      expect(response2.statusCode).toBe(200);
      const body2 = JSON.parse(response2.body);
      expect(body2.status).toBe('skip');
      expect(body2.message).toContain('处理中');
    });

    test('should reject invalid data', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/terminal/queryData',
        payload: {
          data: {
            // Missing required fields
            mac: '',
            pid: -1,
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('error');
      expect(body.message).toBeDefined();
    });

    test('should handle missing mac field', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/terminal/queryData',
        payload: {
          data: {
            pid: 1,
            protocol: 'modbus',
            type: 1,
            content: 'test',
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('error');
    });

    test('should handle invalid pid', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/terminal/queryData',
        payload: {
          data: {
            mac: '00:11:22:33:44:58',
            pid: 0, // Invalid: must be positive
            protocol: 'modbus',
            type: 1,
            content: 'test',
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('error');
    });

    test('should accept optional fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/terminal/queryData',
        payload: {
          data: {
            mac: '00:11:22:33:44:59',
            pid: 1,
            protocol: 'modbus',
            type: 1,
            content: 'test content',
            timeStamp: Date.now(),
            // buffer is optional and not included
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
    });
  });

  describe('POST /api/terminal/status', () => {
    test('should return current processing count', async () => {
      // First, send some data
      await app.inject({
        method: 'POST',
        url: '/api/terminal/queryData',
        payload: {
          data: {
            mac: '00:11:22:33:44:60',
            pid: 1,
            protocol: 'modbus',
            type: 1,
            content: 'test',
          },
        },
      });

      // Then check status
      const response = await app.inject({
        method: 'POST',
        url: '/api/terminal/status',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('processingCount');
      expect(typeof body.processingCount).toBe('number');
      expect(body.processingCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Performance Benchmarks', () => {
    test('should handle 100 concurrent requests efficiently', async () => {
      const requests = Array.from({ length: 100 }, (_, i) =>
        app.inject({
          method: 'POST',
          url: '/api/terminal/queryData',
          payload: {
            data: {
              mac: `00:11:22:33:44:${String(i).padStart(2, '0')}`,
              pid: 1,
              protocol: 'modbus',
              type: 1,
              content: 'test content',
            },
          },
        })
      );

      const start = Date.now();
      const responses = await Promise.all(requests);
      const duration = Date.now() - start;

      // All requests should succeed
      responses.forEach((response) => {
        expect(response.statusCode).toBe(200);
      });

      // 100 requests should complete in less than 1 second
      expect(duration).toBeLessThan(1000);

      console.log(`  ⚡ 100 requests completed in ${duration}ms`);
      console.log(`  ⚡ Average: ${(duration / 100).toFixed(2)}ms per request`);
    });
  });
});
