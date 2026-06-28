import type { Transition, Variants } from "framer-motion";

/** Shared "Warm Industrial" easing — calm, decisive, never bouncy. */
export const EASE = [0.4, 0, 0.2, 1] as const;

/** Screen-to-screen crossfade with a gentle vertical drift. Kept brief so
 *  navigation stays snappy even with AnimatePresence mode="wait". */
export const screenVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
};
export const screenTransition: Transition = { duration: 0.18, ease: EASE };

/** Staggered list/card entrance container + item. */
export const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } },
};

/** Modal / popover pop. */
export const popVariants: Variants = {
  initial: { opacity: 0, scale: 0.96, y: 10 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.97, y: 6 },
};
export const popTransition: Transition = { duration: 0.2, ease: EASE };
