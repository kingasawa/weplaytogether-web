"use client";

import { useEffect } from "react";

/* ============================================================================
 * CONFIG — mọi thông số chỉnh được (shape, màu, kích thước, độ sáng tối, tốc độ) của cả 3
 * hiệu ứng VIP đều gom vào khối này. Glow + sparkle chủ yếu là CSS thuần (custom property đặt
 * trên .playerRow trong wolf/page.module.css — xem khối CONFIG tương ứng ở đó), riêng FLASH gom
 * hết về đây vì phần lớn giá trị của nó (góc quét, background-image) vốn phải set bằng JS mỗi
 * lần chạy (ngẫu nhiên) — gom về 1 nguồn duy nhất, tránh CSS/JS lệch số nhau.
 * LƯU Ý ĐỒNG BỘ: SHINE_ACTIVE_MS dưới đây phải khớp --frame-glow-active-duration trong CSS
 * (CSS lo phần fade in/giữ/fade out bằng animation riêng, JS chỉ cần biết lúc nào gỡ
 * data-shine) — đổi 1 bên nhớ đổi bên kia.
 * ============================================================================ */

// Row spotlight (glow + sparkle): tần suất chọn hàng mới + thời lượng bật mỗi lượt.
const SHINE_MIN_DELAY_MS = 5000;
const SHINE_MAX_DELAY_MS = 10000; // tốc độ/tần suất: 5-10s giữa 2 lần bật
const SHINE_ACTIVE_MS = 4500; // tốc độ: 1 lượt bật kéo dài bao lâu (PHẢI khớp --frame-glow-active-duration ở CSS)

// Sparkle: khoảng thời gian giữa 2 lần đổi vị trí trên viền của MỖI sparkle.
const SPARKLE_REPOSITION_MIN_MS = 500;
const SPARKLE_REPOSITION_MAX_MS = 3000; // tốc độ: 0.5-3s giữa 2 lần đổi chỗ

// Flash: shape "line" (vạch thẳng, góc ngẫu nhiên mỗi lần) hoặc "circle" (vòng tròn, luôn quét
// cố định trái->phải, không có góc để random) — đổi giá trị này để chuyển hẳn kiểu hiệu ứng.
const FLASH_SHAPE: "line" | "circle" = "line";
const FLASH_COLOR_MIX_PERCENT = 75; // màu/độ sáng tối: % primary-light so với phần trong suốt (0-100, càng cao càng đặc/sáng)
const FLASH_LINE_THICKNESS_PERCENT = 16; // kích thước (chỉ shape "line"): bề dày vạch, tính theo % canvas quét 300% (~3x kích thước hàng)
const FLASH_CIRCLE_SIZE_REM = 6.5; // kích thước (chỉ shape "circle"): đường kính vòng tròn
const FLASH_DURATION_MS = 1300; // tốc độ: quét hết 1 lượt mất bao lâu
const FLASH_MIN_DELAY_MS = 4000;
const FLASH_MAX_DELAY_MS = 8000; // tần suất: 4-8s giữa 2 lần phóng flash — độc lập với chu kỳ glow/sparkle

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

const FLASH_COLOR = `color-mix(in srgb, var(--primary-light) ${FLASH_COLOR_MIX_PERCENT}%, transparent ${100 - FLASH_COLOR_MIX_PERCENT}%)`;

type FlashSweep = {
  backgroundImage: string;
  backgroundSize: string;
  startPosition: string;
  endPosition: string;
};

// Sinh 1 lượt quét cho shape "line": góc bất kỳ (0-360°, nên có thể ngang/dọc/chéo, không cố
// định hướng) rồi suy ra cặp toạ độ background-position đầu/cuối tương ứng đúng hướng đó (quy
// đổi góc CSS — 0° hướng lên, tăng theo chiều kim đồng hồ — sang vector rồi nhân với biên độ
// quét travel=150, khớp canvas 300% để vạch luôn đi hết từ ngoài mép này sang mép kia). Vạch
// LUÔN vuông góc với hướng di chuyển (bản chất linear-gradient) và canvas to hơn cả đường chéo
// hàng nên dù đi góc nào cũng chắc chắn cắt qua viền khung ở đâu đó trong hành trình.
function buildLineFlashSweep(): FlashSweep {
  const angleDeg = Math.random() * 360;
  const rad = (angleDeg * Math.PI) / 180;
  const dirX = Math.sin(rad);
  const dirY = -Math.cos(rad);
  const travel = 150;

  const startX = 50 - dirX * travel;
  const startY = 50 - dirY * travel;
  const endX = 50 + dirX * travel;
  const endY = 50 + dirY * travel;

  const half = FLASH_LINE_THICKNESS_PERCENT / 2;

  return {
    backgroundImage: `linear-gradient(${angleDeg.toFixed(1)}deg, transparent ${50 - half}%, ${FLASH_COLOR} 50%, transparent ${50 + half}%)`,
    backgroundSize: "300% 300%",
    startPosition: `${startX.toFixed(1)}% ${startY.toFixed(1)}%`,
    endPosition: `${endX.toFixed(1)}% ${endY.toFixed(1)}%`,
  };
}

// Lượt quét cho shape "circle": không có góc để random nữa nên luôn 1 hướng cố định trái->phải.
function buildCircleFlashSweep(): FlashSweep {
  return {
    backgroundImage: `radial-gradient(circle, ${FLASH_COLOR} 0%, transparent 70%)`,
    backgroundSize: `${FLASH_CIRCLE_SIZE_REM}rem ${FLASH_CIRCLE_SIZE_REM}rem`,
    startPosition: "-15% 50%",
    endPosition: "115% 50%",
  };
}

function buildFlashSweep(): FlashSweep {
  return FLASH_SHAPE === "circle" ? buildCircleFlashSweep() : buildLineFlashSweep();
}

/**
 * Điều phối hiệu ứng VIP (glow + sparkle + flash) cho khung info: gồm 3 việc độc lập. Mọi
 * thông số tốc độ/tần suất/kích thước/màu sắc lấy từ khối CONFIG ở đầu file.
 *
 * 1. Sparkle position: mỗi sparkle ([data-frame-sparkle]) tự di chuyển ngẫu nhiên giữa các
 *    điểm cố định trên viền — chạy nền cho MỌI sparkle kể cả khi đang ẩn (rẻ, không cần đợi
 *    hàng được chọn mới bắt đầu di chuyển).
 * 2. Row spotlight: định kỳ chọn ngẫu nhiên 1 hàng ĐỦ ĐIỀU KIỆN ([data-player-row-shine-card]
 *    — chỉ gắn cho user thực sự MUA/trang bị khung info, không phải khung mặc định) để bật
 *    data-shine="on" (glow xoay + sparkle nhấp nháy) rồi tắt, chỉ 1 hàng/1 thời điểm trong
 *    cùng 1 phòng — tương tự CardShine ở trang chủ nhưng gate theo hasEquippedProfileFrame
 *    thay vì mọi card.
 * 3. Flash: định kỳ, độc lập (có thể trúng hàng khác đang/không glow) chọn ngẫu nhiên 1 hàng
 *    đủ điều kiện, tính 1 lượt quét (buildFlashSweep) rồi set qua inline style trên
 *    [data-frame-flash], bật data-flash="on" để chạy 1 lượt rồi tắt.
 *
 * Quét lại DOM định kỳ để bắt sparkle/hàng của người chơi mới join (list phòng đổi động) mà
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
    let activeFlashRow: HTMLElement | null = null;

    const moveSparkle = (el: HTMLElement) => {
      if (stopped) {
        return;
      }

      const [x, y] = BORDER_POINTS[Math.floor(Math.random() * BORDER_POINTS.length)];
      el.style.left = `${x}%`;
      el.style.top = `${y}%`;

      const delay = SPARKLE_REPOSITION_MIN_MS + Math.random() * (SPARKLE_REPOSITION_MAX_MS - SPARKLE_REPOSITION_MIN_MS);
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

    const clearActiveFlash = () => {
      if (activeFlashRow) {
        activeFlashRow.removeAttribute("data-flash");
        activeFlashRow = null;
      }
    };

    const runFlashOnce = () => {
      const rows = Array.from(
        document.querySelectorAll<HTMLElement>("[data-player-row-shine-card]")
      );

      if (rows.length === 0) {
        scheduleFlash();
        return;
      }

      const row = rows[Math.floor(Math.random() * rows.length)];
      const flashEl = row.querySelector<HTMLElement>("[data-frame-flash]");

      if (!flashEl) {
        scheduleFlash();
        return;
      }

      const sweep = buildFlashSweep();

      // Nhảy tức thời về điểm bắt đầu (transition:none) trước khi bật transition thật, để
      // bước chuyển sang điểm kết thúc bên dưới luôn quét mượt theo đúng hướng vừa tính —
      // không "nhảy cóc" từ vị trí quét lần trước. transition set lại (không phải "") ngay
      // trước bước cuối để LUÔN mang đúng FLASH_DURATION_MS — nếu chỉ đặt transitionDuration
      // rồi gán transition="none"/"" thì bước "none" xoá sạch mọi longhand vừa set, cuối cùng
      // lại rơi về giá trị mặc định "1.3s" hardcode trong CSS thay vì theo đúng CONFIG (đã gặp
      // lỗi này khi mới thêm CONFIG).
      row.removeAttribute("data-flash");
      flashEl.style.backgroundImage = sweep.backgroundImage;
      flashEl.style.backgroundSize = sweep.backgroundSize;
      flashEl.style.animationDuration = `${FLASH_DURATION_MS}ms`;
      flashEl.style.transition = "none";
      flashEl.style.backgroundPosition = sweep.startPosition;
      void flashEl.offsetWidth; // ép reflow để trình duyệt chốt vị trí bắt đầu trước khi bật lại transition
      flashEl.style.transition = `background-position ${FLASH_DURATION_MS}ms linear`;
      flashEl.style.backgroundPosition = sweep.endPosition;
      row.setAttribute("data-flash", "on");
      activeFlashRow = row;

      timers.add(
        window.setTimeout(() => {
          clearActiveFlash();
          scheduleFlash();
        }, FLASH_DURATION_MS)
      );
    };

    const scheduleFlash = () => {
      const delay = FLASH_MIN_DELAY_MS + Math.random() * (FLASH_MAX_DELAY_MS - FLASH_MIN_DELAY_MS);
      timers.add(window.setTimeout(runFlashOnce, delay));
    };

    initNewSparkles();
    const rescanInterval = window.setInterval(initNewSparkles, RESCAN_INTERVAL_MS);
    scheduleShine();
    scheduleFlash();

    return () => {
      stopped = true;
      window.clearInterval(rescanInterval);
      timers.forEach((timer) => window.clearTimeout(timer));
      clearActiveRow();
      clearActiveFlash();
    };
  }, []);

  return null;
}
