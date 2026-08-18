"use client";

import { ArrowLeft, Check, LoaderCircle, LogIn } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { buildAuthPath } from "@/lib/auth-redirect";
import { MAX_GUEST_PLAYER_NAME_LENGTH } from "@/lib/guest-player";
import { DEFAULT_PLAYER_AVATAR_KEY, type PlayerAvatarKey } from "@/lib/player-avatars";
import { getAuthDisplayName, isAllowedGmailSession } from "@/lib/supabase/auth-client";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { ensureMyProfile, getMyProfile, updateMyProfile } from "@/lib/user-profile";
import { PlayerAvatarPicker } from "../games/wolf/player-avatar-picker";
import styles from "./profile.module.css";

type ProfileStatus = "loading" | "guest" | "ready";

export default function ProfileScreen() {
  const [status, setStatus] = useState<ProfileStatus>("loading");
  const [email, setEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [avatarKey, setAvatarKey] = useState<PlayerAvatarKey>(DEFAULT_PLAYER_AVATAR_KEY);
  const [avatarObjectKey, setAvatarObjectKey] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    const supabase = createSupabaseBrowserClient();

    void supabase.auth.getSession().then(async ({ data }) => {
      if (!isMounted) {
        return;
      }

      if (!data.session || !isAllowedGmailSession(data.session)) {
        setStatus("guest");
        return;
      }

      setEmail(data.session.user.email ?? null);

      const profile = (await getMyProfile()) ?? (await ensureMyProfile(data.session));

      if (!isMounted) {
        return;
      }

      if (profile) {
        setDisplayName(profile.displayName || getAuthDisplayName(data.session));
        setAvatarKey(profile.avatarKey);
        setAvatarObjectKey(profile.avatarObjectKey);
      } else {
        setDisplayName(getAuthDisplayName(data.session));
      }

      setStatus("ready");
    });

    return () => {
      isMounted = false;
    };
  }, []);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    const normalizedName = displayName.trim();

    if (!normalizedName) {
      setError("Vui lòng nhập tên hiển thị.");
      return;
    }

    setIsSaving(true);
    const updated = await updateMyProfile({ displayName: normalizedName, avatarKey, avatarObjectKey });
    setIsSaving(false);

    if (!updated) {
      setError("Không thể lưu hồ sơ. Hãy thử lại.");
      return;
    }

    setDisplayName(updated.displayName);
    setAvatarKey(updated.avatarKey);
    setAvatarObjectKey(updated.avatarObjectKey);
    setMessage("Đã lưu hồ sơ.");
  }

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <div className={styles.header}>
          <Link className={styles.backLink} href="/" aria-label="Về trang chủ">
            <ArrowLeft aria-hidden="true" />
          </Link>
          <h1>Hồ sơ người chơi</h1>
        </div>

        {status === "loading" && (
          <p className={styles.statusText}>
            <LoaderCircle aria-hidden="true" />
            Đang tải hồ sơ...
          </p>
        )}

        {status === "guest" && (
          <div className={styles.guestBlock}>
            <p>Bạn cần đăng nhập bằng Google để chỉnh sửa hồ sơ.</p>
            <Link className={styles.primaryButton} href={buildAuthPath("/auth/sign-in", "/profile")}>
              <LogIn aria-hidden="true" />
              Đăng nhập
            </Link>
          </div>
        )}

        {status === "ready" && (
          <form className={styles.form} onSubmit={saveProfile}>
            {email && <p className={styles.emailText}>{email}</p>}

            <label className={styles.field}>
              <span>Tên hiển thị trong game</span>
              <input
                maxLength={MAX_GUEST_PLAYER_NAME_LENGTH}
                placeholder="Nhập tên hiển thị"
                type="text"
                value={displayName}
                onChange={(event) => {
                  setDisplayName(event.target.value);
                  setMessage("");
                  setError("");
                }}
              />
            </label>

            <PlayerAvatarPicker
              selectedAvatarKey={avatarKey}
              selectedAvatarObjectKey={avatarObjectKey}
              onSelectAvatar={(nextAvatarKey) => {
                setAvatarKey(nextAvatarKey);
                setMessage("");
              }}
              onSelectAvatarObjectKey={(nextObjectKey) => {
                setAvatarObjectKey(nextObjectKey);
                setMessage("");
              }}
            />

            {error && <span className={styles.errorText}>{error}</span>}
            {message && <span className={styles.successText}>{message}</span>}

            <button className={styles.primaryButton} type="submit" disabled={isSaving}>
              {isSaving ? <LoaderCircle aria-hidden="true" /> : <Check aria-hidden="true" />}
              {isSaving ? "Đang lưu..." : "Lưu hồ sơ"}
            </button>

            <p className={styles.hintText}>
              Khi tạo hoặc tham gia game, nếu bạn không đổi tên/avatar riêng thì hệ thống sẽ dùng tên và avatar
              trong hồ sơ này.
            </p>
          </form>
        )}
      </section>
    </main>
  );
}
