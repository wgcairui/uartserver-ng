import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mongodb } from '../database/mongodb';
import { protocolService, Protocol } from './protocol.service';

describe('ProtocolService', () => {
  beforeAll(async () => {
    await mongodb.connect();
    // 清理测试数据
    await mongodb
      .getCollection('device.protocols')
      .deleteMany({ Protocol: /^test_/ });
  });

  afterAll(async () => {
    // 清理测试数据
    await mongodb
      .getCollection('device.protocols')
      .deleteMany({ Protocol: /^test_/ });
    await mongodb.disconnect();
  });

  describe('getProtocol', () => {
    test('should return null for non-existent protocol', async () => {
      const result = await protocolService.getProtocol('non_existent_protocol');
      expect(result).toBeNull();
    });

    test('should return protocol when it exists', async () => {
      const testProtocol: Protocol = {
        Type: 232,
        ProtocolType: 'Test Protocol',
        Protocol: 'test_modbus_001',
        instruct: [{ name: 'read', resultType: 'object', shift: false }],
      };

      await protocolService.upsertProtocol(testProtocol);
      const result = await protocolService.getProtocol('test_modbus_001');

      expect(result).toBeDefined();
      expect(result?.Protocol).toBe('test_modbus_001');
      expect(result?.ProtocolType).toBe('Test Protocol');
    });
  });

  describe('upsertProtocol', () => {
    test('should create new protocol', async () => {
      const newProtocol: Protocol = {
        Type: 485,
        ProtocolType: 'New Protocol',
        Protocol: 'test_new_protocol',
        instruct: [{ name: 'query', resultType: 'string', shift: true }],
      };

      const result = await protocolService.upsertProtocol(newProtocol);
      expect(result).toBe(true);

      const saved = await protocolService.getProtocol('test_new_protocol');
      expect(saved?.Type).toBe(485);
    });

    test('should update existing protocol', async () => {
      const protocol: Protocol = {
        Type: 232,
        ProtocolType: 'Update Test',
        Protocol: 'test_update_protocol',
        instruct: [{ name: 'read', resultType: 'object', shift: false }],
      };

      await protocolService.upsertProtocol(protocol);

      // Update
      protocol.ProtocolType = 'Updated Protocol';
      protocol.instruct.push({
        name: 'write',
        resultType: 'boolean',
        shift: true,
      });

      await protocolService.upsertProtocol(protocol);

      const updated = await protocolService.getProtocol('test_update_protocol');
      expect(updated?.ProtocolType).toBe('Updated Protocol');
      expect(updated?.instruct).toHaveLength(2);
    });

    test('should throw error for missing required fields', async () => {
      expect(
        async () =>
          await protocolService.upsertProtocol({ Type: 232 } as Protocol)
      ).toThrow();
    });
  });

  describe('getProtocols', () => {
    test('should return multiple protocols', async () => {
      await protocolService.upsertProtocol({
        Type: 232,
        ProtocolType: 'Multi 1',
        Protocol: 'test_multi_1',
        instruct: [],
      });

      await protocolService.upsertProtocol({
        Type: 232,
        ProtocolType: 'Multi 2',
        Protocol: 'test_multi_2',
        instruct: [],
      });

      const results = await protocolService.getProtocols([
        'test_multi_1',
        'test_multi_2',
      ]);

      expect(results).toHaveLength(2);
    });
  });

  describe('deleteProtocol', () => {
    test('should delete existing protocol', async () => {
      await protocolService.upsertProtocol({
        Type: 232,
        ProtocolType: 'Delete Test',
        Protocol: 'test_delete_protocol',
        instruct: [],
      });

      const deleted = await protocolService.deleteProtocol(
        'test_delete_protocol'
      );
      expect(deleted).toBe(true);

      const result = await protocolService.getProtocol('test_delete_protocol');
      expect(result).toBeNull();
    });

    test('should return false for non-existent protocol', async () => {
      const deleted = await protocolService.deleteProtocol(
        'non_existent_protocol'
      );
      expect(deleted).toBe(false);
    });
  });

  describe('getProtocolInstructs', () => {
    test('should return instruct list', async () => {
      const instructs = [
        { name: 'read', resultType: 'object', shift: false },
        { name: 'write', resultType: 'boolean', shift: true },
      ];

      await protocolService.upsertProtocol({
        Type: 232,
        ProtocolType: 'Instruct Test',
        Protocol: 'test_instruct_protocol',
        instruct: instructs,
      });

      const result = await protocolService.getProtocolInstructs(
        'test_instruct_protocol'
      );

      expect(result).toHaveLength(2);
      expect(result[0]?.name).toBe('read');
      expect(result[1]?.name).toBe('write');
    });

    test('should return empty array for non-existent protocol', async () => {
      const result = await protocolService.getProtocolInstructs(
        'non_existent'
      );
      expect(result).toEqual([]);
    });
  });
});
