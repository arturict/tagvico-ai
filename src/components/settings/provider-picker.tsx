'use client';

import { useState, type ReactNode } from 'react';
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

const heroSummary = 'Use your ChatGPT Plus or Pro plan to pay for Tagvico. No API key, no billing setup. Recommended.';

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
  return <button
    type="button"
    className={`provider-option${selected ? ' is-selected' : ''}`}
    aria-pressed={selected}
    disabled={!provider.available}
    onClick={() => onSelect(provider.instanceId)}
  >
    <ProviderIcon icon={provider.icon} name={provider.name} size={28} />
    <span className="provider-option-copy">
      <strong>{provider.name}</strong>
      <small>{shortDescriptions[provider.instanceId] || provider.description}</small>
    </span>
    {active ? <span className="provider-option-state">In use</span> : null}
  </button>;
}

/**
 * One picker for Settings and first-run setup: the ChatGPT plan as a hero card
 * with its sign-in inline, the common alternatives in small groups and the rest
 * behind a disclosure. The provider in use always stays in the main list.
 */
export function ProviderPicker({
  providers,
  selectedId,
  activeId,
  onSelect,
  heroAction
}: {
  providers: ProviderDescriptor[];
  /** Provider whose configuration is open (Settings) or chosen (setup). */
  selectedId: string;
  /** Provider Tagvico currently uses; shown as "In use". */
  activeId?: string;
  onSelect: (instanceId: string) => void;
  /** Sign-in flow (or a button that selects the plan) rendered inside the hero card. */
  heroAction: ReactNode;
}) {
  const visible = providers.filter((provider) => provider.available);
  const hero = visible.find((provider) => providerGroup(provider.instanceId) === 'hero');
  const inGroup = (group: ProviderGroup) => visible.filter((provider) => providerGroup(provider.instanceId) === group);
  const apiKey = ['openai', 'openrouter']
    .map((id) => inGroup('apikey').find((provider) => provider.instanceId === id))
    .filter((provider): provider is ProviderDescriptor => Boolean(provider));
  const local = inGroup('local');
  const advanced = inGroup('advanced');
  const promoted = advanced.filter((provider) => provider.instanceId === activeId);
  const collapsed = advanced.filter((provider) => provider.instanceId !== activeId);
  const selectedIsCollapsed = collapsed.some((provider) => provider.instanceId === selectedId);
  const [advancedOpen, setAdvancedOpen] = useState(selectedIsCollapsed);
  const isActive = (provider: ProviderDescriptor) => provider.instanceId === activeId;
  const option = (provider: ProviderDescriptor) => <ProviderOption
    key={provider.instanceId}
    provider={provider}
    selected={provider.instanceId === selectedId}
    active={isActive(provider)}
    onSelect={onSelect}
  />;

  return <div className="provider-picker">
    {hero ? <section
      className={`provider-hero${hero.instanceId === selectedId ? ' is-selected' : ''}`}
      aria-label={hero.name}
    >
      <div className="provider-hero-head">
        <ProviderIcon icon={hero.icon} name={hero.name} size={44} />
        <div>
          <h3>
            {hero.name}
            {hero.badge ? <em className="provider-badge">{hero.badge}</em> : null}
            {isActive(hero) ? <span className="provider-option-state">In use</span> : null}
          </h3>
          <p>{heroSummary}</p>
        </div>
      </div>
      <div className="provider-hero-action">{heroAction}</div>
    </section> : null}

    <h3 className="provider-picker-label">Other providers</h3>
    <div className="provider-groups">
      {apiKey.length ? <div className="provider-group">
        <h4>API key</h4>
        {apiKey.map(option)}
      </div> : null}
      {local.length ? <div className="provider-group">
        <h4>Local, private</h4>
        {local.map(option)}
      </div> : null}
      {promoted.length ? <div className="provider-group">
        <h4>In use</h4>
        {promoted.map(option)}
      </div> : null}
    </div>

    {collapsed.length ? <details
      className="provider-advanced"
      open={advancedOpen}
      onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
    >
      <summary>
        <span>Advanced providers</span>
        <small>{collapsed.length} more</small>
        <ChevronDown aria-hidden="true" />
      </summary>
      <div className="provider-advanced-list">{collapsed.map(option)}</div>
    </details> : null}
  </div>;
}
