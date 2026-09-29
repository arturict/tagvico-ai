import { redirect } from 'next/navigation';
import Image from 'next/image';
import { getBackendConfigurationState } from '@/lib/server/system';
import { SetupWizard } from '@/components/settings/setup-wizard';
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
  return <main className="setup-page">
    <header className="setup-head">
      <Image className="brand-mark" src="/tagvico-icon.png" alt="" width={44} height={44} />
      <div>
        <h1>One calm setup flow.</h1>
        <p>Connect Paperless, choose a runtime and create the owner account. The same components continue in Settings after sign-in.</p>
      </div>
    </header>
    <SetupWizard providers={providers} />
  </main>;
}
