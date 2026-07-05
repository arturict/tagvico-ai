const express = require('express');
type RequestValue = string | number | boolean | null | undefined | string[] | number[] | UnknownRecord | UnknownRecord[];
interface Req {
  body: Record<string, RequestValue>;
  cookies: Record<string, string | undefined>;
  get(name: string): string | undefined;
  headers: Record<string, string | string[] | undefined>;
  method: string;
  on(event: string, listener: (data?: unknown) => void): void;
  params: Record<string, string>;
  path: string;
  query: Record<string, RequestValue>;
  secure: boolean;
  socket?: { remoteAddress?: string };
  user?: { username?: string; [key: string]: unknown };
}
interface Res {
  clearCookie(name: string): Res;
  cookie(name: string, value: string, options?: UnknownRecord): Res;
  end(): Res;
  flushHeaders(): void;
  json(body: unknown): Res;
  redirect(path: string): Res;
  render(view: string, options?: unknown): Res;
  send(body: unknown): Res;
  sendFile(file: string): Res;
  setHeader(name: string, value: string): void;
  status(code: number): Res;
  write(chunk: string): boolean;
}
type Next = () => unknown;
const router = express.Router();
const axios = require('axios');
const setupService = require('../services/setupService.js');
const paperlessService = require('../services/paperlessService.js');
const openaiService = require('../services/openaiService.js');
const ollamaService = require('../services/ollamaService.js');
const azureService = require('../services/azureService.js');
const anthropicService = require('../services/anthropicService.js');
const codexService = require('../services/codexService.js');
const codexAuthService = require('../services/codexAuthService.js');
const documentModel = require('../models/document.js');
const AIServiceFactory = require('../services/aiServiceFactory');
const debugService = require('../services/debugService.js');
const configFile = require('../config/config.js');
const ownerProfileService = require('../services/ownerProfileService');
const onboardingService = require('../services/onboardingService');
const fs = require('fs').promises;
const path = require('path');
const jwt = require('../services/jwtCompat');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const { authenticateJWT, isAuthenticated } = require('./auth.js');
const { getJwtSecret } = require('../services/authSecret');
const JWT_SECRET = getJwtSecret();
const customService = require('../services/customService.js');
const config = require('../config/config.js');
const providerCatalogService = require('../services/providerCatalogService');
const dashboardMetrics = require('../services/dashboardMetrics');
const reviewService = require('../services/reviewService');
const reviewProgressService = require('../services/reviewProgressService');
const historyService = require('../services/historyService');
const ocrService = require('../services/ocrService');
const reconciliationService = require('../services/reconciliationService');
const tagGroupService = require('../services/tagGroupService');
const tagExceptionService = require('../services/tagExceptionService');
const controlledTaggingService = require('../services/controlledTaggingService');
const { createRateLimiter } = require('../services/rateLimiter');
const loginLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10, keyPrefix: 'login' });
const totpService = require('../services/totpService');
const pendingMfaSecrets = new Map();

type UnknownRecord = Record<string, unknown>;
interface NamedItem { id: number; name: string; model?: string; size?: number; modified_at?: string }
interface DocumentData { id: number; title: string; created?: string; owner?: number; tags?: number[]; correspondent?: number; document_type?: number; custom_fields?: UnknownRecord[]; language?: string }
interface AnalysisData {
  error?: string;
  document: { tags: string[]; title?: string; document_date?: string; document_type?: string; custom_fields?: Record<string, { field_name?: string; value?: string }>; correspondent?: string; language?: string };
  metrics: { promptTokens: number; completionTokens: number; totalTokens: number };
}
interface DocumentUpdate { tags?: number[]; title?: string; created?: string; document_type?: number; custom_fields?: UnknownRecord[]; correspondent?: number; language?: string; owner?: number }
interface SaveOptions { currentConfig?: Record<string, string | undefined>; apiToken?: string; jwtToken?: string; processedCustomFields?: UnknownRecord[] }
interface TokenMetric { promptTokens: number; completionTokens: number; totalTokens: number }

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const errorCode = (error: unknown): string | undefined => {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const code = error.code;
  return typeof code === 'string' ? code : undefined;
};
const firstString = (value: RequestValue | string | string[]): string | undefined =>
  typeof value === 'string' ? value : Array.isArray(value) && typeof value[0] === 'string' ? value[0] : undefined;
const {
  buildUiConfig,
  normalizeArray,
  normalizeProviderPayload,
  parseBooleanFlag,
  processSystemPrompt,
  resolveEnv,
  serializeArray
} = require('../services/configHelpers');
require('dotenv').config({ path: '../data/.env' });

/**
 * @swagger
 * tags:
 *   - name: Authentication
 *     description: User authentication and authorization endpoints, including login, logout, and token management
 *   - name: Documents
 *     description: Document management and processing endpoints for interacting with Paperless-ngx documents
 *   - name: History
 *     description: Document processing history and tracking of AI-generated metadata
 *   - name: Navigation
 *     description: General navigation endpoints for the web interface
 *   - name: System
 *     description: System configuration, health checks, and administrative functions
 *   - name: Chat
 *     description: Document chat functionality for interacting with document content using AI
 *   - name: Setup
 *     description: Application setup and configuration endpoints
 *   - name: Metadata
 *     description: Endpoints for managing document metadata like tags, correspondents, and document types
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Error:
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *           description: Error message
 *           example: Error resetting documents
 *     User:
 *       type: object
 *       required:
 *         - username
 *         - password
 *       properties:
 *         username:
 *           type: string
 *           description: User's username
 *         password:
 *           type: string
 *           format: password
 *           description: User's password (will be hashed)
 *     Document:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: Document ID
 *           example: 123
 *         title:
 *           type: string
 *           description: Document title
 *           example: Invoice #12345
 *         tags:
 *           type: array
 *           items:
 *             type: integer
 *           description: Array of tag IDs
 *           example: [1, 4, 7]
 *         correspondent:
 *           type: integer
 *           description: Correspondent ID
 *           example: 5
 *     HistoryItem:
 *       type: object
 *       properties:
 *         document_id:
 *           type: integer
 *           description: Document ID
 *           example: 123
 *         title:
 *           type: string
 *           description: Document title
 *           example: Invoice #12345
 *         created_at:
 *           type: string
 *           format: date-time
 *           description: Date and time when the processing occurred
 *         tags:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Tag'
 *         correspondent:
 *           type: string
 *           description: Document correspondent name
 *           example: Acme Corp
 *         link:
 *           type: string
 *           description: Link to the document in Paperless-ngx
 *     Tag:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: Tag ID
 *           example: 5
 *         name:
 *           type: string
 *           description: Tag name
 *           example: Invoice
 *         color:
 *           type: string
 *           description: Tag color (hex code)
 *           example: "#FF5733"
 */

// API endpoints that should not redirect
const API_ENDPOINTS = ['/health'];
// Routes that don't require authentication
let PUBLIC_ROUTES = [
  '/health',
  '/api/health',
  '/login',
  '/logout',
  '/setup',
  // Paperless-ngx discovery/probe: needed during onboarding before an admin exists.
  // These are still gated by the allowDuringSetup middleware (auth required once configured).
  '/api/paperless/discover',
  '/api/paperless/probe',
  '/api/ollama/models',
  '/api/codex'
];
declare let runningTask: boolean;

// Combined middleware to check authentication and setup
router.use(async (req: Req, res: Res, next: Next) => {
  const token = req.cookies.jwt || firstString(req.headers.authorization)?.split(' ')[1];
  const apiKey = req.headers['x-api-key'];

  if (req.path.startsWith('/setup')) {
    const configured = await setupService.isConfigured().catch(() => false);
    const remote = String(req.socket?.remoteAddress || '');
    const local = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
    if (!configured && !local && process.env.ALLOW_REMOTE_SETUP !== 'yes') {
      return res.status(403).send('Remote setup is disabled. Set ALLOW_REMOTE_SETUP=yes temporarily to opt in.');
    }
  }

  // Public route check
  if (PUBLIC_ROUTES.some(route => req.path.startsWith(route))) {
    return next();
  }

  // API key authentication
  if (apiKey && apiKey === process.env.API_KEY) {
    req.user = { apiKey: true };
  } else {
    // Fallback to JWT authentication
    if (!token) {
      return res.redirect('/login');
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
    } catch (error) {
      res.clearCookie('jwt');
      return res.redirect('/login');
    }
  }

  // Setup check
  try {
    const isConfigured = await setupService.isConfigured();

    // API and health endpoints must never be redirected to an HTML page; they
    // return JSON and handle their own auth/setup gating (e.g. allowDuringSetup).
    const isApiRequest = req.path.startsWith('/api/') || req.path === '/health';

    if (!isApiRequest) {
      const initialSetup = resolveEnv('TAGVICO_AI_INITIAL_SETUP', 'ARCHIVISTA_AI_INITIAL_SETUP');
      if (!isConfigured && (!initialSetup || initialSetup === 'no') && !req.path.startsWith('/setup')) {
        return res.redirect('/setup');
      } else if (!isConfigured && initialSetup === 'yes' && !req.path.startsWith('/settings')) {
        return res.redirect('/settings');
      }
    }
  } catch (error) {
    console.error('Error checking setup configuration:', error);
    return res.status(500).send('Internal Server Error');
  }
  
  next();
});

// Cookie-authenticated mutations must originate from this application. API-key
// clients are not subject to browser CSRF and remain usable without Origin.
router.use((req: Req, res: Res, next: Next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) || !req.cookies.jwt || req.headers['x-api-key']) return next();
  const source = req.headers.origin || req.headers.referer;
  try {
    if (!source || new URL(firstString(source) || '').host !== req.get('host')) return res.status(403).json({ error: 'Cross-site request rejected' });
  } catch {
    return res.status(403).json({ error: 'Cross-site request rejected' });
  }
  next();
});

// Protected route middleware for API endpoints
const protectApiRoute = (req: Req, res: Res, next: Next) => {
  const token = req.cookies.jwt || firstString(req.headers.authorization)?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
};

// Allow a route either when the request carries a valid JWT, or while the app is
// still in initial-setup state (no admin configured yet). Used for Paperless discovery
// so the onboarding flow can scan for instances before an admin account exists.
const allowDuringSetup = async (req: Req, res: Res, next: Next) => {
  const token = req.cookies.jwt || firstString(req.headers.authorization)?.split(' ')[1];
  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET);
      return next();
    } catch (error) {
      // fall through to setup-mode check
    }
  }
  try {
    const isConfigured = await setupService.isConfigured();
    if (!isConfigured) {
      const remote = String(req.socket?.remoteAddress || '');
      const local = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
      if (!local && process.env.ALLOW_REMOTE_SETUP !== 'yes') {
        return res.status(403).json({ success: false, error: 'Remote setup is disabled. Set ALLOW_REMOTE_SETUP=yes temporarily to opt in.' });
      }
      return next();
    }
  } catch (error) {
    // ignore and reject below
  }
  return res.status(401).json({ success: false, error: 'Authentication required' });
};

const retiredUiRoute = (target: string) => (req: Req, res: Res) => {
  res.redirect(target);
};

const retiredApiRoute = (message: string) => (req: Req, res: Res) => {
  res.status(410).json({ error: message });
};

/**
 * @swagger
 * /login:
 *   get:
 *     summary: Render login page or redirect to setup if no users exist
 *     description: |
 *       Serves the login page for user authentication to the Tagvico AI application.
 *       If no users exist in the database, the endpoint automatically redirects to the setup page
 *       to complete the initial application configuration.
 *       
 *       This endpoint handles both new user sessions and returning users whose
 *       sessions have expired.
 *     tags:
 *       - Authentication
 *       - Navigation
 *     responses:
 *       200:
 *         description: Login page rendered successfully
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 *               description: HTML content of the login page
 *       302:
 *         description: Redirect to setup page if no users exist, or to dashboard if already authenticated
 *         headers:
 *           Location:
 *             schema:
 *               type: string
 *               example: "/setup"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/login', (req: Req, res: Res) => {
  //check if a user exists beforehand
  documentModel.getUsers().then((users: UnknownRecord[]) => {
    if(users.length === 0) {
      res.redirect('setup');
    } else {
      res.render('login', { error: null });
    }
  });
});

// Login page route
/**
 * @swagger
 * /login:
 *   post:
 *     summary: Authenticate user with username and password
 *     description: |
 *       Authenticates a user using their username and password credentials.
 *       If authentication is successful, a JWT token is generated and stored in a secure HTTP-only
 *       cookie for subsequent requests.
 *       
 *       Failed login attempts are logged for security purposes, and multiple failures
 *       may result in temporary account lockout depending on configuration.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 description: User's login name
 *                 example: "admin"
 *               password:
 *                 type: string
 *                 description: User's password
 *                 example: "securepassword"
 *               rememberMe:
 *                 type: boolean
 *                 description: Whether to extend the session lifetime
 *                 example: false
 *     responses:
 *       200:
 *         description: Authentication successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 redirect:
 *                   type: string
 *                   description: URL to redirect to after successful login
 *                   example: "/dashboard"
 *         headers:
 *           Set-Cookie:
 *             schema:
 *               type: string
 *               description: HTTP-only cookie containing JWT token
 *       401:
 *         description: Authentication failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Invalid username or password"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/login', loginLimiter, async (req: Req, res: Res) => {
  const { username, password, otp } = req.body;

  try {
    console.log('Login attempt for user:', username);   
    // Get user data - returns a single user object
    const user = await documentModel.getUser(username);
    
    // Check if user was found and has required fields
    if (!user || !user.password) {
      console.log('[FAILED LOGIN] User not found or invalid data:', username);
      return res.render('login', { error: 'Invalid credentials' });
    }

    // Compare passwords
    const isValidPassword = await bcrypt.compare(password, user.password);
    console.log('Password validation result:', isValidPassword);

    if (isValidPassword) {
      if (user.mfa_enabled && (!user.mfa_secret || !totpService.verify(user.mfa_secret, String(otp || '')))) {
        return res.status(401).render('login', { error: 'A valid six-digit MFA code is required' });
      }
      const token = jwt.sign(
        { 
          id: user.id, 
          username: user.username 
        },
        JWT_SECRET,
        { expiresIn: '24h' }
      );
      res.cookie('jwt', token, {
        httpOnly: true,
        secure: process.env.COOKIE_SECURE_MODE === 'always' || (process.env.COOKIE_SECURE_MODE !== 'never' && req.secure),
        sameSite: 'lax', 
        path: '/',
        maxAge: 24 * 60 * 60 * 1000 
      });

      return res.redirect('/dashboard');
    }else{
      return res.render('login', { error: 'Invalid credentials' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.render('login', { error: 'An error occurred during login' });
  }
});

// Logout route
/**
 * @swagger
 * /logout:
 *   get:
 *     summary: Log out user and clear JWT cookie
 *     description: |
 *       Terminates the current user session by invalidating and clearing the JWT authentication
 *       cookie. After logging out, the user is redirected to the login page.
 *       
 *       This endpoint also clears any session-related data stored on the server side
 *       for the current user.
 *     tags:
 *       - Authentication
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       302:
 *         description: Logout successful, redirected to login page
 *         headers:
 *           Location:
 *             schema:
 *               type: string
 *               example: "/login"
 *           Set-Cookie:
 *             schema:
 *               type: string
 *               description: HTTP-only cookie with cleared JWT token and immediate expiration
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/logout', (req: Req, res: Res) => {
  res.clearCookie('jwt');
  res.redirect('/login');
});

/**
 * @swagger
 * /sampleData/{id}:
 *   get:
 *     summary: Get sample data for a document
 *     description: |
 *       Retrieves sample data extracted from a document, including processed text content
 *       and any metadata that has been extracted or processed by the AI.
 *       
 *       This endpoint is commonly used for previewing document data in the UI before
 *       completing document processing or updating metadata.
 *     tags:
 *       - Documents
 *       - API
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Document ID to retrieve sample data for
 *         example: 123
 *     responses:
 *       200:
 *         description: Document sample data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 content:
 *                   type: string
 *                   description: Extracted text content from the document
 *                   example: "Invoice from Acme Corp. Total amount: $125.00, Due date: 2023-08-15"
 *                 metadata:
 *                   type: object
 *                   description: Any metadata that has been extracted from the document
 *                   properties:
 *                     title:
 *                       type: string
 *                       example: "Acme Corp Invoice - August 2023"
 *                     tags:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["Invoice", "Finance"]
 *                     correspondent:
 *                       type: string
 *                       example: "Acme Corp"
 *       404:
 *         description: Document not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Document not found"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/sampleData/:id', async (req: Req, res: Res) => {
  try {
    //get all correspondents from one document by id
    const document = await paperlessService.getDocument(req.params.id);
    const correspondents = await paperlessService.getCorrespondentsFromDocument(document.id);

  } catch (error) {
    console.error('[ERRO] loading sample data:', error);
    res.status(500).json({ error: 'Error loading sample data' });
  }
});

router.get('/playground', protectApiRoute, retiredUiRoute('/manual'));

/**
 * @swagger
 * /thumb/{documentId}:
 *   get:
 *     summary: Get document thumbnail
 *     description: |
 *       Retrieves the thumbnail image for a specific document from the Paperless-ngx system.
 *       This endpoint proxies the request to the Paperless-ngx API and returns the thumbnail
 *       image for display in the UI.
 *       
 *       The thumbnail is returned as an image file in the format provided by Paperless-ngx,
 *       typically JPEG or PNG.
 *     tags:
 *       - Documents
 *       - API
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: documentId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the document to retrieve thumbnail for
 *         example: 123
 *     responses:
 *       200:
 *         description: Thumbnail retrieved successfully
 *         content:
 *           image/*:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Document or thumbnail not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Thumbnail not found"
 *       500:
 *         description: Server error or Paperless-ngx connection failure
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/thumb/:documentId', async (req: Req, res: Res) => {
  const cachePath = path.join('./public/images', `${req.params.documentId}.png`);

  try {
    // Prüfe ob das Bild bereits im Cache existiert
    try {
      await fs.access(cachePath);
      console.log('Serving cached thumbnail');
      
      // Wenn ja, sende direkt das gecachte Bild
      res.setHeader('Content-Type', 'image/png');
      return res.sendFile(path.resolve(cachePath));
      
    } catch (err) {
      // File existiert nicht im Cache, hole es von Paperless
      console.log('Thumbnail not cached, fetching from Paperless');
      
      const thumbnailData = await paperlessService.getThumbnailImage(req.params.documentId);
      
      if (!thumbnailData) {
        return res.status(404).send('Thumbnail nicht gefunden');
      }

      // Speichere im Cache
      await fs.mkdir(path.dirname(cachePath), { recursive: true }); // Erstelle Verzeichnis falls nicht existiert
      await fs.writeFile(cachePath, thumbnailData);

      // Sende das Bild
      res.setHeader('Content-Type', 'image/png');
      res.send(thumbnailData);
    }

  } catch (error) {
    console.error('Fehler beim Abrufen des Thumbnails:', error);
    res.status(500).send('Fehler beim Laden des Thumbnails');
  }
});

router.get('/chat', protectApiRoute, retiredUiRoute('/manual'));
router.get('/chat/init', protectApiRoute, retiredApiRoute('Document chat has been removed. Use manual review instead.'));
router.post('/chat/message', protectApiRoute, retiredApiRoute('Document chat has been removed. Use manual review instead.'));
router.get('/chat/init/:documentId', protectApiRoute, retiredApiRoute('Document chat has been removed. Use manual review instead.'));

/**
 * @swagger
 * /history:
 *   get:
 *     summary: Document history page
 *     description: |
 *       Renders the document history page with filtering options.
 *       This page displays a list of all documents that have been processed by Tagvico AI,
 *       showing the changes made to the documents through AI processing.
 *       
 *       The page includes filtering capabilities by correspondent, tag, and free text search,
 *       allowing users to easily find specific documents or categories of processed documents.
 *       Each entry includes links to the original document in Paperless-ngx.
 *     tags:
 *       - History
 *       - Navigation
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: History page rendered successfully
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 *               description: HTML content of the history page with filtering controls and document list
 *       401:
 *         description: Unauthorized - user not authenticated
 *         headers:
 *           Location:
 *             schema:
 *               type: string
 *               example: "/login"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/history', async (req: Req, res: Res) => {
  try {
    const allTags = await paperlessService.getTags();
    const tagMap = new Map(allTags.map((tag: NamedItem) => [tag.id, tag]));

    // Get all correspondents for filter dropdown
    const historyDocuments = await documentModel.getAllHistory();
    const allCorrespondents = [...new Set(historyDocuments.map((doc: UnknownRecord) => doc.correspondent))]
      .filter(Boolean).sort();

    res.render('history', {
      version: configFile.TAGVICO_AI_VERSION,
      filters: {
        allTags: allTags,
        allCorrespondents: allCorrespondents
      }
    });
  } catch (error) {
    console.error('[ERROR] loading history page:', error);
    res.status(500).send('Error loading history page');
  }
});

/**
 * @swagger
 * /api/history:
 *   get:
 *     summary: Get processed document history
 *     description: |
 *       Returns a paginated list of documents that have been processed by Tagvico AI.
 *       Supports filtering by tag, correspondent, and search term.
 *       Designed for integration with DataTables jQuery plugin.
 *       
 *       This endpoint provides comprehensive information about each processed document,
 *       including its metadata before and after AI processing, allowing users to track
 *       changes made by the system.
 *     tags:
 *       - History
 *       - API
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: draw
 *         schema:
 *           type: integer
 *         description: Draw counter for DataTables (prevents XSS)
 *         example: 1
 *       - in: query
 *         name: start
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Starting record index for pagination
 *         example: 0
 *       - in: query
 *         name: length
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of records to return per page
 *         example: 10
 *       - in: query
 *         name: search[value]
 *         schema:
 *           type: string
 *         description: Global search term (searches title, correspondent and tags)
 *         example: "invoice"
 *       - in: query
 *         name: tag
 *         schema:
 *           type: string
 *         description: Filter by tag ID
 *         example: "5"
 *       - in: query
 *         name: correspondent
 *         schema:
 *           type: string
 *         description: Filter by correspondent name
 *         example: "Acme Corp"
 *       - in: query
 *         name: order[0][column]
 *         schema:
 *           type: integer
 *         description: Index of column to sort by (0=document_id, 1=title, etc.)
 *         example: 1
 *       - in: query
 *         name: order[0][dir]
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *         description: Sort direction (ascending or descending)
 *         example: "desc"
 *     responses:
 *       200:
 *         description: Document history returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 draw:
 *                   type: integer
 *                   description: Echo of the draw parameter
 *                   example: 1
 *                 recordsTotal:
 *                   type: integer
 *                   description: Total number of records in the database
 *                   example: 100
 *                 recordsFiltered:
 *                   type: integer
 *                   description: Number of records after filtering
 *                   example: 20
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       document_id:
 *                         type: integer
 *                         description: Document ID
 *                         example: 123
 *                       title:
 *                         type: string
 *                         description: Document title
 *                         example: "Invoice #12345"
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                         description: Date and time when the processing occurred
 *                         example: "2023-07-15T14:30:45Z"
 *                       tags:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: integer
 *                               example: 5
 *                             name:
 *                               type: string
 *                               example: "Invoice"
 *                             color:
 *                               type: string
 *                               example: "#FF5733"
 *                       correspondent:
 *                         type: string
 *                         description: Document correspondent name
 *                         example: "Acme Corp"
 *                       link:
 *                         type: string
 *                         description: Link to the document in Paperless-ngx
 *                         example: "http://paperless.example.com/documents/123/"
 *       401:
 *         description: Unauthorized - authentication required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Authentication required"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Error loading history data"
 */
router.get('/api/history', async (req: Req, res: Res) => {
  try {
    const draw = parseInt(String(req.query.draw || '0'));
    const start = parseInt(String(req.query.start || '0')) || 0;
    const length = parseInt(String(req.query.length || '10')) || 10;
    const searchQuery = req.query.search;
    const search = typeof searchQuery === 'object' && searchQuery && !Array.isArray(searchQuery) ? String(searchQuery.value || '') : '';
    const tagFilter = String(req.query.tag || '');
    const correspondentFilter = String(req.query.correspondent || '');

    const order = (Array.isArray(req.query.order) ? req.query.order[0] : {}) as UnknownRecord;
    const columns = Array.isArray(req.query.columns) ? req.query.columns as UnknownRecord[] : [];
    const requestedColumn = columns[Number(order.column)]?.data;
    const historyPage = await documentModel.getHistoryPage({
      search,
      tag: tagFilter,
      correspondent: correspondentFilter,
      sortColumn: requestedColumn,
      sortDir: order.dir,
      limit: length,
      offset: start
    });
    const allTags = await paperlessService.getTags();
    const tagMap = new Map<number, NamedItem>(allTags.map((tag: NamedItem) => [tag.id, tag]));

    const filteredDocs = historyPage.rows.map((doc: UnknownRecord) => {
      const tagIds: string[] = doc.tags === '[]' ? [] : JSON.parse(String(doc.tags || '[]'));
      const resolvedTags = tagIds.map((id: string) => tagMap.get(parseInt(id))).filter((tag): tag is NamedItem => Boolean(tag));
      const baseURL = (process.env.PAPERLESS_API_URL || '').replace(/\/api$/, '');

      resolvedTags.sort((a: NamedItem, b: NamedItem) => a.name.localeCompare(b.name));

      return {
        document_id: doc.document_id,
        title: doc.title || 'Modified: Invalid Date',
        created_at: doc.created_at,
        tags: resolvedTags,
        correspondent: doc.correspondent || 'Not assigned',
        link: `${baseURL}/documents/${doc.document_id}/`
      };
    });

    res.json({
      draw: draw,
      recordsTotal: historyPage.total,
      recordsFiltered: historyPage.filtered,
      data: filteredDocs
    });
  } catch (error) {
    console.error('[ERROR] loading history data:', error);
    res.status(500).json({ error: 'Error loading history data' });
  }
});

/**
 * @swagger
 * /api/history/{id}/diff:
 *   get:
 *     summary: Get the structured diff for a single processed document
 *     description: |
 *       Returns the diff captured when the document was last patched by
 *       Tagvico AI. The :id parameter is the Paperless document id
 *       (NOT the history row id); the endpoint picks the most recent
 *       history row for that document.
 *
 *       Each diff entry is `{ field, before, after, applied, error? }` —
 *       the same shape used internally by metadataDiff.compareMetadata.
 *     tags:
 *       - History
 *       - API
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Paperless document id
 *         example: 123
 *     responses:
 *       200:
 *         description: Diff returned (may be empty array when no patch happened)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 document_id:
 *                   type: integer
 *                   example: 123
 *                 title:
 *                   type: string
 *                   example: "Invoice #12345"
 *                 created_at:
 *                   type: string
 *                   format: date-time
 *                 diff:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       field:
 *                         type: string
 *                         example: "title"
 *                       before:
 *                         nullable: true
 *                       after:
 *                         nullable: true
 *                       applied:
 *                         type: boolean
 *                       error:
 *                         type: string
 *       404:
 *         description: No history row for this document
 */
router.get('/api/history/:id/diff', async (req: Req, res: Res) => {
  try {
    const documentId = req.params.id;
    const row = historyService.getLatestByDocumentId(documentId);
    if (!row) {
      return res.status(404).json({ error: 'No history row for document', document_id: documentId });
    }
    res.json({
      document_id: row.document_id,
      title: row.title,
      created_at: row.created_at,
      diff: row.diff || []
    });
  } catch (error) {
    console.error('[ERROR] loading history diff:', error);
    res.status(500).json({ error: 'Error loading history diff' });
  }
});

/**
 * /review:
 *   get:
 *     summary: Dry-run review queue
 *     description: |
 *       Renders the dry-run review queue: the latest 20 auto-analyzed documents
 *       with their proposed title, tags, correspondent, document type, and
 *       custom fields. While DRY_RUN=true (the default), new AI suggestions
 *       land here instead of being written back to Paperless-ngx automatically.
 *     tags:
 *       - Navigation
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Review page rendered successfully
 */
router.get('/review', async (req: Req, res: Res) => {
  try {
    const analyses = await reviewService.listRecentAnalyses(20);
    res.render('review', {
      title: 'Review | Tagvico AI',
      activePage: 'review',
      version: configFile.TAGVICO_AI_VERSION,
      analyses,
      dryRun: reviewService.isDryRunEnabled()
    });
  } catch (error) {
    console.error('[ERROR] loading review page:', error);
    res.status(500).render('review', {
      title: 'Review | Tagvico AI',
      activePage: 'review',
      version: configFile.TAGVICO_AI_VERSION,
      analyses: [],
      dryRun: reviewService.isDryRunEnabled(),
      error: 'Error loading review queue'
    });
  }
});

/**
 * /review/:id/apply:
 *   post:
 *     summary: Apply a partial metadata patch to a single document
 *     description: |
 *       Accepts a partial metadata object (any of title, tags, correspondent,
 *       document_type, custom_fields, owner) and writes it back to Paperless-ngx.
 *       In dry-run mode the request is rejected so operators can stage changes
 *       first. The update is delegated to paperlessService.patchDocument.
 *     tags:
 *       - Documents
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 */
router.post('/review/:id/apply', express.json(), isAuthenticated, async (req: Req, res: Res) => {
  try {
    const documentId = req.params.id;
    const metadata = req.body || {};
    reviewProgressService.publish({ documentId, status: 'applying' });
    const result = await reviewService.applyMetadata(documentId, metadata);
    if (!result.ok) {
      reviewProgressService.publish({ documentId, status: 'skipped', reason: result.reason });
      return res.status(409).json(result);
    }
    reviewProgressService.publish({ documentId, status: 'applied' });
    res.json({ success: true, documentId, ...result });
  } catch (error) {
    reviewProgressService.publish({ documentId: req.params.id, status: 'failed', error: errorMessage(error) });
    console.error('[ERROR] applying review metadata:', error);
    res.status(500).json({ error: 'Error applying metadata' });
  }
});

router.get('/api/review/progress', (req: Req, res: Res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  const send = (event: unknown) => res.write(`event: progress\ndata: ${JSON.stringify(event)}\n\n`);
  send({ status: 'connected' });
  reviewProgressService.on('progress', send);
  const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), 15_000);
  req.on('close', () => { clearInterval(keepAlive); reviewProgressService.off('progress', send); });
});

/**
 * @swagger
 * /api/reset-all-documents:
 *   post:
 *     summary: Reset all processed documents
 *     description: |
 *       Deletes all processing records from the database, allowing documents to be processed again.
 *       This doesn't delete the actual documents from Paperless-ngx, only their processing status in Tagvico AI.
 *       
 *       This operation can be useful when changing AI models or prompts, as it allows reprocessing
 *       all documents with the updated configuration.
 *     tags:
 *       - Documents
 *       - API
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: All documents successfully reset
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *       401:
 *         description: Unauthorized - authentication required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Authentication required"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Error resetting documents"
 */
router.post('/api/reset-all-documents', async (req: Req, res: Res) => {
  try {
    await documentModel.deleteAllDocuments();
    res.json({ success: true });
  }
  catch (error) {
    console.error('[ERROR] resetting documents:', error);
    res.status(500).json({ error: 'Error resetting documents' });
  }
});

/**
 * @swagger
 * /api/reset-documents:
 *   post:
 *     summary: Reset specific documents
 *     description: |
 *       Deletes processing records for specific documents, allowing them to be processed again.
 *       This doesn't delete the actual documents from Paperless-ngx, only their processing status in Tagvico AI.
 *       
 *       This operation is useful when you want to reprocess only selected documents after changes to
 *       the AI model, prompt, or document metadata configuration.
 *     tags:
 *       - Documents
 *       - API
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ids
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: Array of document IDs to reset
 *                 example: [123, 456, 789]
 *     responses:
 *       200:
 *         description: Documents successfully reset
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: Invalid request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Invalid document IDs"
 *       401:
 *         description: Unauthorized - authentication required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Authentication required"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Error resetting documents"
 */
router.post('/api/reset-documents', async (req: Req, res: Res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) {
      return res.status(400).json({ error: 'Invalid document IDs' });
    }

    await documentModel.deleteDocumentsIdList(ids);
    res.json({ success: true });
  }
  catch (error) {
    console.error('[ERROR] resetting documents:', error);
    res.status(500).json({ error: 'Error resetting documents' });
  }
});

/**
 * @swagger
 * /api/scan/now:
 *   post:
 *     summary: Trigger immediate document scan
 *     description: |
 *       Initiates an immediate scan of documents in Paperless-ngx that haven't been processed yet.
 *       This endpoint can be used to manually trigger processing without waiting for the scheduled interval.
 *       
 *       The scan will:
 *       - Connect to Paperless-ngx API
 *       - Fetch all unprocessed documents
 *       - Process each document with the configured AI service
 *       - Update documents in Paperless-ngx with generated metadata
 *       
 *       The process respects the function limitations set in the configuration.
 *     tags:
 *       - Documents
 *       - API
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Scan initiated successfully
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: "Task completed"
 *       401:
 *         description: Unauthorized - authentication required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Authentication required"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Error during document scan"
 */
router.post('/api/scan/now', async (req: Req, res: Res) => {
try {
    const isConfigured = await setupService.isConfigured();
    if (!isConfigured) {
      console.log(`Setup not completed. Visit http://your-machine-ip:${resolveEnv('TAGVICO_AI_PORT', 'ARCHIVISTA_AI_PORT') || 3000}/setup to complete setup.`);
      return;
    }

    const userId = await paperlessService.getOwnUserID();
    if (!userId) {
      console.error('Failed to get own user ID. Abort scanning.');
      return;
    }
    
      try {
        let [existingTags, documents, ownUserId, existingCorrespondentList, existingDocumentTypes] = await Promise.all([
          paperlessService.getTags(),
          paperlessService.getAllDocuments(),
          paperlessService.getOwnUserID(),
          paperlessService.listCorrespondentsNames(),
          paperlessService.listDocumentTypesNames()
        ]);
    
        //get existing correspondent list
        existingCorrespondentList = existingCorrespondentList.map((correspondent: NamedItem) => correspondent.name);
        
        //get existing document types list
        let existingDocumentTypesList = existingDocumentTypes.map((docType: NamedItem) => docType.name);
        
        // Extract tag names from tag objects
        const existingTagNames = existingTags.map((tag: NamedItem) => tag.name);
    
        for (const doc of documents) {
          try {
            const result = await processDocument(doc, existingTagNames, existingCorrespondentList, existingDocumentTypesList, ownUserId);
            if (!result) continue;
    
            const { analysis, originalData, content } = result;
            const updateData = await buildUpdateData(analysis, doc, content);
            await saveDocumentChanges(doc.id, updateData, analysis, originalData);
          } catch (error) {
            console.error(`[ERROR] processing document ${doc.id}:`, error);
          }
        }
      } catch (error) {
        console.error('[ERROR]  during document scan:', error);
      } finally {
        runningTask = false;
        console.log('[INFO] Task completed');
        res.send('Task completed');
      }
  } catch (error) {
    console.error('[ERROR] in startScanning:', error);
  }
});

async function processDocument(doc: DocumentData, existingTags: string[], existingCorrespondentList: string[], existingDocumentTypesList: string[], ownUserId: number, customPrompt: string | null = null) {
  const isProcessed = await documentModel.isDocumentProcessed(doc.id);
  if (isProcessed) return null;
  await documentModel.setProcessingStatus(doc.id, doc.title, 'processing');

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

  if (!content || Number(!content.length) >= 10) {
    console.log(`[DEBUG] Document ${doc.id} has no content, skipping analysis`);
    return null;
  }

  if (content.length > 50000) {
    content = content.substring(0, 50000);
  }

  // Prepare options for AI service
  const options: { restrictToExistingTags: boolean; restrictToExistingCorrespondents: boolean; externalApiData?: unknown } = {
    restrictToExistingTags: config.restrictToExistingTags === 'yes',
    restrictToExistingCorrespondents: config.restrictToExistingCorrespondents === 'yes'
  };

  // Get external API data if enabled
  if (config.externalApiConfig.enabled === 'yes') {
    try {
      const externalApiService = require('../services/externalApiService');
      const externalData = await externalApiService.fetchData();
      if (externalData) {
        options.externalApiData = externalData;
        console.log('[DEBUG] Retrieved external API data for prompt enrichment');
      }
    } catch (error) {
      console.error('[ERROR] Failed to fetch external API data:', errorMessage(error));
    }
  }

  const aiService = AIServiceFactory.getService();
  const tagPolicy = tagGroupService.getConfig();
  existingTags = tagPolicy.enabled ? tagPolicy.vocabulary : existingTags;
  let analysis;
  if(customPrompt) {
    console.log('[DEBUG] Starting document analysis with custom prompt');
    analysis = await aiService.analyzeDocument(content, existingTags, existingCorrespondentList, existingDocumentTypesList, doc.id, customPrompt, options);
  }else{
    analysis = await aiService.analyzeDocument(content, existingTags, existingCorrespondentList, existingDocumentTypesList, doc.id, null, options);
  }
  console.log('Response from AI service:', analysis);
  if (analysis.error) {
    throw new Error(`[ERROR] Document analysis failed: ${analysis.error}`);
  }
  await documentModel.setProcessingStatus(doc.id, doc.title, 'complete');
  return { analysis, originalData, content };
}

async function buildUpdateData(analysis: AnalysisData, doc: DocumentData, content = '') {
  const updateData: DocumentUpdate = {};

  // Create options object with restriction settings
  const options = {
    restrictToExistingTags: config.restrictToExistingTags === 'yes' ? true : false,
    restrictToExistingCorrespondents: config.restrictToExistingCorrespondents === 'yes' ? true : false
  };

  console.log(`[DEBUG] Building update data with restrictions: tags=${options.restrictToExistingTags}, correspondents=${options.restrictToExistingCorrespondents}`);

  // Only process tags if tagging is activated
  if (config.limitFunctions?.activateTagging !== 'no') {
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
    const { tagIds, errors } = await paperlessService.processTags(tags, options);
    if (errors.length > 0) {
      console.warn('[ERROR] Some tags could not be processed:', errors);
    }
    updateData.tags = tagIds;
    console.log('[DEBUG] Tagging is deactivated');
  }

  // Only process title if title generation is activated
  if (config.limitFunctions?.activateTitle !== 'no') {
    updateData.title = analysis.document.title || doc.title;
  }

  // Add created date regardless of settings as it's a core field
  updateData.created = analysis.document.document_date || doc.created;

  // Only process document type if document type classification is activated
  if (config.limitFunctions?.activateDocumentType !== 'no' && analysis.document.document_type) {
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

    // Get existing custom fields
    const existingFields = await paperlessService.getExistingCustomFields(doc.id);
    console.log(`[DEBUG] Found existing fields:`, existingFields);

    // Keep track of which fields we've processed to avoid duplicates
    const processedFieldIds = new Set();

    // First, add any new/updated fields
    for (const key in customFields) {
      const customField = customFields[key];
      
      if (!customField.field_name || !customField.value?.trim()) {
        console.log(`[DEBUG] Skipping empty/invalid custom field`);
        continue;
      }

      const fieldDetails = await paperlessService.findExistingCustomField(customField.field_name);
      if (fieldDetails?.id) {
        processedFields.push({
          field: fieldDetails.id,
          value: customField.value.trim()
        });
        processedFieldIds.add(fieldDetails.id);
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
  }

  // Only process correspondent if correspondent detection is activated
  if (config.limitFunctions?.activateCorrespondents !== 'no' && analysis.document.correspondent) {
    try {
      const correspondent = await paperlessService.getOrCreateCorrespondent(analysis.document.correspondent, options);
      if (correspondent) {
        updateData.correspondent = correspondent.id;
      }
    } catch (error) {
      console.error(`[ERROR] Error processing correspondent:`, error);
    }
  }

  // Always include language if provided as it's a core field
  if (analysis.document.language) {
    updateData.language = analysis.document.language;
  }

  if (config.activateOwnerAssignment !== 'no' && !doc.owner) {
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
  }

  return updateData;
}

async function saveDocumentChanges(docId: number, updateData: DocumentUpdate, analysis: AnalysisData, originalData: DocumentData) {
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

/**
 * @swagger
 * /api/key-regenerate:
 *   post:
 *     summary: Regenerate API key
 *     description: |
 *       Generates a new random API key for the application and updates the .env file.
 *       The previous API key will be invalidated immediately after generation.
 *       
 *       This API key can be used for programmatic access to the API endpoints
 *       by sending it in the `x-api-key` header of subsequent requests.
 *       
 *       **Security Notice**: This operation invalidates any existing API key.
 *       All systems using the previous key will need to be updated.
 *     tags:
 *       - System
 *       - Authentication
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: API key regenerated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: string
 *                   description: The newly generated API key
 *                   example: "3f7a8d6e2c1b5a9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5"
 *       401:
 *         description: Unauthorized - JWT authentication required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Authentication required"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Error regenerating API key"
 */
router.post('/api/key-regenerate', async (req: Req, res: Res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const dotenv = require('dotenv');
    const crypto = require('crypto');    
    const envPath = path.join(process.cwd(), 'data', '.env');
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    // Generiere ein neues API-Token
    const apiKey = crypto.randomBytes(32).toString('hex');
    envConfig.API_KEY = apiKey;

    // Schreibe die aktualisierte .env-Datei
    const envContent = Object.entries(envConfig)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    fs.writeFileSync(envPath, envContent);

    // Setze die Umgebungsvariable für den aktuellen Prozess
    process.env.API_KEY = apiKey;

    // Sende die Antwort zurück
    res.json({ success: apiKey });
    console.log('API key regenerated:', apiKey);
  } catch (error) {
    console.error('API key regeneration error:', error);
    res.status(500).json({ error: 'Error regenerating API key' });
  }
});


function buildPageConfig() {
  const onboardingDefaults = onboardingService.loadOnboardingDefaults();
  const config = buildUiConfig({ ...onboardingDefaults, ...process.env }, configFile.TAGVICO_AI_VERSION || '');
  config.SYSTEM_PROMPT = '';
  config.CUSTOM_FIELDS = process.env.CUSTOM_FIELDS || '{"custom_fields":[]}';
  return config;
}

function buildViewModel(config: UnknownRecord) {
  return {
    config,
    providerCatalog: providerCatalogService.buildCatalog(config),
    // Safe defaults so setup/settings EJS templates never hit a ReferenceError.
    // Callers can override any of these via the render() options object.
    success: null,
    error: null,
    settingsError: null
  };
}

function resetRuntimeServices() {
  paperlessService.reset?.();
  openaiService.reset?.();
  ollamaService.reset?.();
  azureService.reset?.();
  anthropicService.reset?.();
  codexService.reset?.();
  customService.reset?.();
}

async function provisionControlledTags() {
  const policy = tagGroupService.getConfig();
  if (!policy.enabled) return [];
  try {
    paperlessService.initialize();
    await paperlessService.ensureTagCache();
  } catch (error) {
    return policy.vocabulary.map((name: string) => ({ name, ok: false, error: errorMessage(error) }));
  }
  const results = [];
  for (const name of policy.vocabulary) {
    try {
      const tag = await paperlessService.findExistingTag(name) || await paperlessService.createTagSafely(name);
      results.push({ name, ok: true, id: tag.id });
    } catch (error) {
      results.push({ name, ok: false, error: errorMessage(error) });
    }
  }
  return results;
}

async function getOllamaModelsForUrl(url: string) {
  const models = await setupService.getOllamaModels(url || 'http://localhost:11434');
  return models.map((model: NamedItem) => ({
    name: model.name,
    slug: model.model || model.name,
    size: model.size || null,
    modifiedAt: model.modified_at || null
  }));
}

function buildConfigForSave(payload: Record<string, RequestValue>, options: SaveOptions = {}) {
  const providerPayload = normalizeProviderPayload(payload);
  const currentConfig = options.currentConfig || {};
  const apiToken = options.apiToken || process.env.API_KEY || require('crypto').randomBytes(64).toString('hex');
  const jwtToken = options.jwtToken || process.env.JWT_SECRET || require('crypto').randomBytes(64).toString('hex');
  const processedCustomFields = options.processedCustomFields || [];

  return {
    ...currentConfig,
    PAPERLESS_API_URL: `${String(payload.paperlessUrl || '').replace(/\/api$/, '')}/api`,
    PAPERLESS_API_TOKEN: payload.paperlessToken,
    PAPERLESS_USERNAME: payload.paperlessUsername || '',
    AI_PROVIDER: providerPayload.provider,
    AI_MODEL: providerPayload.selectedModel,
    SCAN_INTERVAL: payload.scanInterval || currentConfig.SCAN_INTERVAL || '*/30 * * * *',
    PROCESS_PREDEFINED_DOCUMENTS: parseBooleanFlag(payload.showTags, currentConfig.PROCESS_PREDEFINED_DOCUMENTS || 'no'),
    TAGS: serializeArray(payload.tags),
    TAG_GROUPS_JSON: JSON.stringify(tagGroupService.parseGroups(payload.tagGroupsJson || currentConfig.TAG_GROUPS_JSON)),
    CONTROLLED_TAGGING_ENABLED: parseBooleanFlag(payload.controlledTaggingEnabled, currentConfig.CONTROLLED_TAGGING_ENABLED || 'no'),
    TAG_MAX_PER_DOCUMENT: String(Math.min(10, Math.max(1, parseInt(String(payload.tagMaxPerDocument || currentConfig.TAG_MAX_PER_DOCUMENT || '3'), 10) || 3))),
    ADD_AI_PROCESSED_TAG: parseBooleanFlag(payload.aiProcessedTag, currentConfig.ADD_AI_PROCESSED_TAG || 'no'),
    AI_PROCESSED_TAG_NAME: payload.aiTagName || currentConfig.AI_PROCESSED_TAG_NAME || 'ai-processed',
    ACTIVATE_OWNER_ASSIGNMENT: parseBooleanFlag(payload.activateOwnerAssignment, currentConfig.ACTIVATE_OWNER_ASSIGNMENT || 'yes'),
    OWNER_PROFILES: String(payload.ownerProfiles || currentConfig.OWNER_PROFILES || '').replace(/\r\n/g, '\n'),
    USE_EXISTING_DATA: parseBooleanFlag(payload.useExistingData, currentConfig.USE_EXISTING_DATA || 'no'),
    DISABLE_AUTOMATIC_PROCESSING: parseBooleanFlag(payload.disableAutomaticProcessing, currentConfig.DISABLE_AUTOMATIC_PROCESSING || 'no'),
    OPENROUTER_API_KEY: providerPayload.openrouterApiKey || currentConfig.OPENROUTER_API_KEY || '',
    OPENROUTER_BASE_URL: process.env.OPENROUTER_BASE_URL || currentConfig.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    OPENROUTER_MODEL: providerPayload.provider === 'openrouter' ? providerPayload.selectedModel : currentConfig.OPENROUTER_MODEL || providerPayload.selectedModel,
    OPENAI_API_KEY: providerPayload.provider === 'openai' ? providerPayload.openaiApiKey : currentConfig.OPENAI_API_KEY || '',
    OPENAI_MODEL: providerPayload.provider === 'openai' ? providerPayload.selectedModel : currentConfig.OPENAI_MODEL || 'gpt-4o-mini',
    ANTHROPIC_API_KEY: providerPayload.provider === 'anthropic' ? providerPayload.anthropicApiKey : currentConfig.ANTHROPIC_API_KEY || '',
    ANTHROPIC_MODEL: providerPayload.provider === 'anthropic' ? providerPayload.selectedModel : currentConfig.ANTHROPIC_MODEL || 'claude-haiku-4-5',
    CODEX_MODEL: providerPayload.provider === 'codex' ? providerPayload.selectedModel : currentConfig.CODEX_MODEL || 'gpt-5.4-mini',
    AI_PROCESSING_MODE: ['standard', 'flex', 'batch'].includes(String(payload.aiProcessingMode)) ? String(payload.aiProcessingMode) : (currentConfig.AI_PROCESSING_MODE || 'standard'),
    OLLAMA_API_URL: providerPayload.ollamaUrl || currentConfig.OLLAMA_API_URL || 'http://localhost:11434',
    OLLAMA_MODEL: providerPayload.provider === 'ollama' ? providerPayload.selectedModel : currentConfig.OLLAMA_MODEL || 'llama3.2',
    COMPATIBLE_BASE_URL: providerPayload.compatibleBaseUrl || currentConfig.COMPATIBLE_BASE_URL || '',
    COMPATIBLE_API_KEY: providerPayload.compatibleApiKey || currentConfig.COMPATIBLE_API_KEY || '',
    COMPATIBLE_MODEL: providerPayload.provider === 'compatible' ? providerPayload.selectedModel : currentConfig.COMPATIBLE_MODEL || '',
    CUSTOM_BASE_URL: providerPayload.compatibleBaseUrl || currentConfig.CUSTOM_BASE_URL || '',
    CUSTOM_API_KEY: providerPayload.compatibleApiKey || currentConfig.CUSTOM_API_KEY || '',
    CUSTOM_MODEL: providerPayload.provider === 'compatible' ? providerPayload.selectedModel : currentConfig.CUSTOM_MODEL || '',
    AZURE_ENDPOINT: providerPayload.azureEndpoint || currentConfig.AZURE_ENDPOINT || '',
    AZURE_API_KEY: providerPayload.azureApiKey || currentConfig.AZURE_API_KEY || '',
    AZURE_DEPLOYMENT_NAME: providerPayload.azureDeploymentName || currentConfig.AZURE_DEPLOYMENT_NAME || '',
    AZURE_API_VERSION: providerPayload.azureApiVersion || currentConfig.AZURE_API_VERSION || '',
    API_KEY: apiToken,
    JWT_SECRET: jwtToken,
    TAGVICO_AI_INITIAL_SETUP: 'yes',
    ACTIVATE_TAGGING: parseBooleanFlag(payload.activateTagging, currentConfig.ACTIVATE_TAGGING || 'yes'),
    ACTIVATE_CORRESPONDENTS: parseBooleanFlag(payload.activateCorrespondents, currentConfig.ACTIVATE_CORRESPONDENTS || 'yes'),
    ACTIVATE_DOCUMENT_TYPE: parseBooleanFlag(payload.activateDocumentType, currentConfig.ACTIVATE_DOCUMENT_TYPE || 'yes'),
    ACTIVATE_TITLE: parseBooleanFlag(payload.activateTitle, currentConfig.ACTIVATE_TITLE || 'yes'),
    ACTIVATE_CUSTOM_FIELDS: parseBooleanFlag(payload.activateCustomFields, currentConfig.ACTIVATE_CUSTOM_FIELDS || 'yes'),
    RESTRICT_TO_EXISTING_TAGS: parseBooleanFlag(payload.restrictToExistingTags, currentConfig.RESTRICT_TO_EXISTING_TAGS || 'no'),
    RESTRICT_TO_EXISTING_CORRESPONDENTS: parseBooleanFlag(payload.restrictToExistingCorrespondents, currentConfig.RESTRICT_TO_EXISTING_CORRESPONDENTS || 'no'),
    RESTRICT_TO_EXISTING_DOCUMENT_TYPES: parseBooleanFlag(payload.restrictToExistingDocumentTypes, currentConfig.RESTRICT_TO_EXISTING_DOCUMENT_TYPES || 'no'),
    EXTERNAL_API_ENABLED: parseBooleanFlag(payload.externalApiEnabled, currentConfig.EXTERNAL_API_ENABLED || 'no'),
    EXTERNAL_API_URL: payload.externalApiUrl || currentConfig.EXTERNAL_API_URL || '',
    EXTERNAL_API_METHOD: payload.externalApiMethod || currentConfig.EXTERNAL_API_METHOD || 'GET',
    EXTERNAL_API_HEADERS: payload.externalApiHeaders || currentConfig.EXTERNAL_API_HEADERS || '{}',
    EXTERNAL_API_BODY: payload.externalApiBody || currentConfig.EXTERNAL_API_BODY || '{}',
    EXTERNAL_API_TIMEOUT: payload.externalApiTimeout || currentConfig.EXTERNAL_API_TIMEOUT || '5000',
    EXTERNAL_API_TRANSFORM: payload.externalApiTransform || currentConfig.EXTERNAL_API_TRANSFORM || '',
    CUSTOM_FIELDS: processedCustomFields.length > 0 ? JSON.stringify({ custom_fields: processedCustomFields }) : (currentConfig.CUSTOM_FIELDS || '{"custom_fields":[]}'),
    SYSTEM_PROMPT: processSystemPrompt(payload.systemPrompt),
    TOKEN_LIMIT: currentConfig.TOKEN_LIMIT || '128000',
    RESPONSE_TOKENS: currentConfig.RESPONSE_TOKENS || '1000',
    AI_REASONING_EFFORT: payload.aiReasoningEffort || currentConfig.AI_REASONING_EFFORT || 'low'
  };
}

/**
 * @swagger
 * /setup:
 *   get:
 *     summary: Application setup page
 *     description: |
 *       Renders the application setup page for initial configuration.
 *       
 *       This page allows configuring the connection to Paperless-ngx, AI services,
 *       and other application settings. It loads existing configuration if available
 *       and redirects to dashboard if setup is already complete.
 *       
 *       The setup page is the entry point for new installations and guides users through
 *       the process of connecting to Paperless-ngx, configuring AI providers, and setting up
 *       admin credentials.
 *     tags:
 *       - Navigation
 *       - Setup
 *       - System
 *     responses:
 *       200:
 *         description: Setup page rendered successfully
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 *               description: HTML content of the application setup page
 *       302:
 *         description: Redirects to dashboard if setup is already complete
 *         headers:
 *           Location:
 *             schema:
 *               type: string
 *               example: "/dashboard"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/setup', async (req: Req, res: Res) => {
  try {
    let config = buildPageConfig();

    // Check both configuration and users
    const [isEnvConfigured, users] = await Promise.all([
      setupService.isConfigured(),
      documentModel.getUsers()
    ]);

    // Load saved config if it exists
    if (isEnvConfigured) {
      const savedConfig = await setupService.loadConfig();
      config = { ...config, ...buildUiConfig(savedConfig, configFile.TAGVICO_AI_VERSION || '') };
    }

    // Check if system is fully configured
    const hasUsers = Array.isArray(users) && users.length > 0;
    const isFullyConfigured = isEnvConfigured && hasUsers;

    // Generate appropriate success message
    let successMessage;
    if (isEnvConfigured && !hasUsers) {
      successMessage = 'Environment is configured, but no users exist. Please create at least one user.';
    } else if (isEnvConfigured) {
      successMessage = 'The application is already configured. You can update the configuration below.';
    }

    // If everything is configured and we have users, redirect to dashboard
    // BUT only after we've loaded all the config
    if (isFullyConfigured) {
      return res.redirect('/dashboard');
    }

    // Render setup page with config and appropriate message
    res.render('setup', {
      ...buildViewModel(config),
      success: successMessage
    });
  } catch (error) {
    console.error('Setup route error:', error);
    res.status(500).render('setup', {
      ...buildViewModel(buildPageConfig()),
      error: 'An error occurred while loading the setup page.'
    });
  }
});

/**
 * @swagger
 * /manual/preview/{id}:
 *   get:
 *     summary: Document preview
 *     description: |
 *       Fetches and returns the content of a specific document from Paperless-ngx 
 *       for preview in the manual document review interface.
 *       
 *       This endpoint retrieves document details including content, title, ID, and tags,
 *       allowing users to view the document text before applying changes or processing
 *       it with AI tools. The document content is retrieved directly from Paperless-ngx
 *       using the system's configured API credentials.
 *     tags:
 *       - Documents
 *       - API
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The document ID from Paperless-ngx
 *         example: 123
 *     responses:
 *       200:
 *         description: Document content retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 content:
 *                   type: string
 *                   description: The document content
 *                   example: "Invoice from ACME Corp. Amount: $1,234.56"
 *                 title:
 *                   type: string
 *                   description: The document title
 *                   example: "ACME Corp Invoice #12345"
 *                 id:
 *                   type: integer
 *                   description: The document ID
 *                   example: 123
 *                 tags:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: Array of tag names assigned to the document
 *                   example: ["Invoice", "ACME Corp", "2023"]
 *       401:
 *         description: Unauthorized - user not authenticated
 *         headers:
 *           Location:
 *             schema:
 *               type: string
 *               example: "/login"
 *       404:
 *         description: Document not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error or Paperless connection error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/manual/preview/:id', async (req: Req, res: Res) => {
  try {
    const documentId = req.params.id;
    console.log('Fetching content for document:', documentId);
    
    const response = await fetch(
      `${process.env.PAPERLESS_API_URL}/documents/${documentId}/`,
      {
        headers: {
          'Authorization': `Token ${process.env.PAPERLESS_API_TOKEN}`
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch document content: ${response.status} ${response.statusText}`);
    }

    const document = await response.json();
    //map the tags to their names
    document.tags = await Promise.all(document.tags.map(async (tag: number) => {
      const tagName = await paperlessService.getTagTextFromId(tag);
      return tagName;
    }
    ));
    const correspondent = document.correspondent
      ? await paperlessService.getCorrespondentNameById(document.correspondent)
      : null;
    const owner = document.owner ? { id: document.owner } : null;

    res.json({
      content: document.content,
      title: document.title,
      id: document.id,
      tags: document.tags,
      correspondent,
      documentType: document.document_type || null,
      owner,
      originalDocument: document
    });
  } catch (error) {
    console.error('Content fetch error:', error);
    res.status(500).json({ error: `Error fetching document content: ${errorMessage(error)}` });
  }
});

/**
 * @swagger
 * /manual:
 *   get:
 *     summary: Document review page
 *     description: |
 *       Renders the manual document review page that allows users to browse, 
 *       view and manually process documents from Paperless-ngx.
 *       
 *       This interface enables users to review documents, view their content, and 
 *       manage tags, correspondents, and document metadata without AI assistance.
 *       Users can apply manual changes to documents based on their own judgment,
 *       which is particularly useful for correction or verification of AI-processed documents.
 *     tags:
 *       - Navigation
 *       - Documents
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Manual document review page rendered successfully
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 *               description: HTML content of the manual document review interface
 *       401:
 *         description: Unauthorized - user not authenticated
 *         headers:
 *           Location:
 *             schema:
 *               type: string
 *               example: "/login"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/manual', async (req: Req, res: Res) => {
  const version = configFile.TAGVICO_AI_VERSION || ' ';
  const [correspondents, documentTypes, users] = await Promise.all([
    paperlessService.listCorrespondentsNames(),
    paperlessService.listDocumentTypesNames(),
    paperlessService.getUsers()
  ]);
  res.render('manual', {
    title: 'Document Review',
    error: null,
    success: null,
    version,
    paperlessUrl: process.env.PAPERLESS_API_URL,
    paperlessToken: process.env.PAPERLESS_API_TOKEN,
    config: {},
    correspondents,
    documentTypes,
    users
  });
});

/**
 * @swagger
 * /manual/tags:
 *   get:
 *     summary: Get all tags
 *     description: |
 *       Retrieves all tags from Paperless-ngx for use in the manual document review interface.
 *       
 *       This endpoint returns a complete list of all available tags that can be applied to documents,
 *       including their IDs, names, and colors. The tags are retrieved directly from Paperless-ngx
 *       and used for tag selection in the UI when manually updating document metadata.
 *     tags:
 *       - Documents
 *       - API
 *       - Metadata
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Tags retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Tag'
 *       401:
 *         description: Unauthorized - user not authenticated
 *         headers:
 *           Location:
 *             schema:
 *               type: string
 *               example: "/login"
 *       500:
 *         description: Server error or Paperless connection error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/manual/tags', async (req: Req, res: Res) => {
  const getTags = await paperlessService.getTags();
  res.json(getTags);
});

/**
 * @swagger
 * /manual/documents:
 *   get:
 *     summary: Get all documents
 *     description: |
 *       Retrieves all documents from Paperless-ngx for display in the manual document review interface.
 *       
 *       This endpoint returns a list of all available documents that can be manually reviewed,
 *       including their basic metadata such as ID, title, and creation date. The documents are
 *       retrieved directly from Paperless-ngx and presented in the UI for selection and processing.
 *     tags:
 *       - Documents
 *       - API
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Documents retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Document'
 *       401:
 *         description: Unauthorized - user not authenticated
 *         headers:
 *           Location:
 *             schema:
 *               type: string
 *               example: "/login"
 *       500:
 *         description: Server error or Paperless connection error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/manual/documents', async (req: Req, res: Res) => {
  const getDocuments = await paperlessService.getDocuments();
  res.json(getDocuments);
});

router.get('/api/provider-catalog', async (req: Req, res: Res) => {
  const config = buildPageConfig();
  const catalog = providerCatalogService.buildCatalog(config);

  let ollamaModels = [];
  if (catalog.selectedProvider === 'ollama') {
    ollamaModels = await getOllamaModelsForUrl(config.OLLAMA_API_URL);
  }

  res.json({
    ...catalog,
    ollamaModels
  });
});

router.get('/api/ollama/models', allowDuringSetup, async (req: Req, res: Res) => {
  try {
    const url = req.query.url || process.env.OLLAMA_API_URL || 'http://localhost:11434';
    const models = await getOllamaModelsForUrl(String(url));
    res.json({ success: true, models });
  } catch (error) {
    res.status(500).json({ success: false, error: errorMessage(error) });
  }
});

/**
 * Normalize a user-supplied Paperless URL to a clean base URL (no trailing slash, no /api).
 */
function normalizePaperlessBaseUrl(raw: string | undefined | null) {
  if (!raw) return null;
  let url = String(raw).trim();
  if (!/^https?:\/\//i.test(url)) {
    url = `http://${url}`;
  }
  url = url.replace(/\/+$/, '');
  url = url.replace(/\/api$/i, '');
  return url;
}

/**
 * Probe a single base URL to see if it is a Paperless-ngx instance.
 *
 * Paperless-ngx is detected via several independent signals, because depending
 * on version / reverse-proxy / auth config a single signal is not always present:
 *   1. `x-version` / `x-api-version` response headers (classic fingerprint).
 *   2. The unauthenticated `/api/` root redirecting to the DRF schema view.
 *   3. A DRF-style 401/403 on a well-known API endpoint (statistics/ui_settings),
 *      which means the instance is up but token-gated.
 *   4. A JSON API root listing the usual Paperless resources.
 */
async function probePaperlessInstance(baseUrl: string, timeout = 2500, token = '') {
  const url = normalizePaperlessBaseUrl(baseUrl);
  if (!url) return { url: baseUrl, ok: false };

  const tokenHeader = token ? { Authorization: `Token ${token}` } : {};

  const get = (path: string) => axios.get(`${url}${path}`, {
    timeout,
    validateStatus: () => true,
    maxRedirects: 0,
    headers: { Accept: 'application/json', ...tokenHeader }
  });

  try {
    const response = await get(token ? '/api/documents/?page_size=1' : '/api/');
    const headers = response.headers || {};
    const version = headers['x-version'] || null;
    const apiVersion = headers['x-api-version'] || null;
    const location = headers['location'] || '';

    // Signal 1 + 4: header fingerprint or JSON resource listing.
    let looksLikePaperless = Boolean(
      version ||
      apiVersion ||
      (response.data && typeof response.data === 'object' &&
        ('documents' in response.data || 'correspondents' in response.data || 'tags' in response.data || 'results' in response.data))
    );

    if (token && response.status === 200) {
      const permission = await validatePaperlessTokenPermissions(url, token, timeout);
      return {
        url,
        ok: permission.success,
        status: response.status,
        version,
        apiVersion,
        requiresAuth: false,
        authenticated: permission.success,
        error: permission.success ? null : permission.message
      };
    }

    // Signal 2: /api/ redirects to the DRF schema view (Paperless-ngx behaviour).
    if (!looksLikePaperless && response.status >= 300 && response.status < 400 &&
        /schema/i.test(location)) {
      looksLikePaperless = true;
    }

    // Signal 3: a token-gated DRF endpoint confirms a live Paperless API.
    let requiresAuth = response.status === 401 || response.status === 403;
    if (!looksLikePaperless || version === null) {
      for (const probePath of ['/api/ui_settings/', '/api/statistics/']) {
        const probe = await get(probePath);
        const pv = (probe.headers || {})['x-version'] ||
                   (probe.headers || {})['x-api-version'] || null;
        if (pv && !version) {
          looksLikePaperless = true;
        }
        if (probe.status === 401 || probe.status === 403) {
          looksLikePaperless = true;
          requiresAuth = true;
        }
        if (probe.status === 200 && probe.data && typeof probe.data === 'object') {
          looksLikePaperless = true;
        }
        if (looksLikePaperless) break;
      }
    }

    return {
      url,
      ok: looksLikePaperless,
      status: response.status,
      version,
      apiVersion,
      requiresAuth
    };
  } catch (error) {
    return { url, ok: false, error: errorCode(error) || errorMessage(error) };
  }
}

/**
 * Build a candidate list of base URLs to probe for Paperless-ngx auto-discovery.
 */
function buildDiscoveryCandidates(hint: string | undefined) {
  const candidates = new Set();
  const add = (u: string | undefined) => {
    const n = normalizePaperlessBaseUrl(u);
    if (n) candidates.add(n);
  };

  // Anything the user already typed / has configured.
  add(hint);
  add(process.env.PAPERLESS_API_URL);

  // Common container/service names on the same docker/compose network.
  ['paperless', 'paperless-ngx', 'paperless-webserver', 'webserver', 'paperlessngx']
    .forEach((host) => { add(`http://${host}:8000`); });

  // Common local defaults.
  ['http://localhost:8000', 'http://127.0.0.1:8000', 'http://host.docker.internal:8000']
    .forEach(add);

  // Common homelab/LAN addresses. This intentionally includes the local /24 so
  // setup does not only rely on Docker DNS names.
  for (let host = 1; host <= 254; host += 1) {
    add(`http://192.168.1.${host}:8000`);
  }

  // If the hint points at a host, also try the standard Paperless port on that host.
  const n = normalizePaperlessBaseUrl(hint);
  if (n) {
    try {
      const u = new URL(n);
      add(`${u.protocol}//${u.hostname}:8000`);
      add(`${u.protocol}//${u.hostname}`);
    } catch (_) { /* ignore */ }
  }

  return Array.from(candidates);
}

async function validatePaperlessTokenPermissions(baseUrl: string, token: string, timeout = 3500) {
  if (!token) {
    return { success: false, message: 'API token is required.' };
  }

  for (const endpoint of ['documents', 'tags', 'correspondents', 'document_types', 'users']) {
    try {
      const response = await axios.get(`${baseUrl}/api/${endpoint}/`, {
        timeout,
        validateStatus: () => true,
        headers: {
          Accept: 'application/json',
          Authorization: `Token ${token}`
        }
      });
      if (response.status !== 200) {
        return { success: false, message: `Token check failed at /api/${endpoint}/ with HTTP ${response.status}.` };
      }
    } catch (error) {
      return { success: false, message: `Token check failed at /api/${endpoint}/: ${errorCode(error) || errorMessage(error)}` };
    }
  }

  return { success: true, message: 'Paperless token can read documents and metadata.' };
}

/**
 * POST /api/paperless/discover
 * Scans a curated set of candidate URLs (plus an optional hint) for reachable
 * Paperless-ngx instances and returns the ones that respond with the Paperless fingerprint.
 */
router.post('/api/paperless/discover', allowDuringSetup, express.json(), async (req: Req, res: Res) => {
  try {
    const hint = String((req.body && req.body.hint) || (req.query && req.query.hint) || '');
    const candidates = buildDiscoveryCandidates(hint);
    const results = await Promise.all(candidates.map((url) => probePaperlessInstance(String(url))));
    const instances = results
      .filter((r) => r.ok)
      // de-duplicate by normalized url
      .filter((r, i, arr) => arr.findIndex((x) => x.url === r.url) === i);
    res.json({ success: true, scanned: candidates.length, instances });
  } catch (error) {
    res.status(500).json({ success: false, error: errorMessage(error) });
  }
});

/**
 * GET /api/paperless/probe?url=...
 * Probes a single URL on demand (used by the "Test connection" / quick-add UI).
 */
router.get('/api/paperless/probe', allowDuringSetup, async (req: Req, res: Res) => {
  const url = req.query.url;
  if (!url) {
    return res.status(400).json({ success: false, error: 'url query parameter is required' });
  }
  const result = await probePaperlessInstance(String(url));
  res.json({ success: result.ok, instance: result });
});

router.post('/api/paperless/probe', allowDuringSetup, express.json(), async (req: Req, res: Res) => {
  const url = req.body?.url;
  const token = req.body?.token;
  if (!url) {
    return res.status(400).json({ success: false, error: 'url is required' });
  }
  const result = await probePaperlessInstance(String(url), 3500, String(token || ''));
  res.json({ success: result.ok, instance: result });
});

/**
 * @swagger
 * /api/correspondentsCount:
 *   get:
 *     summary: Get count of correspondents
 *     description: |
 *       Retrieves the list of correspondents with their document counts.
 *       This endpoint returns all correspondents in the system along with 
 *       the number of documents associated with each correspondent.
 *     tags: 
 *       - API
 *       - Metadata
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of correspondents with document counts retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                     description: ID of the correspondent
 *                     example: 1
 *                   name:
 *                     type: string
 *                     description: Name of the correspondent
 *                     example: "ACME Corp"
 *                   count:
 *                     type: integer
 *                     description: Number of documents associated with this correspondent
 *                     example: 5
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Invalid or expired token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/api/correspondentsCount', async (req: Req, res: Res) => {
  const correspondents = await paperlessService.listCorrespondentsNames();
  res.json(correspondents);
});

/**
 * @swagger
 * /api/tagsCount:
 *   get:
 *     summary: Get count of tags
 *     description: |
 *       Retrieves the list of tags with their document counts.
 *       This endpoint returns all tags in the system along with 
 *       the number of documents associated with each tag.
 *     tags: 
 *       - API
 *       - Metadata
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of tags with document counts retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                     description: ID of the tag
 *                     example: 1
 *                   name:
 *                     type: string
 *                     description: Name of the tag
 *                     example: "Invoice"
 *                   count:
 *                     type: integer
 *                     description: Number of documents associated with this tag
 *                     example: 12
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Invalid or expired token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/api/tagsCount', async (req: Req, res: Res) => {
  const tags = await paperlessService.listTagNames();
  res.json(tags);
});

const documentQueue: DocumentData[] = [];
let isProcessing = false;

function extractDocumentId(url: string) {
  const match = url.match(/\/documents\/(\d+)\//);
  if (match && match[1]) {
    return parseInt(match[1], 10);
  }
  throw new Error('Could not extract document ID from URL');
}

async function processQueue(customPrompt?: string) {
  if (customPrompt) {
    console.log('Using custom prompt:', customPrompt);
  }

  if (isProcessing || documentQueue.length === 0) return;
  
  isProcessing = true;
  
  try {
    const isConfigured = await setupService.isConfigured();
    if (!isConfigured) {
      console.log(`Setup not completed. Visit http://your-machine-ip:${resolveEnv('TAGVICO_AI_PORT', 'ARCHIVISTA_AI_PORT') || 3000}/setup to complete setup.`);
      return;
    }

    const userId = await paperlessService.getOwnUserID();
    if (!userId) {
      console.error('Failed to get own user ID. Abort scanning.');
      return;
    }

    const [existingTags, existingCorrespondentList, existingDocumentTypes, ownUserId] = await Promise.all([
      paperlessService.getTags(),
      paperlessService.listCorrespondentsNames(),
      paperlessService.listDocumentTypesNames(),
      paperlessService.getOwnUserID()
    ]);

    const existingDocumentTypesList = existingDocumentTypes.map((docType: NamedItem) => docType.name);

    while (documentQueue.length > 0) {
      const doc = documentQueue.shift();
      if (!doc) continue;
      
      try {
        const result = await processDocument(doc, existingTags, existingCorrespondentList, existingDocumentTypesList, ownUserId, customPrompt);
        if (!result) continue;

        const { analysis, originalData, content } = result;
        const updateData = await buildUpdateData(analysis, doc, content);
        await saveDocumentChanges(doc.id, updateData, analysis, originalData);
      } catch (error) {
        console.error(`[ERROR] Failed to process document ${doc.id}:`, error);
      }
    }
  } catch (error) {
    console.error('[ERROR] Error during queue processing:', error);
  } finally {
    isProcessing = false;
    
    if (documentQueue.length > 0) {
      processQueue();
    }
  }
}

/**
 * @swagger
 * /api/webhook/document:
 *   post:
 *     summary: Webhook for document updates
 *     description: |
 *       Processes incoming webhook notifications from Paperless-ngx about document
 *       changes, additions, or deletions. The webhook allows Tagvico AI to respond
 *       to document changes in real-time.
 *       
 *       When a new document is added or updated in Paperless-ngx, this endpoint can
 *       trigger automatic AI processing for metadata extraction.
 *     tags:
 *       - Documents
 *       - API
 *       - System
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - event_type
 *               - document_id
 *             properties:
 *               event_type:
 *                 type: string
 *                 description: Type of event that occurred
 *                 enum: ["added", "updated", "deleted"]
 *                 example: "added"
 *               document_id:
 *                 type: integer
 *                 description: ID of the affected document
 *                 example: 123
 *               document_info:
 *                 type: object
 *                 description: Additional information about the document (optional)
 *                 properties:
 *                   title:
 *                     type: string
 *                     example: "Invoice"
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Document event processed"
 *                 processing_queued:
 *                   type: boolean
 *                   description: Whether AI processing was queued for this document
 *                   example: true
 *       400:
 *         description: Invalid webhook payload
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Missing required fields: event_type, document_id"
 *       401:
 *         description: Unauthorized - invalid or missing API key
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Unauthorized: Invalid API key"
 *       500:
 *         description: Server error processing webhook
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/api/webhook/document', async (req: Req, res: Res) => {
  try {
    const { url, prompt } = req.body;
    let usePrompt = false;
    if (!url) {
      return res.status(400).send('Missing document URL');
    }
    
    try {
      const documentId = extractDocumentId(String(url));
      const document = await paperlessService.getDocument(documentId);
      
      if (!document) {
        return res.status(404).send(`Document with ID ${documentId} not found`);
      }
      
      documentQueue.push(document);
      if (prompt) {
        usePrompt = true;
        console.log('[DEBUG] Using custom prompt:', prompt);
        await processQueue(String(prompt));
      } else {
        await processQueue();
      }
      
      
      res.status(202).send({
        message: 'Document accepted for processing',
        documentId: documentId,
        queuePosition: documentQueue.length
      });
      
    } catch (error) {
      console.error('[ERROR] Failed to extract document ID or fetch document:', error);
      return res.status(200).send('Invalid document URL format');
    }
    
  } catch (error) {
    console.error('[ERROR] Error in webhook endpoint:', error);
    res.status(200).send('Internal server error');
  }
});

/**
 * @swagger
 * /dashboard:
 *   get:
 *     summary: Main dashboard page
 *     description: |
 *       Renders the main dashboard page of the application with summary statistics and visualizations.
 *       The dashboard provides an overview of processed documents, system metrics, and important statistics
 *       about document processing including tag counts, correspondent counts, and token usage.
 *       
 *       The page displays visualizations for document processing status, token distribution, 
 *       processing time statistics, and document type categorization to help administrators
 *       understand system performance and document processing patterns.
 *     tags:
 *       - Navigation
 *       - System
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Dashboard page rendered successfully
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 *               description: HTML content of the dashboard page
 *       401:
 *         description: Unauthorized - user not authenticated
 *         headers:
 *           Location:
 *             schema:
 *               type: string
 *               example: "/login"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/dashboard', async (req: Req, res: Res) => {
  const tagCount = await paperlessService.getTagCount();
  const correspondentCount = await paperlessService.getCorrespondentCount();
  const documentCount = await paperlessService.getDocumentCount();
  const processedDocumentCount = await documentModel.getProcessedDocumentsCount();
  const metrics: TokenMetric[] = await documentModel.getMetrics();
  const processingTimeStats = await documentModel.getProcessingTimeStats();
  const tokenDistribution = await documentModel.getTokenDistribution();
  const documentTypes = await documentModel.getDocumentTypeStats();

  const averagePromptTokens = metrics.length > 0 ? Math.round(metrics.reduce((acc: number, cur: TokenMetric) => acc + cur.promptTokens, 0) / metrics.length) : 0;
  const averageCompletionTokens = metrics.length > 0 ? Math.round(metrics.reduce((acc: number, cur: TokenMetric) => acc + cur.completionTokens, 0) / metrics.length) : 0;
  const averageTotalTokens = metrics.length > 0 ? Math.round(metrics.reduce((acc: number, cur: TokenMetric) => acc + cur.totalTokens, 0) / metrics.length) : 0;
  const tokensOverall = metrics.length > 0 ? metrics.reduce((acc: number, cur: TokenMetric) => acc + cur.totalTokens, 0) : 0;

  const paperless_data = {
    tagCount,
    correspondentCount,
    documentCount,
    processedDocumentCount,
    processingTimeStats,
    tokenDistribution,
    documentTypes
  };
  const openai_data = {
    averagePromptTokens,
    averageCompletionTokens,
    averageTotalTokens,
    tokensOverall,
    metricCount: metrics.length
  };
  const summary = dashboardMetrics.buildDashboardSummary(paperless_data, openai_data);
  const version = configFile.TAGVICO_AI_VERSION || ' ';

  res.render('dashboard', { paperless_data, openai_data, summary, version });
});

/**
 * @swagger
 * /settings:
 *   get:
 *     summary: Application settings page
 *     description: |
 *       Renders the application settings page where users can modify configuration
 *       after initial setup.
 *       
 *       This page allows administrators to update connections to Paperless-ngx, 
 *       AI provider settings, processing parameters, feature toggles, and custom fields.
 *       The interface provides validation for connection settings and displays the current
 *       configuration values.
 *       
 *       Changes made on this page are applied to new processing runs immediately.
 *     tags:
 *       - Navigation
 *       - Setup
 *       - System
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Settings page rendered successfully
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 *               description: HTML content of the application settings page
 *       401:
 *         description: Unauthorized - user not authenticated
 *         headers:
 *           Location:
 *             schema:
 *               type: string
 *               example: "/login"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/settings', async (req: Req, res: Res) => {
  let showErrorCheckSettings = false;
  const isConfigured = await setupService.isConfigured();
  if(!isConfigured && resolveEnv('TAGVICO_AI_INITIAL_SETUP', 'ARCHIVISTA_AI_INITIAL_SETUP') === 'yes') {
    showErrorCheckSettings = true;
  }
  let config = buildPageConfig();
  
  if (isConfigured) {
    const savedConfig = await setupService.loadConfig();
    config = { ...config, ...buildUiConfig(savedConfig, configFile.TAGVICO_AI_VERSION || '') };
  }
  const version = configFile.TAGVICO_AI_VERSION || ' ';
  res.render('settings', { 
    ...buildViewModel(config),
    version,
    success: isConfigured ? 'The application is already configured. You can update the configuration below.' : undefined,
    settingsError: showErrorCheckSettings ? 'Please check your settings. Something is not working correctly.' : undefined
  });
});

/**
 * @swagger
 * /debug:
 *   get:
 *     summary: Debug interface
 *     description: |
 *       Renders a debug interface for testing and troubleshooting Paperless-ngx connections
 *       and API responses.
 *       
 *       This page provides a simple UI for executing API calls to Paperless-ngx endpoints
 *       and viewing the raw responses. It's primarily used for diagnosing connection issues
 *       and understanding the structure of data returned by the Paperless-ngx API.
 *       
 *       The debug interface should only be accessible to administrators and is not intended
 *       for regular use in production environments.
 *     tags:
 *       - Navigation
 *       - System
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Debug interface rendered successfully
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 *               description: HTML content of the debug interface
 *       401:
 *         description: Unauthorized - user not authenticated
 *         headers:
 *           Location:
 *             schema:
 *               type: string
 *               example: "/login"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/debug', async (req: Req, res: Res) => {
  //const isConfigured = await setupService.isConfigured();
  //if (!isConfigured) {
  //   return res.status(503).json({ 
  //     status: 'not_configured',
  //     message: 'Application setup not completed'
  //   });
  // }
  res.render('debug');
});

// router.get('/test/:correspondent', async (req: Req, res: Res) => {
//   //create a const for the correspondent that is base64 encoded and decode it
//   const correspondentx = Buffer.from(req.params.correspondent, 'base64').toString('ascii');
//   const correspondent = await paperlessService.searchForExistingCorrespondent(correspondentx);
//   res.send(correspondent);
// });

/**
 * @swagger
 * /debug/tags:
 *   get:
 *     summary: Debug tags API
 *     description: |
 *       Returns the raw tags data from Paperless-ngx for debugging purposes.
 *       
 *       This endpoint performs a direct API call to the Paperless-ngx tags endpoint
 *       and returns the unmodified response. It's used for diagnosing tag-related issues
 *       and verifying proper connection to Paperless-ngx.
 *     tags:
 *       - System
 *       - API
 *       - Metadata
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Tags data retrieved successfully from Paperless-ngx
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               description: Raw response from Paperless-ngx tags API
 *       401:
 *         description: Unauthorized - user not authenticated
 *         headers:
 *           Location:
 *             schema:
 *               type: string
 *               example: "/login"
 *       500:
 *         description: Server error or Paperless connection error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/debug/tags', async (req: Req, res: Res) => {
  const tags = await debugService.getTags();
  res.json(tags);
});

/**
 * @swagger
 * /debug/documents:
 *   get:
 *     summary: Debug documents API
 *     description: |
 *       Returns the raw documents data from Paperless-ngx for debugging purposes.
 *       
 *       This endpoint performs a direct API call to the Paperless-ngx documents endpoint
 *       and returns the unmodified response. It's used for diagnosing document-related issues
 *       and verifying proper connection to Paperless-ngx.
 *     tags:
 *       - System
 *       - API
 *       - Documents
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Documents data retrieved successfully from Paperless-ngx
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               description: Raw response from Paperless-ngx documents API
 *       401:
 *         description: Unauthorized - user not authenticated
 *         headers:
 *           Location:
 *             schema:
 *               type: string
 *               example: "/login"
 *       500:
 *         description: Server error or Paperless connection error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/debug/documents', async (req: Req, res: Res) => {
  const documents = await debugService.getDocuments();
  res.json(documents);
});

/**
 * @swagger
 * /debug/correspondents:
 *   get:
 *     summary: Debug correspondents API
 *     description: |
 *       Returns the raw correspondents data from Paperless-ngx for debugging purposes.
 *       
 *       This endpoint performs a direct API call to the Paperless-ngx correspondents endpoint
 *       and returns the unmodified response. It's used for diagnosing correspondent-related issues
 *       and verifying proper connection to Paperless-ngx.
 *     tags:
 *       - System
 *       - API
 *       - Metadata
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Correspondents data retrieved successfully from Paperless-ngx
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               description: Raw response from Paperless-ngx correspondents API
 *       401:
 *         description: Unauthorized - user not authenticated
 *         headers:
 *           Location:
 *             schema:
 *               type: string
 *               example: "/login"
 *       500:
 *         description: Server error or Paperless connection error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/debug/correspondents', async (req: Req, res: Res) => {
  const correspondents = await debugService.getCorrespondents();
  res.json(correspondents);
});

/**
 * @swagger
 * /manual/analyze:
 *   post:
 *     summary: Analyze document content manually
 *     description: |
 *       Analyzes document content using the configured AI provider and returns structured metadata.
 *       This endpoint processes the document text to extract relevant information such as tags,
 *       correspondent, and document type based on content analysis.
 *       
 *       The analysis is performed using the AI provider configured in the application settings.
 *     tags:
 *       - Documents
 *       - API
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *                 description: The document text content to analyze
 *                 example: "Invoice from Acme Corp. Total amount: $125.00, Due date: 2023-08-15"
 *               existingTags:
 *                 type: array
 *                 description: List of existing tags in the system to help with tag matching
 *                 items:
 *                   type: string
 *                 example: ["Invoice", "Finance", "Acme Corp"]
 *               id:
 *                 type: string
 *                 description: Optional document ID for tracking metrics
 *                 example: "doc_123"
 *     responses:
 *       200:
 *         description: Document analysis results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 correspondent:
 *                   type: string
 *                   description: Detected correspondent name
 *                   example: "Acme Corp"
 *                 title:
 *                   type: string
 *                   description: Suggested document title
 *                   example: "Acme Corp Invoice - August 2023"
 *                 tags:
 *                   type: array
 *                   description: Suggested tags for the document
 *                   items:
 *                     type: string
 *                   example: ["Invoice", "Finance"]
 *                 documentType:
 *                   type: string
 *                   description: Detected document type
 *                   example: "Invoice"
 *                 metrics:
 *                   type: object
 *                   description: Token usage metrics (when using OpenAI)
 *                   properties:
 *                     promptTokens:
 *                       type: number
 *                       example: 350
 *                     completionTokens:
 *                       type: number
 *                       example: 120
 *                     totalTokens:
 *                       type: number
 *                       example: 470
 *       400:
 *         description: Invalid request parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error or AI provider not configured
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/manual/analyze', express.json(), async (req: Req, res: Res) => {
  try {
    const { content, existingTags, id } = req.body;
    let existingCorrespondentList = await paperlessService.listCorrespondentsNames();
    existingCorrespondentList = existingCorrespondentList.map((correspondent: NamedItem) => correspondent.name);
    let existingTagsList = await paperlessService.listTagNames();
    existingTagsList = existingTagsList.map((tags: NamedItem) => tags.name);
    let existingDocumentTypes = await paperlessService.listDocumentTypesNames();
    let existingDocumentTypesList = existingDocumentTypes.map((docType: NamedItem) => docType.name);
    
    if (!content || typeof content !== 'string') {
      console.log('Invalid content received:', content);
      return res.status(400).json({ error: 'Valid content string is required' });
    }

    const aiService = AIServiceFactory.getService();
    if (!aiService || typeof aiService.analyzeDocument !== 'function') {
      return res.status(500).json({ error: 'AI provider not configured' });
    }

    const analyzeDocument = await aiService.analyzeDocument(content, existingTagsList, existingCorrespondentList, existingDocumentTypesList, id || []);

    // Persist token metrics when the active provider reports them (OpenAI/OpenRouter compatible).
    if (id && analyzeDocument && analyzeDocument.metrics) {
      try {
        await documentModel.addOpenAIMetrics(
          id,
          analyzeDocument.metrics.promptTokens,
          analyzeDocument.metrics.completionTokens,
          analyzeDocument.metrics.totalTokens
        );
      } catch (metricsError) {
        console.warn('Could not persist token metrics:', errorMessage(metricsError));
      }
    }

    return res.json(analyzeDocument);
  } catch (error) {
    console.error('Analysis error:', error);
    return res.status(500).json({ error: errorMessage(error) });
  }
});

router.post('/manual/playground', protectApiRoute, retiredApiRoute('Playground mode has been removed from Tagvico AI.'));

/**
 * @swagger
 * /manual/updateDocument:
 *   post:
 *     summary: Update document metadata in Paperless-ngx
 *     description: |
 *       Updates document metadata such as tags, correspondent and title in the Paperless-ngx system.
 *       This endpoint handles the translation between tag names and IDs, and manages the creation of
 *       new tags or correspondents if they don't exist in the system.
 *       
 *       The endpoint also removes any unused tags from the document to keep the metadata clean.
 *     tags:
 *       - Documents
 *       - API
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - documentId
 *             properties:
 *               documentId:
 *                 type: number
 *                 description: ID of the document to update in Paperless-ngx
 *                 example: 123
 *               tags:
 *                 type: array
 *                 description: List of tags to apply (can be tag IDs or names)
 *                 items:
 *                   oneOf:
 *                     - type: number
 *                     - type: string
 *                 example: ["Invoice", 42, "Finance"]
 *               correspondent:
 *                 type: string
 *                 description: Correspondent name to assign to the document
 *                 example: "Acme Corp"
 *               title:
 *                 type: string
 *                 description: New title for the document
 *                 example: "Acme Corp Invoice - August 2023"
 *     responses:
 *       200:
 *         description: Document successfully updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Document updated successfully"
 *       400:
 *         description: Invalid request parameters or tag processing errors
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["Failed to create tag: Invalid tag name"]
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/manual/updateDocument', express.json(), async (req: Req, res: Res) => {
  try {
    const { documentId, correspondent, title, documentType, ownerId } = req.body;
    let tags: Array<string | number> = Array.isArray(req.body.tags) ? req.body.tags as Array<string | number> : [];
    console.log("TITLE: ", title);
    // Convert all tags to names if they are IDs
    tags = await Promise.all(tags.map(async (tag: string | number) => {
      console.log('Processing tag:', tag);
      if (!isNaN(Number(tag))) {
        const tagName = await paperlessService.getTagTextFromId(Number(tag));
        console.log('Converted tag ID:', tag, 'to name:', tagName);
        return tagName;
      }
      return tag;
    }));

    // Filter out any null or undefined tags
    tags = tags.filter((tag: string | number) => tag != null);

    // Process new tags to get their IDs
    const { tagIds, errors } = await paperlessService.processTags(tags);
    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    // Process correspondent if provided
    const correspondentData = correspondent ? await paperlessService.getOrCreateCorrespondent(correspondent) : null;
    const documentTypeData = documentType ? await paperlessService.getOrCreateDocumentType(documentType) : null;


    await paperlessService.removeUnusedTagsFromDocument(documentId, tagIds);
    
    // Then update with new tags (this will only add new ones since we already removed unused ones)
    const updateData = {
      tags: tagIds,
      correspondent: correspondentData ? correspondentData.id : null,
      title: title ? title : null,
      document_type: documentTypeData ? documentTypeData.id : null,
      owner: ownerId ? Number(ownerId) : null
    };

    if(updateData.tags === null && updateData.correspondent === null && updateData.title === null) {
      return res.status(400).json({ error: 'No changes provided' });
    }
    const updateDocument = await paperlessService.updateDocument(documentId, updateData);
    
    // Mark document as processed
    await documentModel.addProcessedDocument(documentId, updateData.title);

    res.json(updateDocument);
  } catch (error) {
    console.error('Update error:', error);
    res.status(500).json({ error: errorMessage(error) });
  }
});

/**
 * @swagger
 * /health:
 *   get:
 *     summary: System health check endpoint
 *     description: |
 *       Provides information about the current system health status.
 *       This endpoint checks database connectivity and returns system operational status.
 *       Used for monitoring and automated health checks.
 *     tags: 
 *       - System
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
 *                   description: Health status of the system
 *                   example: "healthy"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   description: Status indicating an error
 *                   example: "error"
 *                 message:
 *                   type: string
 *                   description: Error message details
 *                   example: "Internal server error"
 *       503:
 *         description: Service unavailable
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   description: Status indicating database error
 *                   example: "database_error"
 *                 message:
 *                   type: string
 *                   description: Details about the service unavailability
 *                   example: "Database check failed"
 */
router.get('/health', async (req: Req, res: Res) => {
  try {
    // const isConfigured = await setupService.isConfigured();
    // if (!isConfigured) {
    //   return res.status(503).json({ 
    //     status: 'not_configured',
    //     message: 'Application setup not completed'
    //   });
    // }
    try {
      await documentModel.isDocumentProcessed(1);
    } catch (error) {
      return res.status(503).json({ 
        status: 'database_error',
        message: 'Database check failed'
      });
    }

    res.json({ status: 'healthy' });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({ 
      status: 'error', 
      message: errorMessage(error)
    });
  }
});

router.get('/api/health', async (req: Req, res: Res) => {
  const started = Date.now();
  try {
    await documentModel.isDocumentProcessed(1);
    const provider = AIServiceFactory.getService();
    const providerResult = typeof provider.healthcheck === 'function'
      ? await Promise.race([provider.healthcheck(), new Promise((resolve) => setTimeout(() => resolve({ ok: false, error: 'Provider healthcheck timed out' }), 5000))])
      : { ok: null, error: 'Provider does not expose a healthcheck' };
    const status = providerResult.ok === false ? 'degraded' : 'healthy';
    res.status(status === 'healthy' ? 200 : 503).json({ status, database: { ok: true }, provider: providerResult, latencyMs: Date.now() - started });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', database: { ok: false }, error: errorMessage(error), latencyMs: Date.now() - started });
  }
});

/**
 * @swagger
 * /setup:
 *   post:
 *     summary: Submit initial application setup configuration
 *     description: |
 *       Configures the initial setup of the Tagvico AI application, including connections
 *       to Paperless-ngx, AI provider settings, processing parameters, and user authentication.
 *       
 *       This endpoint is primarily used during the first-time setup of the application and
 *       creates the necessary configuration files and database tables.
 *     tags:
 *       - System
 *       - Setup
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - paperlessUrl
 *               - paperlessToken
 *               - aiProvider
 *               - username
 *               - password
 *             properties:
 *               paperlessUrl:
 *                 type: string
 *                 description: URL of the Paperless-ngx instance
 *                 example: "https://paperless.example.com"
 *               paperlessToken:
 *                 type: string
 *                 description: API token for Paperless-ngx access
 *                 example: "abc123def456"
 *               paperlessUsername:
 *                 type: string
 *                 description: Username for Paperless-ngx (alternative to token authentication)
 *                 example: "admin"
 *               aiProvider:
 *                 type: string
 *                 description: Selected AI provider for document analysis
 *                 enum: ["openai", "ollama", "custom", "azure"]
 *                 example: "openai"
 *               openaiKey:
 *                 type: string
 *                 description: API key for OpenAI (required when aiProvider is 'openai')
 *                 example: "sk-abc123def456"
 *               openaiModel:
 *                 type: string
 *                 description: OpenAI model to use for analysis
 *                 example: "gpt-4"
 *               ollamaUrl:
 *                 type: string
 *                 description: URL for Ollama API (required when aiProvider is 'ollama')
 *                 example: "http://localhost:11434"
 *               ollamaModel:
 *                 type: string
 *                 description: Ollama model to use for analysis
 *                 example: "llama2"
 *               customApiKey:
 *                 type: string
 *                 description: API key for custom LLM provider
 *                 example: "api-key-123"
 *               customBaseUrl:
 *                 type: string
 *                 description: Base URL for custom LLM provider
 *                 example: "https://api.customllm.com"
 *               customModel:
 *                 type: string
 *                 description: Model name for custom LLM provider
 *                 example: "custom-model"
 *               scanInterval:
 *                 type: number
 *                 description: Interval in minutes for scanning new documents
 *                 example: 15
 *               systemPrompt:
 *                 type: string
 *                 description: Custom system prompt for document analysis
 *                 example: "Extract key information from the following document..."
 *               showTags:
 *                 type: boolean
 *                 description: Whether to show tags in the UI
 *                 example: true
 *               tags:
 *                 type: string
 *                 description: Comma-separated list of tags to use for filtering
 *                 example: "Invoice,Receipt,Contract"
 *               aiProcessedTag:
 *                 type: boolean
 *                 description: Whether to add a tag for AI-processed documents
 *                 example: true
 *               aiTagName:
 *                 type: string
 *                 description: Tag name to use for AI-processed documents
 *                 example: "AI-Processed"
 *               usePromptTags:
 *                 type: boolean
 *                 description: Whether to use tags in prompts
 *                 example: true
 *               promptTags:
 *                 type: string
 *                 description: Comma-separated list of tags to use in prompts
 *                 example: "Invoice,Receipt"
 *               username:
 *                 type: string
 *                 description: Admin username for Tagvico AI
 *                 example: "admin"
 *               password:
 *                 type: string
 *                 description: Admin password for Tagvico AI
 *                 example: "securepassword"
 *               useExistingData:
 *                 type: boolean
 *                 description: Whether to use existing data from a previous setup
 *                 example: false
 *               activateTagging:
 *                 type: boolean
 *                 description: Enable AI-based tag suggestions
 *                 example: true
 *               activateCorrespondents:
 *                 type: boolean
 *                 description: Enable AI-based correspondent suggestions
 *                 example: true
 *               activateDocumentType:
 *                 type: boolean
 *                 description: Enable AI-based document type suggestions
 *                 example: true
 *               activateTitle:
 *                 type: boolean
 *                 description: Enable AI-based title suggestions
 *                 example: true
 *               activateCustomFields:
 *                 type: boolean
 *                 description: Enable AI-based custom field extraction
 *                 example: false
 *     responses:
 *       200:
 *         description: Setup completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: ["success"]
 *                   example: "success"
 *                 message:
 *                   type: string
 *                   example: "Configuration saved successfully"
 *       400:
 *         description: Invalid configuration parameters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: ["error"]
 *                   example: "error"
 *                 message:
 *                   type: string
 *                   example: "Missing required configuration parameters"
 *       500:
 *         description: Server error during setup
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: ["error"]
 *                   example: "error"
 *                 message:
 *                   type: string
 *                   example: "Failed to save configuration: Database error"
 */
router.post('/setup', express.json(), async (req: Req, res: Res) => {
  try {
    const { 
      paperlessUrl, 
      paperlessToken,
      paperlessUsername,
      aiProvider,
      openaiKey,
      openaiModel,
      ollamaUrl,
      ollamaModel,
      scanInterval,
      systemPrompt,
      showTags,
      tokenLimit,
      responseTokens,
      tags,
      aiProcessedTag,
      aiTagName,
      usePromptTags,
      promptTags,
      username,
      password,
      useExistingData,
      customApiKey,
      customBaseUrl,
      customModel,
      activateTagging,
      activateCorrespondents,
      activateDocumentType,
      activateTitle,
      activateCustomFields,
      customFields,
      disableAutomaticProcessing,
      azureEndpoint,
      azureApiKey,
      azureDeploymentName,
      azureApiVersion
    } = req.body;

    // Log setup request with sensitive data redacted
    const sensitiveKeys = ['paperlessToken', 'openaiKey', 'customApiKey', 'password', 'confirmPassword'];
    const redactedBody = Object.fromEntries(
      Object.entries(req.body).map(([key, value]) => [
      key,
      sensitiveKeys.includes(key) ? '******' : value
      ])
    );
    console.log('Setup request received:', redactedBody);


    // Initialize paperlessService with the new credentials
    const paperlessApiUrl = paperlessUrl + '/api';
    const initSuccess = await paperlessService.initializeWithCredentials(paperlessApiUrl, paperlessToken);
    
    if (!initSuccess) {
      return res.status(400).json({ 
        error: 'Failed to initialize connection to Paperless-ngx. Please check URL and Token.'
      });
    }

    // Validate Paperless credentials
    const isPaperlessValid = await setupService.validatePaperlessConfig(paperlessUrl, paperlessToken);
    if (!isPaperlessValid) {
      return res.status(400).json({ 
        error: 'Paperless-ngx connection failed. Please check URL and Token.'
      });
    }

    const isPermissionValid = await setupService.validateApiPermissions(paperlessUrl, paperlessToken);
    if (!isPermissionValid.success) {
      return res.status(400).json({
        error: 'Paperless-ngx API permissions are insufficient. Error: ' + isPermissionValid.message
      });
    }

    // Process custom fields if enabled
    let processedCustomFields = [];
    if (customFields && activateCustomFields) {
      try {
        const parsedFields = typeof customFields === 'string' 
          ? JSON.parse(customFields) 
          : customFields;
        
        for (const field of parsedFields.custom_fields) {
          try {
            const createdField = await paperlessService.createCustomFieldSafely(
              field.value,
              field.data_type,
              field.currency
            );
            
            if (createdField) {
              processedCustomFields.push({
                value: field.value,
                data_type: field.data_type,
                ...(field.currency && { currency: field.currency })
              });
              console.log(`[SUCCESS] Created/found custom field: ${field.value}`);
            }
          } catch (fieldError) {
            console.error(`[WARNING] Error creating custom field ${field.value}:`, fieldError);
          }
        }
      } catch (error) {
        console.error('[ERROR] Error processing custom fields:', error);
      }
    }

    const providerConfig = normalizeProviderPayload(req.body);

    if (providerConfig.provider === 'openrouter') {
      const isValid = await setupService.validateOpenRouterConfig(
        providerConfig.openrouterApiKey,
        providerConfig.selectedModel
      );
      if (!isValid) {
        return res.status(400).json({
          error: 'OpenRouter connection failed. Please check the API key and selected model.'
        });
      }
    } else if (providerConfig.provider === 'openai') {
      const isValid = await setupService.validateOpenAIConfig(providerConfig.openaiApiKey);
      if (!isValid) {
        return res.status(400).json({
          error: 'OpenAI API key is not valid. Please check the key.'
        });
      }
    } else if (providerConfig.provider === 'ollama') {
      const isValid = await setupService.validateOllamaConfig(providerConfig.ollamaUrl, providerConfig.selectedModel);
      if (!isValid) {
        return res.status(400).json({
          error: 'Ollama connection failed. Please check URL and model.'
        });
      }
    } else if (providerConfig.provider === 'compatible') {
      const isValid = await setupService.validateCustomConfig(
        providerConfig.compatibleBaseUrl,
        providerConfig.compatibleApiKey,
        providerConfig.selectedModel
      );
      if (!isValid) {
        return res.status(400).json({
          error: 'OpenAI-compatible connection failed. Please check base URL, key, and model.'
        });
      }
    } else if (providerConfig.provider === 'azure') {
      const isValid = await setupService.validateAzureConfig(
        azureApiKey,
        azureEndpoint,
        azureDeploymentName,
        azureApiVersion
      );
      if (!isValid) {
        return res.status(400).json({
          error: 'Azure connection failed. Please check URL, API key, deployment name, and API version.'
        });
      }
    }

    const config = buildConfigForSave(req.body, {
      processedCustomFields
    });

    // Save configuration
    await setupService.saveConfig(config);
    resetRuntimeServices();
    const tagProvisioning = await provisionControlledTags();
    onboardingService.writeOnboardingSnapshot(config);

    // Persist dry-run review flag alongside the main config so the review
    // queue picks it up on the next request without restarting the process.
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'dry_run')) {
      reviewService.writeReviewConfig({ DRY_RUN: req.body.dry_run ? 'true' : 'false' });
    } else {
      // Make sure the on-disk default exists so /review can read it.
      reviewService.writeReviewConfig({});
    }

    const hashedPassword = await bcrypt.hash(password, 15);
    await documentModel.addUser(username, hashedPassword);

    res.json({ 
      success: true,
      message: 'Configuration saved successfully.',
      restart: false,
      tagProvisioning
    });

  } catch (error) {
    console.error('[ERROR] Setup error:', error);
    res.status(500).json({ 
      error: 'An error occurred: ' + errorMessage(error)
    });
  }
});

/**
 * @swagger
 * /settings:
 *   post:
 *     summary: Update application settings
 *     description: |
 *       Updates the configuration settings of the Tagvico AI application after initial setup.
 *       This endpoint allows administrators to modify connections to Paperless-ngx, 
 *       AI provider settings, processing parameters, and feature toggles.
 *       
 *       Changes made through this endpoint are applied immediately and affect all future
 *       document processing operations.
 *     tags:
 *       - System
 *       - Setup
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               paperlessUrl:
 *                 type: string
 *                 description: URL of the Paperless-ngx instance
 *                 example: "https://paperless.example.com"
 *               paperlessToken:
 *                 type: string
 *                 description: API token for Paperless-ngx access
 *                 example: "abc123def456"
 *               paperlessUsername:
 *                 type: string
 *                 description: Username for Paperless-ngx (alternative to token authentication)
 *                 example: "admin"
 *               aiProvider:
 *                 type: string
 *                 description: Selected AI provider for document analysis
 *                 enum: ["openai", "ollama", "custom", "azure"]
 *                 example: "openai"
 *               openaiKey:
 *                 type: string
 *                 description: API key for OpenAI (required when aiProvider is 'openai')
 *                 example: "sk-abc123def456"
 *               openaiModel:
 *                 type: string
 *                 description: OpenAI model to use for analysis
 *                 example: "gpt-4"
 *               ollamaUrl:
 *                 type: string
 *                 description: URL for Ollama API (required when aiProvider is 'ollama')
 *                 example: "http://localhost:11434"
 *               ollamaModel:
 *                 type: string
 *                 description: Ollama model to use for analysis
 *                 example: "llama2"
 *               customApiKey:
 *                 type: string
 *                 description: API key for custom LLM provider
 *                 example: "api-key-123"
 *               customBaseUrl:
 *                 type: string
 *                 description: Base URL for custom LLM provider
 *                 example: "https://api.customllm.com"
 *               customModel:
 *                 type: string
 *                 description: Model name for custom LLM provider
 *                 example: "custom-model"
 *               scanInterval:
 *                 type: number
 *                 description: Interval in minutes for scanning new documents
 *                 example: 15
 *               systemPrompt:
 *                 type: string
 *                 description: Custom system prompt for document analysis
 *                 example: "Extract key information from the following document..."
 *               showTags:
 *                 type: boolean
 *                 description: Whether to show tags in the UI
 *                 example: true
 *               tokenLimit:
 *                 type: integer
 *                 description: The maximum number of tokens th AI can handle
 *                 example: 128000
 *               responseTokens:
 *                 type: integer
 *                 description: The approx. amount of tokens required for the response
 *                 example: 1000
 *               tags:
 *                 type: string
 *                 description: Comma-separated list of tags to use for filtering
 *                 example: "Invoice,Receipt,Contract"
 *               aiProcessedTag:
 *                 type: boolean
 *                 description: Whether to add a tag for AI-processed documents
 *                 example: true
 *               aiTagName:
 *                 type: string
 *                 description: Tag name to use for AI-processed documents
 *                 example: "AI-Processed"
 *               usePromptTags:
 *                 type: boolean
 *                 description: Whether to use tags in prompts
 *                 example: true
 *               promptTags:
 *                 type: string
 *                 description: Comma-separated list of tags to use in prompts
 *                 example: "Invoice,Receipt"
 *               useExistingData:
 *                 type: boolean
 *                 description: Whether to use existing data from a previous setup
 *                 example: false
 *               activateTagging:
 *                 type: boolean
 *                 description: Enable AI-based tag suggestions
 *                 example: true
 *               activateCorrespondents:
 *                 type: boolean
 *                 description: Enable AI-based correspondent suggestions
 *                 example: true
 *               activateDocumentType:
 *                 type: boolean
 *                 description: Enable AI-based document type suggestions
 *                 example: true
 *               activateTitle:
 *                 type: boolean
 *                 description: Enable AI-based title suggestions
 *                 example: true
 *               activateCustomFields:
 *                 type: boolean
 *                 description: Enable AI-based custom field extraction
 *                 example: false
 *               customFields:
 *                 type: string
 *                 description: JSON string defining custom fields to extract
 *                 example: '{"invoice_number":{"type":"string"},"total_amount":{"type":"number"}}'
 *               disableAutomaticProcessing:
 *                 type: boolean
 *                 description: Disable automatic document processing
 *                 example: false
 *     responses:
 *       200:
 *         description: Settings updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: ["success"]
 *                   example: "success"
 *                 message:
 *                   type: string
 *                   example: "Settings updated successfully"
 *       400:
 *         description: Invalid configuration parameters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: ["error"]
 *                   example: "error"
 *                 message:
 *                   type: string
 *                   example: "Invalid settings: AI provider required when automatic processing is enabled"
 *       500:
 *         description: Server error while updating settings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: ["error"]
 *                   example: "error"
 *                 message:
 *                   type: string
 *                   example: "Failed to update settings: Database error"
 */
router.post('/settings', express.json(), async (req: Req, res: Res) => {
  try {
    const { 
      paperlessUrl, 
      paperlessToken,
      aiProvider,
      openaiKey,
      openaiModel,
      ollamaUrl,
      ollamaModel,
      scanInterval,
      systemPrompt,
      showTags,
      tokenLimit,
      responseTokens,
      tags,
      aiProcessedTag,
      aiTagName,
      usePromptTags,
      promptTags,
      paperlessUsername,
      useExistingData,
      customApiKey,
      customBaseUrl,
      customModel,
      activateTagging,
      activateCorrespondents,
      activateDocumentType,
      activateTitle,
      activateCustomFields,
      customFields,  // Added parameter
      disableAutomaticProcessing,
      azureEndpoint,
      azureApiKey,
      azureDeploymentName,
      azureApiVersion
    } = req.body;
    const currentConfig: Record<string, string | undefined> = {
      ...process.env,
      PAPERLESS_API_URL: process.env.PAPERLESS_API_URL || '',
      PAPERLESS_API_TOKEN: process.env.PAPERLESS_API_TOKEN || '',
      PAPERLESS_USERNAME: process.env.PAPERLESS_USERNAME || ''
    };

    // Process custom fields
    let processedCustomFields: Array<{ value: string; data_type: string; currency?: string }> = [];
    if (customFields) {
      try {
        const parsedFields = typeof customFields === 'string' 
          ? JSON.parse(customFields) 
          : customFields;
        
        processedCustomFields = parsedFields.custom_fields.map((field: { value: string; data_type: string; currency?: string }) => ({
          value: field.value,
          data_type: field.data_type,
          ...(field.currency && { currency: field.currency })
        }));
      } catch (error) {
        console.error('Error processing custom fields:', error);
        processedCustomFields = [];
      }
    }

    try {
      for (const field of processedCustomFields) {
        await paperlessService.createCustomFieldSafely(field.value, field.data_type, field.currency);
      }
    } catch (error) {
      console.log('[ERROR] Error creating custom fields:', error);
    }

    if (paperlessUrl !== currentConfig.PAPERLESS_API_URL?.replace('/api', '') || 
        paperlessToken !== currentConfig.PAPERLESS_API_TOKEN) {
      const isPaperlessValid = await setupService.validatePaperlessConfig(paperlessUrl, paperlessToken);
      if (!isPaperlessValid) {
        return res.status(400).json({ 
          error: 'Paperless-ngx connection failed. Please check URL and Token.'
        });
      }
    }

    const providerConfig = normalizeProviderPayload(req.body);

    if (providerConfig.provider === 'openrouter') {
      const isValid = await setupService.validateOpenRouterConfig(
        providerConfig.openrouterApiKey,
        providerConfig.selectedModel
      );
      if (!isValid) {
        return res.status(400).json({
          error: 'OpenRouter connection failed. Please check the API key and selected model.'
        });
      }
    } else if (providerConfig.provider === 'openai' && providerConfig.openaiApiKey) {
      const isValid = await setupService.validateOpenAIConfig(providerConfig.openaiApiKey);
      if (!isValid) {
        return res.status(400).json({
          error: 'OpenAI API key is not valid. Please check the key.'
        });
      }
    } else if (providerConfig.provider === 'ollama') {
      const isValid = await setupService.validateOllamaConfig(
        providerConfig.ollamaUrl || currentConfig.OLLAMA_API_URL,
        providerConfig.selectedModel || currentConfig.OLLAMA_MODEL
      );
      if (!isValid) {
        return res.status(400).json({
          error: 'Ollama connection failed. Please check URL and model.'
        });
      }
    } else if (providerConfig.provider === 'compatible') {
      const isValid = await setupService.validateCustomConfig(
        providerConfig.compatibleBaseUrl || currentConfig.COMPATIBLE_BASE_URL || currentConfig.CUSTOM_BASE_URL,
        providerConfig.compatibleApiKey || currentConfig.COMPATIBLE_API_KEY || currentConfig.CUSTOM_API_KEY,
        providerConfig.selectedModel || currentConfig.COMPATIBLE_MODEL || currentConfig.CUSTOM_MODEL
      );
      if (!isValid) {
        return res.status(400).json({
          error: 'OpenAI-compatible connection failed. Please check base URL, key, and model.'
        });
      }
    } else if (providerConfig.provider === 'azure') {
      const isValid = await setupService.validateAzureConfig(
        azureApiKey || currentConfig.AZURE_API_KEY,
        azureEndpoint || currentConfig.AZURE_ENDPOINT,
        azureDeploymentName || currentConfig.AZURE_DEPLOYMENT_NAME,
        azureApiVersion || currentConfig.AZURE_API_VERSION
      );
      if (!isValid) {
        return res.status(400).json({
          error: 'Azure connection failed. Please check URL, API key, deployment name, and API version.'
        });
      }
    }

    const mergedConfig = buildConfigForSave(req.body, {
      currentConfig,
      processedCustomFields,
      apiToken: process.env.API_KEY
    });

    await setupService.saveConfig(mergedConfig);
    resetRuntimeServices();
    const tagProvisioning = await provisionControlledTags();
    onboardingService.writeOnboardingSnapshot(mergedConfig);
    try {
      for (const field of processedCustomFields) {
        await paperlessService.createCustomFieldSafely(field.value, field.data_type, field.currency);
      }
    } catch (error) {
      console.log('[ERROR] Error creating custom fields:', error);
    }

    res.json({ 
      success: true,
      message: 'Configuration saved successfully.',
      restart: false,
      tagProvisioning
    });

  } catch (error) {
    console.error('Settings update error:', error);
    res.status(500).json({ 
      error: 'An error occurred: ' + errorMessage(error)
    });
  }
});

/**
 * @swagger
 * /api/processing-status:
 *   get:
 *     summary: Get document processing status
 *     description: |
 *       Returns the current status of document processing operations.
 *       This endpoint provides information about documents in the processing queue
 *       and the current processing state (active/idle).
 *       
 *       The status information can be used by UIs to display progress indicators
 *       and provide real-time feedback about background processing operations.
 *     tags:
 *       - Documents
 *       - System
 *       - API
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Processing status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isProcessing:
 *                   type: boolean
 *                   description: Whether documents are currently being processed
 *                   example: true
 *                 queueLength:
 *                   type: integer
 *                   description: Number of documents waiting in the processing queue
 *                   example: 5
 *                 currentDocument:
 *                   type: object
 *                   description: Details about the document currently being processed (if any)
 *                   properties:
 *                     id:
 *                       type: integer
 *                       description: Document ID
 *                       example: 123
 *                     title:
 *                       type: string
 *                       description: Document title
 *                       example: "Invoice #12345"
 *                     status:
 *                       type: string
 *                       description: Current processing status
 *                       example: "processing"
 *       401:
 *         description: Unauthorized - authentication required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Authentication required"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Failed to fetch processing status"
 */
router.get('/api/processing-status', async (req: Req, res: Res) => {
  try {
      const status = await documentModel.getCurrentProcessingStatus();
      res.json(status);
  } catch (error) {
      res.status(500).json({ error: 'Failed to fetch processing status' });
  }
});

router.get('/operations', async (req: Req, res: Res) => {
  res.render('operations', {
    version: configFile.TAGVICO_AI_VERSION,
    ocrEnabled: ocrService.isEnabled(),
    ocrProvider: config.ocr?.provider || 'mistral'
  });
});

router.get('/api/rag-test', protectApiRoute, retiredApiRoute('RAG features have been removed from Tagvico AI.'));

router.get('/dashboard/doc/:id', async (req: Req, res: Res) => {
  const docId = req.params.id;
  if (!docId) {
    return res.status(400).json({ error: 'Document ID is required' });
  }
  try {
    // Redirect to paperless-ngx and show detail page of the document (for example https://paperless.example.com/documents/887/details)
    const paperlessUrl = process.env.PAPERLESS_API_URL;
    const paperlessUrlWithoutApi = (paperlessUrl || '').replace('/api', '');
    const redirectUrl = `${paperlessUrlWithoutApi}/documents/${docId}/details`;
    console.log('Redirecting to Paperless-ngx URL:', redirectUrl);
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

router.post('/api/scan/stop', async (req: Req, res: Res) => {
  const control = (global as typeof global & { __tagvicoScanControl?: { running: boolean; stopRequested: boolean } }).__tagvicoScanControl;
  if (!control?.running) return res.status(409).json({ error: 'No scan is running' });
  control.stopRequested = true;
  res.json({ success: true, message: 'The scan will stop before the next document' });
});

router.get('/api/ocr/queue', async (req: Req, res: Res) => {
  const page = await documentModel.getOcrQueuePage({
    search: String(req.query.search || ''),
    status: String(req.query.status || ''),
    limit: Number(req.query.limit || 20),
    offset: Number(req.query.offset || 0)
  });
  res.json(page);
});

router.post('/api/ocr/queue', express.json(), async (req: Req, res: Res) => {
  const documentId = Number(req.body?.documentId);
  if (!Number.isInteger(documentId) || documentId <= 0) return res.status(400).json({ error: 'A valid documentId is required' });
  const document = await paperlessService.getDocument(documentId);
  await documentModel.addToOcrQueue(documentId, document?.title, 'manual');
  res.status(201).json({ success: true });
});

router.delete('/api/ocr/queue/:id', async (req: Req, res: Res) => {
  const removed = await documentModel.removeFromOcrQueue(Number(req.params.id));
  res.status(removed ? 200 : 409).json({ success: removed });
});

router.post('/api/ocr/process/:id', async (req: Req, res: Res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  const send = (step: string, message: string, data: UnknownRecord = {}) => res.write(`data: ${JSON.stringify({ step, message, ...data })}\n\n`);
  try {
    await ocrService.process(Number(req.params.id), send);
  } catch (error) {
    send('error', errorMessage(error));
  } finally {
    res.end();
  }
});

router.get('/api/failures', async (req: Req, res: Res) => {
  const page = await documentModel.getFailedDocumentsPage({
    search: String(req.query.search || ''),
    limit: Number(req.query.limit || 20),
    offset: Number(req.query.offset || 0)
  });
  res.json(page);
});

router.post('/api/failures/:id/reset', async (req: Req, res: Res) => {
  const success = await documentModel.resetFailedDocument(Number(req.params.id));
  res.status(success ? 200 : 404).json({ success });
});

router.post('/api/history/:id/rescan', async (req: Req, res: Res) => {
  const documentId = Number(req.params.id);
  if (!Number.isInteger(documentId) || documentId <= 0) return res.status(400).json({ error: 'Invalid document ID' });
  await documentModel.resetForRescan(documentId);
  res.json({ success: true, message: 'Document queued for the next scan' });
});

router.post('/api/history/:id/restore', async (req: Req, res: Res) => {
  const documentId = Number(req.params.id);
  const original = await documentModel.getOriginalData(documentId);
  if (!original) return res.status(404).json({ error: 'No original snapshot is available' });
  let snapshot: Record<string, unknown>;
  try { snapshot = JSON.parse(original.snapshot_json || '{}'); } catch { snapshot = {}; }
  const update: Record<string, unknown> = {
    title: snapshot.title ?? original.title,
    tags: snapshot.tags ?? JSON.parse(original.tags || '[]'),
    correspondent: snapshot.correspondent ?? original.correspondent,
    document_type: snapshot.document_type ?? original.document_type,
    created: snapshot.created ?? original.document_date,
    language: snapshot.language ?? original.language,
    custom_fields: snapshot.custom_fields ?? JSON.parse(original.custom_fields || '[]'),
    owner: snapshot.owner ?? original.owner
  };
  Object.keys(update).forEach((key) => update[key] === undefined && delete update[key]);
  const restored = await paperlessService.updateDocument(documentId, update);
  if (!restored) return res.status(502).json({ error: 'Paperless-ngx rejected the restore' });
  await documentModel.addToHistory(documentId, update.tags || [], update.title, String(update.correspondent || ''));
  res.json({ success: true });
});

router.get('/api/codex/status', allowDuringSetup, async (req: Req, res: Res) => {
  try {
    const account = await codexAuthService.account();
    res.json({ ...(await codexService.getStatus()), account: account.account || null });
  } catch { res.json(await codexService.getStatus()); }
});

router.post('/api/codex/login', allowDuringSetup, express.json(), async (req: Req, res: Res) => {
  try { res.json(await codexAuthService.login(req.body?.type === 'chatgpt' ? 'chatgpt' : 'chatgptDeviceCode')); }
  catch (error) { res.status(502).json({ error: errorMessage(error) }); }
});

router.get('/api/codex/login/:loginId', allowDuringSetup, (req: Req, res: Res) => {
  const status = codexAuthService.loginStatus(req.params.loginId);
  if (!status) return res.status(404).json({ error: 'Login flow not found or expired' });
  res.json(status);
});

router.post('/api/codex/login/:loginId/cancel', allowDuringSetup, async (req: Req, res: Res) => {
  try { res.json(await codexAuthService.cancel(req.params.loginId)); }
  catch (error) { res.status(502).json({ error: errorMessage(error) }); }
});

router.post('/api/codex/logout', allowDuringSetup, async (req: Req, res: Res) => {
  try { await codexAuthService.logout(); res.json({ success: true }); }
  catch (error) { res.status(502).json({ error: errorMessage(error) }); }
});

router.post('/api/settings/clear-tag-cache', async (req: Req, res: Res) => {
  paperlessService.clearTagCache();
  res.json({ success: true });
});

router.get('/api/tag-groups', async (req: Req, res: Res) => {
  const policy = tagGroupService.getConfig();
  res.json({ ...policy, presets: tagGroupService.PRESETS });
});

router.post('/api/tag-groups', express.json(), async (req: Req, res: Res) => {
  try {
    const groups = tagGroupService.parseGroups(req.body.groups);
  const maximum = Math.min(10, Math.max(1, parseInt(String(req.body.maximum || '3'), 10) || 3));
    await setupService.saveTagPolicy({
      TAG_GROUPS_JSON: JSON.stringify(groups),
      CONTROLLED_TAGGING_ENABLED: req.body.enabled ? 'yes' : 'no',
      TAG_MAX_PER_DOCUMENT: String(maximum)
    });
    resetRuntimeServices();
    const provisioning = await provisionControlledTags();
    res.json({ success: true, policy: tagGroupService.getConfig(), provisioning });
  } catch (error) {
    res.status(400).json({ success: false, error: errorMessage(error) });
  }
});

router.get('/api/tags/unmanaged', async (req: Req, res: Res) => {
  try {
    const managed = new Set(tagGroupService.getConfig().vocabulary.map(tagGroupService.normalizeTag));
    const tags = (await paperlessService.getTags()).filter((tag: NamedItem) => !managed.has(tagGroupService.normalizeTag(tag.name)));
    res.json({ tags });
  } catch (error) { res.status(502).json({ error: errorMessage(error) }); }
});

router.post('/api/tags/unmanaged/cleanup', express.json(), async (req: Req, res: Res) => {
  const managed = new Set(tagGroupService.getConfig().vocabulary.map(tagGroupService.normalizeTag));
  const results = [];
  for (const id of Array.isArray(req.body.ids) ? req.body.ids : []) {
    try {
      const current = (await paperlessService.getTags()).find((tag: NamedItem & { document_count?: number }) => Number(tag.id) === Number(id));
      if (!current) throw new Error('Tag no longer exists');
      if (managed.has(tagGroupService.normalizeTag(current.name))) throw new Error('Tag is managed');
      if (Number(current.document_count || 0) !== 0) throw new Error('Tag is assigned to documents');
      await paperlessService.deleteUnusedTag(id);
      results.push({ id, ok: true });
    } catch (error) { results.push({ id, ok: false, error: errorMessage(error) }); }
  }
  res.json({ results });
});

router.get('/api/tag-exceptions', async (req: Req, res: Res) => {
  const rows = tagExceptionService.list(String(req.query.status || 'pending'));
  const tagNames = new Map<number, string>((await paperlessService.getTags()).map((tag: NamedItem) => [Number(tag.id), tag.name]));
  const valid = new Set(tagGroupService.getConfig().vocabulary.map(tagGroupService.normalizeTag));
  const enriched = await Promise.all(rows.map(async (row: UnknownRecord) => {
    try {
      const document = await paperlessService.getDocument(row.document_id);
      const currentValidTags = (document.tags || []).map((id: number | { id: number }) => tagNames.get(Number(typeof id === 'object' ? id.id : id))).filter((name: string | undefined): name is string => Boolean(name && valid.has(tagGroupService.normalizeTag(name))));
      return { ...row, document: { id: document.id, title: document.title, tags: document.tags }, currentValidTags };
    } catch { return { ...row, document: null }; }
  }));
  res.json({ exceptions: enriched, groups: tagGroupService.getConfig().groups });
});

router.post('/api/tag-exceptions/:id/reject', (req: Req, res: Res) => {
  const result = tagExceptionService.resolve(Number(req.params.id), 'rejected');
  if (!result.changes) return res.status(409).json({ error: 'Exception is no longer pending' });
  res.json({ success: true });
});

router.post('/api/tag-exceptions/:id/approve', express.json(), async (req: Req, res: Res) => {
  try {
    const exception = tagExceptionService.get(Number(req.params.id));
    if (!exception || exception.status !== 'pending') return res.status(409).json({ error: 'Exception is no longer pending' });
    const policy = tagGroupService.getConfig();
    const group = policy.groups.find((item: { id: string; enabled: boolean; tags: string[] }) => item.id === String(req.body.groupId || ''));
    if (!group) return res.status(400).json({ error: 'A valid destination group is required' });
    if (!group.enabled) return res.status(400).json({ error: 'The destination group must be enabled' });
    group.tags = tagGroupService.cleanTags([...group.tags, exception.suggested_name]);
    await setupService.saveTagPolicy({ TAG_GROUPS_JSON: JSON.stringify(policy.groups) });
    resetRuntimeServices();
    paperlessService.initialize();
    await paperlessService.ensureTagCache();
    const tag = await paperlessService.findExistingTag(exception.suggested_name) || await paperlessService.createTagSafely(exception.suggested_name);
    let applied = false;
    if (tagExceptionService.assignmentCount(exception.document_id) < policy.maximum) {
      const updated = await paperlessService.updateDocument(exception.document_id, { tags: [tag.id] });
      if (!updated) throw new Error('Paperless rejected the document tag update');
      tagExceptionService.recordAssignments(exception.document_id, [exception.suggested_name], [tag.id]);
      applied = true;
    }
    tagExceptionService.resolve(exception.id, 'approved', group.id);
    res.json({ success: true, tag, applied });
  } catch (error) { res.status(500).json({ error: errorMessage(error) }); }
});

router.get('/api/reconciliation/preview', async (req: Req, res: Res) => {
  const documentIds = await reconciliationService.preview();
  res.json({ count: documentIds.length, documentIds });
});

router.post('/api/reconciliation/run', async (req: Req, res: Res) => {
  res.json(await reconciliationService.run());
});

router.post('/api/mfa/setup', async (req: Req, res: Res) => {
  const username = req.user?.username;
  if (!username) return res.status(401).json({ error: 'User authentication is required' });
  const secret = totpService.generateSecret();
  pendingMfaSecrets.set(username, { secret, expiresAt: Date.now() + 10 * 60 * 1000 });
  res.json({ secret, provisioningUri: totpService.provisioningUri(secret, username) });
});

router.post('/api/mfa/verify', express.json(), async (req: Req, res: Res) => {
  const username = req.user?.username;
  const pending = pendingMfaSecrets.get(username);
  if (!pending || pending.expiresAt < Date.now()) return res.status(400).json({ error: 'MFA setup expired' });
  if (!totpService.verify(pending.secret, String(req.body?.otp || ''))) return res.status(400).json({ error: 'Invalid MFA code' });
  await documentModel.setUserMfaSettings(username, true, pending.secret);
  pendingMfaSecrets.delete(username);
  res.json({ success: true });
});

router.post('/api/mfa/disable', express.json(), async (req: Req, res: Res) => {
  const username = req.user?.username;
  const user = await documentModel.getUser(username);
  if (!user || !await bcrypt.compare(String(req.body?.password || ''), user.password)) return res.status(403).json({ error: 'Current password is invalid' });
  await documentModel.setUserMfaSettings(username, false);
  res.json({ success: true });
});

module.exports = router;
