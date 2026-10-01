export const NEW_CHAT_HREF = '/companion?new=1';

export function isCurrent(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Titles for the mobile top bar; any page not listed shows the product name. */
const TITLES: Array<[prefix: string, title: string]> = [
  ['/inbox', 'Needs you'],
  ['/actions/', 'Needs you'],
  ['/documents', 'Documents'],
  ['/settings', 'Settings'],
  ['/review', 'Review queue'],
  ['/tags', 'Organize tags'],
  ['/activity', 'Activity'],
  ['/automation', 'Overview'],
  ['/changelog', "What's new"]
];

export function pageTitle(pathname: string, members: Array<{ id: string; displayName: string }> = []) {
  if (pathname.startsWith('/people/')) {
    const id = pathname.split('/')[2] || '';
    return members.find((member) => member.id === id)?.displayName || 'People';
  }
  for (const [prefix, title] of TITLES) {
    if (pathname === prefix || pathname.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`)) return title;
  }
  return 'Tagvico';
}
