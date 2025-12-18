/**
 * 分页工具单元测试
 */

import { describe, test, expect } from 'bun:test';
import {
  parsePaginationParams,
  calculateSkip,
  calculateTotalPages,
  createPaginatedResponse,
  createMongoSort,
  PaginationHelper,
  parsePaginationFromQuery,
} from '../../src/utils/pagination';

describe('pagination utils', () => {
  describe('parsePaginationParams', () => {
    test('should use default values when no params provided', () => {
      const result = parsePaginationParams();

      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
      expect(result.sortBy).toBe('createdAt');
      expect(result.sortOrder).toBe('desc');
    });

    test('should parse valid pagination params', () => {
      const result = parsePaginationParams({
        page: 3,
        limit: 20,
        sortBy: 'name',
        sortOrder: 'asc',
      });

      expect(result.page).toBe(3);
      expect(result.limit).toBe(20);
      expect(result.sortBy).toBe('name');
      expect(result.sortOrder).toBe('asc');
    });

    test('should parse string numbers correctly', () => {
      const result = parsePaginationParams({
        page: '5' as any,
        limit: '100' as any,
      });

      expect(result.page).toBe(5);
      expect(result.limit).toBe(100);
    });

    test('should enforce minimum page of 1', () => {
      const result = parsePaginationParams({ page: 0 });
      expect(result.page).toBe(1);

      const result2 = parsePaginationParams({ page: -5 });
      expect(result2.page).toBe(1);
    });

    test('should enforce limit bounds', () => {
      // Test minimum
      const result1 = parsePaginationParams({ limit: 0 });
      expect(result1.limit).toBe(1);

      // Test maximum (default maxLimit is 1000)
      const result2 = parsePaginationParams({ limit: 5000 });
      expect(result2.limit).toBe(1000);
    });

    test('should respect custom options', () => {
      const result = parsePaginationParams(
        {},
        {
          defaultPage: 2,
          defaultLimit: 25,
          maxLimit: 100,
          defaultSortBy: 'updatedAt',
          defaultSortOrder: 'asc',
        }
      );

      expect(result.page).toBe(2);
      expect(result.limit).toBe(25);
      expect(result.sortBy).toBe('updatedAt');
      expect(result.sortOrder).toBe('asc');
    });

    test('should enforce custom maxLimit', () => {
      const result = parsePaginationParams(
        { limit: 500 },
        { maxLimit: 100 }
      );

      expect(result.limit).toBe(100);
    });
  });

  describe('calculateSkip', () => {
    test('should calculate skip correctly for page 1', () => {
      expect(calculateSkip(1, 10)).toBe(0);
      expect(calculateSkip(1, 50)).toBe(0);
    });

    test('should calculate skip correctly for other pages', () => {
      expect(calculateSkip(2, 10)).toBe(10);
      expect(calculateSkip(3, 10)).toBe(20);
      expect(calculateSkip(5, 20)).toBe(80);
    });
  });

  describe('calculateTotalPages', () => {
    test('should calculate total pages correctly', () => {
      expect(calculateTotalPages(100, 10)).toBe(10);
      expect(calculateTotalPages(95, 10)).toBe(10);
      expect(calculateTotalPages(91, 10)).toBe(10);
    });

    test('should round up for partial pages', () => {
      expect(calculateTotalPages(101, 10)).toBe(11);
      expect(calculateTotalPages(105, 10)).toBe(11);
    });

    test('should handle edge cases', () => {
      expect(calculateTotalPages(0, 10)).toBe(0);
      expect(calculateTotalPages(1, 10)).toBe(1);
      expect(calculateTotalPages(10, 10)).toBe(1);
      expect(calculateTotalPages(11, 10)).toBe(2);
    });
  });

  describe('createPaginatedResponse', () => {
    test('should create correct response structure', () => {
      const data = [1, 2, 3, 4, 5];
      const response = createPaginatedResponse(data, 100, 2, 10);

      expect(response.data).toEqual(data);
      expect(response.pagination.page).toBe(2);
      expect(response.pagination.limit).toBe(10);
      expect(response.pagination.total).toBe(100);
      expect(response.pagination.totalPages).toBe(10);
      expect(response.pagination.hasPrevPage).toBe(true);
      expect(response.pagination.hasNextPage).toBe(true);
    });

    test('should set hasPrevPage correctly', () => {
      const response1 = createPaginatedResponse([], 100, 1, 10);
      expect(response1.pagination.hasPrevPage).toBe(false);

      const response2 = createPaginatedResponse([], 100, 2, 10);
      expect(response2.pagination.hasPrevPage).toBe(true);
    });

    test('should set hasNextPage correctly', () => {
      const response1 = createPaginatedResponse([], 100, 10, 10);
      expect(response1.pagination.hasNextPage).toBe(false);

      const response2 = createPaginatedResponse([], 100, 9, 10);
      expect(response2.pagination.hasNextPage).toBe(true);
    });

    test('should handle last page correctly', () => {
      const response = createPaginatedResponse([], 95, 10, 10);
      expect(response.pagination.totalPages).toBe(10);
      expect(response.pagination.hasNextPage).toBe(false);
    });
  });

  describe('createMongoSort', () => {
    test('should create ascending sort', () => {
      const sort = createMongoSort('name', 'asc');
      expect(sort).toEqual({ name: 1 });
    });

    test('should create descending sort', () => {
      const sort = createMongoSort('createdAt', 'desc');
      expect(sort).toEqual({ createdAt: -1 });
    });

    test('should work with different field names', () => {
      const sort1 = createMongoSort('email', 'asc');
      expect(sort1).toEqual({ email: 1 });

      const sort2 = createMongoSort('updatedAt', 'desc');
      expect(sort2).toEqual({ updatedAt: -1 });
    });
  });

  describe('PaginationHelper', () => {
    test('should initialize with default values', () => {
      const helper = new PaginationHelper();

      expect(helper.page).toBe(1);
      expect(helper.limit).toBe(50);
      expect(helper.skip).toBe(0);
      expect(helper.sortBy).toBe('createdAt');
      expect(helper.sortOrder).toBe('desc');
    });

    test('should initialize with provided params', () => {
      const helper = new PaginationHelper({
        page: 3,
        limit: 20,
        sortBy: 'name',
        sortOrder: 'asc',
      });

      expect(helper.page).toBe(3);
      expect(helper.limit).toBe(20);
      expect(helper.skip).toBe(40);
      expect(helper.sortBy).toBe('name');
      expect(helper.sortOrder).toBe('asc');
    });

    test('should calculate skip correctly', () => {
      const helper1 = new PaginationHelper({ page: 1, limit: 10 });
      expect(helper1.skip).toBe(0);

      const helper2 = new PaginationHelper({ page: 5, limit: 20 });
      expect(helper2.skip).toBe(80);
    });

    test('should generate mongoSort correctly', () => {
      const helper1 = new PaginationHelper({ sortBy: 'name', sortOrder: 'asc' });
      expect(helper1.mongoSort).toEqual({ name: 1 });

      const helper2 = new PaginationHelper({ sortBy: 'date', sortOrder: 'desc' });
      expect(helper2.mongoSort).toEqual({ date: -1 });
    });

    test('should create response correctly', () => {
      const helper = new PaginationHelper({ page: 2, limit: 10 });
      const data = [1, 2, 3];
      const response = helper.createResponse(data, 50);

      expect(response.data).toEqual(data);
      expect(response.pagination.page).toBe(2);
      expect(response.pagination.limit).toBe(10);
      expect(response.pagination.total).toBe(50);
      expect(response.pagination.totalPages).toBe(5);
    });

    test('should respect custom options', () => {
      const helper = new PaginationHelper(
        { page: 100, limit: 5000 },
        { maxLimit: 100, defaultPage: 1 }
      );

      expect(helper.page).toBe(100);
      expect(helper.limit).toBe(100); // Capped at maxLimit
    });
  });

  describe('parsePaginationFromQuery', () => {
    test('should parse query string parameters', () => {
      const query = {
        page: '3',
        limit: '25',
        sortBy: 'email',
        sortOrder: 'asc',
      };

      const result = parsePaginationFromQuery(query);

      expect(result.page).toBe(3);
      expect(result.limit).toBe(25);
      expect(result.sortBy).toBe('email');
      expect(result.sortOrder).toBe('asc');
    });

    test('should handle missing parameters', () => {
      const result = parsePaginationFromQuery({});

      expect(result.page).toBeUndefined();
      expect(result.limit).toBeUndefined();
      expect(result.sortBy).toBeUndefined();
      expect(result.sortOrder).toBeUndefined();
    });

    test('should validate sortOrder values', () => {
      const result1 = parsePaginationFromQuery({ sortOrder: 'asc' });
      expect(result1.sortOrder).toBe('asc');

      const result2 = parsePaginationFromQuery({ sortOrder: 'desc' });
      expect(result2.sortOrder).toBe('desc');

      const result3 = parsePaginationFromQuery({ sortOrder: 'invalid' });
      expect(result3.sortOrder).toBeUndefined();
    });

    test('should handle numeric values as strings', () => {
      const query = {
        page: 10,
        limit: 100,
      };

      const result = parsePaginationFromQuery(query);

      expect(result.page).toBe(10);
      expect(result.limit).toBe(100);
    });
  });
});
