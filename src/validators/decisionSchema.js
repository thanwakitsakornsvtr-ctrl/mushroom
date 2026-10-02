const { z } = require('zod');

const outcomeSchema = z.object({
  applied: z.boolean(),
  error: z.string().nullable().optional(),
});

const decisionSchema = z.object({
  situation: z.string().trim().min(1).max(64),
  reasons: z.array(z.string().max(64)).max(8).default([]),
  targets: z.object({
    fan: z.enum(['on', 'off']),
    mister: z.enum(['on', 'off']),
  }),
  smoothed: z
    .object({ co2: z.number(), temperature: z.number(), humidity: z.number() })
    .nullable()
    .optional(),
  classification: z
    .object({ co2: z.string(), temperature: z.string(), humidity: z.string() })
    .nullable()
    .optional(),
  changed: z.object({
    fan: z.boolean().default(false),
    mister: z.boolean().default(false),
  }),
  outcomes: z
    .object({ fan: outcomeSchema.optional(), mister: outcomeSchema.optional() })
    .optional(),
});

const plugReportSchema = z.object({
  state: z.enum(['on', 'off', 'unknown']),
  reachable: z.boolean(),
  error: z.string().max(64).nullable().optional(),
});

// ESP32 อ่านสถานะจริงจากปลั๊ก Tapo แล้วรายงาน (ตอนบูต, ทุก 30 วิ, หลังสั่งสำเร็จ)
const plugsSchema = z.object({
  deviceId: z.string().trim().min(1).max(64).optional(),
  fan: plugReportSchema,
  mister: plugReportSchema,
});

module.exports = { decisionSchema, plugsSchema };
