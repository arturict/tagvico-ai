'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { ProviderIcon } from '@/components/provider-icon';
import type { ProviderDescriptor } from './types';

export type ProviderGroup = 'hero' | 'apikey' | 'local' | 'advanced';

const groupById: Record<string, ProviderGroup> = {
  chatgpt: 'hero',
  openai: 'apikey',
  openrouter: 'apikey',
  ollama: 'local'
};

const shortDescriptions: Record<string, string> = {
  chatgpt: 'Use your Plus or Pro plan, no API key',
  openai: 'Your own API key',
  openrouter: 'Many models, one key',
  ollama: 'Runs on your own server',
  compatible: 'Any OpenAI-compatible endpoint',
  copilot: 'GitHub Copilot subscription',
  typesafe: 'TypeSafe Jev models',
  'ollama-cloud': 'Hosted Ollama models',
  opencode: 'OpenCode Go subscription',
  codex: 'Legacy device sign-in'
};

/** Providers not named here are advanced, so a new registry entry never crowds the main list. */
export function providerGroup(instanceId: string): ProviderGroup {
  return groupById[instanceId] ?? 'advanced';
}

function ProviderOption({
  provider,
  selected,
  active,
  onSelect
}: {
  provider: ProviderDescriptor;
  selected: boolean;
  active: boolean;
  onSelect: (instanceId: string) => void;
}) {
  return <label className={`provider-option${selected ? ' is-selected' : ''}`}>
    <input
      type="radio"
      className="provider-option-radio"
      name="ai-provider"
      value={provider.instanceId}
      checked={selected}
      disabled={!provider.available}
      onChange={() => onSelect(provider.instanceId)}
    />
    <ProviderIcon icon={provider.icon} name={provider.name} size={24} />
    <span className="provider-option-copy">
      <strong>
        {provider.name}
        {provider.badge ? <span className="badge">{provider.badge}</span> : null}
      </strong>
      <small>{shortDescriptions[provider.instanceId] || provider.description}</small>
    </span>
    {active ? <span className="provider-option-state">In use</span> : null}
  </label>;
}

/**
 * One radio list for Settings and first-run setup: the ChatGPT plan first, the
 * common alternatives next and the rest behind a disclosure. The provider in use
 * always stays in the main list. The selected provider's own panel (sign-in,
 * keys, test) is rendered by the caller under the list.
 */
export function ProviderPicker({
  providers,
  selectedId,
  activeId,
  onSelect
}: {
  providers: ProviderDescriptor[];
  /** Provider whose configuration is open (Settings) or chosen (setup). */
  selectedId: string;
  /** Provider Tagvico currently uses; shown as "In use". */
  activeId?: string;
  onSelect: (instanceId: string) => void;
}) {
  const visible = providers.filter((provider) => provider.available);
  const inGroup = (group: ProviderGroup) => visible.filter((provider) => providerGroup(provider.instanceId) === group);
  const hero = inGroup('hero');
  const apiKey = ['openai', 'openrouter']
    .map((id) => inGroup('apikey').find((provider) => provider.instanceId === id))
    .filter((provider): provider is ProviderDescriptor => Boolean(provider));
  const local = inGroup('local');
  const advanced = inGroup('advanced');
  const promoted = advanced.filter((provider) => provider.instanceId === activeId);
  const collapsed = advanced.filter((provider) => provider.instanceId !== activeId);
  const selectedIsCollapsed = collapsed.some((provider) => provider.instanceId === selectedId);
  const [advancedOpen, setAdvancedOpen] = useState(selectedIsCollapsed);
  const option = (provider: ProviderDescriptor) => <ProviderOption
    key={provider.instanceId}
    provider={provider}
    selected={provider.instanceId === selectedId}
    active={provider.instanceId === activeId}
    onSelect={onSelect}
  />;

  return <div className="provider-picker" role="radiogroup" aria-label="AI provider">
    {[...hero, ...apiKey, ...local, ...promoted].map(option)}
    {collapsed.length ? <details
      className="provider-advanced"
      open={advancedOpen}
      onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
    >
      <summary>
        <span>More providers</span>
        <ChevronDown aria-hidden="true" />
      </summary>
      {collapsed.map(option)}
    </details> : null}
  </div>;
}
