'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { fallbackTone, type AvatarTone } from '@/components/member-tone-palette';

/**
 * Household members get their avatar colour by their order in the household (see
 * member-tone-palette.ts), provided by the app layout so every page agrees. Outside it, or for
 * someone not in the household, a hash of the ID is the fallback.
 */
const MemberTonesContext = createContext<Record<string, AvatarTone>>({});

export function MemberTonesProvider({ tones, children }: { tones: Record<string, AvatarTone>; children: ReactNode }) {
  return <MemberTonesContext.Provider value={tones}>{children}</MemberTonesContext.Provider>;
}

export function useMemberTone(key: string): AvatarTone {
  return useContext(MemberTonesContext)[key] ?? fallbackTone(key);
}
