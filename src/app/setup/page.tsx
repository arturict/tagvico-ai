import { redirect } from 'next/navigation';
import Image from 'next/image';
import { getBackendConfigurationState } from '@/lib/server/system';
import { SetupWizard } from '@/components/settings/setup-wizard';
import { Mascot } from '@/components/mascot/mascot';
import type { ProviderDescriptor } from '@/components/settings/types';

const providerRegistryModule = require('@root/services/providerRegistry');
const providerRegistry = providerRegistryModule.default || providerRegistryModule;

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Setup' };

export default async function SetupPage() {
  if (await getBackendConfigurationState() === true) redirect('/login');
  const providers = providerRegistry.getProviderDefinitions().map((definition: {
    id: string;
    name: string;
    description: string;
    icon: ProviderDescriptor['icon'];
    runtimeAdapter: string;
    recommended?: boolean;
    badge?: string;
    discovery: string;
    manualModelInput: boolean;
    fields: ProviderDescriptor['fields'];
    suggestedModels: ProviderDescriptor['suggestedModels'];
  }) => ({
    instanceId: definition.id,
    driverId: definition.id,
    name: definition.name,
    description: definition.description,
    icon: definition.icon,
    runtimeAdapter: definition.runtimeAdapter,
    recommended: Boolean(definition.recommended),
    badge: definition.badge || null,
    available: true,
    discovery: definition.discovery,
    manualModelInput: definition.manualModelInput,
    fields: definition.fields.map((field) => ({
      key: field.key,
      label: field.label,
      description: field.description,
      type: field.type,
      required: field.required,
      placeholder: field.placeholder,
      defaultValue: field.defaultValue,
      secret: field.secret
    })),
    configuration: {},
    suggestedModels: definition.suggestedModels
  })) as ProviderDescriptor[];
  return <main className="auth-page"><section className="auth-column is-wide" aria-labelledby="setup-title">
    <Mascot pose="waving" size={64} className="auth-mascot" />
    <div className="auth-logo"><Image src="/tagvico-icon.png" alt="" width={28} height={28} /><span>Tagvico</span></div>
    <h1 className="auth-title is-compact" id="setup-title">Set up Tagvico</h1>
    <SetupWizard providers={providers} />
  </section></main>;
}
