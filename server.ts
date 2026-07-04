// @ts-nocheck — legacy module; tracked for strict typing.
const express = require('express');
const cron = require('node-cron');
const path = require('path');
const fs = require('fs').promises;
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


const corsOptions = {
  origin: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'x-api-key',
    'Access-Control-Allow-Private-Network'
  ],
  credentials: false
};

app.use(cors(corsOptions));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-api-key, Access-Control-Allow-Private-Network');
  res.header('Access-Control-Allow-Private-Network', 'true');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(process.cwd(), 'public')));
app.use(cookieParser());

// Swagger documentation route
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
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
app.get('/api-docs/openapi.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Add a redirect for the old endpoint for backward compatibility
app.get('/api-docs.json', (req, res) => {
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
  const dataDir = path.join(process.cwd(), 'data');
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
async function processDocument(doc, existingTags, existingCorrespondentList, existingDocumentTypesList, ownUserId) {
  const isProcessed = await documentModel.isDocumentProcessed(doc.id);
  if (isProcessed) return null;
  await documentModel.setProcessingStatus(doc.id, doc.title, 'processing');

  //Check if the Document can be edited
  const documentEditable = await paperlessService.getPermissionOfDocument(doc.id);
  if (!documentEditable) {
    console.log(`[DEBUG] Document belongs to: ${documentEditable}, skipping analysis`);
    console.log(`[DEBUG] Document ${doc.id} not editable by Tagvico AI user, skipping analysis`);
    return null;
  }else {
    console.log(`[DEBUG] Document ${doc.id} rights for AI User - processed`);
  }

  let [content, originalData] = await Promise.all([
    paperlessService.getDocumentContent(doc.id),
    paperlessService.getDocument(doc.id)
  ]);

  if (!content || !content.length >= 10) {
    console.log(`[DEBUG] Document ${doc.id} has no content, skipping analysis`);
    return null;
  }

  if (content.length > 50000) {
    content = content.substring(0, 50000);
  }

  const aiService = AIServiceFactory.getService();
  const analysis = await aiService.analyzeDocument(content, existingTags, existingCorrespondentList, existingDocumentTypesList, doc.id);
  console.log('Response from AI service:', analysis);
  if (analysis.error) {
    throw new Error(`[ERROR] Document analysis failed: ${analysis.error}`);
  }
  await documentModel.setProcessingStatus(doc.id, doc.title, 'complete');
  return { analysis, originalData, content };
}

async function buildUpdateData(analysis, doc, content = '') {
  const updateData = {};

  // Only process tags if tagging is activated and tags are not held for review
  if (config.limitFunctions?.activateTagging !== 'no' && !heldFields.includes('tags')) {
    const { tagIds, errors } = await paperlessService.processTags(analysis.document.tags);
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
      console.warn('[WARN] Custom field discovery failed, continuing with legacy lookup:', error.message);
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
          (f) => String(f.name).toLowerCase() === String(fieldDetails.name).toLowerCase()
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
      console.error('[ERROR] Error assigning owner profile:', error.message);
    }
  } else if (heldFields.includes('owner')) {
    console.log('[DEBUG] Owner held for review, skipping auto-apply');
  }

  return updateData;
}

async function saveDocumentChanges(docId, updateData, analysis, originalData) {
  const { tags: originalTags, correspondent: originalCorrespondent, title: originalTitle } = originalData;
  
  await Promise.all([
    documentModel.saveOriginalData(docId, originalTags, originalCorrespondent, originalTitle),
    paperlessService.updateDocument(docId, updateData),
    documentModel.addProcessedDocument(docId, updateData.title),
    documentModel.addOpenAIMetrics(
      docId, 
      analysis.metrics.promptTokens,
      analysis.metrics.completionTokens,
      analysis.metrics.totalTokens
    ),
    documentModel.addToHistory(docId, updateData.tags, updateData.title, analysis.document.correspondent)
  ]);
}

async function processAndSaveDocument(doc, existingTagNames, existingCorrespondentList, existingDocumentTypesList, ownUserId) {
  try {
    const result = await processDocument(doc, existingTagNames, existingCorrespondentList, existingDocumentTypesList, ownUserId);
    if (!result) return;
    const { analysis, originalData, content } = result;
    const updateData = await buildUpdateData(analysis, doc, content);
    await saveDocumentChanges(doc.id, updateData, analysis, originalData);
  } catch (error) {
    console.error(`[ERROR] processing document ${doc.id}:`, error);
  }
}

async function processDocumentCollection(documents, existingTagNames, existingCorrespondentList, existingDocumentTypesList, ownUserId) {
  const args = [existingTagNames, existingCorrespondentList, existingDocumentTypesList, ownUserId];
  if (config.processingMode === 'batch') {
    await Promise.all(documents.map((doc) => processAndSaveDocument(doc, ...args)));
    return;
  }
  for (const doc of documents) {
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
    existingCorrespondentList = existingCorrespondentList.map(correspondent => correspondent.name);
    let existingDocumentTypesList = existingDocumentTypes.map(docType => docType.name);
    
    // Extract tag names from tag objects
    const existingTagNames = existingTags.map(tag => tag.name);

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
  try {
    let [existingTags, documents, ownUserId, existingCorrespondentList, existingDocumentTypes] = await Promise.all([
      paperlessService.getTags(),
      paperlessService.getAllDocuments(),
      paperlessService.getOwnUserID(),
      paperlessService.listCorrespondentsNames(),
      paperlessService.listDocumentTypesNames()
    ]);

    //get existing correspondent list
    existingCorrespondentList = existingCorrespondentList.map(correspondent => correspondent.name);
    
    //get existing document types list
    let existingDocumentTypesList = existingDocumentTypes.map(docType => docType.name);
    
    // Extract tag names from tag objects
    const existingTagNames = existingTags.map(tag => tag.name);

    await processDocumentCollection(documents, existingTagNames, existingCorrespondentList, existingDocumentTypesList, ownUserId);
  } catch (error) {
    console.error('[ERROR]  during document scan:', error);
  } finally {
    runningTask = false;
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
app.get('/', async (req, res) => {
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
app.get('/health', async (req, res) => {
  try {
    const isConfigured = await setupService.isConfigured();
    if (!isConfigured) {
      return res.status(503).json({ 
        status: 'not_configured',
        message: 'Application setup not completed'
      });
    }

    await documentModel.isDocumentProcessed(1);
    res.json({ status: 'healthy' });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({ 
      status: 'error', 
      message: error.message 
    });
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// Start scanning
async function startScanning() {
  try {
    const isConfigured = await setupService.isConfigured();
    if (!isConfigured) {
      console.log(`Setup not completed. Visit http://your-machine-ip:${process.env.ARCHIVISTA_AI_PORT || 3000}/setup to complete setup.`);
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

async function gracefulShutdown(signal) {
  console.log(`[DEBUG] Received ${signal} signal. Starting graceful shutdown...`);
  try {
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
  const port = process.env.ARCHIVISTA_AI_PORT || 3000;
  try {
    await initializeDataDirectory();
    // Idempotent schema migration for the history.diff JSON column.
    historyService.migrate();
    await saveOpenApiSpec(); // Save OpenAPI specification on startup
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
      startScanning();
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
