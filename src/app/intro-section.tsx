"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import styles from "./page.module.css";

/** Google xét duyệt OAuth yêu cầu trang chủ nêu rõ tên app và app dùng để làm gì. */
export default function IntroSection() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <section className={styles.intro} aria-label="Giới thiệu WePlayTogether">
      <p>
        <strong>WePlayTogether</strong> là nền tảng chơi board game suy luận online dành cho nhóm
        bạn. Một người tạo phòng và chia sẻ mã phòng, cả nhóm vào bằng điện thoại của mình rồi chơi
        cùng nhau — không cần bộ bài giấy, không cần người quản trò.
      </p>

      {isExpanded && (
        <p id="intro-more">
          Bạn có thể chơi ngay với tên khách. Nếu chọn đăng nhập bằng Google, chúng tôi chỉ dùng
          tên hiển thị, địa chỉ email và ảnh đại diện của tài khoản Google để nhận diện bạn và
          hiển thị hồ sơ người chơi trên các thiết bị. Chúng tôi không đọc Gmail, Drive, Lịch hay
          Danh bạ, không bán dữ liệu và không dùng dữ liệu cho quảng cáo. Chi tiết xem{" "}
          <Link href="/privacy-policy">Chính sách bảo mật</Link>.
        </p>
      )}

      <button
        className={styles.introToggle}
        type="button"
        aria-expanded={isExpanded}
        aria-controls="intro-more"
        onClick={() => setIsExpanded((current) => !current)}
      >
        {isExpanded ? "Thu gọn" : "Xem thêm"}
        <span className={isExpanded ? styles.introToggleIconOpen : styles.introToggleIcon}>
          <ChevronDown aria-hidden="true" />
        </span>
      </button>
    </section>
  );
}
