/**
 * Protocol API Schemas (Phase 8.2)
 *
 * 协议管理 API 验证 schemas
 */

import { z } from 'zod';

// ============================================================================
// 基础验证 Schemas
// ============================================================================

/**
 * 协议名称验证
 */
export const ProtocolNameSchema = z
  .string()
  .min(1, '协议名称不能为空')
  .max(100, '协议名称最多 100 个字符');

/**
 * MAC 地址验证 (设备唯一标识)
 */
export const MacAddressSchema = z
  .string()
  .regex(/^[A-F0-9]{12}$/i, 'MAC 地址格式错误 (12位十六进制)');

/**
 * PID 验证 (协议端口 ID)
 */
export const PidSchema = z
  .number()
  .int('PID 必须是整数')
  .positive('PID 必须 > 0');

/**
 * 串口类型验证
 */
export const UartTypeSchema = z.union([z.literal(232), z.literal(485)]);

/**
 * 协议配置类型
 */
export const ProtocolConfigTypeSchema = z.enum([
  'ShowTag',
  'Threshold',
  'AlarmStat',
]);

// ============================================================================
// 获取协议详情
// ============================================================================

/**
 * GET /api/protocols/:code
 * 获取协议详细信息
 */
export const GetProtocolParamsSchema = z.object({
  code: ProtocolNameSchema,
});

export type GetProtocolParams = z.infer<typeof GetProtocolParamsSchema>;

export const GetProtocolResponseSchema = z.object({
  status: z.literal('ok'),
  data: z.object({
    Type: UartTypeSchema,
    Protocol: z.string(),
    ProtocolType: z.string(),
    instruct: z.array(
      z.object({
        name: z.string(),
        isUse: z.boolean(),
        isSplit: z.boolean(),
        splitStr: z.string(),
        noStandard: z.boolean(),
        scriptStart: z.string().optional(),
        scriptEnd: z.string().optional(),
        resultType: z.any(),
        shift: z.boolean(),
        shiftNum: z.number(),
        pop: z.boolean(),
        popNum: z.number(),
        resize: z.string().optional(),
        formResize: z.array(
          z.object({
            name: z.string(),
            enName: z.string().optional(),
            regx: z.string(),
            bl: z.string(),
            unit: z.string(),
            isState: z.boolean(),
          })
        ),
        remark: z.string().optional(),
      })
    ),
    remark: z.string().optional(),
  }),
});

export type GetProtocolResponse = z.infer<typeof GetProtocolResponseSchema>;

// ============================================================================
// 发送协议指令
// ============================================================================

/**
 * POST /api/protocols/send-instruction
 * 发送协议指令到设备
 */
export const SendInstructionRequestSchema = z.object({
  data: z.object({
    query: z.object({
      DevMac: MacAddressSchema,
      pid: PidSchema,
      protocol: ProtocolNameSchema,
    }),
    item: z.object({
      name: z.string(),
      value: z.string(),
      bl: z.string(),
      val: z.string().optional(),
      readme: z.string().optional(),
      tag: z.string().optional(),
    }),
  }),
});

export type SendInstructionRequest = z.infer<
  typeof SendInstructionRequestSchema
>;

export const SendInstructionResponseSchema = z.object({
  status: z.literal('ok'),
  message: z.string().optional(),
  data: z.object({
    success: z.boolean(),
    event: z.string().optional(),
  }),
});

export type SendInstructionResponse = z.infer<
  typeof SendInstructionResponseSchema
>;

// ============================================================================
// 更新用户协议配置
// ============================================================================

/**
 * PUT /api/protocols/:code/user-setup
 * 更新用户协议配置
 */
export const UpdateUserProtocolSetupParamsSchema = z.object({
  code: ProtocolNameSchema,
});

export type UpdateUserProtocolSetupParams = z.infer<
  typeof UpdateUserProtocolSetupParamsSchema
>;

export const UpdateUserProtocolSetupRequestSchema = z.object({
  data: z.object({
    type: ProtocolConfigTypeSchema,
    arg: z.union([
      // ShowTag: string[]
      z.array(z.string()),
      // Threshold: Array<{name, min, max}>
      z.array(
        z.object({
          name: z.string(),
          min: z.number(),
          max: z.number(),
        })
      ),
      // AlarmStat: Array<{name, alarmStat}>
      z.array(
        z.object({
          name: z.string(),
          alarmStat: z.array(z.string()),
        })
      ),
    ]),
  }),
});

export type UpdateUserProtocolSetupRequest = z.infer<
  typeof UpdateUserProtocolSetupRequestSchema
>;

export const UpdateUserProtocolSetupResponseSchema = z.object({
  status: z.literal('ok'),
  message: z.string().optional(),
  data: z.object({
    success: z.boolean(),
  }),
});

export type UpdateUserProtocolSetupResponse = z.infer<
  typeof UpdateUserProtocolSetupResponseSchema
>;

// ============================================================================
// 获取终端协议配置
// ============================================================================

/**
 * GET /api/protocols/terminal/:mac/:pid
 * 获取终端指定 PID 的协议信息
 */
export const GetTerminalProtocolParamsSchema = z.object({
  mac: MacAddressSchema,
  pid: z
    .string()
    .regex(/^\d+$/, 'PID 必须是数字')
    .transform((val) => parseInt(val, 10))
    .pipe(PidSchema),
});

export type GetTerminalProtocolParams = z.infer<
  typeof GetTerminalProtocolParamsSchema
>;

export const GetTerminalProtocolResponseSchema = z.object({
  status: z.literal('ok'),
  data: z
    .object({
      pid: z.number(),
      protocol: z.string(),
      Type: UartTypeSchema.optional(),
      protocolType: z.string().optional(),
      port: z.number().optional(),
      remark: z.string().optional(),
    })
    .nullable(),
});

export type GetTerminalProtocolResponse = z.infer<
  typeof GetTerminalProtocolResponseSchema
>;

// ============================================================================
// 获取协议配置
// ============================================================================

/**
 * GET /api/protocols/:code/setup
 * 获取协议配置 (系统 + 用户)
 */
export const GetProtocolSetupParamsSchema = z.object({
  code: ProtocolNameSchema,
});

export type GetProtocolSetupParams = z.infer<
  typeof GetProtocolSetupParamsSchema
>;

export const GetProtocolSetupQuerySchema = z.object({
  type: ProtocolConfigTypeSchema,
});

export type GetProtocolSetupQuery = z.infer<typeof GetProtocolSetupQuerySchema>;

export const GetProtocolSetupResponseSchema = z.object({
  status: z.literal('ok'),
  data: z.object({
    sys: z.any(), // 系统默认配置 (类型取决于 type 参数)
    user: z.any(), // 用户自定义配置
  }),
});

export type GetProtocolSetupResponse = z.infer<
  typeof GetProtocolSetupResponseSchema
>;

// ============================================================================
// 获取用户告警协议配置
// ============================================================================

/**
 * GET /api/protocols/:code/alarm-setup
 * 获取用户告警协议配置
 */
export const GetUserAlarmSetupParamsSchema = z.object({
  code: ProtocolNameSchema,
});

export type GetUserAlarmSetupParams = z.infer<
  typeof GetUserAlarmSetupParamsSchema
>;

export const GetUserAlarmSetupResponseSchema = z.object({
  status: z.literal('ok'),
  data: z
    .object({
      Protocol: z.string(),
      ShowTag: z.array(z.string()).optional(),
      Threshold: z
        .array(
          z.object({
            name: z.string(),
            min: z.number(),
            max: z.number(),
          })
        )
        .optional(),
      AlarmStat: z
        .array(
          z.object({
            name: z.string(),
            alarmStat: z.array(z.string()),
          })
        )
        .optional(),
    })
    .nullable(),
});

export type GetUserAlarmSetupResponse = z.infer<
  typeof GetUserAlarmSetupResponseSchema
>;

// ============================================================================
// 获取告警协议配置
// ============================================================================

/**
 * GET /api/protocols/:code/alarm
 * 获取告警协议配置 (系统级)
 */
export const GetAlarmProtocolParamsSchema = z.object({
  code: ProtocolNameSchema,
});

export type GetAlarmProtocolParams = z.infer<
  typeof GetAlarmProtocolParamsSchema
>;

export const GetAlarmProtocolResponseSchema = z.object({
  status: z.literal('ok'),
  data: z.object({
    Protocol: z.string(),
    ProtocolType: z.string(),
    Constant: z.any().optional(),
    Threshold: z
      .array(
        z.object({
          name: z.string(),
          min: z.number(),
          max: z.number(),
        })
      )
      .optional(),
    AlarmStat: z
      .array(
        z.object({
          name: z.string(),
          value: z.string(),
          unit: z.string(),
          alarmStat: z.array(z.string()),
        })
      )
      .optional(),
    ShowTag: z.array(z.string()).optional(),
    OprateInstruct: z
      .array(
        z.object({
          name: z.string(),
          value: z.string(),
          bl: z.string(),
          readme: z.string(),
          tag: z.string(),
        })
      )
      .optional(),
  }),
});

export type GetAlarmProtocolResponse = z.infer<
  typeof GetAlarmProtocolResponseSchema
>;

// ============================================================================
// 错误响应
// ============================================================================

export const ProtocolErrorResponseSchema = z.object({
  status: z.literal('error'),
  message: z.string(),
  data: z.null(),
});

export type ProtocolErrorResponse = z.infer<typeof ProtocolErrorResponseSchema>;
