import { describe, test, expect, beforeEach } from 'bun:test';
import { Controller, Get, Post, Put, Delete, ROUTE_METADATA } from './controller';

describe('Controller Decorator', () => {
  beforeEach(() => {
    // 清理元数据
    ROUTE_METADATA.clear();
  });

  test('should register controller with base path', () => {
    @Controller('/api/test')
    class TestController {}

    const routes = ROUTE_METADATA.get(TestController);
    expect(routes).toBeDefined();
    expect(routes?.basePath).toBe('/api/test');
  });

  test('should register controller without base path', () => {
    @Controller()
    class TestController {}

    const routes = ROUTE_METADATA.get(TestController);
    expect(routes).toBeDefined();
    expect(routes?.basePath).toBe('/');
  });

  test('should normalize base path with leading slash', () => {
    @Controller('api/test')
    class TestController {}

    const routes = ROUTE_METADATA.get(TestController);
    expect(routes?.basePath).toBe('/api/test');
  });

  test('should remove trailing slash from base path', () => {
    @Controller('/api/test/')
    class TestController {}

    const routes = ROUTE_METADATA.get(TestController);
    expect(routes?.basePath).toBe('/api/test');
  });
});

describe('HTTP Method Decorators', () => {
  beforeEach(() => {
    ROUTE_METADATA.clear();
  });

  test('@Get should register GET route', () => {
    @Controller('/api/test')
    class TestController {
      @Get('/users')
      getUsers() {
        return [];
      }
    }

    const routes = ROUTE_METADATA.get(TestController);
    expect(routes?.routes).toHaveLength(1);
    expect(routes?.routes[0]).toEqual({
      method: 'GET',
      path: '/users',
      handler: 'getUsers',
      middlewares: [],
    });
  });

  test('@Post should register POST route', () => {
    @Controller('/api/test')
    class TestController {
      @Post('/users')
      createUser() {
        return { id: 1 };
      }
    }

    const routes = ROUTE_METADATA.get(TestController);
    expect(routes?.routes[0]?.method).toBe('POST');
  });

  test('@Put should register PUT route', () => {
    @Controller('/api/test')
    class TestController {
      @Put('/users/:id')
      updateUser() {
        return { id: 1 };
      }
    }

    const routes = ROUTE_METADATA.get(TestController);
    expect(routes?.routes[0]?.method).toBe('PUT');
  });

  test('@Delete should register DELETE route', () => {
    @Controller('/api/test')
    class TestController {
      @Delete('/users/:id')
      deleteUser() {
        return { success: true };
      }
    }

    const routes = ROUTE_METADATA.get(TestController);
    expect(routes?.routes[0]?.method).toBe('DELETE');
  });

  test('should register multiple routes in one controller', () => {
    @Controller('/api/users')
    class UserController {
      @Get('/')
      list() {
        return [];
      }

      @Get('/:id')
      get() {
        return {};
      }

      @Post('/')
      create() {
        return {};
      }

      @Put('/:id')
      update() {
        return {};
      }

      @Delete('/:id')
      delete() {
        return {};
      }
    }

    const routes = ROUTE_METADATA.get(UserController);
    expect(routes?.routes).toHaveLength(5);

    const methods = routes?.routes.map(r => r.method);
    expect(methods).toEqual(['GET', 'GET', 'POST', 'PUT', 'DELETE']);
  });

  test('should normalize route path with leading slash', () => {
    @Controller('/api/test')
    class TestController {
      @Get('users')
      getUsers() {
        return [];
      }
    }

    const routes = ROUTE_METADATA.get(TestController);
    expect(routes?.routes[0]?.path).toBe('/users');
  });

  test('should handle root path', () => {
    @Controller('/api/test')
    class TestController {
      @Get('/')
      root() {
        return {};
      }
    }

    const routes = ROUTE_METADATA.get(TestController);
    expect(routes?.routes[0]?.path).toBe('/');
  });

  test('should combine base path and route path correctly', () => {
    @Controller('/api')
    class TestController {
      @Get('/users')
      getUsers() {
        return [];
      }
    }

    const routes = ROUTE_METADATA.get(TestController);
    // 组合路径的逻辑在路由加载器中处理
    expect(routes?.basePath).toBe('/api');
    expect(routes?.routes[0]?.path).toBe('/users');
  });
});

describe('Route Metadata Storage', () => {
  beforeEach(() => {
    ROUTE_METADATA.clear();
  });

  test('should store metadata for different controllers separately', () => {
    @Controller('/api/users')
    class UserController {
      @Get('/')
      list() {
        return [];
      }
    }

    @Controller('/api/posts')
    class PostController {
      @Get('/')
      list() {
        return [];
      }
    }

    const userRoutes = ROUTE_METADATA.get(UserController);
    const postRoutes = ROUTE_METADATA.get(PostController);

    expect(userRoutes?.basePath).toBe('/api/users');
    expect(postRoutes?.basePath).toBe('/api/posts');
    expect(userRoutes?.routes).toHaveLength(1);
    expect(postRoutes?.routes).toHaveLength(1);
  });

  test('should clear metadata correctly', () => {
    @Controller('/api/test')
    class TestController {
      @Get('/')
      test() {}
    }

    expect(ROUTE_METADATA.has(TestController)).toBe(true);

    ROUTE_METADATA.clear();

    expect(ROUTE_METADATA.has(TestController)).toBe(false);
  });
});
