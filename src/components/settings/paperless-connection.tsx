'use client';

import { useState } from 'react';
import { DraftField } from './draft-field';
import { InlineStatus } from './inline-status';
import { SettingsRow } from './settings-section';
import type { SettingsResponse } from './types';

type ApplyPatch = (patch: Record<string, unknown>, successMessage?: string) => Promise<SettingsResponse | null>;

type TestState = { kind: 'idle' | 'loading' | 'success' | 'error'; message: string };

/**
 * The Paperless connection: address, optional browser address, user name and
 * token. Every save runs the real connection check so a typo shows up here
 * instead of in a failed scan later.
 */
export function PaperlessConnection({
  paperless,
  applyPatch,
  errorFor
}: {
  paperless: SettingsResponse['paperless'];
  applyPatch: ApplyPatch;
  errorFor: (field: string) => string | undefined;
}) {
  const [test, setTest] = useState<TestState>({ kind: 'idle', message: '' });

  const runTest = async () => {
    setTest({ kind: 'loading', message: 'Checking the connection…' });
    try {
      const response = await fetch('/api/paperless/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not run the connection test.');
      setTest({ kind: body.ok ? 'success' : 'error', message: String(body.message || (body.ok ? 'Connected.' : 'Not connected.')) });
    } catch (error) {
      setTest({ kind: 'error', message: error instanceof Error ? error.message : 'Could not run the connection test.' });
    }
  };

  const saveConnection = async (patch: Record<string, unknown>) => {
    const saved = await applyPatch({ paperless: patch });
    if (saved) await runTest();
    return saved;
  };

  return <>
    <DraftField
      label="Base URL"
      type="url"
      value={paperless.baseUrl}
      placeholder="http://paperless:8000"
      description="Base address only, without an API path."
      error={errorFor('paperless.baseUrl')}
      onCommit={(baseUrl) => saveConnection({ baseUrl })}
    />
    <DraftField
      label="Paperless username"
      value={paperless.username}
      error={errorFor('paperless.username')}
      onCommit={(username) => applyPatch({ paperless: { username } })}
    />
    <DraftField
      label="API token"
      type="password"
      value=""
      configured={paperless.token.configured}
      error={errorFor('paperless.token')}
      onCommit={(token) => saveConnection({ token })}
    />
    <SettingsRow title="Status" description="Every save runs this check.">
      <div className="set-actions">
        {test.kind !== 'idle'
          ? <InlineStatus kind={test.kind === 'loading' ? 'loading' : test.kind}>{test.message}</InlineStatus>
          : null}
        <button className="btn btn-secondary" type="button" disabled={test.kind === 'loading'} onClick={() => void runTest()}>
          Test connection
        </button>
      </div>
    </SettingsRow>
    <DraftField
      label="Public URL"
      type="url"
      value={paperless.publicUrl}
      placeholder="https://paperless.example.org"
      description="Address for Open Paperless links. Empty uses the base URL."
      error={errorFor('paperless.publicUrl')}
      onCommit={(publicUrl) => applyPatch({ paperless: { publicUrl } }, 'Open Paperless address saved.')}
    />
  </>;
}
