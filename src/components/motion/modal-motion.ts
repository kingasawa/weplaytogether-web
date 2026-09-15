import type { Transition, Variants } from "motion/react";

// Timing khớp --transition-base (200ms) của design system — panel dùng spring cho cảm giác
// "nảy nhẹ" khi mở, backdrop/exit dùng ease tuyến tính cho gọn.
const PANEL_ENTER_TRANSITION: Transition = { type: "spring", stiffness: 420, damping: 34, mass: 0.9 };
const EXIT_TRANSITION: Transition = { duration: 0.16, ease: "easeIn" };

export const modalBackdropVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2, ease: "easeOut" } },
  exit: { opacity: 0, transition: EXIT_TRANSITION },
};

export const modalPanelVariants: Variants = {
  hidden: { opacity: 0, y: 28, scale: 0.95 },
  visible: { opacity: 1, y: 0, scale: 1, transition: PANEL_ENTER_TRANSITION },
  exit: { opacity: 0, y: 16, scale: 0.97, transition: EXIT_TRANSITION },
};
