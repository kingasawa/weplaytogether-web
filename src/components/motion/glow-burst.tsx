"use client";

import { AnimatePresence, motion } from "motion/react";

type GlowBurstProps = {
  active: boolean;
  /** Giá trị màu CSS (token) — mặc định --primary-light để trung tính với mọi phe/role. */
  color?: string;
};

// Hiệu ứng loé sáng 1 lượt (radial glow phình ra rồi tắt) — dùng cho khoảnh khắc "vừa mở khoá" một
// thứ riêng tư (bài, role...). Không giữ trạng thái lặp lại như FrameEffects (đó là shine định kỳ
// cho khung VIP) — đây là burst 1 lần, do component cha điều khiển qua `active`.
export function GlowBurst({ active, color = "var(--primary-light)" }: GlowBurstProps) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 4,
            pointerEvents: "none",
            borderRadius: "inherit",
            background: `radial-gradient(circle at 50% 40%, color-mix(in srgb, ${color} 60%, transparent), transparent 72%)`,
          }}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: [0, 1, 0], scale: [0.85, 1.06, 1.15] }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.9, times: [0, 0.35, 1], ease: "easeOut" }}
        />
      )}
    </AnimatePresence>
  );
}
