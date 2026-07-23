import { z } from 'zod';
import { providerInstanceIdSchema } from './provider';

export const tagUnificationAnalyzeSchema = z.object({
  providerInstanceId: providerInstanceIdSchema,
  modelId: z.string().trim().min(1).max(240),
  reasoningEffort: z.string().trim().min(1).max(40).optional()
}).strict();

export type TagUnificationAnalyzeInput = z.infer<typeof tagUnificationAnalyzeSchema>;

export const tagUnificationDecisionSchema = z.object({
  decision: z.enum(['approved', 'rejected'])
}).strict();

export type TagUnificationDecisionInput = z.infer<typeof tagUnificationDecisionSchema>;

export const tagUnificationExecuteSchema = z.object({
  phase: z.enum(['move', 'delete'])
}).strict();

export type TagUnificationExecuteInput = z.infer<typeof tagUnificationExecuteSchema>;

export const tagUnificationModelOutputSchema = z.object({
  suggestions: z.array(z.object({
    sourceTagId: z.number().int().positive(),
    targetTagId: z.number().int().positive(),
    reason: z.string().trim().min(1).max(600),
    confidence: z.number().min(0).max(1)
  }).strict()).max(100)
}).strict();

export type TagUnificationModelOutput = z.infer<typeof tagUnificationModelOutputSchema>;

export type TagUnificationStatus =
  | 'suggested'
  | 'approved'
  | 'rejected'
  | 'moving'
  | 'moved'
  | 'deleting'
  | 'completed'
  | 'failed';

export interface PaperlessTagSnapshot {
  id: number;
  name: string;
  documentCount: number;
}

export interface TagUnificationSuggestion {
  id: string;
  runId: string;
  sourceTagId: number;
  sourceTagName: string;
  sourceDocumentCount: number;
  targetTagId: number;
  targetTagName: string;
  targetDocumentCount: number;
  reason: string;
  confidence: number;
  status: TagUnificationStatus;
  currentPhase: 'move' | 'delete' | null;
  providerInstanceId: string;
  modelId: string;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}
