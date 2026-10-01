'use client';

import { createContext, useContext, type ReactNode } from 'react';

export const AVATAR_TONES = ['blue', 'green', 'purple', 'orange', 'pink', 'yellow'] as const;
export type AvatarTone = (typeof AVATAR_TONES)[number];

/**
 * Household members get their avatar colour by their order in the household, so up to six people
 * never share a colour and each keeps the same colour on every page. The app layout provides the
 * map; outside it (or for someone not in the household) a hash of the ID is the fallback.
 */
const MemberTonesContext = createContext<Record<string, AvatarTone>>({});

export function householdTones(memberIds: string[]): Record<string, AvatarTone> {
  return Object.fromEntries(memberIds.map((id, index) => [id, AVATAR_TONES[index % AVATAR_TONES.length]]));
}

export function MemberTonesProvider({ tones, children }: { tones: Record<string, AvatarTone>; children: ReactNode }) {
  return <MemberTonesContext.Provider value={tones}>{children}</MemberTonesContext.Provider>;
}

function hashString(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) + hash + value.charCodeAt(index)) >>> 0;
  return hash;
}

export function fallbackTone(key: string): AvatarTone {
  return AVATAR_TONES[hashString(key) % AVATAR_TONES.length];
}

export function useMemberTone(key: string): AvatarTone {
  return useContext(MemberTonesContext)[key] ?? fallbackTone(key);
}
