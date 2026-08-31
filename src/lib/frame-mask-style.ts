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
