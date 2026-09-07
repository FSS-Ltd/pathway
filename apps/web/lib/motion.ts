import type { TargetAndTransition, Transition, Variants } from "framer-motion";

export const springEnter = {
  type: "spring",
  stiffness: 260,
  damping: 22,
} satisfies Transition;

export const exitEase = {
  duration: 0.2,
  ease: "easeOut",
} satisfies Transition;

export const backdropFade = {
  duration: 0.4,
  ease: [0.4, 0, 0.2, 1],
} satisfies Transition;

export const staggerChildren = 0.05;

export const settleZoom = {
  scale: [1, 1.02, 1],
  transition: { duration: 0.45 },
} satisfies TargetAndTransition;

export const totalTick = {
  duration: 0.4,
  ease: "easeOut",
} satisfies Transition;

export const reducedMotionFade = {
  duration: 0.15,
  ease: "easeOut",
} satisfies Transition;

export const instantSwap = {
  duration: 0,
} satisfies Transition;

export const backStepTransition = {
  duration: 0.25,
  ease: "easeOut",
} satisfies Transition;

export const optionGroupVariants = {
  hidden: {},
  visible: { transition: { staggerChildren } },
} satisfies Variants;

export const reducedOptionGroupVariants = {
  hidden: {},
  visible: {},
} satisfies Variants;

export const visibleFirstContainerVariants = {
  hidden: { opacity: 1, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
} satisfies Variants;

export const optionCardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: springEnter },
} satisfies Variants;

export type StepDirection = "forward" | "back";

export const configuratorStepVariants = {
  initial: (direction: StepDirection) => ({
    opacity: 1,
    x: direction === "back" ? -24 : 24,
  }),
  animate: (direction: StepDirection) => ({
    opacity: 1,
    x: 0,
    transition: direction === "back" ? backStepTransition : springEnter,
  }),
  exit: (direction: StepDirection) => ({
    opacity: 0,
    x: direction === "back" ? 24 : -24,
    transition: direction === "back" ? backStepTransition : exitEase,
  }),
};

export const reducedStepVariants = {
  initial: { opacity: 1 },
  animate: { opacity: 1, transition: reducedMotionFade },
  exit: { opacity: 0, transition: reducedMotionFade },
} satisfies Variants;
