// Palette tuned for Paper & Pine: every colour keeps white initials readable.
const AVATAR_COLORS = [
  '#193c2c', // pine
  '#a8721f', // ochre
  '#7a5c8e', // plum
  '#3b7a8c', // teal
  '#65774d', // moss
  '#8a4f3d', // clay
  '#4b5d78'  // slate
] as const;

function hashString(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) + hash + value.charCodeAt(index)) >>> 0;
  return hash;
}

export function memberColor(memberId: string) {
  return AVATAR_COLORS[hashString(memberId) % AVATAR_COLORS.length];
}

export function memberInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = Array.from(parts[0])[0] || '';
  const last = parts.length > 1 ? Array.from(parts[parts.length - 1])[0] || '' : '';
  return `${first}${last}`.toUpperCase();
}

export function MemberAvatar({ name, memberId, size = 28 }: { name: string; memberId: string; size?: number }) {
  return <span
    className="member-avatar"
    role="img"
    aria-label={name}
    title={name}
    style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.4)), background: memberColor(memberId) }}
  >{memberInitials(name)}</span>;
}

export function MemberAvatarStack({ members, size = 24, max = 4 }: {
  members: Array<{ id: string; name: string }>;
  size?: number;
  max?: number;
}) {
  const shown = members.slice(0, max);
  const extra = members.length - shown.length;
  return <span className="member-avatar-stack" role="group" aria-label={`${members.length} members`}>
    {shown.map((member) => <MemberAvatar key={member.id} name={member.name} memberId={member.id} size={size} />)}
    {extra > 0 ? <span className="member-avatar member-avatar-more" style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) }}>+{extra}</span> : null}
  </span>;
}
