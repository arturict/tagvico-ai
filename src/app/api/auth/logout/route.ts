import { NextResponse } from 'next/server'; import { assertSameOrigin } from '@/lib/server/auth';
export async function POST(request: Request) { await assertSameOrigin(request); const response = NextResponse.redirect(new URL('/login', request.url), 303); response.cookies.set('jwt', '', { path: '/', maxAge: 0, httpOnly: true, sameSite: 'lax' }); return response; }
