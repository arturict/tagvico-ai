import axios from 'axios';
import { TelegramPaperlessClient, TelegramPaperlessDocument } from './telegramPaperlessClient';
import { encryptSecret } from './secretBox';
import {
  safeText,
  normalizedUrl,
  errorMessage,
  parseJsonObject,
  extractDocumentIds,
  cleanAnswerCitations,
  chunkTelegramText,
  sanitizedFilename,
  answerDocumentQuestion,
  buildActionApprovalPayload,
  classifyPaperlessUpload,
  createUserRateLimiter,
  redactSecrets,
  collectDueReminders,
  formatReminderText,
  createDailyReminderTracker,
  ReminderRecipient,
  DueReminder,
  ChatTurn as BotChatTurn,
} from './companionBotInternals';

const config = require('../config/config');
const AIServiceFactory = require('./aiServiceFactory');
const channelStatusService = require('./channelStatusService');
const settingsRuntimeSync = require('./settingsRuntimeSync');

interface TelegramUserConfig {
  telegramId: string;
  paperlessToken: string;
  paperlessUrl: string;
  householdId?: string;
  memberId?: string;
}

type ChatTurn = BotChatTurn;

interface TelegramFile {
  file_id: string;
  file_size?: number;
  file_name?: string;
  mime_type?: string;
}

interface TelegramMessage {
  message_id: number;
  from?: { id: number; language_code?: string };
  chat: { id: number; type: string };
  text?: string;
  caption?: string;
  document?: TelegramFile;
  photo?: TelegramFile[];
}

interface TelegramCallbackQuery {
  id: string;
  from: { id: number };
  data?: string;
  message?: TelegramMessage;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

interface TextGenerator {
  generateText(prompt: string): Promise<string>;
  analyzeDocument(
    content: string,
    tags?: string[],
    correspondents?: string[],
    documentTypes?: string[],
    id?: string
  ): Promise<{ document?: Record<string, unknown>; error?: unknown }>;
}

interface TelegramApiResponse<T> {
  ok: boolean;
  result: T;
  description?: string;
}

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function parseTelegramUsers(usersJson: string, defaultPaperlessUrl: string): Map<string, TelegramUserConfig> {
  const parsed: unknown = JSON.parse(usersJson || '[]');
  const entries: unknown[] = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object'
      ? Object.entries(parsed).map(([telegramId, value]) => typeof value === 'string'
        ? { telegramId, paperlessToken: value }
        : { telegramId, ...(value as Record<string, unknown>) })
      : [];
  const users = new Map<string, TelegramUserConfig>();
  for (const raw of entries) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const telegramId = safeText(item.telegramId ?? item.telegram_id ?? item.id);
    const paperlessToken = safeText(item.paperlessToken ?? item.paperless_token ?? item.token);
    const paperlessUrl = safeText(item.paperlessUrl ?? item.paperless_url ?? defaultPaperlessUrl);
    if (!/^\d{1,16}$/.test(telegramId) || !paperlessToken || !paperlessUrl) continue;
    const householdId = safeText(item.householdId ?? item.household_id);
    const memberId = safeText(item.memberId ?? item.member_id);
    users.set(telegramId, { telegramId, paperlessToken, paperlessUrl, ...(householdId ? { householdId } : {}), ...(memberId ? { memberId } : {}) });
  }
  return users;
}

class TelegramBotService {
  private readonly histories = new Map<string, ChatTurn[]>();
  private users = new Map<string, TelegramUserConfig>();
  private running = false;
  private offset = 0;
  private pollingController: AbortController | null = null;
  private loopPromise: Promise<void> | null = null;
  private botToken = '';
  private apiBase = '';
  // Per-user flood control on the paths that reach the AI provider or move
  // document bytes; a stolen family phone must not be able to run up costs.
  private readonly questionLimiter = createUserRateLimiter({ windowMs: 60_000, max: 10 });
  private readonly uploadLimiter = createUserRateLimiter({ windowMs: 600_000, max: 6 });
  private readonly downloadLimiter = createUserRateLimiter({ windowMs: 60_000, max: 12 });
  private readonly reminderTracker = createDailyReminderTracker();
  private reminderTimer: ReturnType<typeof setInterval> | null = null;
  // Settings saved in the web app change the .env file; the bot follows them
  // without a restart by comparing a fingerprint of the values it depends on.
  private appliedFingerprint = '';
  private stopWatchingSettings: (() => void) | null = null;
  private botLabel = 'Connected';
  private lastConnectedReport = 0;
  private consecutiveFailures = 0;

  private safeError(error: unknown): string {
    return redactSecrets(errorMessage(error), [this.botToken]);
  }

  /**
   * Send at most one proactive DM per case, linked user, and day for
   * household actions that are overdue or due within the next three days.
   */
  private async checkActionReminders(): Promise<void> {
    const linked = [...this.users.values()].filter((user) => user.householdId && user.memberId);
    if (!linked.length) return;
    const actionCenter = require('../models/actionCenter');
    const today = new Date().toISOString().slice(0, 10);
    const households = new Map<string, ReminderRecipient[]>();
    for (const user of linked) {
      const recipients = households.get(user.householdId!) || [];
      recipients.push({ key: user.telegramId, memberId: user.memberId! });
      households.set(user.householdId!, recipients);
    }
    for (const [householdId, recipients] of households) {
      let reminders: Map<string, DueReminder[]>;
      try {
        reminders = collectDueReminders(actionCenter.listCases(householdId), recipients, today);
      } catch (error) {
        console.warn(`[Telegram] Reminder check failed: ${this.safeError(error)}`);
        continue;
      }
      for (const [recipientKey, dueList] of reminders) {
        const fresh = dueList.filter((reminder) => this.reminderTracker.shouldSend(recipientKey, reminder.caseId, today));
        if (!fresh.length) continue;
        await this.sendText(Number(recipientKey), formatReminderText(fresh, today)).catch((error) =>
          console.warn(`[Telegram] Reminder delivery failed: ${this.safeError(error)}`)
        );
      }
    }
  }

  /**
   * Re-reads the saved settings and restarts the bot only when something it
   * depends on changed, so unrelated settings saves never interrupt polling.
   */
  async reconfigure(): Promise<void> {
    const next = channelStatusService.readChannelConfiguration('telegram').fingerprint;
    if (next === this.appliedFingerprint) return;
    await this.stop();
    this.start();
  }

  private reportConnected(): void {
    const now = Date.now();
    if (now - this.lastConnectedReport < 60_000) return;
    this.lastConnectedReport = now;
    channelStatusService.reportChannel('telegram', {
      state: 'connected',
      label: this.botLabel,
      fingerprint: this.appliedFingerprint
    });
  }

  private reportFailure(error: unknown): void {
    this.consecutiveFailures += 1;
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    const rejected = status === 401 || status === 404;
    // One dropped request is routine on a home network; report two in a row,
    // or an explicit token rejection immediately.
    if (!rejected && this.consecutiveFailures < 2) return;
    this.lastConnectedReport = 0;
    channelStatusService.reportChannel('telegram', {
      state: 'error',
      label: rejected
        ? 'Telegram rejected the bot token'
        : status === 409 ? 'Another process is using this bot' : 'Cannot reach Telegram',
      detail: this.safeError(error),
      fingerprint: this.appliedFingerprint
    });
  }

  private async identifyBot(): Promise<void> {
    try {
      const me = await this.call<{ username?: string }>('getMe', {});
      if (me.username) this.botLabel = `Connected as @${safeText(me.username)}`;
      if (this.running) {
        this.consecutiveFailures = 0;
        this.reportConnected();
      }
    } catch (error) {
      if (this.running) this.reportFailure(error);
    }
  }

  start(): void {
    if (!this.stopWatchingSettings) {
      this.stopWatchingSettings = settingsRuntimeSync.onSettingsChange(() => this.reconfigure());
    }
    this.appliedFingerprint = channelStatusService.readChannelConfiguration('telegram').fingerprint;
    if (config.telegram.enabled !== 'yes' || this.running) return;
    this.botToken = safeText(config.telegram.botToken);
    if (!this.botToken) {
      console.warn('[Telegram] Bot is enabled but TELEGRAM_BOT_TOKEN is empty');
      return;
    }
    try {
      this.users = parseTelegramUsers(config.telegram.usersJson, config.paperless.apiUrl || '');
    } catch (error) {
      console.warn(`[Telegram] TELEGRAM_USERS_JSON is invalid: ${errorMessage(error)}`);
      return;
    }
    if (!this.users.size) {
      console.warn('[Telegram] Bot is enabled but no valid users are allowlisted');
      return;
    }
    const actionCenter = require('../models/actionCenter');
    for (const user of this.users.values()) {
      if (!user.householdId && !user.memberId) continue;
      const member = user.householdId && user.memberId ? actionCenter.getMemberSecretRecord(user.householdId, user.memberId) : null;
      const samePaperless = normalizedUrl(user.paperlessUrl) === normalizedUrl(config.paperless.apiUrl);
      if (!member || !samePaperless) {
        console.warn(`[Telegram] Action Center link ignored for Telegram user ${user.telegramId}: household/member mapping or Paperless URL is invalid`);
        delete user.householdId; delete user.memberId;
        continue;
      }
      actionCenter.setPaperlessToken(user.householdId, user.memberId, encryptSecret(user.paperlessToken));
    }
    this.apiBase = `https://api.telegram.org/bot${this.botToken}`;
    this.running = true;
    this.botLabel = 'Connected';
    this.consecutiveFailures = 0;
    this.lastConnectedReport = 0;
    void this.identifyBot();
    this.loopPromise = this.pollLoop();
    void this.call('setMyCommands', {
      commands: [
        { command: 'start', description: 'Show help and privacy boundaries' },
        { command: 'clear', description: 'Forget your in-memory conversation' },
        { command: 'actions', description: 'Show active household actions' },
        { command: 'privacy', description: 'Show data-processing information' }
      ]
    }).catch(() => {});
    if (config.telegram.actionReminders === 'yes' && [...this.users.values()].some((user) => user.householdId && user.memberId)) {
      this.reminderTimer = setInterval(() => {
        void this.checkActionReminders().catch((error) => console.warn(`[Telegram] Reminder pass failed: ${this.safeError(error)}`));
      }, 30 * 60 * 1000);
      setTimeout(() => {
        void this.checkActionReminders().catch((error) => console.warn(`[Telegram] Reminder pass failed: ${this.safeError(error)}`));
      }, 30_000).unref?.();
      this.reminderTimer.unref?.();
    }
    console.log(`[Telegram] Bot started for ${this.users.size} allowlisted user(s)`);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.reminderTimer) {
      clearInterval(this.reminderTimer);
      this.reminderTimer = null;
    }
    this.pollingController?.abort();
    await this.loopPromise?.catch(() => {});
    this.loopPromise = null;
    this.histories.clear();
  }

  private userFor(id: number | undefined): TelegramUserConfig | null {
    return id === undefined ? null : this.users.get(String(id)) || null;
  }

  private paperlessFor(user: TelegramUserConfig): TelegramPaperlessClient {
    return new TelegramPaperlessClient(user.paperlessUrl, user.paperlessToken);
  }

  private ai(): TextGenerator {
    const service = AIServiceFactory.getService() as TextGenerator;
    if (typeof service.generateText !== 'function') {
      throw new Error('The selected AI provider does not support conversational answers');
    }
    return service;
  }

  private async call<T>(method: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    const response = await axios.post<TelegramApiResponse<T>>(`${this.apiBase}/${method}`, body, {
      signal,
      timeout: (Number(config.telegram.pollTimeoutSeconds) + 10) * 1000
    });
    if (!response.data.ok) throw new Error(response.data.description || `Telegram ${method} failed`);
    return response.data.result;
  }

  private async pollLoop(): Promise<void> {
    let failureDelay = 1000;
    while (this.running) {
      try {
        this.pollingController = new AbortController();
        const updates = await this.call<TelegramUpdate[]>('getUpdates', {
          offset: this.offset,
          timeout: Number(config.telegram.pollTimeoutSeconds),
          allowed_updates: ['message', 'callback_query']
        }, this.pollingController.signal);
        failureDelay = 1000;
        this.consecutiveFailures = 0;
        this.reportConnected();
        for (const update of updates) {
          this.offset = Math.max(this.offset, update.update_id + 1);
          await this.handleUpdate(update).catch(async (error) => {
            console.warn(`[Telegram] Update failed: ${this.safeError(error)}`);
            const chatId = update.message?.chat.id || update.callback_query?.message?.chat.id;
            const user = this.userFor(update.message?.from?.id || update.callback_query?.from.id);
            if (chatId && user) await this.sendText(chatId, 'I could not complete that request. Check the Tagvico logs for the provider or Paperless error.').catch(() => {});
          });
        }
      } catch (error) {
        if (!this.running) break;
        console.warn(`[Telegram] Polling failed; retrying: ${this.safeError(error)}`);
        this.reportFailure(error);
        await sleep(failureDelay);
        failureDelay = Math.min(failureDelay * 2, 30_000);
      } finally {
        this.pollingController = null;
      }
    }
  }

  private async handleUpdate(update: TelegramUpdate): Promise<void> {
    if (update.callback_query) return this.handleCallback(update.callback_query);
    const message = update.message;
    if (!message || message.chat.type !== 'private') return;
    const user = this.userFor(message.from?.id);
    if (!user) return;
    if (message.text?.startsWith('/')) return this.handleCommand(message, user);
    if (message.document || message.photo?.length) return this.handleUpload(message, user);
    if (message.text?.trim()) return this.handleQuestion(message, user);
  }

  private async handleCommand(message: TelegramMessage, user: TelegramUserConfig): Promise<void> {
    const command = message.text?.split(/\s+/)[0].split('@')[0].toLowerCase();
    if (command === '/clear') {
      this.histories.delete(user.telegramId);
      await this.sendText(message.chat.id, 'Conversation cleared. Nothing was stored in a database.');
      return;
    }
    if (command === '/privacy') {
      await this.sendText(message.chat.id, this.privacyText());
      return;
    }
    if (command === '/actions') {
      if (!user.householdId || !user.memberId) { await this.sendText(message.chat.id, 'Link this Telegram user to a valid householdId and memberId in TELEGRAM_USERS_JSON to use the Action Center.'); return; }
      const actionCenter = require('../models/actionCenter');
      const actions = actionCenter.listCases(user.householdId).filter((item: Record<string, unknown>) => !['done', 'dismissed'].includes(String(item.status))).slice(0, 12);
      await this.sendText(message.chat.id, actions.length ? actions.map((item: Record<string, unknown>) => `• ${item.title}${item.dueAt ? ` — due ${String(item.dueAt).slice(0, 10)}` : ''} [doc:${item.paperlessDocumentId}]`).join('\n') : 'No active household actions.');
      return;
    }
    await this.sendText(message.chat.id,
      'Ask me to find or read documents in your Paperless archive, including follow-up questions. Send a PDF or photo to upload and classify it. Use /clear to forget this in-memory conversation.\n\n' + this.privacyText());
  }

  private privacyText(): string {
    const provider = safeText(config.aiProvider);
    const location = provider === 'ollama' || provider === 'compatible' ? 'the configured local/compatible endpoint' : `the configured ${provider} provider`;
    return `Privacy: Telegram bot chats are not end-to-end encrypted. Your questions and retrieved OCR text are sent to ${location}. Tagvico keeps conversation history in memory only, per Telegram user, until /clear or restart. AI totals are summaries, not accounting-grade results.`;
  }

  private async handleQuestion(message: TelegramMessage, user: TelegramUserConfig): Promise<void> {
    if (!this.questionLimiter.tryConsume(user.telegramId)) {
      await this.sendText(message.chat.id, `You are sending questions faster than this bot allows. Try again in ${this.questionLimiter.retryAfterSeconds(user.telegramId)} seconds.`);
      return;
    }
    const question = safeText(message.text);
    const history = this.histories.get(user.telegramId) || [];
    await this.call('sendChatAction', { chat_id: message.chat.id, action: 'typing' });
    const paperless = this.paperlessFor(user);
    const result = await answerDocumentQuestion(
      this.ai(), paperless, history, question, Number(config.telegram.maxDocuments)
    );
    if (!result.documents.length) {
      await this.sendText(message.chat.id, `I found no documents for “${result.query}”. Try a correspondent, title, date, or a more specific phrase.`);
      return;
    }
    await this.sendText(
      message.chat.id,
      result.answer,
      result.documents.filter((document) => result.citedDocumentIds.includes(document.id))
    );
    if (result.plan?.proposeAction === true && user.householdId && user.memberId && result.actionDocument) {
      const actionCenter = require('../models/actionCenter');
      const approval = actionCenter.createApproval(
        user.householdId,
        null,
        user.memberId,
        'action.create',
        buildActionApprovalPayload(result.plan, result.actionDocument)
      );
      await this.sendApproval(message.chat.id, approval.id, safeText(approval.payload.title));
    } else if (result.plan?.proposeAction === true && user.householdId && user.memberId) {
      await this.sendText(message.chat.id, 'I found several possible documents, so I did not guess. Name one Paperless document ID and ask me to create the action again.');
    }
    const nextHistory = [...history, { question, answer: result.answer }].slice(-Number(config.telegram.historyTurns));
    this.histories.set(user.telegramId, nextHistory);
  }

  private async handleCallback(callback: TelegramCallbackQuery): Promise<void> {
    const user = this.userFor(callback.from.id);
    const chatId = callback.message?.chat.id;
    if (!user || !chatId || callback.message?.chat.type !== 'private') return;
    await this.call('answerCallbackQuery', { callback_query_id: callback.id });
    const approvalMatch = safeText(callback.data).match(/^approval:(approve|reject):([0-9a-f-]{36})$/i);
    if (approvalMatch && user.householdId && user.memberId) {
      try {
        const actionCenter = require('../models/actionCenter');
        const decision = approvalMatch[1] === 'approve' ? 'approved' : 'rejected';
        actionCenter.decideApproval(user.householdId, approvalMatch[2], user.memberId, decision);
        const result = decision === 'approved' ? await require('./approvalExecutor').executeApproval(user.householdId, approvalMatch[2], user.memberId) : null;
        const syncFailed = result?.result?.sync?.ok === false;
        await this.sendText(chatId, decision === 'approved' ? (syncFailed ? 'Approved and saved locally. Paperless sync failed and will retry automatically.' : 'Approved and synced with Paperless.') : 'Proposal rejected.');
      } catch (error) {
        console.warn(`[Telegram] Approval decision failed: ${this.safeError(error)}`);
        await this.sendText(chatId, 'This proposal is no longer pending or could not be processed.');
      }
      return;
    }
    const match = safeText(callback.data).match(/^doc:(\d+)$/);
    if (!match) return;
    if (!this.downloadLimiter.tryConsume(user.telegramId)) {
      await this.sendText(chatId, `You are downloading documents faster than this bot allows. Try again in ${this.downloadLimiter.retryAfterSeconds(user.telegramId)} seconds.`);
      return;
    }
    const documentId = Number(match[1]);
    await this.call('sendChatAction', { chat_id: chatId, action: 'upload_document' });
    const file = await this.paperlessFor(user).downloadDocument(documentId);
    if (file.buffer.length > 50 * 1024 * 1024) {
      await this.sendText(chatId, 'That original is larger than Telegram’s 50 MB send limit. Open it in Paperless instead.');
      return;
    }
    await this.sendDocument(chatId, file.buffer, file.filename, file.mimeType, `Paperless document ${documentId}`);
  }

  private async handleUpload(message: TelegramMessage, user: TelegramUserConfig): Promise<void> {
    const photo = message.photo?.[message.photo.length - 1];
    const source = message.document || photo;
    if (!source) return;
    if (!this.uploadLimiter.tryConsume(user.telegramId)) {
      await this.sendText(message.chat.id, `You are uploading faster than this bot allows. Try again in ${this.uploadLimiter.retryAfterSeconds(user.telegramId)} seconds.`);
      return;
    }
    if (source.file_size && source.file_size > Number(config.telegram.maxFileBytes)) {
      await this.sendText(message.chat.id, 'Telegram bots can download files up to 20 MB. Send a smaller file or upload it in Paperless.');
      return;
    }
    await this.call('sendChatAction', { chat_id: message.chat.id, action: 'typing' });
    await this.sendText(message.chat.id, 'Uploading to Paperless and waiting for OCR…');
    const file = await this.call<{ file_path?: string; file_size?: number }>('getFile', { file_id: source.file_id });
    if (!file.file_path || file.file_path.includes('..') || !/^[A-Za-z0-9_./-]+$/.test(file.file_path)) {
      throw new Error('Telegram returned an invalid file path');
    }
    if (file.file_size && file.file_size > Number(config.telegram.maxFileBytes)) throw new Error('Telegram file is too large to download');
    const download = await axios.get(`https://api.telegram.org/file/bot${this.botToken}/${file.file_path}`, {
      responseType: 'arraybuffer',
      timeout: 60_000,
      maxContentLength: Number(config.telegram.maxFileBytes)
    });
    const filename = sanitizedFilename(
      source.file_name || (photo ? `telegram-photo-${message.message_id}.jpg` : `telegram-upload-${message.message_id}`),
      `telegram-upload-${message.message_id}`
    );
    const mimeType = source.mime_type || (photo ? 'image/jpeg' : String(download.headers['content-type'] || 'application/octet-stream'));
    const paperless = this.paperlessFor(user);
    const taskId = await paperless.uploadDocument(Buffer.from(download.data), filename, mimeType);
    const consumed = await paperless.waitForConsumption(taskId, Number(config.telegram.uploadTimeoutSeconds) * 1000);
    if (!consumed.documentId) throw new Error('Paperless finished without returning a document id');
    if (consumed.duplicate) {
      await this.sendText(message.chat.id, 'Paperless detected a duplicate. I kept the existing document.', [{ id: consumed.documentId, title: 'Existing document' }]);
      return;
    }
    if (config.telegram.automaticUploadMetadata !== 'yes') {
      await this.sendText(
        message.chat.id,
        'Uploaded successfully. Automatic Telegram metadata is off, so Paperless consumption rules remain in control.',
        [{ id: consumed.documentId, title: filename }]
      );
      return;
    }
    const result = await this.classifyUpload(paperless, consumed.documentId);
    await this.sendText(message.chat.id, result, [{ id: consumed.documentId, title: filename }]);
  }

  private async classifyUpload(
    paperless: TelegramPaperlessClient,
    documentId: number
  ): Promise<string> {
    return classifyPaperlessUpload(
      this.ai(),
      paperless,
      documentId,
      (error) => console.warn(`[Telegram] Document note was not added: ${this.safeError(error)}`)
    );
  }

  private async sendText(chatId: number, text: string, documents: TelegramPaperlessDocument[] = []): Promise<void> {
    const chunks = chunkTelegramText(text);
    for (let index = 0; index < chunks.length; index += 1) {
      const replyMarkup = index === chunks.length - 1 && documents.length
        ? {
            inline_keyboard: documents.slice(0, 8).map((document) => [{
              text: `📄 ${safeText(document.title) || `Document ${document.id}`}`.slice(0, 60),
              callback_data: `doc:${document.id}`
            }])
          }
        : undefined;
      await this.call('sendMessage', {
        chat_id: chatId,
        text: chunks[index],
        ...(replyMarkup ? { reply_markup: replyMarkup } : {})
      });
    }
  }

  private async sendApproval(chatId: number, approvalId: string, title: string): Promise<void> {
    await this.call('sendMessage', { chat_id: chatId, text: `Proposed action: ${title}\n\nNothing changes until you approve.`, reply_markup: { inline_keyboard: [[
      { text: 'Approve', callback_data: `approval:approve:${approvalId}` },
      { text: 'Reject', callback_data: `approval:reject:${approvalId}` }
    ]] } });
  }

  private async sendDocument(chatId: number, buffer: Buffer, filename: string, mimeType: string, caption: string): Promise<void> {
    const form = new FormData();
    form.append('chat_id', String(chatId));
    form.append('caption', caption);
    const bytes = new Uint8Array(buffer);
    form.append('document', new Blob([bytes.buffer as ArrayBuffer], { type: mimeType }), sanitizedFilename(filename, 'document.pdf'));
    const response = await axios.post<TelegramApiResponse<unknown>>(`${this.apiBase}/sendDocument`, form, {
      timeout: 120_000,
      maxBodyLength: Infinity
    });
    if (!response.data.ok) throw new Error(response.data.description || 'Telegram sendDocument failed');
  }
}

const telegramBotService = new TelegramBotService();
export = Object.assign(telegramBotService, {
  TelegramBotService,
  parseTelegramUsers,
  internals: { parseJsonObject, extractDocumentIds, cleanAnswerCitations, chunkTelegramText }
});
