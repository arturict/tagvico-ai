'use client';

import { useMemberTone } from '@/components/member-tones';

export function memberInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = Array.from(parts[0])[0] || '';
  const last = parts.length > 1 ? Array.from(parts[parts.length - 1])[0] || '' : '';
  return `${first}${last}`.toUpperCase();
}

// Every avatar sits next to the member's name or inside a control that carries an accessible
// label, so the initials are decorative; announcing them would read the name twice.
// Each person keeps one soft colour from OpenAI's palette (pastel fill, darker initials); the tone comes
// from their order in the household (see member-tones.tsx). The name is always shown or labelled too.
export function MemberAvatar({ name, memberId, size = 28 }: { name: string; memberId?: string; size?: number }) {
  const tone = useMemberTone(memberId || name);
  return <span
    className="avatar member-avatar"
    data-tone={tone}
    aria-hidden="true"
    title={name}
    style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.4)) }}
  >{memberInitials(name)}</span>;
}

export function MemberAvatarStack({ members, size = 24, max = 4 }: {
  members: Array<{ id: string; name: string }>;
  size?: number;
  max?: number;
}) {
  const shown = members.slice(0, max);
  const extra = members.length - shown.length;
  return <span className="avatar-group member-avatar-stack" role="group" aria-label={`${members.length} members`}>
    {shown.map((member) => <MemberAvatar key={member.id} name={member.name} memberId={member.id} size={size} />)}
    {extra > 0 ? <span className="avatar member-avatar" style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) }}>+{extra}</span> : null}
  </span>;
}
