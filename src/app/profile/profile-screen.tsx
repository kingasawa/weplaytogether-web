"use client";

import {
  ArrowLeft,
  Ban,
  Check,
  ChevronDown,
  Frame as FrameIcon,
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
import { PlayerAvatarImage } from "@/components/ui/player-avatar-image";
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
import {
  equipShopItem,
  getMyShopProfile,
  listMyOwnedShopItems,
  SHOP_ITEM_TYPE_LABELS,
  type MyOwnedShopItem,
} from "@/lib/shop";
import type { ShopItemType } from "@/lib/supabase/types";
import { ensureMyProfile, getMyProfile, updateMyProfile } from "@/lib/user-profile";
import { PlayerAvatarPicker } from "../games/wolf/player-avatar-picker";
import styles from "./profile.module.css";

type ProfileStatus = "loading" | "guest" | "ready";

export default function ProfileScreen() {
  const [status, setStatus] = useState<ProfileStatus>("loading");
  const [userId, setUserId] = useState<string | null>(null);
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

  const [isFrameExpanded, setIsFrameExpanded] = useState(false);
  const [ownedFrames, setOwnedFrames] = useState<MyOwnedShopItem[]>([]);
  const [equippedAvatarFrameId, setEquippedAvatarFrameId] = useState<string | null>(null);
  const [equippedProfileFrameId, setEquippedProfileFrameId] = useState<string | null>(null);
  const [equippingItemId, setEquippingItemId] = useState<string | null>(null);
  const [frameError, setFrameError] = useState("");

  const avatarFrameUrl =
    ownedFrames.find((item) => item.itemId === equippedAvatarFrameId)?.imageUrl ?? null;
  const ownedAvatarFrames = ownedFrames.filter((item) => item.itemType === "avatar_frame");
  const ownedProfileFrames = ownedFrames.filter((item) => item.itemType === "profile_frame");

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

      setUserId(data.session.user.id);
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

      void Promise.all([getMyShopProfile(), listMyOwnedShopItems()]).then(
        ([shopProfileResult, ownedItemsResult]) => {
          if (!isMounted) {
            return;
          }

          if (shopProfileResult.data) {
            setEquippedAvatarFrameId(shopProfileResult.data.equippedAvatarFrameId);
            setEquippedProfileFrameId(shopProfileResult.data.equippedProfileFrameId);
          }

          if (ownedItemsResult.data) {
            setOwnedFrames(ownedItemsResult.data);
          }
        }
      );
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

  // Trang bị/gỡ khung áp dụng ngay (không cần bấm "Lưu hồ sơ"), giống hành vi ở trang Shop.
  async function equipFrame(itemType: ShopItemType, itemId: string | null) {
    if (!userId) {
      return;
    }

    setEquippingItemId(itemId ?? `unequip-${itemType}`);
    setFrameError("");

    const { error: equipError } = await equipShopItem(itemType, itemId, userId);

    setEquippingItemId(null);

    if (equipError) {
      setFrameError(equipError);
      return;
    }

    if (itemType === "avatar_frame") {
      setEquippedAvatarFrameId(itemId);
    } else {
      setEquippedProfileFrameId(itemId);
    }
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
              <div
                className={`${styles.avatarPreview} ${avatarFrameUrl ? styles.avatarPreviewFramed : ""}`}
              >
                <PlayerAvatarImage
                  alt=""
                  aria-hidden="true"
                  width={112}
                  height={112}
                  src={avatarPreviewSrc}
                  avatarKey={avatarKey}
                />
                {avatarFrameUrl && (
                  <Image
                    alt=""
                    aria-hidden="true"
                    className={styles.avatarPreviewFrame}
                    width={160}
                    height={160}
                    src={avatarFrameUrl}
                    unoptimized
                  />
                )}
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

            <section className={styles.avatarGroup} aria-label="Khung">
              <button
                className={styles.avatarToggle}
                type="button"
                aria-expanded={isFrameExpanded}
                aria-controls="profile-frame-picker"
                onClick={() => setIsFrameExpanded((current) => !current)}
              >
                <span className={styles.rowIcon}>
                  <FrameIcon aria-hidden="true" />
                </span>
                <span className={styles.avatarToggleText}>
                  <h2>Khung</h2>
                  <p>Khung avatar &amp; khung thông tin đã sở hữu.</p>
                </span>
                <span className={isFrameExpanded ? styles.avatarToggleIconOpen : styles.avatarToggleIcon}>
                  <ChevronDown aria-hidden="true" />
                </span>
              </button>

              {isFrameExpanded && (
                <div id="profile-frame-picker" className={styles.frameGroupsWrap}>
                  {(["avatar_frame", "profile_frame"] as ShopItemType[]).map((itemType) => {
                    const items = itemType === "avatar_frame" ? ownedAvatarFrames : ownedProfileFrames;
                    const equippedId =
                      itemType === "avatar_frame" ? equippedAvatarFrameId : equippedProfileFrameId;
                    const unequipKey = `unequip-${itemType}`;

                    return (
                      <div className={styles.frameTypeGroup} key={itemType}>
                        <h3 className={styles.frameTypeTitle}>{SHOP_ITEM_TYPE_LABELS[itemType]}</h3>

                        {items.length === 0 ? (
                          <p className={styles.frameEmptyState}>
                            Bạn chưa sở hữu {SHOP_ITEM_TYPE_LABELS[itemType].toLowerCase()} nào.{" "}
                            <Link href="/shop">Mua ở Cửa hàng</Link>
                          </p>
                        ) : (
                          <div className={styles.frameTileGrid}>
                            <button
                              className={`${styles.frameTile} ${!equippedId ? styles.frameTileActive : ""}`}
                              type="button"
                              disabled={equippingItemId === unequipKey}
                              onClick={() => equipFrame(itemType, null)}
                            >
                              <span className={styles.frameTileEmpty}>
                                {equippingItemId === unequipKey ? (
                                  <LoaderCircle aria-hidden="true" />
                                ) : (
                                  <Ban aria-hidden="true" />
                                )}
                              </span>
                              <span>Không dùng</span>
                            </button>

                            {items.map((item) => (
                              <button
                                className={`${styles.frameTile} ${
                                  equippedId === item.itemId ? styles.frameTileActive : ""
                                }`}
                                type="button"
                                key={item.itemId}
                                disabled={equippingItemId === item.itemId}
                                onClick={() => equipFrame(itemType, item.itemId)}
                              >
                                <span className={styles.frameTileThumb}>
                                  <Image
                                    alt=""
                                    aria-hidden="true"
                                    fill
                                    sizes="72px"
                                    src={item.imageUrl}
                                    unoptimized
                                  />
                                  {equippingItemId === item.itemId && (
                                    <span className={styles.frameTileLoading}>
                                      <LoaderCircle aria-hidden="true" />
                                    </span>
                                  )}
                                </span>
                                <span>{item.name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {frameError && <p className={styles.errorText}>{frameError}</p>}
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
