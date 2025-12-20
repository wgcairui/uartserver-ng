/**
 * Data Parsing Service Unit Tests
 *
 * 测试数据解析服务：
 * - RS232 协议解析
 * - RS485/Modbus 协议解析
 * - 数据类型转换 (bit2, utf8, hex/short, float)
 * - CRC16、IEEE 754 工具函数
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  DataParsingService,
  type QueryResult,
  type ProtocolInstruct,
  type InstructQueryResult,
} from '../../src/services/data-parsing.service';
import {
  crc16Modbus,
  hexToSingle,
  singleToHex,
  parseCoefficient,
  value2BytesInt16,
} from '../../src/utils/data-parsing.utils';

describe('Data Parsing Utils', () => {
  describe('CRC16 Modbus', () => {
    it('should generate correct CRC16 for Modbus instruction', () => {
      // 示例: PID=1, Instruct=0300010002
      const result = crc16Modbus(1, '0300010002');

      // 验证格式: PID(01) + Instruct(0300010002) + CRC16(4字符,字节翻转)
      expect(result).toHaveLength(16); // 2+10+4=16字符
      expect(result.startsWith('01')).toBe(true);
      expect(result.includes('0300010002')).toBe(true);
    });

    it('should handle different PIDs', () => {
      const result1 = crc16Modbus(1, '0300010002');
      const result255 = crc16Modbus(255, '0300010002');

      expect(result1.startsWith('01')).toBe(true);
      expect(result255.startsWith('ff')).toBe(true);
    });
  });

  describe('IEEE 754 Float Conversion', () => {
    it('should convert 4-byte buffer to single precision float', () => {
      // IEEE 754: 0x42480000 = 50.0
      const buffer = Buffer.from([0x42, 0x48, 0x00, 0x00]);
      const value = hexToSingle(buffer);

      expect(value).toBe(50.0);
    });

    it('should handle zero value', () => {
      const buffer = Buffer.from([0x00, 0x00, 0x00, 0x00]);
      const value = hexToSingle(buffer);

      expect(value).toBe(0);
    });

    it('should handle negative values', () => {
      // IEEE 754: 0xC2480000 = -50.0
      const buffer = Buffer.from([0xc2, 0x48, 0x00, 0x00]);
      const value = hexToSingle(buffer);

      expect(value).toBe(-50.0);
    });

    it('should handle invalid buffer length', () => {
      const buffer = Buffer.from([0x42, 0x48]); // 只有2字节
      const value = hexToSingle(buffer);

      expect(value).toBe(0); // 应返回0
    });

    it('should convert float back to buffer', () => {
      const value = 50.0;
      const buffer = singleToHex(value);

      expect(buffer).toHaveLength(4);
      expect(hexToSingle(buffer)).toBe(50.0);
    });
  });

  describe('Coefficient Parsing', () => {
    it('should apply numeric coefficient', () => {
      const result = parseCoefficient('0.1', 100);
      expect(result).toBe(10);
    });

    it('should handle coefficient of 1', () => {
      const result = parseCoefficient('1', 50);
      expect(result).toBe(50);
    });

    it('should handle unsupported format (return original)', () => {
      const result = parseCoefficient('(val, val * 0.1)', 100);
      expect(result).toBe(100); // 不支持函数表达式,返回原值
    });
  });

  describe('Value to Bytes', () => {
    it('should convert positive integer to 2-byte array', () => {
      const bytes = value2BytesInt16(1000);

      expect(bytes).toHaveLength(2);
      expect(bytes[0]).toBe(0x03);
      expect(bytes[1]).toBe(0xe8);
    });

    it('should convert negative integer to 2-byte array', () => {
      const bytes = value2BytesInt16(-1000);

      expect(bytes).toHaveLength(2);
      expect(bytes[0]).toBe(0xfc);
      expect(bytes[1]).toBe(0x18);
    });
  });
});

describe('Data Parsing Service', () => {
  let service: DataParsingService;

  beforeEach(() => {
    service = new DataParsingService();
  });

  describe('RS232 Protocol Parsing', () => {
    it('should parse RS232 data with split mode', async () => {
      // 模拟协议配置
      const protocol: ProtocolInstruct = {
        name: 'test_232_split',
        resultType: 'utf8',
        shift: true,
        shiftNum: 2,
        pop: true,
        popNum: 1,
        isSplit: true,
        splitStr: ' ',
        formResize: [
          { name: 'temperature', regx: '1', unit: '°C', isState: false }, // 1-based: 第1个元素
          { name: 'humidity', regx: '2', unit: '%', isState: false },     // 1-based: 第2个元素
        ],
      };

      const instructMap = new Map<string, ProtocolInstruct>();
      instructMap.set('READ_TEMP_HUM', protocol);

      service.setProtocolInstruct('test_protocol', instructMap);

      // 模拟查询结果: "##25.5 60\r"
      const dataStr = '##25.5 60\r';
      const buffer = Buffer.from(dataStr, 'utf8');

      const queryResult: QueryResult = {
        mac: 'AA:BB:CC:DD:EE:FF',
        pid: 1,
        protocol: 'test_protocol',
        type: 232,
        contents: [
          {
            content: 'READ_TEMP_HUM',
            buffer: {
              data: Array.from(buffer), // 正确转换为字节数组
            },
          },
        ],
        useTime: 100,
      };

      const result = await service.parse(queryResult);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('temperature');
      expect(result[0].parseValue).toBe('25.5');
      expect(result[1].name).toBe('humidity');
      expect(result[1].parseValue).toBe('60');
    });

    it('should filter out invalid RS232 results (no ending \\r)', async () => {
      const protocol: ProtocolInstruct = {
        name: 'test_232',
        resultType: 'utf8',
        formResize: [],
      };

      const instructMap = new Map<string, ProtocolInstruct>();
      instructMap.set('TEST', protocol);

      service.setProtocolInstruct('test_protocol', instructMap);

      // 模拟无效查询结果: 缺少结束符 \r
      const queryResult: QueryResult = {
        mac: 'AA:BB:CC:DD:EE:FF',
        pid: 1,
        protocol: 'test_protocol',
        type: 232,
        contents: [
          {
            content: 'TEST',
            buffer: {
              data: [0x31, 0x32, 0x33], // "123" (无 \r)
            },
          },
        ],
        useTime: 100,
      };

      const result = await service.parse(queryResult);

      expect(result).toHaveLength(0); // 应过滤掉
    });
  });

  describe('RS485/Modbus Protocol Parsing', () => {
    it('should parse Modbus hex/short data', async () => {
      // 模拟协议配置
      const protocol: ProtocolInstruct = {
        name: 'READ_HOLDING_REGISTER',
        resultType: 'hex',
        formResize: [
          {
            name: 'voltage',
            regx: '1-2', // 1-based: 第1个字节开始，读2字节
            unit: 'V',
            isState: false,
            bl: '0.1',
          },
        ],
      };

      const instructMap = new Map<string, ProtocolInstruct>();
      instructMap.set('READ_HOLDING_REGISTER', protocol);

      service.setProtocolInstruct('test_modbus', instructMap);
      service.setContentToName('0300010001', 'READ_HOLDING_REGISTER');

      // 模拟 Modbus 响应: PID=1, FunctionCode=03, Length=02, Data=[01 F4], CRC=[xx xx]
      // 01 F4 (大端序) = 500, 系数 0.1 -> 50.0V
      const queryResult: QueryResult = {
        mac: 'AA:BB:CC:DD:EE:FF',
        pid: 1,
        protocol: 'test_modbus',
        type: 485,
        contents: [
          {
            content: '0300010001',
            buffer: {
              data: [0x01, 0x03, 0x02, 0x01, 0xf4, 0x00, 0x00], // PID, FC, Len, Data, CRC
            },
          },
        ],
        useTime: 100,
      };

      const result = await service.parse(queryResult);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('voltage');
      expect(result[0].parseValue).toBe('50.0');
    });

    it('should parse Modbus float data', async () => {
      const protocol: ProtocolInstruct = {
        name: 'READ_FLOAT',
        resultType: 'float',
        formResize: [
          {
            name: 'power',
            regx: '1-4', // 1-based: 第1个字节开始，读4字节
            unit: 'kW',
            isState: false,
          },
        ],
      };

      const instructMap = new Map<string, ProtocolInstruct>();
      instructMap.set('READ_FLOAT', protocol);

      service.setProtocolInstruct('test_modbus', instructMap);
      service.setContentToName('0300020002', 'READ_FLOAT');

      // Modbus 响应: PID=1, FC=03, Len=04, Data=[42 48 00 00] (50.0), CRC
      const queryResult: QueryResult = {
        mac: 'AA:BB:CC:DD:EE:FF',
        pid: 1,
        protocol: 'test_modbus',
        type: 485,
        contents: [
          {
            content: '0300020002',
            buffer: {
              data: [0x01, 0x03, 0x04, 0x42, 0x48, 0x00, 0x00, 0x00, 0x00],
            },
          },
        ],
        useTime: 100,
      };

      const result = await service.parse(queryResult);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('power');
      expect(result[0].parseValue).toBe('50.00');
    });

    it('should parse Modbus bit2 (coil) data', async () => {
      const protocol: ProtocolInstruct = {
        name: 'READ_COILS',
        resultType: 'bit2',
        formResize: [
          { name: 'coil_0', regx: '1', unit: '', isState: false }, // 1-based: 第1个位
          { name: 'coil_1', regx: '2', unit: '', isState: false }, // 1-based: 第2个位
          { name: 'coil_2', regx: '3', unit: '', isState: false }, // 1-based: 第3个位
        ],
      };

      const instructMap = new Map<string, ProtocolInstruct>();
      instructMap.set('READ_COILS', protocol);

      service.setProtocolInstruct('test_modbus', instructMap);
      service.setContentToName('01000000000A', 'READ_COILS');

      // Modbus 响应: PID=1, FC=01, Len=01, Data=[0b00000101] (bit2: [1,0,1,0,0,0,0,0]), CRC
      const queryResult: QueryResult = {
        mac: 'AA:BB:CC:DD:EE:FF',
        pid: 1,
        protocol: 'test_modbus',
        type: 485,
        contents: [
          {
            content: '01000000000A',
            buffer: {
              data: [0x01, 0x01, 0x01, 0x05, 0x00, 0x00], // PID, FC, Len, Data=5(0b101), CRC
            },
          },
        ],
        useTime: 100,
      };

      const result = await service.parse(queryResult);

      expect(result).toHaveLength(3);
      expect(result[0].parseValue).toBe('1'); // LSB first
      expect(result[1].parseValue).toBe('0');
      expect(result[2].parseValue).toBe('1');
    });

    it('should filter out invalid Modbus responses (wrong PID)', async () => {
      const protocol: ProtocolInstruct = {
        name: 'READ_REG',
        resultType: 'hex',
        formResize: [{ name: 'test', regx: '1-2' }], // 1-based
      };

      const instructMap = new Map<string, ProtocolInstruct>();
      instructMap.set('READ_REG', protocol);

      service.setProtocolInstruct('test_modbus', instructMap);
      service.setContentToName('0300010001', 'READ_REG');

      // PID 不匹配: 响应 PID=2, 查询 PID=1
      const queryResult: QueryResult = {
        mac: 'AA:BB:CC:DD:EE:FF',
        pid: 1, // 查询 PID=1
        protocol: 'test_modbus',
        type: 485,
        contents: [
          {
            content: '0300010001',
            buffer: {
              data: [0x02, 0x03, 0x02, 0x01, 0xf4, 0x00, 0x00], // 响应 PID=2
            },
          },
        ],
        useTime: 100,
      };

      const result = await service.parse(queryResult);

      expect(result).toHaveLength(0); // 应过滤掉
    });
  });

  describe('State Mapping', () => {
    it('should apply state mapping for simulated values', async () => {
      const protocol: ProtocolInstruct = {
        name: 'READ_STATUS',
        resultType: 'hex',
        formResize: [
          {
            name: 'device_status',
            regx: '1-2', // 1-based
            unit: 'device_state',
            isState: true,
          },
        ],
      };

      const instructMap = new Map<string, ProtocolInstruct>();
      instructMap.set('READ_STATUS', protocol);

      service.setProtocolInstruct('test_modbus', instructMap);
      service.setContentToName('0300030001', 'READ_STATUS');

      // 设置状态映射
      const stateMap = new Map<string, string>();
      stateMap.set('0', '离线');
      stateMap.set('1', '在线');
      stateMap.set('2', '故障');
      service.setStateMap('device_state', stateMap);

      // Modbus 响应: 状态值=1 (在线)
      const queryResult: QueryResult = {
        mac: 'AA:BB:CC:DD:EE:FF',
        pid: 1,
        protocol: 'test_modbus',
        type: 485,
        contents: [
          {
            content: '0300030001',
            buffer: {
              data: [0x01, 0x03, 0x02, 0x00, 0x01, 0x00, 0x00], // 状态=1
            },
          },
        ],
        useTime: 100,
      };

      const result = await service.parse(queryResult);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('device_status');
      expect(result[0].parseValue).toBe('在线');
    });
  });

  describe('Production Scenarios - 1-based Regx Indexing', () => {
    it('should parse multiple Modbus registers with 1-based indices', async () => {
      const protocol: ProtocolInstruct = {
        name: 'READ_MULTI_REGISTERS',
        resultType: 'hex',
        formResize: [
          {
            name: 'voltage',
            regx: '1-2', // 第1个字节开始，读2字节
            unit: 'V',
            isState: false,
            bl: '0.1',
          },
          {
            name: 'current',
            regx: '3-2', // 第3个字节开始，读2字节
            unit: 'A',
            isState: false,
            bl: '0.01',
          },
          {
            name: 'power',
            regx: '5-2', // 第5个字节开始，读2字节
            unit: 'W',
            isState: false,
            bl: '1',
          },
        ],
      };

      const instructMap = new Map<string, ProtocolInstruct>();
      instructMap.set('READ_MULTI_REGISTERS', protocol);
      service.setProtocolInstruct('test_modbus', instructMap);
      service.setContentToName('0300010003', 'READ_MULTI_REGISTERS');

      // Modbus 响应: [PID][FC][Len][Data: 01F4 00C8 03E8][CRC]
      // 01F4 (500 * 0.1 = 50.0V) at bytes 1-2
      // 00C8 (200 * 0.01 = 2.00A) at bytes 3-4
      // 03E8 (1000 * 1 = 1000W) at bytes 5-6
      const queryResult: QueryResult = {
        mac: 'AA:BB:CC:DD:EE:FF',
        pid: 1,
        protocol: 'test_modbus',
        type: 485,
        contents: [
          {
            content: '0300010003',
            buffer: {
              data: [0x01, 0x03, 0x06, 0x01, 0xf4, 0x00, 0xc8, 0x03, 0xe8, 0x00, 0x00],
            },
          },
        ],
        useTime: 100,
      };

      const result = await service.parse(queryResult);

      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('voltage');
      expect(result[0].parseValue).toBe('50.0');
      expect(result[1].name).toBe('current');
      expect(result[1].parseValue).toBe('2.0');
      expect(result[2].name).toBe('power');
      expect(result[2].parseValue).toBe('1000');
    });

    it('should parse float data with 1-based 4-byte index', async () => {
      const protocol: ProtocolInstruct = {
        name: 'READ_FLOAT_POWER',
        resultType: 'float',
        formResize: [
          {
            name: 'power',
            regx: '1-4', // 第1个字节开始，读4字节 (IEEE 754)
            unit: 'kW',
            isState: false,
          },
        ],
      };

      const instructMap = new Map<string, ProtocolInstruct>();
      instructMap.set('READ_FLOAT_POWER', protocol);
      service.setProtocolInstruct('test_modbus', instructMap);
      service.setContentToName('0300020002', 'READ_FLOAT_POWER');

      // Modbus 响应: [PID][FC][Len][Data: 42480000][CRC]
      // 42480000 = 50.0 (IEEE 754)
      const queryResult: QueryResult = {
        mac: 'AA:BB:CC:DD:EE:FF',
        pid: 1,
        protocol: 'test_modbus',
        type: 485,
        contents: [
          {
            content: '0300020002',
            buffer: {
              data: [0x01, 0x03, 0x04, 0x42, 0x48, 0x00, 0x00, 0x00, 0x00],
            },
          },
        ],
        useTime: 100,
      };

      const result = await service.parse(queryResult);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('power');
      expect(result[0].parseValue).toBe('50.00');
    });

    it('should parse RS232 split mode with 1-based indices', async () => {
      const protocol: ProtocolInstruct = {
        name: 'READ_ENV_DATA',
        resultType: 'utf8',
        shift: true,
        shiftNum: 2,
        pop: true,
        popNum: 1,
        isSplit: true,
        splitStr: ',',
        formResize: [
          { name: 'temperature', regx: '1', unit: '°C', isState: false }, // 第1个
          { name: 'humidity', regx: '2', unit: '%', isState: false },     // 第2个
          { name: 'pressure', regx: '3', unit: 'kPa', isState: false },   // 第3个
        ],
      };

      const instructMap = new Map<string, ProtocolInstruct>();
      instructMap.set('READ_ENV_DATA', protocol);
      service.setProtocolInstruct('test_protocol', instructMap);

      // 数据: "##25.5,60,101.3\r"
      const queryResult: QueryResult = {
        mac: 'AA:BB:CC:DD:EE:FF',
        pid: 1,
        protocol: 'test_protocol',
        type: 232,
        contents: [
          {
            content: 'READ_ENV_DATA',
            buffer: {
              data: Array.from(Buffer.from('##25.5,60,101.3\r', 'utf8')),
            },
          },
        ],
        useTime: 100,
      };

      const result = await service.parse(queryResult);

      expect(result).toHaveLength(3);
      expect(result[0].parseValue).toBe('25.5');
      expect(result[1].parseValue).toBe('60');
      expect(result[2].parseValue).toBe('101.3');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty instruction results', async () => {
      const queryResult: QueryResult = {
        mac: 'AA:BB:CC:DD:EE:FF',
        pid: 1,
        protocol: 'test',
        type: 485,
        contents: [], // 空结果
        useTime: 100,
      };

      const result = await service.parse(queryResult);

      expect(result).toHaveLength(0);
    });

    it('should handle missing protocol', async () => {
      const queryResult: QueryResult = {
        mac: 'AA:BB:CC:DD:EE:FF',
        pid: 1,
        protocol: 'nonexistent_protocol',
        type: 485,
        contents: [
          {
            content: 'TEST',
            buffer: { data: [0x01, 0x03, 0x02, 0x00, 0x01, 0x00, 0x00] },
          },
        ],
        useTime: 100,
      };

      const result = await service.parse(queryResult);

      expect(result).toHaveLength(0); // 协议不存在,返回空数组
    });
  });
});
