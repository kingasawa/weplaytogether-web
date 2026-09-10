"use client";

import { useEffect } from "react";
import { isAllowedGmailSession } from "@/lib/supabase/auth-client";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { ensureMyProfile, getMyProfile } from "@/lib/user-profile";

// Đồng bộ lại localStorage["boardverse:account-profile"] mỗi khi mở app (nếu đã đăng
// nhập), phòng trường hợp tab/thiết bị này chưa từng ghé /profile hay auth callback nên
// localStorage rỗng hoặc cũ — dẫn tới việc vào phòng chơi lấy nhầm tên/avatar cũ dù đã
// đổi trong trang Hồ sơ. Không render UI gì, chỉ chạy side-effect nền.
export default function AccountProfileSync() {
  useEffect(() => {
    let isMounted = true;
    const supabase = createSupabaseBrowserClient();

    async function syncProfile() {
      const { data } = await supabase.auth.getSession();

      if (!isMounted || !isAllowedGmailSession(data.session)) {
        return;
      }

      const profile = await getMyProfile();

      if (isMounted && !profile && data.session) {
        await ensureMyProfile(data.session);
      }
    }

    void syncProfile();

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        void syncProfile();
      }
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return null;
}
