const jwt = require('../services/jwtCompat');
const config = require('../config/config');
const { getJwtSecret } = require('../services/authSecret');

// JWT secret key - should be moved to environment variables
const JWT_SECRET = getJwtSecret();

type AuthRequest = {
  cookies: Record<string, string | undefined>;
  headers: Record<string, string | string[] | undefined>;
  user?: unknown;
};
type AuthResponse = {
  status(code: number): AuthResponse;
  json(body: unknown): unknown;
  redirect(path: string): unknown;
  clearCookie(name: string): void;
};
type Next = () => unknown;

// JWT middleware to verify token
const authenticateJWT = (req: AuthRequest, res: AuthResponse, next: Next) => {
  const authorization = req.headers.authorization;
  const token = req.cookies.jwt || (typeof authorization === 'string' ? authorization.split(' ')[1] : undefined);
  const apiKey = req.headers['x-api-key'];

  if (apiKey && apiKey === process.env.API_KEY) {
    req.user = { apiKey: true };
    return next();
  }

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

const isAuthenticated = (req: AuthRequest, res: AuthResponse, next: Next) => {
  const authorization = req.headers.authorization;
  const token = req.cookies.jwt || (typeof authorization === 'string' ? authorization.split(' ')[1] : undefined);
  const apiKey = req.headers['x-api-key'];

  if (apiKey && apiKey === process.env.API_KEY) {
    req.user = { apiKey: true };
    return next();
  }

  if (!token) {
    return res.redirect('/login');
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.clearCookie('jwt');
    return res.redirect('/login');
  }
};

module.exports = { authenticateJWT, isAuthenticated };
