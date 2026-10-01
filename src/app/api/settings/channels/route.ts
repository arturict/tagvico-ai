import { apiError, requireApiUser } from '@/lib/server/auth';
import channelStatusService from '@root/services/channelStatusService';

export const dynamic = 'force-dynamic';

/**
 * Read-only state of the Telegram and Discord bots for the sidebar dots.
 * Any signed-in household member may read it; it contains no secrets.
 */
export async function GET() {
  try {
    await requireApiUser();
    return Response.json(channelStatusService.getChannelStatuses(), {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    return apiError(error);
  }
}
