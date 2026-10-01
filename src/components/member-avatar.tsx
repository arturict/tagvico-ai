export function memberInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = Array.from(parts[0])[0] || '';
  const last = parts.length > 1 ? Array.from(parts[parts.length - 1])[0] || '' : '';
  return `${first}${last}`.toUpperCase();
}

// Every avatar sits next to the member's name or inside a control that carries an accessible
// label, so the initials are decorative; announcing them would read the name twice.
// Avatars are grey initials on the shared `.avatar` circle; people are told apart by name, not colour.
// `memberId` is accepted so existing callers keep compiling; it no longer picks a colour.
export function MemberAvatar({ name, size = 28 }: { name: string; memberId?: string; size?: number }) {
  return <span
    className="avatar member-avatar"
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
    {shown.map((member) => <MemberAvatar key={member.id} name={member.name} size={size} />)}
    {extra > 0 ? <span className="avatar member-avatar" style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) }}>+{extra}</span> : null}
  </span>;
}
