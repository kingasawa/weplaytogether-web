"use client";

import { useEffect, useState } from "react";

const TYPE_INTERVAL_MS = 38;

type TypewriterTextProps = {
  /** CSS module đã import ở nơi gọi (wolf/page.module.css) — cần .typewriterText/SrOnly/Caret. */
  styles: Record<string, string>;
  text: string;
};

// Dòng trạng thái chờ ở đáy màn chơi: mỗi khi text đổi thì gõ lại từng ký tự như đang nhập văn
// bản, kèm con trỏ nhấp nháy ở cuối. Người bật "giảm chuyển động" (prefers-reduced-motion) thấy
// ngay toàn bộ chữ, không gõ. Screen reader đọc text đầy đủ (span ẩn) thay vì từng ký tự đang gõ.
export function TypewriterText({ styles, text }: TypewriterTextProps) {
  const [typed, setTyped] = useState({ source: text, count: 0 });
  // Text đổi giữa chừng → bắt đầu gõ lại từ đầu ngay trong lần render này (không chờ effect).
  const visibleCount = typed.source === text ? typed.count : 0;

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const characters = Array.from(text);
    // Giảm chuyển động: tick đầu tiên hiện luôn toàn bộ chữ.
    const step = prefersReducedMotion ? characters.length : 1;

    let count = 0;
    const intervalId = window.setInterval(() => {
      count = Math.min(count + step, characters.length);
      setTyped({ source: text, count });

      if (count >= characters.length) {
        window.clearInterval(intervalId);
      }
    }, TYPE_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [text]);

  return (
    <span className={styles.typewriterText}>
      <span className={styles.typewriterSrOnly}>{text}</span>
      <span aria-hidden="true">{Array.from(text).slice(0, visibleCount).join("")}</span>
      <span aria-hidden="true" className={styles.typewriterCaret} />
    </span>
  );
}
