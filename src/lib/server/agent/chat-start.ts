import 'server-only';
import * as actionSync from '../../../../services/actionSyncService';
import { actionCenter } from '../workspace';
import {
  COMPANION_TOOL_ERRORS,
  classifyCompanionToolError
} from '../../../../contracts/companion';
import {
  buildCompanionSuggestions,
  type CompanionSuggestion
} from '../../../../services/companionResearchService';


const PROBE_TIMEOUT_MS = 3_000;
const OPEN_STATUSES = new Set(['suggested', 'open', 'waiting']);

export type PaperlessState = 'ok' | 'unreachable' | 'access';

export interface ChatStart {
  paperless: PaperlessState;
  suggestions: CompanionSuggestion[];
}

async function recentDocuments(householdId: string, memberId: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(COMPANION_TOOL_ERRORS.unreachable)), PROBE_TIMEOUT_MS);
  });
  try {
    const found = await Promise.race([
      actionSync.listRecentPaperlessDocuments(householdId, memberId, 3),
      timeout
    ]);
    return {
      state: 'ok' as const,
      documents: (Array.isArray(found) ? found : []).flatMap((document: Record<string, unknown>) => {
        const id = Number(document.id);
        const title = String(document.title || '').trim();
        return Number.isSafeInteger(id) && id > 0 && title ? [{ id, title }] : [];
      })
    };
  } catch (error) {
    return {
      state: classifyCompanionToolError(error) === COMPANION_TOOL_ERRORS.access ? 'access' as const : 'unreachable' as const,
      documents: undefined
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * What the empty chat needs: whether Paperless answers right now and starter
 * prompts built from the household's real next deadline and newest documents.
 */
export async function loadChatStart(householdId: string, memberId: string): Promise<ChatStart> {
  const nextAction = actionCenter.listCases(householdId)
    .filter((entry) => OPEN_STATUSES.has(String(entry.status)) && entry.dueAt)
    .sort((left, right) => String(left.dueAt).localeCompare(String(right.dueAt)))
    .map((entry) => ({ title: String(entry.title), dueAt: String(entry.dueAt) }))[0] || null;
  const recent = await recentDocuments(householdId, memberId);
  return {
    paperless: recent.state,
    suggestions: buildCompanionSuggestions({ nextAction, recentDocuments: recent.documents })
  };
}
