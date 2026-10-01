import { ZodError, type ZodIssue } from 'zod';
import { apiError } from '@/lib/server/auth';

/** A union reports "Invalid input"; the useful message is in the branch that came closest. */
function readableMessage(issue: ZodIssue): string {
  if (issue.code === 'invalid_union') {
    const nested = issue.unionErrors
      .flatMap((error) => error.issues)
      .find((candidate) => candidate.code !== 'invalid_literal' && candidate.code !== 'invalid_type');
    if (nested) return readableMessage(nested);
  }
  return issue.message;
}

/**
 * Settings errors carry the field they belong to so the form can show them
 * next to the input instead of as a raw validation dump in a toast.
 */
export function settingsErrorResponse(error: unknown) {
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    const field = issue?.path.filter((part) => part !== 'patch').join('.') || undefined;
    return Response.json({ error: (issue && readableMessage(issue)) || 'This value is not valid.', field }, { status: 400 });
  }
  if (error instanceof Error && typeof (error as { status?: unknown }).status === 'number') {
    const { status, field } = error as Error & { status: number; field?: string };
    return Response.json({ error: error.message, ...(field ? { field } : {}) }, { status });
  }
  return apiError(error);
}
