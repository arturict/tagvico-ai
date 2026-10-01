import type { CSSProperties } from 'react';
import { ServerCog } from 'lucide-react';
import type { PickerIcon } from './types';

/** Marks drawn on an opaque square: only their light glyph should show, so the mask reads luminance instead of alpha. */
const OPAQUE_BACKGROUND_MARKS = new Set(['/provider-icons/opencode.svg']);

/**
 * A provider mark at a fixed square size. The bundled marks are white glyphs
 * made for dark backgrounds, so the glyph is used as a mask and painted in the
 * text colour: it stays monochrome and readable on the light theme, and it can
 * never stretch because the box is the size and the mask is `contain`.
 */
export function ProviderLogo({ icon, size = 16 }: { icon: PickerIcon; size?: number }) {
  if (!icon) {
    return <span className="mp-logo" style={{ width: size, height: size }} aria-hidden="true">
      <ServerCog width={size} height={size} strokeWidth={1.5} />
    </span>;
  }
  const style: CSSProperties & { '--mp-logo-url': string } = {
    width: size,
    height: size,
    '--mp-logo-url': `url("${icon.path}")`
  };
  return <span
    className="mp-logo mp-logo-mask"
    data-mask={OPAQUE_BACKGROUND_MARKS.has(icon.path) ? 'luminance' : 'alpha'}
    style={style}
    aria-hidden="true"
  />;
}
