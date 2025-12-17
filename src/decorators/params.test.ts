import { describe, test, expect, beforeEach } from 'bun:test';
import { Body, Query, Params, User, PARAM_METADATA } from './params';
import { Controller, Post } from './controller';

describe('Parameter Decorators', () => {
  beforeEach(() => {
    PARAM_METADATA.clear();
  });

  describe('@Body decorator', () => {
    test('should register body parameter', () => {
      class TestController {
        create(@Body() data: any) {
          return data;
        }
      }

      const metadata = PARAM_METADATA.get(TestController);
      expect(metadata).toBeDefined();
      expect(metadata?.get('create')).toHaveLength(1);
      expect(metadata?.get('create')?.[0]).toEqual({
        type: 'body',
        index: 0,
        propertyKey: undefined,
      });
    });

    test('should register body parameter with property key', () => {
      class TestController {
        create(@Body('name') name: string) {
          return { name };
        }
      }

      const metadata = PARAM_METADATA.get(TestController);
      expect(metadata?.get('create')?.[0]).toEqual({
        type: 'body',
        index: 0,
        propertyKey: 'name',
      });
    });

    test('should register multiple body parameters', () => {
      class TestController {
        create(@Body('name') name: string, @Body('age') age: number) {
          return { name, age };
        }
      }

      const metadata = PARAM_METADATA.get(TestController);
      const params = metadata?.get('create');

      expect(params).toHaveLength(2);
      expect(params?.[0]).toEqual({
        type: 'body',
        index: 0,
        propertyKey: 'name',
      });
      expect(params?.[1]).toEqual({
        type: 'body',
        index: 1,
        propertyKey: 'age',
      });
    });
  });

  describe('@Query decorator', () => {
    test('should register query parameter', () => {
      class TestController {
        list(@Query('page') page: number) {
          return { page };
        }
      }

      const metadata = PARAM_METADATA.get(TestController);
      expect(metadata?.get('list')?.[0]).toEqual({
        type: 'query',
        index: 0,
        propertyKey: 'page',
      });
    });

    test('should register query parameter without property key', () => {
      class TestController {
        list(@Query() query: any) {
          return query;
        }
      }

      const metadata = PARAM_METADATA.get(TestController);
      expect(metadata?.get('list')?.[0]).toEqual({
        type: 'query',
        index: 0,
        propertyKey: undefined,
      });
    });

    test('should register multiple query parameters', () => {
      class TestController {
        list(
          @Query('page') page: number,
          @Query('limit') limit: number,
          @Query('search') search: string
        ) {
          return { page, limit, search };
        }
      }

      const metadata = PARAM_METADATA.get(TestController);
      const params = metadata?.get('list');

      expect(params).toHaveLength(3);
      expect(params?.map(p => p.propertyKey)).toEqual(['page', 'limit', 'search']);
    });
  });

  describe('@Params decorator', () => {
    test('should register params parameter', () => {
      class TestController {
        get(@Params('id') id: string) {
          return { id };
        }
      }

      const metadata = PARAM_METADATA.get(TestController);
      expect(metadata?.get('get')?.[0]).toEqual({
        type: 'params',
        index: 0,
        propertyKey: 'id',
      });
    });

    test('should register params parameter without property key', () => {
      class TestController {
        get(@Params() params: any) {
          return params;
        }
      }

      const metadata = PARAM_METADATA.get(TestController);
      expect(metadata?.get('get')?.[0]).toEqual({
        type: 'params',
        index: 0,
        propertyKey: undefined,
      });
    });

    test('should register multiple params parameters', () => {
      class TestController {
        get(@Params('mac') mac: string, @Params('pid') pid: number) {
          return { mac, pid };
        }
      }

      const metadata = PARAM_METADATA.get(TestController);
      const params = metadata?.get('get');

      expect(params).toHaveLength(2);
      expect(params?.map(p => p.propertyKey)).toEqual(['mac', 'pid']);
    });
  });

  describe('@User decorator', () => {
    test('should register user parameter', () => {
      class TestController {
        profile(@User() user: any) {
          return user;
        }
      }

      const metadata = PARAM_METADATA.get(TestController);
      expect(metadata?.get('profile')?.[0]).toEqual({
        type: 'user',
        index: 0,
        propertyKey: undefined,
      });
    });

    test('should register user parameter with property key', () => {
      class TestController {
        profile(@User('userId') userId: string) {
          return { userId };
        }
      }

      const metadata = PARAM_METADATA.get(TestController);
      expect(metadata?.get('profile')?.[0]).toEqual({
        type: 'user',
        index: 0,
        propertyKey: 'userId',
      });
    });
  });

  describe('Mixed parameter decorators', () => {
    test('should register mixed parameters in correct order', () => {
      @Controller('/api/users')
      class UserController {
        @Post('/:id')
        update(
          @Params('id') id: string,
          @Body('name') name: string,
          @Query('force') force: boolean,
          @User('userId') userId: string
        ) {
          return { id, name, force, userId };
        }
      }

      const metadata = PARAM_METADATA.get(UserController);
      const params = metadata?.get('update');

      expect(params).toHaveLength(4);
      expect(params?.map(p => p.type)).toEqual(['params', 'body', 'query', 'user']);
      expect(params?.map(p => p.propertyKey)).toEqual(['id', 'name', 'force', 'userId']);
      expect(params?.map(p => p.index)).toEqual([0, 1, 2, 3]);
    });

    test('should handle parameters without property keys', () => {
      class TestController {
        create(
          @Body() body: any,
          @Query() query: any,
          @Params() params: any,
          @User() user: any
        ) {
          return { body, query, params, user };
        }
      }

      const metadata = PARAM_METADATA.get(TestController);
      const paramMetadata = metadata?.get('create');

      expect(paramMetadata).toHaveLength(4);
      expect(paramMetadata?.every(p => p.propertyKey === undefined)).toBe(true);
    });
  });

  describe('Metadata storage for different methods', () => {
    test('should store metadata for different methods separately', () => {
      class TestController {
        list(@Query('page') page: number) {
          return { page };
        }

        get(@Params('id') id: string) {
          return { id };
        }

        create(@Body('name') name: string) {
          return { name };
        }
      }

      const metadata = PARAM_METADATA.get(TestController);

      expect(metadata?.get('list')).toHaveLength(1);
      expect(metadata?.get('get')).toHaveLength(1);
      expect(metadata?.get('create')).toHaveLength(1);

      expect(metadata?.get('list')?.[0]?.type).toBe('query');
      expect(metadata?.get('get')?.[0]?.type).toBe('params');
      expect(metadata?.get('create')?.[0]?.type).toBe('body');
    });

    test('should clear metadata correctly', () => {
      class TestController {
        test(@Body() data: any) {
          return data;
        }
      }

      expect(PARAM_METADATA.has(TestController)).toBe(true);

      PARAM_METADATA.clear();

      expect(PARAM_METADATA.has(TestController)).toBe(false);
    });
  });
});
