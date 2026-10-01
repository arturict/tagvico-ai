import { z } from 'zod';
import { assertSameOrigin, ApiError, readJsonBody, requireApiUser } from '@/lib/server/auth';
import { workspaceFor } from '@/lib/server/workspace';
import channelSettingsService from '@root/services/channelSettingsService';
import { settingsErrorResponse } from '../../error-response';

export const dynamic = 'force-dynamic';

const channelSchema = z.enum(['telegram', 'discord'], {
  errorMap: () => ({ message: 'Unknown channel.' })
});

const updateSchema = z.object({
  enabled: z.boolean().optional(),
  botToken: z.string().max(400).optional(),
  clearToken: z.boolean().optional(),
  homeChannelId: z.string().max(40).optional(),
  remindersEnabled: z.boolean().optional(),
  allowed: z.array(z.object({
    externalId: z.string().trim().max(40),
    memberId: z.string().trim().max(80)
  }).strict()).max(50).optional()
}).strict();

async function ownerWorkspace() {
  const user = await requireApiUser();
  const workspace = workspaceFor(user);
  if (workspace.role !== 'owner') throw new ApiError(403, 'Only the Tagvico owner can manage channels.');
  return workspace;
}

export async function GET(_request: Request, { params }: { params: Promise<{ channel: string }> }) {
  try {
    const workspace = await ownerWorkspace();
    const channel = channelSchema.parse((await params).channel);
    return Response.json(channelSettingsService.getChannelSettings(channel, workspace.householdId), {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    return settingsErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ channel: string }> }) {
  try {
    await assertSameOrigin(request);
    const workspace = await ownerWorkspace();
    const channel = channelSchema.parse((await params).channel);
    const update = updateSchema.parse(await readJsonBody(request, 64 * 1024));
    return Response.json(
      await channelSettingsService.updateChannelSettings(channel, workspace.householdId, update),
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return settingsErrorResponse(error);
  }
}
