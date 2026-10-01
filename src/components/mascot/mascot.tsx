import { MASCOT_GRID, poseTree, type MascotNode, type MascotPose } from './art';

export type { MascotPose } from './art';

function renderNode(node: MascotNode, key: string | number) {
  const content = <>
    {(node.rects ?? []).map((rect, index) => <rect
      key={`r${index}`}
      x={rect.x}
      y={rect.y}
      width={rect.w}
      height={rect.h}
      fill={rect.fill}
      fillOpacity={rect.opacity}
    />)}
    {(node.children ?? []).map((child, index) => renderNode(child, `c${index}`))}
  </>;
  return node.className ? <g key={key} className={node.className}>{content}</g> : <g key={key}>{content}</g>;
}

/**
 * Tagi, the Tagvico mascot: a small lime paper tag drawn on a 16 x 16 pixel grid.
 *
 * It is decoration. The surrounding text always carries the meaning, so the drawing is hidden from
 * assistive technology. Animations are short CSS loops (src/app/styles/mascot.css) and stop under
 * prefers-reduced-motion. Sizes are rounded to a multiple of 16 px so that every pixel of the art
 * lands on whole device pixels at 1x.
 */
export function Mascot({
  pose = 'idle',
  size = 48,
  animated = true,
  className
}: {
  pose?: MascotPose;
  /** Edge length in CSS pixels; rounded to a multiple of 16 (minimum 16). */
  size?: number;
  /** False draws the pose without motion, for places where a moving figure would distract. */
  animated?: boolean;
  className?: string;
}) {
  const edge = Math.max(MASCOT_GRID, Math.round(size / MASCOT_GRID) * MASCOT_GRID);
  const classes = ['mascot', `is-${pose}`, animated ? '' : 'is-still', className ?? ''].filter(Boolean).join(' ');
  return <svg
    className={classes}
    width={edge}
    height={edge}
    viewBox={`0 0 ${MASCOT_GRID} ${MASCOT_GRID}`}
    shapeRendering="crispEdges"
    aria-hidden="true"
    focusable="false"
  >
    {renderNode(poseTree(pose), 'art')}
  </svg>;
}
