/**
 * Motion constants mirrored from `/tokens.json` → `shared.motion`.
 * Only transform/opacity are animated. Consumers wrap the studio in
 * `<MotionConfig reducedMotion="user">`.
 */
export const SPRING_TACTILE = {
  type: "spring",
  stiffness: 480,
  damping: 34,
  mass: 0.8,
} as const;

export const SPRING_DRAWER = {
  type: "spring",
  stiffness: 360,
  damping: 36,
  mass: 1.0,
} as const;

export const EASE_TELEMETRY = {
  duration: 0.22,
  ease: [0.16, 1, 0.3, 1],
} as const;
