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
// (màu solid --primary-light) đã khai báo sẵn trên .playerRowFrameInnerGlass.
// Từng bỏ hẳn linear-gradient (đổi sang màu solid đồng nhất) rồi thêm lại theo yêu cầu — mép
// dưới đục 55%, mép trên đục 45% (đảo lại so với lần trước). Hướng gradient lệch nhẹ 8deg khỏi
// phương thẳng đứng (0deg = "to top" tuyệt đối) theo yêu cầu "cho line méo qua 1 tí đừng thẳng
// đứng" — vẫn về cơ bản là dưới -> trên, chỉ nghiêng nhẹ.
// Opacity qua nhiều lần chỉnh: 40% -> 85% -> 65% -> 45%/55% -> 55%/45% -> 35%/45% -> 25%/45% —
// mix thấp khiến lớp kính LỘ RÕ backdrop phía sau (page background), mà backdrop lại khác nhau
// tuỳ nơi hiển thị (lobby thật = ảnh wolf_game_bg đã backdrop-filter blur, modal xem trước ở
// /shop = nền phẳng --bg-card) nên CÙNG 1 khung từng trông 2 màu khác hẳn nhau giữa preview và
// lobby dù code y hệt — tăng opacity giúp màu riêng của khung áp đảo backdrop phía sau, sau đó
// giảm dần lại theo yêu cầu.
export function frameGlassStyle(profileFrameColor: string | null): CSSProperties | undefined {
  if (!profileFrameColor) {
    return undefined;
  }

  const colorBottom = `color-mix(in srgb, ${profileFrameColor} 25%, transparent)`;
  const colorTop = `color-mix(in srgb, ${profileFrameColor} 45%, transparent)`;

  return {
    background: `linear-gradient(8deg, ${colorBottom} 0%, ${colorTop} 100%)`,
  };
}

// box-shadow phát sáng quanh avatar — CHỈ áp dụng cho người chơi đang trang bị 1 khung THẬT đã
// mua từ shop (caller tự kiểm tra hasEquippedProfileFrame trước khi gọi hàm này, không tự kiểm
// tra ở đây), dùng đúng frame_color đã khai báo lúc thêm khung vào shop (shop_items.frame_color)
// — mỗi khung 1 màu khác nhau nên phải set qua inline style, không hardcode trong CSS module.
export function frameAvatarGlowStyle(profileFrameColor: string): CSSProperties {
  return { boxShadow: `0px 0px 15px 0px ${profileFrameColor}` };
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
