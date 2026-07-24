export type CompanionResearchStep =
  | { toolName: 'count_documents'; input: Record<string, never> }
  | { toolName: 'list_recent_documents'; input: { limit: number } }
  | { toolName: 'list_actions'; input: { status?: 'suggested' | 'open' | 'waiting' | 'done' | 'dismissed' } }
  | { toolName: 'search_documents'; input: { query: string } }
  | { toolName: 'get_document'; input: { documentId: number } };

export interface CompanionResearchPlan {
  steps: CompanionResearchStep[];
  readSearchResults: boolean;
}

const SOCIAL_ONLY = /^(?:hi|hey|hello|hallo|hoi|servus|moin|guten\s+(?:morgen|tag|abend)|danke|dankesch[oö]n|thanks|thank\s+you|was\s+kannst\s+du|what\s+can\s+you\s+do)[\s!.,?]*$/i;
const DOCUMENT_WORDS = /\b(?:document|documents|doc|docs|paperless|dokument|dokumente|rechnung|rechnungen|invoice|invoices|bill|bills|vertrag|vertr[aä]ge|contract|contracts|brief|letter|letters|notice|insurance|versicherung|receipt|beleg|steuer|tax)\b/i;
const SEARCH_WORDS = /\b(?:find|search|show|look\s+for|locate|suche|such|finde|zeig|zeige|durchsuche|welche|which)\b/i;
const CONTENT_WORDS = /\b(?:summar|zusammenfass|due|deadline|f[aä]llig|frist|notice\s+period|k[üu]ndigungsfrist|amount|betrag|when|wann|what\s+does|was\s+steht|explain|erkl[aä]r)\w*/i;
const ACTION_WORDS = /\b(?:action|actions|task|tasks|to-?do|attention|obligation|deadline|deadlines|due\s+soon|aufgabe|aufgaben|aktion|aktionen|handlungsbedarf|pflicht|pflichten|frist|fristen|f[aä]llig)\b/i;
const RECENT_WORDS = /\b(?:recent|latest|newest|new\s+documents?|last\s+documents?|recently\s+added|neueste|neuste|letzte|k[üu]rzlich|neue\s+dokumente)\b/i;
const COUNT_WORDS = /(?:\bhow\s+many\b|\bcount\b|\bnumber\s+of\b|\bwie\s+viele\b|\banzahl\b)/i;

export function explicitCompanionDocumentId(text: string) {
  const match = text.match(/(?:document|documents?|dokument|dokumente|doc)\s*#?\s*(\d{1,10})/i);
  const value = Number(match?.[1]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function normalizedSearchQuery(text: string) {
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

  const documentId = explicitCompanionDocumentId(normalized);
  if (documentId) {
    return {
      steps: [{ toolName: 'get_document', input: { documentId } }],
      readSearchResults: false
    };
  }

  const steps: CompanionResearchStep[] = [];
  const hasDocuments = DOCUMENT_WORDS.test(normalized);
  const hasActions = ACTION_WORDS.test(normalized);

  if (COUNT_WORDS.test(normalized) && hasDocuments) {
    steps.push({ toolName: 'count_documents', input: {} });
  } else if (RECENT_WORDS.test(normalized) && hasDocuments) {
    steps.push({ toolName: 'list_recent_documents', input: { limit: 8 } });
  }

  if (hasActions) {
    steps.push({ toolName: 'list_actions', input: { status: 'open' } });
  }

  const shouldSearch = !steps.some((step) => ['count_documents', 'list_recent_documents'].includes(step.toolName))
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
    readSearchResults: shouldSearch && CONTENT_WORDS.test(normalized)
  };
}
