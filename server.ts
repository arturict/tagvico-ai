const express = require('express');
const cron = require('node-cron');
const path = require('path');
const fs = require('fs').promises;
const { resolveDataDirectory } = require('./services/dataDirectory');
const config = require('./config/config');
const paperlessService = require('./services/paperlessService');
const AIServiceFactory = require('./services/aiServiceFactory');
const documentModel = require('./models/document');
const setupService = require('./services/setupService');
const setupRoutes = require('./routes/setup');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const Logger = require('./services/loggerService');
const { max } = require('date-fns');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');
const ownerProfileService = require('./services/ownerProfileService');
const historyService = require('./services/historyService');
const customFieldsService = require('./services/customFieldsService');
const { resolveEnv } = require('./services/configHelpers');
type HttpRequest = Record<string, unknown>;
type NextFunction = () => void;
interface HttpResponse {
  setHeader(name: string, value: string): void;
  send(body: unknown): HttpResponse;
  sendFile(path: string): HttpResponse;
  redirect(path: string): void;
  status(code: number): HttpResponse;
  json(body: unknown): HttpResponse;
}
interface DocumentRecord { id: number; title: string; created?: string; owner?: number }
interface AnalysisRecord {
  error?: unknown;
  document: {
    held_for_review?: string[];
    tags?: unknown;
    title?: string;
    document_date?: string;
    document_type?: string;
    custom_fields?: Record<string, { field_name?: string; value?: string }>;
    correspondent?: string;
    language?: string;
  };
  metrics?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
}
interface UpdateData {
  tags?: number[];
  title?: string;
  created?: string;
  document_type?: number;
  custom_fields?: unknown[];
  correspondent?: number;
  language?: string;
  owner?: number;
}
interface NamedResource { name: string }
type OriginalData = Record<string, unknown>;
interface ScanControl { running: boolean; stopRequested: boolean; startedAt: string | null; source: string | null }
const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);
const { isAuthenticated } = require('./routes/auth');
const { createRateLimiter } = require('./services/rateLimiter');
const controlledTaggingService = require('./services/controlledTaggingService');
const tagGroupService = require('./services/tagGroupService');
const reviewService = require('./services/reviewService');
const { blockLegacyPublicImages, removeLegacyPublicThumbnailCache } = require('./services/staticPathSecurity');
const telemetryService = require('./services/telemetryService');
const telegramBotService = require('./services/telegramBotService');
const actionSyncService = require('./services/actionSyncService');

const htmlLogger = new Logger({
  logFile: 'logs.html',
  format: 'html',
  timestamp: true,
  maxFileSize: 1024 * 1024 * 10
});

const txtLogger = new Logger({
  logFile: 'logs.txt',
  format: 'txt',
  timestamp: true,
  maxFileSize: 1024 * 1024 * 10
});

const app = express();
let runningTask = false;
const globalState = global as typeof global & { __tagvicoScanControl?: ScanControl };
const scanControl = globalState.__tagvicoScanControl || { running: false, stopRequested: false, startedAt: null, source: null };
globalState.__tagvicoScanControl = scanControl;


const allowedOrigins = String(process.env.CORS_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean);
const corsOptions = {
  origin(origin: string | undefined, callback: (error: Error | null, allowed?: boolean) => void) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Origin is not allowed'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'x-api-key',
    'Access-Control-Allow-Private-Network'
  ],
  credentials: false
};

if (allowedOrigins.length > 0) app.use(cors(corsOptions));

app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === 'yes' ? 1 : false);
app.use((_req: HttpRequest, res: HttpResponse, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
// Paperless thumbnails used to be cached below public/images. Block decoded
// and normalized variants before static middleware so old files cannot be
// exposed through encoded-path mount bypasses.
app.use(blockLegacyPublicImages);
const bundledDocsDirectory = path.join(process.cwd(), 'docs-site');
app.get('/docs', (_req: HttpRequest, res: HttpResponse) => {
  res.sendFile(path.join(bundledDocsDirectory, 'index.html'));
});
app.use('/docs', express.static(bundledDocsDirectory, {
  extensions: ['html'],
  index: 'index.html',
  setHeaders(res: HttpResponse, filePath: string) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));
app.use(express.static(path.join(process.cwd(), 'public')));
app.use(cookieParser());
app.use('/api', createRateLimiter({ windowMs: 15 * 60 * 1000, max: Number(process.env.GLOBAL_RATE_LIMIT_MAX || 1000) }));

// Swagger documentation route
app.use('/api-docs', isAuthenticated, swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  swaggerOptions: {
    url: '/api-docs/openapi.json'
  }
}));

/**
 * @swagger
 * /api-docs/openapi.json:
 *   get:
 *     summary: Retrieve the OpenAPI specification
 *     description: |
 *       Returns the complete OpenAPI specification for the Tagvico AI API.
 *       
 *       The OpenAPI specification document contains all API endpoints, parameters,
 *       request bodies, responses, and schemas for the entire application.
 *     tags: [API, System]
 *     responses:
 *       200:
 *         description: OpenAPI specification returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               description: The complete OpenAPI specification
 *       404:
 *         description: OpenAPI specification file not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error occurred while retrieving the OpenAPI specification
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.get('/api-docs/openapi.json', isAuthenticated, (_req: HttpRequest, res: HttpResponse) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Add a redirect for the old endpoint for backward compatibility
app.get('/api-docs.json', (_req: HttpRequest, res: HttpResponse) => {
  res.redirect('/api-docs/openapi.json');
});

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(process.cwd(), 'views'));

// //Layout middleware
// app.use((req, res, next) => {
//   const originalRender = res.render;
//   res.render = function (view, locals = {}) {
//     originalRender.call(this, view, locals, (err, html) => {
//       if (err) return next(err);
//       originalRender.call(this, 'layout', { content: html, ...locals });
//     });
//   };
//   next();
// });


// Initialize data directory
async function initializeDataDirectory() {
  const dataDir = resolveDataDirectory();
  try {
    await fs.access(dataDir);
  } catch {
    console.log('Creating data directory...');
    await fs.mkdir(dataDir, { recursive: true });
  }
}

// Save OpenAPI specification to file
async function saveOpenApiSpec() {
  const openApiDir = path.join(process.cwd(), 'OPENAPI');
  const openApiPath = path.join(openApiDir, 'openapi.json');
  try {
    // Ensure the directory exists
    try {
      await fs.access(openApiDir);
    } catch {
      console.log('Creating OPENAPI directory...');
      await fs.mkdir(openApiDir, { recursive: true });
    }
    
    // Write the specification to file
    await fs.writeFile(openApiPath, JSON.stringify(swaggerSpec, null, 2));
    console.log(`OpenAPI specification saved to ${openApiPath}`);
    return true;
  } catch (error) {
    console.error('Failed to save OpenAPI specification:', error);
    return false;
  }
}

// Document processing functions
async function processDocument(doc: DocumentRecord, existingTags: string[], existingCorrespondentList: string[], existingDocumentTypesList: string[], ownUserId: number | null) {
  const isProcessed = await documentModel.isDocumentProcessed(doc.id);
  if (isProcessed) return null;
  if (await documentModel.isDocumentFailed(doc.id)) return null;
  // A queued review remains authoritative even if Automatic mode is enabled later.
  // Do not pay for inference again or write around the human review decision.
  if (await reviewService.hasActiveSuggestion(doc.id)) return null;
  const reviewMode = reviewService.isReviewModeEnabled();
  // Reserve before making the paid model request. A pending/staging review row
  // is an explicit marker that this document has already been analyzed.
  const reviewReservation = reviewMode
    ? await reviewService.reserveSuggestion(doc, 'automatic')
    : null;
  if (reviewMode && !reviewReservation) return null;

  await documentModel.setProcessingStatus(doc.id, doc.title, 'processing');
  try {
    // Check if the Document can be edited
    const documentEditable = await paperlessService.getPermissionOfDocument(doc.id);
    if (!documentEditable) {
      console.log(`[DEBUG] Document belongs to: ${documentEditable}, skipping analysis`);
      console.log(`[DEBUG] Document ${doc.id} not editable by Tagvico AI user, skipping analysis`);
      if (reviewReservation) await reviewService.failSuggestion(reviewReservation.id, 'document is not editable');
      return null;
    }
    console.log(`[DEBUG] Document ${doc.id} rights for AI User - processed`);

    let [content, originalData] = await Promise.all([
      paperlessService.getDocumentContent(doc.id),
      paperlessService.getDocument(doc.id)
    ]);

    if (!content || content.length < config.minContentLength) {
      console.log(`[DEBUG] Document ${doc.id} has insufficient OCR content`);
      if (config.ocr?.enabled === 'yes') {
        await documentModel.addToOcrQueue(doc.id, doc.title, 'short_content');
      } else {
        await documentModel.addFailedDocument(doc.id, doc.title, 'short_content_ocr_disabled', 'ocr');
      }
      await documentModel.setProcessingStatus(doc.id, doc.title, 'failed');
      if (reviewReservation) await reviewService.failSuggestion(reviewReservation.id, 'insufficient OCR content');
      return null;
    }

    if (content.length > 50000) content = content.substring(0, 50000);

    const aiService = AIServiceFactory.getService();
    const policy = tagGroupService.getConfig();
    const promptTags = policy.enabled ? policy.vocabulary : existingTags;
    const analysis = await aiService.analyzeDocument(content, promptTags, existingCorrespondentList, existingDocumentTypesList, doc.id);
    console.log('Response from AI service:', analysis);
    if (analysis.error) throw new Error(`[ERROR] Document analysis failed: ${analysis.error}`);

    if (reviewReservation) {
      const suggestion = await reviewService.stageSuggestion(reviewReservation.id, {
        doc,
        analysis,
        originalData,
        content
      });
      if (!suggestion) throw new Error('Review reservation could not be staged');
      await documentModel.setProcessingStatus(doc.id, doc.title, 'complete');
      return { reviewSuggestion: suggestion };
    }

    await documentModel.setProcessingStatus(doc.id, doc.title, 'complete');
    return { analysis, originalData, content };
  } catch (error) {
    if (reviewReservation) await reviewService.failSuggestion(reviewReservation.id, errorMessage(error));
    throw error;
  }
}

async function buildUpdateData(analysis: AnalysisRecord, doc: DocumentRecord, content = '') {
  const updateData: UpdateData = {};
  const heldFields = Array.isArray(analysis?.document?.held_for_review)
    ? analysis.document.held_for_review
    : [];

  // Only process tags if tagging is activated and tags are not held for review
  if (config.limitFunctions?.activateTagging !== 'no' && !heldFields.includes('tags')) {
    const { tagIds, errors } = await controlledTaggingService.processSuggestions(doc.id, analysis.document.tags);
    if (errors.length > 0) {
      console.warn('[ERROR] Some tags could not be processed:', errors);
    }
    updateData.tags = tagIds;
  } else if (config.limitFunctions?.activateTagging === 'no' && config.addAIProcessedTag === 'yes') {
    // Add AI processed tags to the document (processTags function awaits a tags array)
    // get tags from .env file and split them by comma and make an array
    console.log('[DEBUG] Tagging is deactivated but AI processed tag will be added');
    const tags = config.addAIProcessedTags.split(',');
    const { tagIds, errors } = await paperlessService.processTags(tags);
    if (errors.length > 0) {
      console.warn('[ERROR] Some tags could not be processed:', errors);
    }
    updateData.tags = tagIds;
    console.log('[DEBUG] Tagging is deactivated');
  } else if (heldFields.includes('tags')) {
    console.log('[DEBUG] Tags held for review, skipping auto-apply');
  }

  // Only process title if title generation is activated and title is not held for review
  if (config.limitFunctions?.activateTitle !== 'no' && !heldFields.includes('title')) {
    updateData.title = analysis.document.title || doc.title;
  } else if (heldFields.includes('title')) {
    console.log('[DEBUG] Title held for review, skipping auto-apply');
  }

  // Add created date regardless of settings as it's a core field (unless held)
  if (!heldFields.includes('document_date')) {
    updateData.created = analysis.document.document_date || doc.created;
  } else {
    updateData.created = doc.created;
    console.log('[DEBUG] Document date held for review, keeping original');
  }

  // Only process document type if document type classification is activated and not held
  if (config.limitFunctions?.activateDocumentType !== 'no' && analysis.document.document_type && !heldFields.includes('document_type')) {
    try {
      const documentType = await paperlessService.getOrCreateDocumentType(analysis.document.document_type);
      if (documentType) {
        updateData.document_type = documentType.id;
      }
    } catch (error) {
      console.error(`[ERROR] Error processing document type:`, error);
    }
  }
  
  // Only process custom fields if custom fields detection is activated
  if (config.limitFunctions?.activateCustomFields !== 'no' && analysis.document.custom_fields) {
    const customFields = analysis.document.custom_fields;
    const processedFields = [];

    // Discover the live field list so we can validate model output against
    // the declared Paperless type. Failures here are non-fatal — the
    // legacy lookup-by-name path is still used as a fallback.
    let liveFields = [];
    try {
      liveFields = await customFieldsService.listFields();
    } catch (error) {
      console.warn('[WARN] Custom field discovery failed, continuing with legacy lookup:', errorMessage(error));
    }

    // Validate + drop invalid values. The model output is sanitized
    // against the live type list first; whatever passes is then turned
    // into a Paperless-friendly { field, value } array. Values for
    // fields the discovery step didn't return (e.g. legacy / unknown)
    // fall through to the existing name lookup.
    const { valid: sanitizedValid, dropped: sanitizedDropped } = customFieldsService.sanitize(
      liveFields,
      customFields
    );
    if (sanitizedDropped.length > 0) {
      console.warn(
        `[WARN] Dropped ${sanitizedDropped.length} custom field(s) that did not match their declared type`
      );
    }

    // Get existing custom fields
    const existingFields = await paperlessService.getExistingCustomFields(doc.id);
    console.log(`[DEBUG] Found existing fields:`, existingFields);

    // Keep track of which fields we've processed to avoid duplicates
    const processedFieldIds = new Set();
    const processedNames = new Set();

    // First, add any new/updated fields
    for (const key in customFields) {
      const customField = customFields[key];

      if (!customField.field_name || !customField.value?.trim()) {
        console.log(`[DEBUG] Skipping empty/invalid custom field`);
        continue;
      }

      const fieldDetails = await paperlessService.findExistingCustomField(customField.field_name);
      if (fieldDetails?.id) {
        const trimmedValue = customField.value.trim();
        const liveField = liveFields.find(
          (f: NamedResource) => String(f.name).toLowerCase() === String(fieldDetails.name).toLowerCase()
        );
        if (liveField) {
          // Re-check the value against the declared type after trimming.
          const reason = customFieldsService.validateValue(liveField, trimmedValue);
          if (reason) {
            console.warn(
              `[WARN] Custom field "${liveField.name}" value rejected: ${reason}`
            );
            continue;
          }
        }
        processedFields.push({
          field: fieldDetails.id,
          value: trimmedValue
        });
        processedFieldIds.add(fieldDetails.id);
        processedNames.add(String(fieldDetails.name).toLowerCase());
      }
    }

    // Then add any existing fields that weren't updated
    for (const existingField of existingFields) {
      if (!processedFieldIds.has(existingField.field)) {
        processedFields.push(existingField);
      }
    }

    if (processedFields.length > 0) {
      updateData.custom_fields = processedFields;
    }
  } else if (heldFields.includes('custom_fields')) {
    console.log('[DEBUG] Custom fields held for review, skipping auto-apply');
  }

  // Only process correspondent if correspondent detection is activated and not held
  if (config.limitFunctions?.activateCorrespondents !== 'no' && analysis.document.correspondent && !heldFields.includes('correspondent')) {
    try {
      const correspondent = await paperlessService.getOrCreateCorrespondent(analysis.document.correspondent);
      if (correspondent) {
        updateData.correspondent = correspondent.id;
      }
    } catch (error) {
      console.error(`[ERROR] Error processing correspondent:`, error);
    }
  } else if (heldFields.includes('correspondent')) {
    console.log('[DEBUG] Correspondent held for review, skipping auto-apply');
  }

  // Always include language if provided as it's a core field
  if (analysis.document.language) {
    updateData.language = analysis.document.language;
  }

  if (config.activateOwnerAssignment !== 'no' && !doc.owner && !heldFields.includes('owner')) {
    try {
      const users = await paperlessService.getUsers();
      const ownerMatch = ownerProfileService.findOwnerMatch({
        content,
        analysis,
        doc,
        users,
        rawProfiles: config.ownerProfiles
      });
      if (ownerMatch) {
        updateData.owner = ownerMatch.id;
        console.log(`[DEBUG] Assigned owner ${ownerMatch.username} to document ${doc.id} via profile match`, ownerMatch.matched);
      }
    } catch (error) {
      console.error('[ERROR] Error assigning owner profile:', errorMessage(error));
    }
  } else if (heldFields.includes('owner')) {
    console.log('[DEBUG] Owner held for review, skipping auto-apply');
  }

  return updateData;
}

async function saveDocumentChanges(docId: number, updateData: UpdateData, analysis: AnalysisRecord, originalData: OriginalData) {
  await documentModel.saveOriginalSnapshot(docId, originalData);
  await Promise.all([
    paperlessService.updateDocument(docId, updateData),
    documentModel.addProcessedDocument(docId, updateData.title),
    documentModel.addOpenAIMetrics(
      docId, 
      analysis.metrics?.promptTokens || 0,
      analysis.metrics?.completionTokens || 0,
      analysis.metrics?.totalTokens || 0
    ),
    documentModel.addToHistory(docId, updateData.tags, updateData.title, analysis.document.correspondent)
  ]);
}

async function processAndSaveDocument(doc: DocumentRecord, existingTagNames: string[], existingCorrespondentList: string[], existingDocumentTypesList: string[], ownUserId: number | null) {
  for (let attempt = 1; attempt <= config.maxRetries; attempt += 1) {
    try {
      const result = await processDocument(doc, existingTagNames, existingCorrespondentList, existingDocumentTypesList, ownUserId);
      if (!result) return;
      if (result.reviewSuggestion) return;
      const { analysis, originalData, content } = result;
      const updateData = await buildUpdateData(analysis, doc, content);
      await saveDocumentChanges(doc.id, updateData, analysis, originalData);
      return;
    } catch (error) {
      console.error(`[ERROR] processing document ${doc.id} (attempt ${attempt}/${config.maxRetries}):`, error);
      if (attempt === config.maxRetries) {
        const message = error instanceof Error ? error.message : String(error);
        await documentModel.addFailedDocument(doc.id, doc.title, 'ai_failed', 'ai', message);
        await documentModel.setProcessingStatus(doc.id, doc.title, 'failed');
      }
    }
  }
}

async function processDocumentCollection(documents: DocumentRecord[], existingTagNames: string[], existingCorrespondentList: string[], existingDocumentTypesList: string[], ownUserId: number | null) {
  const args: [string[], string[], string[], number | null] = [existingTagNames, existingCorrespondentList, existingDocumentTypesList, ownUserId];
  if (config.processingMode === 'batch') {
    await Promise.all(documents.map((doc) => processAndSaveDocument(doc, ...args)));
    return;
  }
  for (const doc of documents) {
    if (scanControl.stopRequested) break;
    await processAndSaveDocument(doc, ...args);
  }
}

// Main scanning functions
async function scanInitial() {
  try {
    const isConfigured = await setupService.isConfigured();
    if (!isConfigured) {
      console.log('[ERROR] Setup not completed. Skipping document scan.');
      return;
    }

    let [existingTags, documents, ownUserId, existingCorrespondentList, existingDocumentTypes] = await Promise.all([
      paperlessService.getTags(),
      paperlessService.getAllDocuments(),
      paperlessService.getOwnUserID(),
      paperlessService.listCorrespondentsNames(),
      paperlessService.listDocumentTypesNames()
    ]);
    //get existing correspondent list
    existingCorrespondentList = existingCorrespondentList.map((correspondent: NamedResource) => correspondent.name);
    let existingDocumentTypesList = existingDocumentTypes.map((docType: NamedResource) => docType.name);
    
    // Extract tag names from tag objects
    const existingTagNames = existingTags.map((tag: NamedResource) => tag.name);

    await processDocumentCollection(documents, existingTagNames, existingCorrespondentList, existingDocumentTypesList, ownUserId);
  } catch (error) {
    console.error('[ERROR] during initial document scan:', error);
  }
}

async function scanDocuments() {
  if (runningTask) {
    console.log('[DEBUG] Task already running');
    return;
  }

  runningTask = true;
  scanControl.running = true;
  scanControl.stopRequested = false;
  scanControl.startedAt = new Date().toISOString();
  scanControl.source = 'scheduler';
  try {
    let [existingTags, documents, ownUserId, existingCorrespondentList, existingDocumentTypes] = await Promise.all([
      paperlessService.getTags(),
      paperlessService.getAllDocuments(),
      paperlessService.getOwnUserID(),
      paperlessService.listCorrespondentsNames(),
      paperlessService.listDocumentTypesNames()
    ]);

    //get existing correspondent list
    existingCorrespondentList = existingCorrespondentList.map((correspondent: NamedResource) => correspondent.name);
    
    //get existing document types list
    let existingDocumentTypesList = existingDocumentTypes.map((docType: NamedResource) => docType.name);
    
    // Extract tag names from tag objects
    const existingTagNames = existingTags.map((tag: NamedResource) => tag.name);

    await processDocumentCollection(documents, existingTagNames, existingCorrespondentList, existingDocumentTypesList, ownUserId);
  } catch (error) {
    console.error('[ERROR]  during document scan:', error);
  } finally {
    runningTask = false;
    scanControl.running = false;
    scanControl.stopRequested = false;
    scanControl.startedAt = null;
    scanControl.source = null;
    console.log('[INFO] Task completed');
  }
}

// Routes
app.use('/', setupRoutes);

/**
 * @swagger
 * /:
 *   get:
 *     summary: Root endpoint that redirects to the dashboard
 *     description: |
 *       This endpoint serves as the entry point for the application.
 *       When accessed, it automatically redirects the user to the dashboard page.
 *       No parameters or authentication are required for this redirection.
 *     tags: [Navigation, System]
 *     responses:
 *       302:
 *         description: Redirects to the dashboard page
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 *               example: "<html><body>Redirecting to dashboard...</body></html>"
 *       500:
 *         description: Server error occurred during redirection
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.get('/', async (_req: HttpRequest, res: HttpResponse) => {
  try {
    res.redirect('/dashboard');
  } catch (error) {
    console.error('[ERROR] in root route:', error);
    res.status(500).send('Error processing request');
  }
});

/**
 * @swagger
 * /health:
 *   get:
 *     summary: System health check endpoint
 *     description: |
 *       Checks if the application is properly configured and the database is reachable.
 *       This endpoint can be used by monitoring systems to verify service health.
 *       
 *       The endpoint returns a 200 status code with a "healthy" status if everything is 
 *       working correctly, or a 503 status code with error details if there are issues.
 *     tags: [System]
 *     responses:
 *       200:
 *         description: System is healthy and operational
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "healthy"
 *                   description: Health status indication
 *       503:
 *         description: System is not fully configured or database is unreachable
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [not_configured, error]
 *                   example: "not_configured"
 *                   description: Error status type
 *                 message:
 *                   type: string
 *                   example: "Application setup not completed"
 *                   description: Detailed error message
 */
app.get('/health', async (_req: HttpRequest, res: HttpResponse) => {
  try {
    const isConfigured = await setupService.isConfigured();
    await documentModel.isDocumentProcessed(1);
    res.json({ status: 'healthy', configured: isConfigured });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({ 
      status: 'error', 
      message: errorMessage(error)
    });
  }
});

// Error handler
app.use((err: Error, _req: HttpRequest, res: HttpResponse, _next: NextFunction) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// Start scanning
async function startScanning() {
  try {
    const isConfigured = await setupService.isConfigured();
    if (!isConfigured) {
      const port = resolveEnv('TAGVICO_AI_PORT', 'ARCHIVISTA_AI_PORT') || 3000;
      console.log(`Setup not completed. Visit http://your-machine-ip:${port}/setup to complete setup.`);
      return;
    }

    const userId = await paperlessService.getOwnUserID();
    if (!userId) {
      console.error('Failed to get own user ID. Abort scanning.');
      return;
    }

    console.log('Configured scan interval:', config.scanInterval);
    console.log(`Starting initial scan at ${new Date().toISOString()}`);
    if(config.disableAutomaticProcessing != 'yes') {
      await scanInitial();
  
      cron.schedule(config.scanInterval, async () => {
        console.log(`Starting scheduled scan at ${new Date().toISOString()}`);
        await scanDocuments();
      });
    }
    if (config.reconciliationEnabled === 'yes') {
      const reconciliationService = require('./services/reconciliationService');
      cron.schedule(config.reconciliationInterval, async () => {
        try {
          const result = await reconciliationService.run();
          if (result.removed) console.log(`[RECONCILIATION] Removed ${result.removed} stale local document(s)`);
        } catch (error) {
          console.error('[RECONCILIATION] Failed:', errorMessage(error));
        }
      });
    }
    const actionSyncInterval = process.env.ACTION_SYNC_INTERVAL || '*/10 * * * *';
    if (cron.validate(actionSyncInterval)) {
      cron.schedule(actionSyncInterval, async () => {
        try {
          const result = await actionSyncService.reconcileAllCases();
          if (result.changed || result.failed) console.log(`[ACTION SYNC] checked=${result.checked} changed=${result.changed} failed=${result.failed}`);
        } catch (error) { console.warn('[ACTION SYNC] Failed:', errorMessage(error)); }
      });
    } else {
      console.warn(`[ACTION SYNC] Ignoring invalid ACTION_SYNC_INTERVAL: ${actionSyncInterval}`);
    }
  } catch (error) {
    console.error('[ERROR] in startScanning:', error);
  }
}

// Error handlers
// process.on('SIGTERM', async () => {
//   console.log('Received SIGTERM. Starting graceful shutdown...');
//   try {
//     console.log('Closing database...');
//     await documentModel.closeDatabase(); // Jetzt warten wir wirklich auf den Close
//     console.log('Database closed successfully');
//     process.exit(0);
//   } catch (error) {
//     console.error('[ERROR] during shutdown:', error);
//     process.exit(1);
//   }
// });

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

async function gracefulShutdown(signal: NodeJS.Signals) {
  console.log(`[DEBUG] Received ${signal} signal. Starting graceful shutdown...`);
  try {
    await telegramBotService.stop();
    console.log('[DEBUG] Closing database...');
    await documentModel.closeDatabase();
    console.log('[DEBUG] Database closed successfully');
    process.exit(0);
  } catch (error) {
    console.error(`[ERROR] during ${signal} shutdown:`, error);
    process.exit(1);
  }
}

// Handle both SIGTERM and SIGINT
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
async function startServer() {
  const port = resolveEnv('TAGVICO_AI_PORT', 'ARCHIVISTA_AI_PORT') || 3000;
  try {
    const removedLegacyThumbnails = await removeLegacyPublicThumbnailCache();
    if (removedLegacyThumbnails) {
      console.log(`[SECURITY] Removed ${removedLegacyThumbnails} legacy public thumbnail cache file(s)`);
    }
    await initializeDataDirectory();
    // Idempotent schema migration for the history.diff JSON column.
    historyService.migrate();
    const recoveredReviews = await documentModel.recoverApplyingReviewSuggestions();
    if (recoveredReviews) console.log(`[REVIEW] Recovered ${recoveredReviews} interrupted suggestion(s)`);
    const ocrService = require('./services/ocrService');
    const recovered = await ocrService.recoverInterruptedJobs();
    if (recovered) console.log(`[OCR] Recovered ${recovered} interrupted job(s)`);
    await saveOpenApiSpec(); // Save OpenAPI specification on startup
    // Warm the dynamic model-pricing catalog (models.dev) in the background so
    // the dashboard cost estimate uses live prices. Non-blocking and offline-safe.
    try {
      require('./services/pricingCatalog').warmUp();
    } catch (error) {
      console.warn('[WARNING] Could not warm model pricing catalog:', error instanceof Error ? error.message : String(error));
    }
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
      telemetryService.start();
      telegramBotService.start();
      startScanning();
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
