import 'server-only';
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  stepCountIs,
  tool,
  type UIMessage,
  type UIMessageChunk
} from 'ai';
import {
  companionDocumentIds,
  companionToolActivity,
  describeCompanionModelError,
  encodeCompanionError,
  groundCompanionCitations,
  safeCompanionToolError,
  safeCompanionToolInput,
  safeCompanionToolOutput,
  sanitizeCompanionText,
  type CompanionToolActivity,
  type CompanionModelSelection
} from '../../../../contracts/companion';
import { actionCenter } from '../workspace';
import { resolveRuntimeModel } from './model-runtime';
import type { AgentContext } from './types';
import companionAgentService from '../../../../services/companionAgentService';
import {
  isGpt6Model,
  isOpenAIReasoningModel,
  openAIReasoningEffort
} from '../../../../services/openaiModelParameters';

const { companionSystemPrompt, companionToolSchemas, companionToolDescriptions, companionToolExecutors } = companionAgentService;

function toolsFor(context: AgentContext) {
  const executors = companionToolExecutors(context);
  return {
    list_actions: tool({ description: companionToolDescriptions.list_actions, inputSchema: companionToolSchemas.list_actions, execute: executors.list_actions }),
    count_documents: tool({ description: companionToolDescriptions.count_documents, inputSchema: companionToolSchemas.count_documents, execute: executors.count_documents }),
    list_recent_documents: tool({ description: companionToolDescriptions.list_recent_documents, inputSchema: companionToolSchemas.list_recent_documents, execute: executors.list_recent_documents }),
    search_documents: tool({ description: companionToolDescriptions.search_documents, inputSchema: companionToolSchemas.search_documents, execute: executors.search_documents }),
    get_document: tool({ description: companionToolDescriptions.get_document, inputSchema: companionToolSchemas.get_document, execute: executors.get_document }),
    list_tags: tool({ description: companionToolDescriptions.list_tags, inputSchema: companionToolSchemas.list_tags, execute: executors.list_tags }),
    get_tag: tool({ description: companionToolDescriptions.get_tag, inputSchema: companionToolSchemas.get_tag, execute: executors.get_tag }),
    propose_document_update: tool({ description: companionToolDescriptions.propose_document_update, inputSchema: companionToolSchemas.propose_document_update, execute: executors.propose_document_update }),
    propose_tag_create: tool({ description: companionToolDescriptions.propose_tag_create, inputSchema: companionToolSchemas.propose_tag_create, execute: executors.propose_tag_create }),
    propose_tag_update: tool({ description: companionToolDescriptions.propose_tag_update, inputSchema: companionToolSchemas.propose_tag_update, execute: executors.propose_tag_update }),
    propose_tag_delete: tool({ description: companionToolDescriptions.propose_tag_delete, inputSchema: companionToolSchemas.propose_tag_delete, execute: executors.propose_tag_delete }),
    propose_action: tool({ description: companionToolDescriptions.propose_action, inputSchema: companionToolSchemas.propose_action, execute: executors.propose_action }),
    propose_action_update: tool({ description: companionToolDescriptions.propose_action_update, inputSchema: companionToolSchemas.propose_action_update, execute: executors.propose_action_update })
  };
}

function textOf(message: UIMessage) {
  return message.parts.filter((part): part is Extract<UIMessage['parts'][number], { type: 'text' }> => part.type === 'text').map((part) => part.text).join('\n');
}

function turnsOf(history: UIMessage[]) {
  return history.flatMap((message) => message.role === 'user' || message.role === 'assistant'
    ? [{ role: message.role, text: textOf(message) }]
    : []);
}

function redactToolStream(stream: ReadableStream<UIMessageChunk>) {
  const tools = new Map<string, { name: string; input: unknown }>();
  return stream.pipeThrough(new TransformStream<UIMessageChunk, UIMessageChunk>({
    transform(part, controller) {
      if (part.type === 'tool-input-delta') return;
      if (part.type === 'tool-input-start') {
        tools.set(part.toolCallId, { name: part.toolName, input: {} });
        controller.enqueue({
          type: 'tool-input-start',
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          dynamic: part.dynamic,
          title: part.title
        });
        return;
      }
      if (part.type === 'tool-input-available' || part.type === 'tool-input-error') {
        const input = safeCompanionToolInput(part.toolName, part.input);
        tools.set(part.toolCallId, { name: part.toolName, input });
        controller.enqueue(part.type === 'tool-input-error'
          ? {
              type: 'tool-input-error',
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              input,
              errorText: 'The model could not prepare this tool safely.',
              dynamic: part.dynamic,
              title: part.title
            }
          : {
              type: 'tool-input-available',
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              input,
              dynamic: part.dynamic,
              title: part.title
            });
        return;
      }
      if (part.type === 'tool-output-available') {
        const tracked = tools.get(part.toolCallId);
        controller.enqueue({
          type: 'tool-output-available',
          toolCallId: part.toolCallId,
          output: tracked
            ? safeCompanionToolOutput(tracked.name, tracked.input, part.output)
            : { summary: 'Tool completed successfully.' },
          dynamic: part.dynamic
        });
        return;
      }
      if (part.type === 'tool-output-error') {
        controller.enqueue({
          type: 'tool-output-error',
          toolCallId: part.toolCallId,
          errorText: safeCompanionToolError(part.errorText),
          dynamic: part.dynamic
        });
        return;
      }
      controller.enqueue(part);
    }
  }));
}

/** Activities for the stored history, one per tool call, with failures reduced to their safe sentence. */
type FinishedStep = {
  text: string;
  toolCalls: Array<{ toolCallId: string; toolName: string; input: unknown }>;
  toolResults: Array<{ toolCallId: string; output: unknown }>;
  content: Array<{ type: string; toolCallId?: string; error?: unknown }>;
};

function activitiesFromSteps(steps: FinishedStep[]): CompanionToolActivity[] {
  return steps.flatMap((step) => step.toolCalls.map((call) => {
    const result = step.toolResults.find((candidate) => candidate.toolCallId === call.toolCallId);
    const input = safeCompanionToolInput(call.toolName, call.input);
    if (result) {
      return companionToolActivity(
        call.toolName,
        'output-available',
        input,
        safeCompanionToolOutput(call.toolName, input, result.output)
      );
    }
    const failure = step.content.find((part) => part.type === 'tool-error' && part.toolCallId === call.toolCallId);
    const message = failure?.error instanceof Error ? failure.error.message : '';
    return companionToolActivity(call.toolName, 'output-error', input, message);
  }));
}

/** The text of every step, in order: what streamed to the screen is what is stored. */
function storedAnswer(texts: string[], activities: CompanionToolActivity[], history: UIMessage[]) {
  const prior = history.flatMap((message) => message.role === 'assistant'
    ? [...textOf(message).matchAll(/\[doc:(\d+)\]/gi)].map((match) => Number(match[1]))
    : []);
  return groundCompanionCitations(
    sanitizeCompanionText(texts.filter(Boolean).join('\n\n')),
    [...companionDocumentIds(activities), ...prior]
  );
}

export async function streamCompanion(
  context: AgentContext,
  history: UIMessage[],
  signal: AbortSignal,
  selection: CompanionModelSelection
) {
  const model = resolveRuntimeModel(selection);
  const modelRef = { providerInstanceId: model.provider, modelId: model.modelId };
  if (model.kind === 'text-adapter') {
    const stream = createUIMessageStream({
      originalMessages: history,
      async execute({ writer }) {
        const { text, activities } = await companionAgentService.runAdapterTurn({
          context,
          history: turnsOf(history),
          signal,
          generateText: model.generateText,
          write: (chunk) => writer.write(chunk)
        });
        actionCenter.addMessage(context.sessionId, 'assistant', { text, activities, model: modelRef });
      },
      onError: (error) => encodeCompanionError(describeCompanionModelError(error))
    });
    return createUIMessageStreamResponse({ stream, headers: { 'Cache-Control': 'no-store' } });
  }
  const reasoningEffort = String(selection.reasoningEffort || process.env.AI_REASONING_EFFORT || 'auto');
  const openAIModel = model.provider === 'openai';
  const effectiveEffort = openAIModel
    ? openAIReasoningEffort(model.modelId, reasoningEffort)
    : (reasoningEffort === 'auto' ? undefined : reasoningEffort);
  const providerOptions = {
    ...(effectiveEffort ? { reasoningEffort: effectiveEffort } : {}),
    // The pinned @ai-sdk/openai predates GPT-6 and would treat it as a
    // non-reasoning model: it would drop the effort and pass temperature on.
    ...(openAIModel && isGpt6Model(model.modelId) ? { forceReasoning: true } : {})
  };
  const tools = toolsFor(context);
  const persist = (steps: FinishedStep[]) => {
    const activities = activitiesFromSteps(steps);
    const text = storedAnswer(steps.map((step) => step.text), activities, history);
    if (text || activities.length) {
      actionCenter.addMessage(context.sessionId, 'assistant', { text, activities, model: modelRef });
    }
  };
  const result = streamText({
    model: model.model,
    system: companionSystemPrompt(),
    messages: await convertToModelMessages(history, { tools, ignoreIncompleteToolCalls: true }),
    tools,
    stopWhen: stepCountIs(6),
    // Reasoning models (GPT-5 and later) reject temperature.
    ...(reasoningEffort === 'auto' && !isOpenAIReasoningModel(model.modelId) ? { temperature: 0.2 } : {}),
    ...(Object.keys(providerOptions).length
      ? { providerOptions: { [model.provider]: providerOptions } }
      : {}),
    abortSignal: signal,
    onFinish: ({ steps }) => persist(steps),
    // A stopped answer keeps the steps that finished, so a reload shows what the user saw.
    onAbort: ({ steps }) => persist(steps)
  });
  const safeStream = redactToolStream(result.toUIMessageStream({
    originalMessages: history,
    sendReasoning: false,
    onError: (error) => encodeCompanionError(describeCompanionModelError(error))
  }));
  return createUIMessageStreamResponse({
    stream: safeStream,
    headers: { 'Cache-Control': 'no-store' }
  });
}
