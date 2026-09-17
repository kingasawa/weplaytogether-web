"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { GlowBurst } from "./glow-burst";

const MASK_IMAGE_PATH = "/images/ui/mask_card.webp";
const FLIP_TRANSITION = { duration: 0.55, ease: [0.65, 0, 0.35, 1] } as const;

type CardFlipRevealProps = {
  /** CSS module đã import ở nơi gọi (cả 3 game dùng chung wolf/page.module.css). */
  styles: Record<string, string>;
  onUnlock: () => void;
  hintLabel?: string;
};

// Lá bài mask úp trên bài thật (RoleCard đứng cùng vị trí inset:0 trong .privateRevealBox) — bấm
// vào để lật mở bằng animation xoay 3D (rotateY), lộ bài thật đứng yên phía dưới; bấm lại để úp
// về. Trạng thái lật chỉ là hiển thị cục bộ — úp lại KHÔNG huỷ trạng thái "đã xem" đã báo cho cha
// qua onUnlock() (dùng để mở khoá nút "Sẵn sàng" ở màn cha), nên xem xong úp lại xem tiếp thoải mái.
export function CardFlipReveal({ styles, onUnlock, hintLabel }: CardFlipRevealProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [justFlipped, setJustFlipped] = useState(false);
  const glowTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dọn timer loé sáng nếu component unmount giữa chừng (vd chuyển phase ngay sau khi vừa lật).
  useEffect(() => {
    return () => {
      if (glowTimeoutRef.current) {
        clearTimeout(glowTimeoutRef.current);
      }
    };
  }, []);

  function handleTap() {
    if (isFlipped) {
      setIsFlipped(false);
      return;
    }

    setIsFlipped(true);
    onUnlock();

    setJustFlipped(true);
    if (glowTimeoutRef.current) {
      clearTimeout(glowTimeoutRef.current);
    }
    glowTimeoutRef.current = setTimeout(() => setJustFlipped(false), 900);
  }

  return (
    <div className={styles.cardFlipScene}>
      <motion.button
        animate={{ rotateY: isFlipped ? -180 : 0 }}
        aria-label={isFlipped ? "Úp bài lại" : "Lật mở bài"}
        className={styles.cardFlipCard}
        transition={FLIP_TRANSITION}
        type="button"
        onClick={handleTap}
      >
        <div className={styles.cardFlipFace}>
          <Image
            alt=""
            aria-hidden="true"
            className={styles.cardFlipMaskImage}
            draggable={false}
            fill
            sizes="(max-width: 768px) 100vw, 30rem"
            src={MASK_IMAGE_PATH}
          />
          {hintLabel && <span className={styles.cardFlipHint}>{hintLabel}</span>}
        </div>
      </motion.button>
      <GlowBurst active={justFlipped} />
    </div>
  );
}
