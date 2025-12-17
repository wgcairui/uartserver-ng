import { describe, test, expect, beforeEach, mock } from 'bun:test';
import Fastify, { FastifyInstance } from 'fastify';
import { Controller, Get, Post, Put, Delete, ROUTE_METADATA } from '../decorators/controller';
import { Body, Query, Params, User, PARAM_METADATA } from '../decorators/params';
import { registerControllers } from './route-loader';

describe('Route Loader', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    ROUTE_METADATA.clear();
    PARAM_METADATA.clear();
  });

  describe('Basic route registration', () => {
    test('should register GET route', async () => {
      @Controller('/api/test')
      class TestController {
        @Get('/hello')
        hello() {
          return { message: 'hello' };
        }
      }

      registerControllers(app, [TestController]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/test/hello',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ message: 'hello' });
    });

    test('should register POST route', async () => {
      @Controller('/api/test')
      class TestController {
        @Post('/create')
        create() {
          return { success: true };
        }
      }

      registerControllers(app, [TestController]);

      const response = await app.inject({
        method: 'POST',
        url: '/api/test/create',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ success: true });
    });

    test('should register multiple routes', async () => {
      @Controller('/api/users')
      class UserController {
        @Get('/')
        list() {
          return [];
        }

        @Post('/')
        create() {
          return { id: 1 };
        }
      }

      registerControllers(app, [UserController]);

      const getResponse = await app.inject({
        method: 'GET',
        url: '/api/users',
      });

      const postResponse = await app.inject({
        method: 'POST',
        url: '/api/users',
      });

      expect(getResponse.statusCode).toBe(200);
      expect(postResponse.statusCode).toBe(200);
    });
  });

  describe('Parameter extraction', () => {
    test('should extract body parameter', async () => {
      @Controller('/api/test')
      class TestController {
        @Post('/create')
        create(@Body() data: any) {
          return { received: data };
        }
      }

      registerControllers(app, [TestController]);

      const response = await app.inject({
        method: 'POST',
        url: '/api/test/create',
        payload: { name: 'test', age: 25 },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({
        received: { name: 'test', age: 25 },
      });
    });

    test('should extract body parameter with property key', async () => {
      @Controller('/api/test')
      class TestController {
        @Post('/create')
        create(@Body('name') name: string) {
          return { name };
        }
      }

      registerControllers(app, [TestController]);

      const response = await app.inject({
        method: 'POST',
        url: '/api/test/create',
        payload: { name: 'test', age: 25 },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ name: 'test' });
    });

    test('should extract query parameters', async () => {
      @Controller('/api/test')
      class TestController {
        @Get('/search')
        search(@Query('q') query: string, @Query('page') page: string) {
          return { query, page };
        }
      }

      registerControllers(app, [TestController]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/test/search?q=hello&page=1',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ query: 'hello', page: '1' });
    });

    test('should extract route params', async () => {
      @Controller('/api/users')
      class UserController {
        @Get('/:id')
        get(@Params('id') id: string) {
          return { id };
        }
      }

      registerControllers(app, [UserController]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/users/123',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ id: '123' });
    });

    test('should extract user from request', async () => {
      @Controller('/api/test')
      class TestController {
        @Get('/profile')
        profile(@User() user: any) {
          return { user };
        }
      }

      registerControllers(app, [TestController]);

      // 模拟认证中间件添加 user
      app.addHook('onRequest', async (request) => {
        request.user = { userId: '123', username: 'test' };
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/test/profile',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.user).toEqual({ userId: '123', username: 'test' });
    });

    test('should extract user property with property key', async () => {
      @Controller('/api/test')
      class TestController {
        @Get('/profile')
        profile(@User('userId') userId: string) {
          return { userId };
        }
      }

      registerControllers(app, [TestController]);

      app.addHook('onRequest', async (request) => {
        request.user = { userId: '123', username: 'test' };
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/test/profile',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ userId: '123' });
    });
  });

  describe('Mixed parameters', () => {
    test('should handle mixed parameters in correct order', async () => {
      @Controller('/api/posts')
      class PostController {
        @Put('/:id')
        update(
          @Params('id') id: string,
          @Body('title') title: string,
          @Query('publish') publish: string
        ) {
          return { id, title, publish };
        }
      }

      registerControllers(app, [PostController]);

      const response = await app.inject({
        method: 'PUT',
        url: '/api/posts/123?publish=true',
        payload: { title: 'Test Post', content: 'Content here' },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({
        id: '123',
        title: 'Test Post',
        publish: 'true',
      });
    });
  });

  describe('Multiple controllers', () => {
    test('should register multiple controllers', async () => {
      @Controller('/api/users')
      class UserController {
        @Get('/')
        list() {
          return { controller: 'users' };
        }
      }

      @Controller('/api/posts')
      class PostController {
        @Get('/')
        list() {
          return { controller: 'posts' };
        }
      }

      registerControllers(app, [UserController, PostController]);

      const usersResponse = await app.inject({
        method: 'GET',
        url: '/api/users',
      });

      const postsResponse = await app.inject({
        method: 'GET',
        url: '/api/posts',
      });

      expect(JSON.parse(usersResponse.body)).toEqual({ controller: 'users' });
      expect(JSON.parse(postsResponse.body)).toEqual({ controller: 'posts' });
    });
  });

  describe('Async handlers', () => {
    test('should handle async controller methods', async () => {
      @Controller('/api/test')
      class TestController {
        @Get('/async')
        async asyncMethod() {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return { async: true };
        }
      }

      registerControllers(app, [TestController]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/test/async',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ async: true });
    });
  });
});
