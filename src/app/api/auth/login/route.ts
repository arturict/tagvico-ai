import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { assertSameOrigin, apiError, ApiError, readJsonBody } from '@/lib/server/auth';
import documentModel from '../../../../../models/document';
import jwt from '../../../../../services/jwtCompat';
import authSecret from '../../../../../services/authSecret';
import totpService from '../../../../../services/totpService';
import { clearLoginFailures, loginAllowed, recordLoginFailure } from '@/lib/server/login-throttle';

const DUMMY_PASSWORD_HASH = bcrypt.hashSync('tagvico-invalid-account', 10);

export async function POST(request: Request) {
  try {
    await assertSameOrigin(request);
    const { username, password, otp } = await readJsonBody<Record<string, unknown>>(request);
    if (!username || !password) throw new ApiError(400, 'Username and password are required');
    if (String(username).length > 100 || String(password).length > 1024 || String(otp || '').length > 20) throw new ApiError(400, 'Sign-in fields are too long');
    if (!loginAllowed(username).allowed) throw new ApiError(429, 'Too many failed sign-in attempts. Try again in 15 minutes');
    const user = await documentModel.getUser(String(username));
    const passwordMatches = await bcrypt.compare(String(password), user?.password || DUMMY_PASSWORD_HASH);
    if (!user?.password || !passwordMatches) { recordLoginFailure(username); throw new ApiError(401, 'Invalid credentials'); }
    if (user.mfa_enabled && (!user.mfa_secret || !totpService.verify(user.mfa_secret, String(otp || '')))) { recordLoginFailure(username); throw new ApiError(401, 'A valid six-digit MFA code is required'); }
    clearLoginFailures(username);
    const token = jwt.sign({ id: user.id, username: user.username }, authSecret.getJwtSecret(), { expiresIn: '24h' });
    const response = NextResponse.json({ ok: true });
    response.cookies.set('jwt', token, { httpOnly: true, secure: process.env.COOKIE_SECURE_MODE === 'always' || (process.env.COOKIE_SECURE_MODE !== 'never' && new URL(request.url).protocol === 'https:'), sameSite: 'lax', path: '/', maxAge: 86400 });
    return response;
  } catch (error) { return apiError(error); }
}
