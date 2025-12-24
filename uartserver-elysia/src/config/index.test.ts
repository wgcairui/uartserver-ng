import { describe, test, expect } from 'bun:test';
import { config, derivedConfig } from './index';

describe('Config Module', () => {
  test('should load basic configuration', () => {
    expect(config.NODE_ENV).toBeDefined();
    expect(config.PORT).toBeNumber();
    expect(config.HOST).toBeDefined();
  });

  test('should have valid MongoDB URI', () => {
    expect(config.MONGODB_URI).toMatch(/^mongodb:\/\//);
  });

  test('should have valid PostgreSQL configuration', () => {
    expect(config.DB_HOST).toBeDefined();
    expect(config.DB_PORT).toBeNumber();
    expect(config.DB_USER).toBeDefined();
  });

  test('should have valid Redis configuration', () => {
    expect(config.REDIS_HOST).toBeDefined();
    expect(config.REDIS_PORT).toBeNumber();
    expect(config.REDIS_DB).toBeNumber();
  });

  test('should convert string numbers to numbers', () => {
    expect(typeof config.PORT).toBe('number');
    expect(typeof config.DB_PORT).toBe('number');
    expect(typeof config.REDIS_PORT).toBe('number');
    expect(typeof config.WORKER_POOL_SIZE).toBe('number');
  });

  test('should convert boolean strings', () => {
    expect(typeof config.LOG_PRETTY).toBe('boolean');
  });

  describe('Derived Config', () => {
    test('should detect environment correctly', () => {
      expect(typeof derivedConfig.isProduction).toBe('boolean');
      expect(typeof derivedConfig.isDevelopment).toBe('boolean');
      expect(typeof derivedConfig.isTest).toBe('boolean');
    });

    test('should generate server URL', () => {
      expect(derivedConfig.serverUrl).toMatch(/^http:\/\//);
      expect(derivedConfig.serverUrl).toContain(config.PORT.toString());
    });

    test('should generate PostgreSQL URL', () => {
      expect(derivedConfig.postgresUrl).toMatch(/^postgresql:\/\//);
      expect(derivedConfig.postgresUrl).toContain(config.DB_HOST);
      expect(derivedConfig.postgresUrl).toContain(config.DB_PORT.toString());
    });

    test('should have Redis config object', () => {
      const redisConfig = derivedConfig.redisConfig;
      expect(redisConfig.host).toBe(config.REDIS_HOST);
      expect(redisConfig.port).toBe(config.REDIS_PORT);
      expect(redisConfig.db).toBe(config.REDIS_DB);
    });

    test('should detect optional services', () => {
      expect(typeof derivedConfig.hasOSS).toBe('boolean');
      expect(typeof derivedConfig.hasIoT).toBe('boolean');
      expect(typeof derivedConfig.hasWXP).toBe('boolean');
      expect(typeof derivedConfig.hasEmail).toBe('boolean');
    });
  });

  describe('Type Safety', () => {
    test('should have correct environment enum', () => {
      expect(['development', 'production', 'test']).toContain(config.NODE_ENV);
    });

    test('should have correct log level enum', () => {
      expect(['debug', 'info', 'warn', 'error']).toContain(config.LOG_LEVEL);
    });
  });
});
