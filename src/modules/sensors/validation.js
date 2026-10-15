const { z } = require('zod');

const readingSchema = z.object({
  deviceId: z.string().trim().min(1).max(64).default('esp32-scd40-01'),
  co2: z.number().finite().int().min(0).max(40000),
  temperature: z.number().finite().min(-40).max(85),
  humidity: z.number().finite().min(0).max(100),
});

module.exports = { readingSchema };
