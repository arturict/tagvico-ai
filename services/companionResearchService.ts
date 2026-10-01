export type CompanionResearchStep =
  | { toolName: 'count_documents'; input: Record<string, never> }
  | { toolName: 'list_recent_documents'; input: { limit: number } }
  | { toolName: 'list_actions'; input: { status?: 'suggested' | 'open' | 'waiting' | 'done' | 'dismissed' } }
  | { toolName: 'search_documents'; input: { query: string } }
  | { toolName: 'get_document'; input: { documentId: number } }
  | { toolName: 'list_tags'; input: { limit: number } }
  | {
    toolName: 'propose_tag_create';
    input: { name: string; reason: string };
  }
  // Reads the document first, then prepares an action approval titled after
  // it. Only the deterministic fallback uses this; models plan propose_action.
  | { toolName: 'propose_followup'; input: { documentId: number; request: string } };

export interface CompanionResearchPlan {
  steps: CompanionResearchStep[];
  readSearchResults: boolean;
}

type CompanionResearchResult = {
  toolName: string;
  output: unknown;
};

const SOCIAL_ONLY = /^(?:hi|hey|hello|hallo|hoi|servus|moin|guten\s+(?:morgen|tag|abend)|danke|dankesch[oö]n|thanks|thank\s+you|was\s+kannst\s+du|what\s+can\s+you\s+do)[\s!.,?]*$/i;
const DOCUMENT_WORDS = /(?:\b(?:document|documents|doc|docs|paperless|dokument|dokumente|rechnung|rechnungen|invoice|invoices|bill|bills|vertrag|vertr[aä]ge|contract|contracts|brief|letter|letters|notice|insurance|versicherung|receipt|beleg|steuer|tax)\b|doc:\/\/)/i;
const SEARCH_WORDS = /\b(?:find|search|show|look\s+for|locate|suche|such|finde|zeig|zeige|durchsuche|welche|which)\b/i;
const CONTENT_WORDS = /\b(?:read|inspect|review|open|content|contents|terms|details|summar|zusammenfass|due|deadline|f[aä]llig|frist|notice\s+period|k[üu]ndigungsfrist|amount|betrag|when|wann|what\s+does|was\s+steht|explain|erkl[aä]r)\w*/i;
const ACTION_WORDS = /\b(?:action|actions|task|tasks|to-?do|attention|obligation|deadline|deadlines|due\s+soon|aufgabe|aufgaben|aktion|aktionen|handlungsbedarf|pflicht|pflichten|frist|fristen|f[aä]llig)\b/i;
const RECENT_WORDS = /\b(?:recent|latest|newest|new\s+documents?|last\s+documents?|recently\s+added|neueste|neuste|letzte|k[üu]rzlich|neue\s+dokumente)\b/i;
const COUNT_WORDS = /(?:\bhow\s+many\b|\bcount\b|\bnumber\s+of\b|\bwie\s+viele\b|\banzahl\b|doc:\/\/count_?documents?)/i;
const TAG_WORDS = /\b(?:tags?|schlagw[oö]rt\w*|etiketten?)\b/i;
const FOLLOWUP_INTENT = /\b(?:prepare|create|add|make|draft|set\s+up|erstelle\w*|bereite\w*)\b[^.?!]*\b(?:follow-?up|reminder|task|action|aufgabe|nachfass\w*)\b/i;
const ADAPTER_PLANNING_WORDS = /(?:\b(?:paperless|documents?|docs?|dokumente?|rechnungen?|invoices?|actions?|tags?)\b|doc:\/\/)/i;

export function shouldPlanAdapterResearch(text: string) {
  return ADAPTER_PLANNING_WORDS.test(String(text || ''));
}

export function shouldReadCompanionSearchResults(text: string) {
  return CONTENT_WORDS.test(String(text || ''));
}

export function explicitCompanionDocumentId(text: string) {
  const match = text.match(/(?:document|documents?|dokument|dokumente|doc)\s*#?\s*(\d{1,10})/i);
  const value = Number(match?.[1]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function explicitCompanionTagCreate(text: string) {
  const source = String(text || '').trim();
  const prefix = String.raw`(?:\b(?:create|add)\s+(?:a\s+)?(?:paperless(?:-ngx)?\s+)?tag\s+(?:named|called)|\b(?:erstelle|erstell|füge)\s+(?:einen?\s+)?(?:paperless(?:-ngx)?\s+)?tag\s+(?:namens|mit\s+dem\s+namen))`;
  const quoted = source.match(new RegExp(`${prefix}\\s+["“']([^"”']{1,128})["”']\\s*[.!?]*$`, 'i'));
  const unquoted = quoted ? null : source.match(new RegExp(`${prefix}\\s+(.+?)\\s*$`, 'i'));
  const name = String(quoted?.[1] || unquoted?.[1] || '')
    .trim()
    .replace(/["'”]+$/, '')
    .replace(/[.!?,;:]+$/, '')
    .trim()
    .slice(0, 128);
  return name || null;
}

export function directCompanionResearchAnswer(
  text: string,
  research: CompanionResearchResult[]
) {
  if (!/^doc:\/\/count_?documents?\/?$/i.test(String(text || '').trim())) return null;
  const result = research.find((entry) => entry.toolName === 'count_documents')?.output;
  const count = Number(
    result && typeof result === 'object'
      ? (result as { count?: unknown }).count
      : Number.NaN
  );
  if (!Number.isSafeInteger(count) || count < 0) return null;
  return `Your Paperless library contains ${count} document${count === 1 ? '' : 's'} in total.`;
}

function normalizedSearchQuery(text: string) {
  // A quoted title is the best search term there is.
  const quoted = text.match(/[„“"]([^„“”"]{2,200})[”"]/);
  if (quoted) return quoted[1].trim();
  const query = text
    .replace(/(?:please|bitte|can\s+you|could\s+you|kannst\s+du|würdest\s+du)/gi, ' ')
    .replace(/(?:find|search(?:\s+for)?|show(?:\s+me)?|look\s+for|locate|suche|such|finde|zeig(?:e)?(?:\s+mir)?|durchsuche)/gi, ' ')
    .replace(/(?:in|from|inside|within|aus|in\s+meinem?)\s+paperless(?:-ngx)?/gi, ' ')
    .replace(/[?!.,;:()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (query || text.trim()).slice(0, 300);
}

/**
 * Keeps subscription-backed text adapters useful without pretending they can
 * natively call tools. Only clear Paperless intents trigger research.
 */
export function planCompanionResearch(text: string): CompanionResearchPlan {
  const normalized = String(text || '').trim();
  if (!normalized || SOCIAL_ONLY.test(normalized)) return { steps: [], readSearchResults: false };

  const tagName = explicitCompanionTagCreate(normalized);
  if (tagName) {
    return {
      steps: [{
        toolName: 'propose_tag_create',
        input: {
          name: tagName,
          reason: `Create the Paperless tag "${tagName}" as requested.`
        }
      }],
      readSearchResults: false
    };
  }

  const documentId = explicitCompanionDocumentId(normalized);
  if (documentId && FOLLOWUP_INTENT.test(normalized)) {
    return {
      steps: [{ toolName: 'propose_followup', input: { documentId, request: normalized.slice(0, 300) } }],
      readSearchResults: false
    };
  }
  if (documentId) {
    return {
      steps: [{ toolName: 'get_document', input: { documentId } }],
      readSearchResults: false
    };
  }

  const steps: CompanionResearchStep[] = [];
  const hasDocuments = DOCUMENT_WORDS.test(normalized);
  const hasActions = ACTION_WORDS.test(normalized);

  if (COUNT_WORDS.test(normalized) && hasDocuments && !TAG_WORDS.test(normalized)) {
    steps.push({ toolName: 'count_documents', input: {} });
  } else if (RECENT_WORDS.test(normalized) && hasDocuments) {
    steps.push({ toolName: 'list_recent_documents', input: { limit: 8 } });
  }

  if (hasActions) {
    steps.push({ toolName: 'list_actions', input: { status: 'open' } });
  }

  if (TAG_WORDS.test(normalized)) {
    steps.push({ toolName: 'list_tags', input: { limit: 100 } });
  }

  const shouldSearch = !steps.some((step) => ['count_documents', 'list_recent_documents', 'list_tags'].includes(step.toolName))
    && hasDocuments
    && (SEARCH_WORDS.test(normalized) || CONTENT_WORDS.test(normalized));
  if (shouldSearch) {
    steps.push({
      toolName: 'search_documents',
      input: { query: normalizedSearchQuery(normalized) }
    });
  }

  return {
    steps,
    readSearchResults: shouldSearch && shouldReadCompanionSearchResults(normalized)
  };
}

type ActionCaseRow = Record<string, unknown>;

/**
 * The model needs the case facts, not the database row with every column
 * twice (snake and camel case) plus sync internals.
 */
export function compactActionCases(cases: ActionCaseRow[]) {
  return cases.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    dueAt: row.dueAt ?? row.due_at ?? null,
    assignee: row.assignee_name ?? null,
    paperlessDocumentId: row.paperlessDocumentId ?? row.paperless_document_id ?? null,
    summary: typeof row.summary === 'string' ? row.summary.slice(0, 400) : '',
    steps: Number(row.step_count) || 0,
    stepsDone: Number(row.completed_step_count) || 0
  }));
}

export type CompanionSuggestionKind = 'Answer' | 'Action' | 'Approval';
export type CompanionSuggestionIcon = 'calendar' | 'files' | 'summary' | 'tags' | 'followup' | 'tag-create';

export interface CompanionSuggestion {
  kind: CompanionSuggestionKind;
  icon: CompanionSuggestionIcon;
  prompt: string;
  hint: string;
}

export interface CompanionSuggestionContext {
  /** Open action with the earliest due date, if any. */
  nextAction?: { title: string; dueAt: string } | null;
  /** Newest Paperless documents; absent when Paperless could not be read. */
  recentDocuments?: Array<{ id: number; title: string }>;
}

function quotedTitle(title: string) {
  return title.replace(/[„“”"']|\p{Cc}/gu, '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

/**
 * Starter prompts for the empty chat. Every prompt is phrased so that the
 * read and propose tools can answer it, and the document-specific ones are
 * only offered when Paperless returned a document to name.
 */
export function buildCompanionSuggestions(context: CompanionSuggestionContext = {}): CompanionSuggestion[] {
  const suggestions: CompanionSuggestion[] = [{
    kind: 'Action',
    icon: 'calendar',
    prompt: 'What is due soon in our open actions?',
    hint: context.nextAction
      ? `Next: ${quotedTitle(context.nextAction.title)}, due ${context.nextAction.dueAt.slice(0, 10)}`
      : 'Reviews the open actions of your household'
  }];
  const recent = (context.recentDocuments || []).filter((document) => quotedTitle(document.title));
  if (!context.recentDocuments) return suggestions;
  suggestions.push({
    kind: 'Answer',
    icon: 'files',
    prompt: 'Show my newest documents.',
    hint: recent[0] ? `Latest: ${quotedTitle(recent[0].title)}` : 'Lists the latest documents in Paperless'
  });
  if (recent[0]) {
    suggestions.push({
      kind: 'Answer',
      icon: 'summary',
      prompt: `Summarize document #${recent[0].id}, “${quotedTitle(recent[0].title)}”.`,
      hint: 'Reads the document and cites it as a source'
    });
  }
  suggestions.push({
    kind: 'Answer',
    icon: 'tags',
    prompt: 'Which tags do I have, and how many documents use each?',
    hint: 'Reads your Paperless tags'
  });
  if (recent[0]) {
    suggestions.push({
      kind: 'Action',
      icon: 'followup',
      prompt: `Prepare a follow-up action for document #${recent[0].id}.`,
      hint: 'Drafts a task that waits for your approval'
    });
  }
  suggestions.push({
    kind: 'Approval',
    icon: 'tag-create',
    prompt: 'Create a Paperless tag named “To review”.',
    hint: 'Prepares a tag that waits for your approval'
  });
  return suggestions;
}
