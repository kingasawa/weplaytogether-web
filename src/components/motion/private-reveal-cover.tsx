"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import Image from "next/image";
import { animate, motion, useMotionValue, type PanInfo } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { GlowBurst } from "./glow-burst";

const PRIVATE_CARD_COVER_IMAGE_PATH = "/images/ui/mask_card.webp";
const SPRING = { type: "spring", stiffness: 420, damping: 38, mass: 0.9 } as const;

type PrivateRevealCoverProps = {
  /** CSS module đã import ở nơi gọi (cả 3 game dùng chung wolf/page.module.css). */
  styles: Record<string, string>;
  unlocked: boolean;
  onUnlock: () => void;
  onRelock?: () => void;
  openRatio?: number;
  closeRatio?: number;
  hintLabel?: string;
};

// Kéo lên để MỞ hẳn (còn lại dải peek có thể kéo xuống để đóng lại) — dùng cho Avalon (nội dung
// tiết lộ dài, cần giữ mở để đọc). Wolf/Wolf Classic đã chuyển sang CardFlipReveal (bấm để lật
// bài 3D) cho phase xem bài riêng của người chơi, không còn dùng component này.
export function PrivateRevealCover({
  styles,
  unlocked,
  onUnlock,
  onRelock,
  openRatio = 1 / 3,
  closeRatio = 1 / 4,
  hintLabel,
}: PrivateRevealCoverProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const peekProbeRef = useRef<HTMLDivElement>(null);
  const y = useMotionValue(0);
  const isDraggingRef = useRef(false);
  const wasUnlockedRef = useRef(unlocked);
  const [justUnlocked, setJustUnlocked] = useState(false);
  // Đo lại kích thước qua state (thay vì đọc ref trực tiếp lúc render) để dragConstraints luôn
  // fresh sau khi mount/resize — đọc ref ngay trong render body dễ bị lệch 1 nhịp vì ref chỉ gắn
  // xong SAU lần render đầu, và cập nhật ref không tự kích hoạt render lại.
  const [measured, setMeasured] = useState({ height: 0, peekHeight: 0 });

  function measureNow() {
    return {
      height: containerRef.current?.offsetHeight ?? 0,
      peekHeight: peekProbeRef.current?.offsetHeight ?? 0,
    };
  }

  function openTargetYOf(size: typeof measured) {
    return -(size.height - size.peekHeight);
  }

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    setMeasured(measureNow());

    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => setMeasured(measureNow()));
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Đồng bộ vị trí cover theo trạng thái unlocked tới từ bên ngoài (vd resume game ở phase đã mở
  // khoá trước đó) hoặc khi kích thước đổi trong lúc đang mở, KHÔNG áp dụng khi đang kéo dở tay.
  useEffect(() => {
    if (isDraggingRef.current) {
      return;
    }
    const target = unlocked ? openTargetYOf(measured) : 0;
    animate(y, target, SPRING);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked, measured.height, measured.peekHeight]);

  useEffect(() => {
    if (unlocked && !wasUnlockedRef.current) {
      setJustUnlocked(true);
      const timer = setTimeout(() => setJustUnlocked(false), 900);
      wasUnlockedRef.current = unlocked;
      return () => clearTimeout(timer);
    }
    wasUnlockedRef.current = unlocked;
  }, [unlocked]);

  function handleDragStart() {
    isDraggingRef.current = true;
  }

  function handleDragEnd(_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    isDraggingRef.current = false;
    const size = measureNow();
    const height = size.height || 1;

    if (!unlocked) {
      const liftedRatio = Math.max(0, -info.offset.y) / height;
      const fastFlick = info.velocity.y < -700;

      if (liftedRatio >= openRatio || fastFlick) {
        onUnlock();
        animate(y, openTargetYOf(size), SPRING);
        return;
      }

      animate(y, 0, SPRING);
      return;
    }

    const openTargetY = openTargetYOf(size);
    const closeSpan = Math.max(1, 0 - openTargetY);
    const droppedRatio = (y.get() - openTargetY) / closeSpan;

    if (info.offset.y > 0 && droppedRatio >= closeRatio) {
      onRelock?.();
      animate(y, 0, SPRING);
      return;
    }

    animate(y, openTargetY, SPRING);
  }

  const dragConstraints = unlocked
    ? { top: openTargetYOf(measured), bottom: 0 }
    : { top: -(measured.height || 2000), bottom: 0 };

  return (
    <div ref={containerRef} style={{ position: "absolute", inset: 0 }}>
      <div
        ref={peekProbeRef}
        aria-hidden="true"
        style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "var(--private-reveal-peek-height)" }}
      />

      <motion.div
        aria-hidden={unlocked}
        className={styles.privateRevealCover}
        style={{ y, touchAction: "none" }}
        drag="y"
        dragConstraints={dragConstraints}
        dragElastic={0.06}
        dragMomentum={false}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onClick={() => {
          if (!unlocked) {
            onUnlock();
            animate(y, openTargetYOf(measureNow()), SPRING);
          }
        }}
      >
        <Image
          alt=""
          aria-hidden="true"
          className={styles.privateRevealCoverImage}
          draggable={false}
          fill
          sizes="(max-width: 768px) 100vw, 30rem"
          src={PRIVATE_CARD_COVER_IMAGE_PATH}
        />
        {hintLabel && <span className={styles.privateRevealHint}>{hintLabel}</span>}
        <div aria-hidden="true" className={styles.privateRevealHandle}>
          {unlocked ? <ArrowDown aria-hidden="true" /> : <ArrowUp aria-hidden="true" />}
        </div>
      </motion.div>

      <GlowBurst active={justUnlocked} />
    </div>
  );
}
