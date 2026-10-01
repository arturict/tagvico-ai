import { z } from 'zod';
import { assertSameOrigin, ApiError, requireApiUser } from '@/lib/server/auth';
import { workspaceFor } from '@/lib/server/workspace';
import channelSettingsService from '@root/services/channelSettingsService';
import { settingsErrorResponse } from '../../../error-response';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ channel: string }> }) {
  try {
    await assertSameOrigin(request);
    const user = await requireApiUser();
    if (workspaceFor(user).role !== 'owner') throw new ApiError(403, 'Only the Tagvico owner can test channels.');
    const channel = z.enum(['telegram', 'discord']).parse((await params).channel);
    return Response.json(await channelSettingsService.testChannel(channel), {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    return settingsErrorResponse(error);
  }
}
