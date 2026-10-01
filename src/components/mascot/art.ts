/**
 * Pixel art of the Tagvico mascot, "Tagi": a small lime paper tag with a folded corner,
 * two dot eyes and little feet. The art is plain data on a 16 x 16 grid so that the React
 * component, the exported files in public/mascot/ and the tests all draw from one source.
 *
 * Colours come from the app icon (public/tagvico-icon.png): lime #B5EA0B and the near-black
 * #171917 that the logo uses for its strokes.
 */

export const MASCOT_POSES = ['idle', 'thinking', 'happy', 'sleeping', 'searching', 'oops', 'waving'] as const;
export type MascotPose = (typeof MASCOT_POSES)[number];

/** Edge length of the pixel grid. Sizes that are multiples of this render without blurred edges. */
export const MASCOT_GRID = 16;

type Paint = { fill: string; opacity?: number };

export const MASCOT_COLORS = {
  ink: '#171917',
  lime: '#B5EA0B',
  shade: '#8DB605',
  light: '#D5F55E',
  glass: '#F3FCCB',
  drop: '#7FBDF0'
} as const;

/** One character per colour in the sprite strings below; "." is empty. */
const PAINT: Record<string, Paint> = {
  O: { fill: MASCOT_COLORS.ink },
  L: { fill: MASCOT_COLORS.lime },
  S: { fill: MASCOT_COLORS.shade },
  H: { fill: MASCOT_COLORS.light },
  G: { fill: MASCOT_COLORS.glass },
  D: { fill: MASCOT_COLORS.drop },
  Z: { fill: MASCOT_COLORS.ink, opacity: 0.12 },
  z: { fill: MASCOT_COLORS.ink, opacity: 0.5 }
};

export type MascotRect = { x: number; y: number; w: number; h: number; fill: string; opacity?: number };
export type MascotNode = { className?: string; rects?: MascotRect[]; children?: MascotNode[] };

type Sprite = { x: number; y: number; rows: string[] };

/** Merges horizontal runs of one colour into rectangles, so a pose is a few dozen elements, not hundreds. */
function rectsOf({ x, y, rows }: Sprite): MascotRect[] {
  const rects: MascotRect[] = [];
  rows.forEach((row, rowIndex) => {
    let column = 0;
    while (column < row.length) {
      const char = row[column];
      let end = column;
      while (end + 1 < row.length && row[end + 1] === char) end += 1;
      const paint = PAINT[char];
      if (paint) rects.push({ x: x + column, y: y + rowIndex, w: end - column + 1, h: 1, ...paint });
      column = end + 1;
    }
  });
  return rects;
}

const leaf = (className: string | undefined, sprite: Sprite): MascotNode => ({ className, rects: rectsOf(sprite) });
const at = (x: number, y: number, ...rows: string[]): Sprite => ({ x, y, rows });

// Paper body with a folded top right corner, a lighter edge on the left, a darker edge on the
// right and at the bottom, and two feet.
const BODY = at(0, 2,
  '...OOOOOOO......',
  '...OHLLLLOO.....',
  '...OHLLLLOHO....',
  '...OHLLLLOOOO...',
  '...OHLLLLLLSO...',
  '...OLLLLLLLSO...',
  '...OLLLLLLLSO...',
  '...OLLLLLLLSO...',
  '...OLLLLLLLSO...',
  '...OSSSSSSSSO...',
  '....OOOOOOOO....',
  '.....OO..OO.....'
);

const SHADOW = at(4, 14, 'ZZZZZZZZ');

const ARMS_DOWN = at(1, 9, '.O..........O.', '.O..........O.');

const EYES_OPEN = at(0, 7, '.....O....O.....', '.....O....O.....');
const EYES_UP = at(0, 6, '.....O....O.....', '.....O....O.....');
const EYES_RIGHT = at(0, 7, '......O....O....', '......O....O....');
const EYES_WIDE = at(0, 7, '.....O....O.....', '.....O....O.....');
const EYES_HAPPY = at(0, 7, '.....O....O.....', '....O.O..O.O....');
const EYES_CLOSED = at(0, 8, '....OOO..OOO....');

const SMILE = at(6, 9, 'O..O', '.OO.');
const FLAT_MOUTH = at(7, 10, 'OO');
const FROWN = at(6, 9, '.OO.', 'O..O');
const BROWS = at(4, 5, '.O....O.', 'O......O');

const ARMS_UP = at(0, 7, '.O............O.', '..O..........O..', '..O..........O..');
const ARM_LEFT_DOWN = at(1, 9, '.O', '.O');
const ARM_WAVE_A = at(13, 5, '..O', '..O', '.O.', 'O..', 'O..');
const ARM_WAVE_B = at(13, 5, '.O', '.O', '.O', 'O.', 'O.');

const Z_BIG = at(13, 6, 'OOO', '..O', '.O.', 'OOO');
const Z_SMALL = at(13, 1, 'zzz', '..z', '.z.', 'zzz');
const THOUGHT = [at(13, 7, 'O'), at(14, 5, 'O'), at(14, 2, 'OO', 'OO')];
const SPARK = at(13, 1, '.L.', 'LLL', '.L.');
const SWEAT = at(14, 4, 'D', 'D');
const LENS = at(10, 9,
  '.OOO.',
  'OGGGO',
  'OGGGO',
  'OGGGO',
  '.OOO.',
  '....O',
  '.....O'
);

function figure(face: MascotNode[], arms: MascotNode[], extras: MascotNode[] = []): MascotNode {
  return {
    className: 'mascot-art',
    children: [
      leaf('mascot-shadow', SHADOW),
      { className: 'mascot-body', children: [leaf(undefined, BODY), ...arms, { className: 'mascot-face', children: face }] },
      ...extras
    ]
  };
}

const armsDown = [leaf('mascot-arms', ARMS_DOWN)];

/** The drawing tree of one pose; CSS classes name the parts that animate. */
export function poseTree(pose: MascotPose): MascotNode {
  switch (pose) {
    case 'idle':
      return figure([leaf('mascot-eyes', EYES_OPEN)], armsDown);
    case 'thinking':
      return figure(
        [leaf('mascot-eyes', EYES_UP), leaf(undefined, FLAT_MOUTH)],
        armsDown,
        [{ className: 'mascot-dots', children: THOUGHT.map((dot, index) => leaf(`mascot-dot is-${index + 1}`, dot)) }]
      );
    case 'happy':
      return figure(
        [leaf(undefined, EYES_HAPPY), leaf(undefined, SMILE)],
        [leaf('mascot-arms', ARMS_UP)],
        [leaf('mascot-spark', SPARK)]
      );
    case 'sleeping':
      return figure(
        [leaf(undefined, EYES_CLOSED)],
        armsDown,
        [leaf('mascot-z is-1', Z_SMALL), leaf('mascot-z is-2', Z_BIG)]
      );
    case 'searching':
      return figure(
        [leaf('mascot-eyes', EYES_RIGHT)],
        armsDown,
        [leaf('mascot-lens', LENS)]
      );
    case 'oops':
      return figure(
        [leaf('mascot-eyes', EYES_WIDE), leaf(undefined, BROWS), leaf(undefined, FROWN)],
        armsDown,
        [leaf('mascot-drop', SWEAT)]
      );
    case 'waving':
      return figure(
        [leaf('mascot-eyes', EYES_OPEN), leaf(undefined, SMILE)],
        [leaf('mascot-arms', ARM_LEFT_DOWN), leaf('mascot-wave is-a', ARM_WAVE_A), leaf('mascot-wave is-b', ARM_WAVE_B)]
      );
  }
}

function attributes(attrs: Record<string, string | number | undefined>) {
  return Object.entries(attrs)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => ` ${key}="${value}"`)
    .join('');
}

function nodeSvg(node: MascotNode): string {
  const inner = [
    ...(node.rects ?? []).map((rect) => `<rect${attributes({
      x: rect.x, y: rect.y, width: rect.w, height: rect.h, fill: rect.fill, 'fill-opacity': rect.opacity
    })}/>`),
    ...(node.children ?? []).map(nodeSvg)
  ].join('');
  return node.className ? `<g class="${node.className}">${inner}</g>` : inner;
}

/** Markup of the shapes inside the svg element, for the standalone files and the tests. */
export function poseMarkup(pose: MascotPose) {
  return nodeSvg(poseTree(pose));
}

/** A complete standalone SVG file. `css` is inlined for the animated variants. */
export function poseSvg(pose: MascotPose, css = '', size = MASCOT_GRID * 16) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MASCOT_GRID} ${MASCOT_GRID}" width="${size}" height="${size}" shape-rendering="crispEdges" class="mascot is-${pose}" role="img" aria-label="Tagvico mascot">`
    + (css ? `<style>${css}</style>` : '')
    + poseMarkup(pose)
    + '</svg>\n';
}
