import documentModel from '../../../models/document';
import { getBackendConfigurationState } from '@/lib/server/system';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const configured = await getBackendConfigurationState();
    if (configured === null) return Response.json({ status: 'error', component: 'backend' }, { status: 503 });
    return Response.json({ status: 'healthy', configured, version: require('../../../package.json').version, schemaVersion: documentModel.getSchemaVersion(), backend: 'healthy' });
  }
  catch { return Response.json({ status: 'error' }, { status: 503 }); }
}
