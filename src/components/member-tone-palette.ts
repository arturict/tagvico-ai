// Pure helpers shared by the server layout and the client avatar; kept out of the 'use client'
// module because the server cannot call functions exported from a client module.
export const AVATAR_TONES = ['blue', 'green', 'purple', 'orange', 'pink', 'yellow'] as const;
export type AvatarTone = (typeof AVATAR_TONES)[number];

/** Household order decides the tone, so up to six members never share a colour. */
export function householdTones(memberIds: string[]): Record<string, AvatarTone> {
  return Object.fromEntries(memberIds.map((id, index) => [id, AVATAR_TONES[index % AVATAR_TONES.length]]));
}

function hashString(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) + hash + value.charCodeAt(index)) >>> 0;
  return hash;
}

export function fallbackTone(key: string): AvatarTone {
  return AVATAR_TONES[hashString(key) % AVATAR_TONES.length];
}
