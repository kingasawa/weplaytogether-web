import type { CSSProperties } from "react";

// mask-image dùng chung cho .playerRowFrameGlow/.playerRowFrameShine — phải set qua inline
// style (không hardcode trong CSS module) vì mỗi người trang bị 1 ảnh khung info khác nhau,
// giống cách .playerRowFrameOverlay set backgroundImage.
export function frameMaskStyle(profileFrameUrl: string): CSSProperties {
  return {
    WebkitMaskImage: `url(${profileFrameUrl})`,
    maskImage: `url(${profileFrameUrl})`,
  };
}

// Màu lớp kính (.playerRowFrameInnerGlass) theo màu riêng của khung (shop_items.frame_color, do
// admin chọn ở /admin/items) — set qua inline style (không hardcode trong CSS module) giống lý
// do ở frameMaskStyle: mỗi khung 1 màu khác nhau. profileFrameColor null (khung chưa set màu
// riêng, hoặc khung mặc định) -> trả về undefined, để CSS module tự dùng background mặc định
// (color-mix với --primary-light) đã khai báo sẵn trên .playerRowFrameInnerGlass.
// Công thức màu: 0% --primary-light của hệ thống (không pha, chỉ giữ cú pháp color-mix lồng để
// dễ chỉnh lại sau) + trộn thêm màu riêng của khung ở mức 40% (tức "60% trong suốt") để lớp
// kính nhẹ nhàng, không bị màu khung lấn át. Bọc trong linear-gradient (phải -> trái, đậm ->
// trong suốt hẳn) thay vì tô đặc đồng nhất cả lớp kính — cùng công thức/hướng với background
// mặc định khai báo sẵn trên .playerRowFrameInnerGlass (page.module.css), chỉ khác màu gốc dùng
// ở mép phải.
export function frameGlassStyle(profileFrameColor: string | null): CSSProperties | undefined {
  if (!profileFrameColor) {
    return undefined;
  }

  const color = `color-mix(in srgb, var(--primary-light) 0%, color-mix(in srgb, ${profileFrameColor} 40%, transparent))`;

  return {
    background: `linear-gradient(to left, ${color} 0%, transparent 100%)`,
  };
}

// Đặt custom property --frame-tint-color trên chính .playerRow (article, KHÔNG phải trên từng
// span hiệu ứng) — CSS custom property inherit xuống mọi phần tử con nên set 1 lần ở đây là đủ
// cho cả 3 hiệu ứng ánh sáng: .playerRowFrameGlow + .sparkle (đọc qua var() trong CSS module) và
// .playerRowFrameFlash (JS ở frame-effects.tsx set background-image chứa var(--frame-tint-color),
// trình duyệt tự resolve theo đúng hàng chứa nó). profileFrameColor null -> trả về undefined, để
// custom property giữ giá trị mặc định --primary-light khai báo sẵn trên .playerRow.
export function frameTintStyle(profileFrameColor: string | null): CSSProperties | undefined {
  if (!profileFrameColor) {
    return undefined;
  }

  return { "--frame-tint-color": profileFrameColor } as CSSProperties;
}
