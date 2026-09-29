import { apiError, requireApiUser } from '@/lib/server/auth';
import { getHouseholdNavigation } from '@/lib/server/household-navigation';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await requireApiUser();
    return Response.json(await getHouseholdNavigation(user), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return apiError(error);
  }
}
