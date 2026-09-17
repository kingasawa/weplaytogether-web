"use client";

import Image from "next/image";
import { useState, type KeyboardEvent, type ReactNode } from "react";

const MASK_IMAGE_PATH = "/images/ui/mask_card.webp";

type CardFlipRevealProps = {
  /** CSS module đã import ở nơi gọi (cả 3 game dùng chung wolf/page.module.css). */
  styles: Record<string, string>;
  onUnlock: () => void;
  /** Mặt sau của lá bài (thường là <RoleCard />) — đứng yên, chỉ hiện ra khi mặt trước (mask)
   * xoay quá 90° và ẩn đi nhờ backface-visibility, giống lật thật 1 lá bài vật lý 2 mặt. */
  children: ReactNode;
};

// Lật 3D thật sự (2 mặt của CÙNG 1 khối, không phải mask fade ra rồi lộ nội dung đứng yên bên
// dưới): mặt trước (mask) và mặt sau (children) cùng xoay theo 1 div duy nhất
// (transform-style: preserve-3d). Mặt sau tự xoay bù 180° bằng CSS (.cardFlipFaceBack) nên khi
// container quay hết 180°, nó hiện ra đúng chiều, không bị lật ngược/soi gương.
//
// CỐ Ý dùng CSS transition thuần (style + class .cardFlipCard trong page.module.css) thay vì
// Motion's `animate` prop: đã thực đo bằng tay — animate rotateY bằng Motion (JS/rAF-driven) bị
// KẸT giữa chừng khi lật ÚP LẠI (180° → 0°), vì nửa đầu hành trình đó mặt trước vẫn đang
// backface-hidden (vô hình), trình duyệt/Motion tối ưu ngừng tick cho phần tử coi như "vô hình"
// nên animation không bao giờ chạy hết. CSS transition do compositor trình duyệt tự chạy native,
// không bị ảnh hưởng bởi tối ưu ẩn/hiện này nên lật cả 2 chiều đều mượt.
// Bấm để lật mở, bấm lại để úp về; trạng thái lật chỉ là hiển thị cục bộ — úp lại KHÔNG huỷ trạng
// thái "đã xem" đã báo cho cha qua onUnlock() (dùng để mở khoá nút "Sẵn sàng" ở màn cha).
export function CardFlipReveal({ styles, onUnlock, children }: CardFlipRevealProps) {
  const [isFlipped, setIsFlipped] = useState(false);

  function handleTap() {
    if (isFlipped) {
      setIsFlipped(false);
      return;
    }

    setIsFlipped(true);
    onUnlock();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    handleTap();
  }

  return (
    <div className={styles.cardFlipWrap}>
      <div className={styles.privateRevealBox}>
        <div className={styles.cardFlipScene}>
          <div
            aria-label={isFlipped ? "Úp lá bài lại" : "Lật mở lá bài"}
            aria-pressed={isFlipped}
            className={styles.cardFlipCard}
            role="button"
            style={{ transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)" }}
            tabIndex={0}
            onClick={handleTap}
            onKeyDown={handleKeyDown}
          >
            <div className={styles.cardFlipFaceFront}>
              <Image
                alt=""
                aria-hidden="true"
                className={styles.cardFlipMaskImage}
                draggable={false}
                fill
                sizes="(max-width: 768px) 100vw, 30rem"
                src={MASK_IMAGE_PATH}
              />
            </div>
            <div className={styles.cardFlipFaceBack}>{children}</div>
          </div>
        </div>
      </div>
      <p className={styles.cardFlipHintText}>
        {isFlipped ? "Chạm vào lá bài để đóng" : "Chạm vào lá bài để xem"}
      </p>
    </div>
  );
}
