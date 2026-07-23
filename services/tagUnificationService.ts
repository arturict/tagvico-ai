import crypto from 'node:crypto';
import type {
  PaperlessTagSnapshot,
  TagUnificationAnalyzeInput,
  TagUnificationSuggestion
} from '../contracts/tagUnification';
import {
  tagUnificationAnalyzeSchema,
  tagUnificationDecisionSchema,
  tagUnificationExecuteSchema
} from '../contracts/tagUnification';
import paperlessService from './paperlessService';
import tagUnificationInference from './tagUnificationInference';
import tagUnificationStore from './tagUnificationStore';

type PaperlessDocument = { id: number; tags?: number[]; title?: string };
type PaperlessTag = { id: number; name: string; document_count?: number };

interface PaperlessDependency {
  getTags(): Promise<PaperlessTag[]>;
  getTag(id: number): Promise<PaperlessTag | null>;
  getDocumentsByTag(id: number): Promise<PaperlessDocument[]>;
  getDocument(id: number): Promise<PaperlessDocument>;
  patchDocument(id: number, patch: { tags: number[] }): Promise<{ ok: boolean; error?: string }>;
  deleteUnusedTag(id: number): Promise<PaperlessTag>;
}

interface InferenceDependency {
  configuredProviders(): Promise<Array<{
    instanceId: string;
    name: string;
    discovery: string;
  }>>;
  analyze(
    input: TagUnificationAnalyzeInput,
    tags: PaperlessTagSnapshot[]
  ): Promise<{ output: {
    suggestions: Array<{
      sourceTagId: number;
      targetTagId: number;
      reason: string;
      confidence: number;
    }>;
  }; snapshotHash: string }>;
}

interface StoreDependency {
  createRun(input: {
    providerInstanceId: string;
    modelId: string;
    tagSnapshotHash: string;
    tagsCount: number;
  }): string;
  completeRun(runId: string, suggestions: Array<{
    source: PaperlessTagSnapshot;
    target: PaperlessTagSnapshot;
    reason: string;
    confidence: number;
  }>): TagUnificationSuggestion[];
  failRun(runId: string, error: string): void;
  list(filters?: { runId?: string; limit?: number }): TagUnificationSuggestion[];
  get(id: string): TagUnificationSuggestion | null;
  decide(id: string, decision: 'approved' | 'rejected', actor: string): TagUnificationSuggestion | null;
  beginPhase(id: string, phase: 'move' | 'delete'): TagUnificationSuggestion | null;
  finishPhase(id: string, phase: 'move' | 'delete'): TagUnificationSuggestion | null;
  failPhase(id: string, phase: 'move' | 'delete', error: string): TagUnificationSuggestion | null;
  audit(input: {
    suggestionId: string;
    actor: string;
    phase: 'move' | 'delete' | 'decision';
    action: string;
    documentId?: number;
    outcome: 'success' | 'skipped' | 'failed';
    payload?: unknown;
    error?: string;
  }): void;
  auditTrail(suggestionId: string): unknown[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function snapshotTags(tags: PaperlessTag[]): PaperlessTagSnapshot[] {
  const unique = new Map<number, PaperlessTagSnapshot>();
  for (const tag of tags) {
    const id = Number(tag.id);
    const name = String(tag.name || '').trim();
    if (!Number.isSafeInteger(id) || id <= 0 || !name || unique.has(id)) continue;
    unique.set(id, {
      id,
      name: name.slice(0, 255),
      documentCount: Math.max(0, Number(tag.document_count || 0))
    });
  }
  return [...unique.values()].sort((left, right) => left.id - right.id);
}

function safeSuggestions(
  tags: PaperlessTagSnapshot[],
  output: Awaited<ReturnType<InferenceDependency['analyze']>>['output']
) {
  const byId = new Map(tags.map((tag) => [tag.id, tag]));
  const usedTags = new Set<number>();
  const usedPairs = new Set<string>();
  const suggestions: Array<{
    source: PaperlessTagSnapshot;
    target: PaperlessTagSnapshot;
    reason: string;
    confidence: number;
  }> = [];
  for (const candidate of output.suggestions) {
    const source = byId.get(candidate.sourceTagId);
    const target = byId.get(candidate.targetTagId);
    if (!source || !target || source.id === target.id || usedTags.has(source.id) || usedTags.has(target.id)) continue;
    const unorderedPair = [source.id, target.id].sort((a, b) => a - b).join(':');
    if (usedPairs.has(unorderedPair)) continue;
    usedTags.add(source.id);
    usedTags.add(target.id);
    usedPairs.add(unorderedPair);
    suggestions.push({
      source,
      target,
      reason: candidate.reason.trim().slice(0, 600),
      confidence: Math.min(1, Math.max(0, candidate.confidence))
    });
  }
  return suggestions;
}

export function createTagUnificationService(dependencies: {
  paperless?: PaperlessDependency;
  inference?: InferenceDependency;
  store?: StoreDependency;
} = {}) {
  const paperless = dependencies.paperless || paperlessService as unknown as PaperlessDependency;
  const inference = dependencies.inference || tagUnificationInference;
  const store = dependencies.store || tagUnificationStore;

  async function analyze(input: unknown) {
    const parsed = tagUnificationAnalyzeSchema.parse(input);
    const tags = snapshotTags(await paperless.getTags());
    if (tags.length > 2000) {
      throw new Error('This installation has more than 2,000 tags. Tag analysis is capped to prevent an unexpectedly large AI request.');
    }
    const snapshotHash = crypto.createHash('sha256').update(JSON.stringify(tags)).digest('hex');
    const runId = store.createRun({
      providerInstanceId: parsed.providerInstanceId,
      modelId: parsed.modelId,
      tagSnapshotHash: snapshotHash,
      tagsCount: tags.length
    });
    try {
      if (tags.length < 2) return {
        runId,
        suggestions: store.completeRun(runId, []),
        tagsAnalyzed: tags.length
      };
      const result = await inference.analyze(parsed, tags);
      if (result.snapshotHash !== snapshotHash) {
        throw new Error('The AI analysis did not use the current tag snapshot.');
      }
      const suggestions = store.completeRun(runId, safeSuggestions(tags, result.output));
      return { runId, suggestions, tagsAnalyzed: tags.length };
    } catch (error) {
      store.failRun(runId, errorMessage(error));
      throw error;
    }
  }

  function list() {
    return store.list({ limit: 100 });
  }

  function get(id: string) {
    const suggestion = store.get(id);
    if (!suggestion) throw new Error('Tag unification suggestion not found.');
    return {
      suggestion,
      audit: store.auditTrail(id)
    };
  }

  function decide(id: string, input: unknown, actor: string) {
    const { decision } = tagUnificationDecisionSchema.parse(input);
    const before = store.get(id);
    if (!before) throw new Error('Tag unification suggestion not found.');
    if (before.status === decision) return before;
    if (before.status !== 'suggested') {
      throw new Error('Only a new suggestion can be approved or rejected.');
    }
    const suggestion = store.decide(id, decision, actor);
    if (!suggestion || suggestion.status !== decision) {
      throw new Error('The suggestion changed in another session.');
    }
    store.audit({
      suggestionId: id,
      actor,
      phase: 'decision',
      action: decision,
      outcome: 'success'
    });
    return suggestion;
  }

  async function moveDocuments(suggestion: TagUnificationSuggestion, actor: string) {
    const source = await paperless.getTag(suggestion.sourceTagId);
    const target = await paperless.getTag(suggestion.targetTagId);
    if (!source || source.name !== suggestion.sourceTagName) {
      throw new Error('The source tag no longer matches the approved suggestion.');
    }
    if (!target || target.name !== suggestion.targetTagName) {
      throw new Error('The target tag no longer matches the approved suggestion.');
    }
    const documents = await paperless.getDocumentsByTag(source.id);
    let moved = 0;
    let skipped = 0;
    for (const listedDocument of documents) {
      const document = await paperless.getDocument(listedDocument.id);
      const currentTags = Array.isArray(document.tags) ? document.tags.map(Number) : [];
      if (!currentTags.includes(source.id)) {
        skipped += 1;
        store.audit({
          suggestionId: suggestion.id,
          actor,
          phase: 'move',
          action: 'replace_document_tag',
          documentId: document.id,
          outcome: 'skipped',
          payload: { reason: 'source-already-absent' }
        });
        continue;
      }
      const nextTags = [...new Set(
        currentTags.filter((tagId) => tagId !== source.id).concat(target.id)
      )];
      const result = await paperless.patchDocument(document.id, { tags: nextTags });
      if (!result.ok) {
        store.audit({
          suggestionId: suggestion.id,
          actor,
          phase: 'move',
          action: 'replace_document_tag',
          documentId: document.id,
          outcome: 'failed',
          payload: { fromTagId: source.id, toTagId: target.id },
          error: result.error || 'Paperless rejected the tag update.'
        });
        throw new Error(`Document ${document.id} could not be updated: ${result.error || 'Paperless rejected the update.'}`);
      }
      const verified = await paperless.getDocument(document.id);
      const verifiedTags = Array.isArray(verified.tags) ? verified.tags.map(Number) : [];
      if (verifiedTags.includes(source.id) || !verifiedTags.includes(target.id)) {
        const verificationError = 'Paperless did not persist the exact source-to-target tag replacement.';
        store.audit({
          suggestionId: suggestion.id,
          actor,
          phase: 'move',
          action: 'verify_document_tag',
          documentId: document.id,
          outcome: 'failed',
          payload: { fromTagId: source.id, toTagId: target.id },
          error: verificationError
        });
        throw new Error(`Document ${document.id}: ${verificationError}`);
      }
      moved += 1;
      store.audit({
        suggestionId: suggestion.id,
        actor,
        phase: 'move',
        action: 'replace_document_tag',
        documentId: document.id,
        outcome: 'success',
        payload: { fromTagId: source.id, toTagId: target.id }
      });
    }
    const remaining = await paperless.getTag(source.id);
    if (!remaining) throw new Error('The source tag disappeared before the deletion phase.');
    if (Number(remaining.document_count || 0) !== 0) {
      throw new Error(`The source tag still belongs to ${remaining.document_count} document(s). Retry phase 1.`);
    }
    store.audit({
      suggestionId: suggestion.id,
      actor,
      phase: 'move',
      action: 'phase_complete',
      outcome: 'success',
      payload: { moved, skipped }
    });
    return { moved, skipped };
  }

  async function deleteSourceTag(suggestion: TagUnificationSuggestion, actor: string) {
    const source = await paperless.getTag(suggestion.sourceTagId);
    if (!source) {
      store.audit({
        suggestionId: suggestion.id,
        actor,
        phase: 'delete',
        action: 'delete_source_tag',
        outcome: 'skipped',
        payload: { reason: 'source-already-deleted' }
      });
      return { deleted: false, alreadyDeleted: true };
    }
    if (source.name !== suggestion.sourceTagName) {
      throw new Error('The source tag no longer matches the approved suggestion.');
    }
    if (Number(source.document_count || 0) !== 0) {
      throw new Error('The source tag is still assigned to documents. Run phase 1 again.');
    }
    await paperless.deleteUnusedTag(source.id);
    store.audit({
      suggestionId: suggestion.id,
      actor,
      phase: 'delete',
      action: 'delete_source_tag',
      outcome: 'success',
      payload: { tagId: source.id, tagName: source.name }
    });
    return { deleted: true, alreadyDeleted: false };
  }

  async function execute(id: string, input: unknown, actor: string) {
    const { phase } = tagUnificationExecuteSchema.parse(input);
    const claimed = store.beginPhase(id, phase);
    if (!claimed) throw new Error('Tag unification suggestion not found.');
    if (phase === 'move' && ['moved', 'completed'].includes(claimed.status)) {
      return { suggestion: claimed, idempotent: true };
    }
    if (phase === 'delete' && claimed.status === 'completed') {
      return { suggestion: claimed, idempotent: true };
    }
    try {
      const result = phase === 'move'
        ? await moveDocuments(claimed, actor)
        : await deleteSourceTag(claimed, actor);
      return {
        suggestion: store.finishPhase(id, phase),
        result,
        idempotent: false
      };
    } catch (error) {
      const message = errorMessage(error);
      store.audit({
        suggestionId: id,
        actor,
        phase,
        action: 'phase_failed',
        outcome: 'failed',
        error: message
      });
      store.failPhase(id, phase, message);
      throw error;
    }
  }

  return {
    analyze,
    configuredProviders: () => inference.configuredProviders(),
    decide,
    execute,
    get,
    list
  };
}

const tagUnificationService = Object.assign(createTagUnificationService(), {
  createTagUnificationService
});

export default tagUnificationService;
module.exports = tagUnificationService;
