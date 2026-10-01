/**
 * Browser tab title with the Needs-you count: "(3) Needs you · Tagvico". With nothing waiting the
 * Needs you page says "All caught up · Tagvico"; on every other page the title stays as the page set it.
 *
 * The function is idempotent, so it can run again on its own output when the framework rewrites
 * the title on navigation.
 */

const BRAND = 'Tagvico';

/** The page's own name, without a count prefix or the product suffix ("Needs you | Tagvico" gives "Needs you"). */
export function pageNameFromTitle(title: string) {
  const withoutCount = title.replace(/^\(\d+\+?\)\s*/, '').trim();
  const withoutBrand = withoutCount.replace(new RegExp(`\\s*[|·]\\s*${BRAND}$`), '').trim();
  return withoutBrand === BRAND ? '' : withoutBrand;
}

export function countLabel(count: number) {
  return count > 99 ? '99+' : String(count);
}

export function tabTitle(rawTitle: string, needsCount: number, onNeedsYouPage: boolean) {
  const name = pageNameFromTitle(rawTitle);
  if (onNeedsYouPage && needsCount === 0) return `All caught up · ${BRAND}`;
  const base = name ? `${name} · ${BRAND}` : BRAND;
  return needsCount > 0 ? `(${countLabel(needsCount)}) ${base}` : base;
}
