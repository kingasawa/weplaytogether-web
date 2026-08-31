"use client";

import { useEffect } from "react";

// Toạ độ % nằm trên viền khung info (ảnh 3:1, giữa trong suốt) — không random tự do vì rơi
// vào giữa sẽ trông lơ lửng vô nghĩa.
const BORDER_POINTS: Array<[number, number]> = [
  [5, 5],
  [20, 5],
  [40, 5],
  [60, 5],
  [80, 5],
  [95, 5],
  [5, 30],
  [5, 60],
  [5, 90],
  [95, 30],
  [95, 60],
  [95, 90],
  [20, 95],
  [40, 95],
  [60, 95],
  [80, 95],
];

const RESCAN_INTERVAL_MS = 2000;
const SHINE_MIN_DELAY_MS = 5000;
const SHINE_MAX_DELAY_MS = 10000; // 5-10s giữa 2 lần bật
const SHINE_ACTIVE_MS = 4500; // ăn khớp 1 vòng playerRowFrameGlowSpin (3s) + sparkle pulse

/**
 * Điều phối hiệu ứng VIP (glow + sparkle) cho khung info: gồm 2 việc độc lập.
 *
 * 1. Sparkle position: mỗi sparkle ([data-frame-sparkle]) tự di chuyển ngẫu nhiên giữa các
 *    điểm cố định trên viền mỗi 500-3000ms — chạy nền cho MỌI sparkle kể cả khi đang ẩn (rẻ,
 *    không cần đợi hàng được chọn mới bắt đầu di chuyển).
 * 2. Row spotlight: mỗi 5-10s chọn ngẫu nhiên 1 hàng ĐỦ ĐIỀU KIỆN ([data-player-row-shine-card]
 *    — chỉ gắn cho user thực sự MUA/trang bị khung info, không phải khung mặc định) để bật
 *    data-shine="on" trong ~4.5s rồi tắt, chỉ 1 hàng/1 thời điểm trong cùng 1 phòng — tương tự
 *    CardShine ở trang chủ nhưng gate theo hasEquippedProfileFrame thay vì mọi card.
 *
 * Quét lại DOM mỗi 2s để bắt sparkle/hàng của người chơi mới join (list phòng đổi động) mà
 * không cần MutationObserver — nhẹ, đủ dùng cho danh sách tối đa 10 người.
 */
export default function FrameEffects() {
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const timers = new Set<number>();
    let stopped = false;
    let activeRow: HTMLElement | null = null;

    const moveSparkle = (el: HTMLElement) => {
      if (stopped) {
        return;
      }

      const [x, y] = BORDER_POINTS[Math.floor(Math.random() * BORDER_POINTS.length)];
      el.style.left = `${x}%`;
      el.style.top = `${y}%`;

      const delay = 500 + Math.random() * 2500;
      timers.add(window.setTimeout(() => moveSparkle(el), delay));
    };

    const initNewSparkles = () => {
      const sparkles = document.querySelectorAll<HTMLElement>(
        "[data-frame-sparkle]:not([data-sparkle-init])"
      );

      sparkles.forEach((el, index) => {
        el.setAttribute("data-sparkle-init", "");
        timers.add(window.setTimeout(() => moveSparkle(el), index * 250));
      });
    };

    const clearActiveRow = () => {
      if (activeRow) {
        activeRow.removeAttribute("data-shine");
        activeRow = null;
      }
    };

    const runShineOnce = () => {
      const rows = Array.from(
        document.querySelectorAll<HTMLElement>("[data-player-row-shine-card]")
      );

      if (rows.length === 0) {
        scheduleShine();
        return;
      }

      const row = rows[Math.floor(Math.random() * rows.length)];
      activeRow = row;
      row.setAttribute("data-shine", "on");

      timers.add(
        window.setTimeout(() => {
          clearActiveRow();
          scheduleShine();
        }, SHINE_ACTIVE_MS)
      );
    };

    const scheduleShine = () => {
      const delay = SHINE_MIN_DELAY_MS + Math.random() * (SHINE_MAX_DELAY_MS - SHINE_MIN_DELAY_MS);
      timers.add(window.setTimeout(runShineOnce, delay));
    };

    initNewSparkles();
    const rescanInterval = window.setInterval(initNewSparkles, RESCAN_INTERVAL_MS);
    scheduleShine();

    return () => {
      stopped = true;
      window.clearInterval(rescanInterval);
      timers.forEach((timer) => window.clearTimeout(timer));
      clearActiveRow();
    };
  }, []);

  return null;
}
