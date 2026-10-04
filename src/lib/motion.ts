export const sfMotion = {
  spring: { type: 'spring', stiffness: 350, damping: 30 },
  springBouncy: { type: 'spring', stiffness: 400, damping: 20 },
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.2, ease: "easeOut" }
  },
  transition: {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
    transition: { type: 'spring', stiffness: 350, damping: 30 },
  },
  modal: {
    initial: { opacity: 0, scale: 0.95, y: 20 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.95, y: 20 },
    transition: { type: 'spring', stiffness: 400, damping: 25 },
  },
  hover: {
    scale: 1.02,
    transition: { type: 'spring', stiffness: 400, damping: 25 }
  },
  tap: {
    scale: 0.98,
    transition: { type: 'spring', stiffness: 400, damping: 25 }
  }
} as const;
