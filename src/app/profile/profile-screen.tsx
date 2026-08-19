"use client";

import {
  ArrowLeft,
  Check,
  ChevronDown,
  IdCard,
  LoaderCircle,
  LogIn,
  Mail,
  Pencil,
  UserRound,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { buildAuthPath } from "@/lib/auth-redirect";
import { MAX_GUEST_PLAYER_NAME_LENGTH } from "@/lib/guest-player";
import {
  DEFAULT_PLAYER_AVATAR_KEY,
  getPlayerAvatarSrc,
  getUploadedPlayerAvatarUrl,
  type PlayerAvatarKey,
} from "@/lib/player-avatars";
import {
  getAuthDisplayName,
  getGmailAvatarUrl,
  isAllowedGmailSession,
} from "@/lib/supabase/auth-client";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { ensureMyProfile, getMyProfile, updateMyProfile } from "@/lib/user-profile";
import { PlayerAvatarPicker } from "../games/wolf/player-avatar-picker";
import styles from "./profile.module.css";

type ProfileStatus = "loading" | "guest" | "ready";

export default function ProfileScreen() {
  const [status, setStatus] = useState<ProfileStatus>("loading");
  const [email, setEmail] = useState<string | null>(null);
  const [gmailAvatarUrl, setGmailAvatarUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [avatarKey, setAvatarKey] = useState<PlayerAvatarKey>(DEFAULT_PLAYER_AVATAR_KEY);
  const [avatarObjectKey, setAvatarObjectKey] = useState<string | null>(null);
  const [isAvatarExpanded, setIsAvatarExpanded] = useState(false);
  const [isNicknameEditing, setIsNicknameEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const nicknameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let isMounted = true;
    const supabase = createSupabaseBrowserClient();

    void supabase.auth.getSession().then(async ({ data }) => {
      if (!isMounted) {
        return;
      }

      if (!data.session || !isAllowedGmailSession(data.session)) {
        setEmail(null);
        setGmailAvatarUrl(null);
        setStatus("guest");
        return;
      }

      setEmail(data.session.user.email ?? null);
      setGmailAvatarUrl(getGmailAvatarUrl(data.session));

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

  useEffect(() => {
    if (isNicknameEditing) {
      nicknameInputRef.current?.focus();
    }
  }, [isNicknameEditing]);

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
    const { profile: updated, error: updateError } = await updateMyProfile({
      displayName: normalizedName,
      avatarKey,
      avatarObjectKey,
    });
    setIsSaving(false);

    if (!updated) {
      setError(updateError ?? "Không thể lưu hồ sơ. Hãy thử lại.");
      return;
    }

    setDisplayName(updated.displayName);
    setAvatarKey(updated.avatarKey);
    setAvatarObjectKey(updated.avatarObjectKey);
    setIsNicknameEditing(false);
    setMessage("Đã lưu hồ sơ.");
  }

  const avatarPreviewSrc = getPlayerAvatarSrc(
    avatarKey,
    getUploadedPlayerAvatarUrl(avatarObjectKey)
  );

  return (
    <main className={styles.page}>
      <section className={styles.screen} aria-labelledby="profile-title">
        <header className={styles.topBar}>
          <Link className={styles.iconButton} href="/" aria-label="Về trang chủ">
            <ArrowLeft aria-hidden="true" />
          </Link>
          <div className={styles.navTitle}>
            <h1 id="profile-title">Hồ sơ</h1>
          </div>
        </header>

        {status === "loading" && (
          <div className={styles.stateBlock}>
            <LoaderCircle className={styles.stateSpinner} aria-hidden="true" />
            <h2>Đang tải hồ sơ</h2>
            <p>Đợi một chút để đồng bộ tài khoản người chơi.</p>
          </div>
        )}

        {status === "guest" && (
          <div className={styles.stateBlock}>
            <span className={styles.stateIcon}>
              <IdCard aria-hidden="true" />
            </span>
            <h2>Bạn chưa đăng nhập</h2>
            <p>Đăng nhập bằng Google để chỉnh tên và avatar dùng trong game.</p>
            <Link className={styles.primaryButton} href={buildAuthPath("/auth/sign-in", "/profile")}>
              <LogIn aria-hidden="true" />
              Đăng nhập
            </Link>
          </div>
        )}

        {status === "ready" && (
          <form className={styles.form} onSubmit={saveProfile}>
            <section className={styles.identityPanel} aria-label="Người chơi hiện tại">
              <div className={styles.avatarPreview}>
                <Image
                  alt=""
                  aria-hidden="true"
                  width={112}
                  height={112}
                  src={avatarPreviewSrc}
                  unoptimized={Boolean(avatarObjectKey)}
                />
              </div>
              <div className={styles.identityCopy}>
                <div className={styles.identityNameRow}>
                  <h2>{displayName || "Người chơi"}</h2>
                  <button
                    className={styles.identityEditButton}
                    type="button"
                    aria-label="Edit nickname"
                    aria-controls="profile-nickname-input"
                    aria-expanded={isNicknameEditing}
                    onClick={() => setIsNicknameEditing(true)}
                  >
                    <Pencil aria-hidden="true" />
                  </button>
                </div>
                {email && <p>{email}</p>}
              </div>
            </section>

            <section className={styles.settingsGroup} aria-label="Thông tin hồ sơ">
              <div className={styles.settingRow}>
                <span className={styles.rowIcon}>
                  <UserRound aria-hidden="true" />
                </span>
                <span className={styles.rowBody}>
                  <span className={styles.rowLabel}>Nickname</span>
                  {isNicknameEditing ? (
                    <input
                      id="profile-nickname-input"
                      ref={nicknameInputRef}
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
                  ) : (
                    <span className={styles.rowValue}>{displayName}</span>
                  )}
                </span>
              </div>

              {email && (
                <div className={styles.settingRow}>
                  <span className={styles.rowIcon}>
                    <Mail aria-hidden="true" />
                  </span>
                  <span className={styles.rowBody}>
                    <span className={styles.rowLabel}>Email</span>
                    <span className={styles.rowValue}>{email}</span>
                  </span>
                </div>
              )}
            </section>

            <section className={styles.avatarGroup} aria-label="Avatar">
              <button
                className={styles.avatarToggle}
                type="button"
                aria-expanded={isAvatarExpanded}
                aria-controls="profile-avatar-picker"
                onClick={() => setIsAvatarExpanded((current) => !current)}
              >
                <span className={styles.rowIcon}>
                  <IdCard aria-hidden="true" />
                </span>
                <span className={styles.avatarToggleText}>
                  <h2>Avatar</h2>
                  <p>Hiển thị trong phòng chơi.</p>
                </span>
                <span className={isAvatarExpanded ? styles.avatarToggleIconOpen : styles.avatarToggleIcon}>
                  <ChevronDown aria-hidden="true" />
                </span>
              </button>

              {isAvatarExpanded && (
                <div id="profile-avatar-picker">
                  <PlayerAvatarPicker
                    className={styles.profileAvatarPicker}
                    legend="Bộ sưu tập"
                    variant="profile"
                    selectedAvatarKey={avatarKey}
                    selectedAvatarObjectKey={avatarObjectKey}
                    gmailAvatarUrl={gmailAvatarUrl}
                    onSelectAvatar={(nextAvatarKey) => {
                      setAvatarKey(nextAvatarKey);
                      setMessage("");
                    }}
                    onSelectAvatarObjectKey={(nextObjectKey) => {
                      setAvatarObjectKey(nextObjectKey);
                      setMessage("");
                    }}
                  />
                </div>
              )}
            </section>

            {(error || message) && (
              <p className={error ? styles.errorText : styles.successText} role="status">
                {error || message}
              </p>
            )}

            <div className={styles.saveBar}>
              <button className={styles.primaryButton} type="submit" disabled={isSaving}>
                {isSaving ? <LoaderCircle aria-hidden="true" /> : <Check aria-hidden="true" />}
                {isSaving ? "Đang lưu..." : "Lưu hồ sơ"}
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
