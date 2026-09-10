"use client";

import { useEffect } from "react";

// Tải trước 1 danh sách ảnh vào cache trình duyệt (không render gì) - dùng cho ảnh lá bài role
// giờ host trên GCS (weplaytogether-uploads) thay vì ảnh tĩnh cùng origin, nên có rủi ro mạng
// chập chờn đúng lúc cần hiện lá bài giữa ván sẽ làm gián đoạn trải nghiệm. Gọi hook này ở lobby
// (ngay khi vào phòng chờ, trước khi bắt đầu ván) và lặp lại ở play-screen (phòng khi người chơi
// vào thẳng ván đang chạy, ví dụ reconnect) để đảm bảo ảnh luôn sẵn sàng trước khi cần hiện.
export function usePreloadImages(urls: Array<string | null | undefined>) {
  const key = urls.filter((url): url is string => Boolean(url)).join("|");

  useEffect(() => {
    if (!key || typeof window === "undefined") {
      return;
    }

    const uniqueUrls = Array.from(new Set(key.split("|")));

    uniqueUrls.forEach((url) => {
      const image = new window.Image();
      image.src = url;
    });
    // key đã gộp toàn bộ urls thành 1 chuỗi ổn định - dùng làm dependency duy nhất để tránh
    // effect chạy lại vô ích khi caller truyền mảng mới nhưng nội dung không đổi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
