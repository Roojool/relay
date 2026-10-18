// Relay API input validation (zod 4.6.7).
// Every route handler parses its payload through these schemas before touching the graph.

import { z } from "zod";

export const scenarioIdSchema = z.enum(["S1", "S2", "S3"]);

export const analyzeBodySchema = z.object({
  revision: z.number().int().nonnegative(),
  live: z.boolean().optional(),
});

export const editBodySchema = z.object({
  revision: z.number().int().nonnegative(),
  edit: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("reassign-driver"),
      legId: z.string().min(1),
      driverId: z.string().min(1),
    }),
    z.object({
      kind: z.literal("reschedule"),
      legId: z.string().min(1),
      windowId: z.string().min(1),
    }),
    z.object({
      kind: z.literal("split-leg"),
      legId: z.string().min(1),
      hubId: z.string().min(1),
      note: z.string().max(2000).optional(),
    }),
    z.object({
      kind: z.literal("clarify-unknown"),
      legId: z.string().min(1),
      trailerClassId: z.string().min(1),
      note: z.string().min(1).max(2000),
    }),
  ]),
});

export const approveBodySchema = z.object({
  revision: z.number().int().nonnegative(),
  proposalId: z.string().min(1),
  idempotencyKey: z.string().min(8).max(64),
});

export const memoryBodySchema = z.object({
  message: z.string().min(1).max(2000),
  live: z.boolean().optional(),
});

export const resetBodySchema = z.object({
  scenario: scenarioIdSchema.optional(),
}).strict();

export type AnalyzeBody = z.infer<typeof analyzeBodySchema>;
export type EditBody = z.infer<typeof editBodySchema>;
export type ApproveBody = z.infer<typeof approveBodySchema>;
export type MemoryBody = z.infer<typeof memoryBodySchema>;
export type ResetBody = z.infer<typeof resetBodySchema>;
