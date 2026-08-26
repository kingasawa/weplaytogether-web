"use client";

import {
  ArrowLeft,
  Check,
  Coins,
  Frame,
  IdCard,
  LoaderCircle,
  LogIn,
  ShoppingBag,
  Sparkles,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { buildAuthPath } from "@/lib/auth-redirect";
import { isAllowedGmailSession } from "@/lib/supabase/auth-client";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  equipShopItem,
  getMyShopProfile,
  listMyShopItemIds,
  listShopItems,
  purchaseShopItem,
  SHOP_ITEM_TYPE_LABELS,
  type MyShopProfile,
  type ShopItem,
} from "@/lib/shop";
import type { ShopItemType } from "@/lib/supabase/types";
import styles from "./shop.module.css";

type ShopStatus = "loading" | "guest" | "ready";
type FilterTab = "all" | ShopItemType;

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "avatar_frame", label: SHOP_ITEM_TYPE_LABELS.avatar_frame },
  { key: "profile_frame", label: SHOP_ITEM_TYPE_LABELS.profile_frame },
];

export default function ShopScreen() {
  const [status, setStatus] = useState<ShopStatus>("loading");
  const [loadError, setLoadError] = useState("");
  const [items, setItems] = useState<ShopItem[]>([]);
  const [ownedItemIds, setOwnedItemIds] = useState<Set<string>>(new Set());
  const [profile, setProfile] = useState<MyShopProfile | null>(null);
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [previewItem, setPreviewItem] = useState<ShopItem | null>(null);
  const [isActionPending, setIsActionPending] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function load() {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const hasSession = Boolean(session && isAllowedGmailSession(session));

      const [itemsResult, profileResult, ownedResult] = await Promise.all([
        listShopItems(),
        hasSession ? getMyShopProfile() : Promise.resolve({ data: null, error: null } as const),
        hasSession ? listMyShopItemIds() : Promise.resolve({ data: new Set<string>(), error: null } as const),
      ]);

      if (!isMounted) {
        return;
      }

      if (itemsResult.error) {
        setLoadError(itemsResult.error);
      } else {
        setItems(itemsResult.data ?? []);
      }

      if (hasSession) {
        setProfile(profileResult.data ?? null);
        setOwnedItemIds(ownedResult.data ?? new Set());
        setStatus("ready");
      } else {
        setStatus("guest");
      }
    }

    void load();

    return () => {
      isMounted = false;
    };
  }, []);

  const visibleItems = useMemo(
    () => (filterTab === "all" ? items : items.filter((item) => item.item_type === filterTab)),
    [items, filterTab]
  );

  function openPreview(item: ShopItem) {
    setActionError("");
    setActionMessage("");
    setPreviewItem(item);
  }

  function closePreview() {
    setPreviewItem(null);
    setActionError("");
    setActionMessage("");
  }

  async function handlePurchase(item: ShopItem) {
    setIsActionPending(true);
    setActionError("");
    setActionMessage("");

    const { data, error } = await purchaseShopItem(item.id);

    setIsActionPending(false);

    if (error || !data) {
      setActionError(error ?? "Không thể mua vật phẩm.");
      return;
    }

    setOwnedItemIds((current) => new Set(current).add(item.id));
    setProfile((current) => (current ? { ...current, totalCoins: data.remainingCoins } : current));
    setActionMessage("Mua thành công!");
  }

  async function handleEquip(item: ShopItem, equip: boolean) {
    if (!profile) {
      return;
    }

    setIsActionPending(true);
    setActionError("");
    setActionMessage("");

    const targetId = equip ? item.id : null;
    const { error } = await equipShopItem(item.item_type, targetId, profile.userId);

    setIsActionPending(false);

    if (error) {
      setActionError(error);
      return;
    }

    setProfile((current) =>
      current
        ? {
            ...current,
            equippedAvatarFrameId:
              item.item_type === "avatar_frame" ? targetId : current.equippedAvatarFrameId,
            equippedProfileFrameId:
              item.item_type === "profile_frame" ? targetId : current.equippedProfileFrameId,
          }
        : current
    );
    setActionMessage(equip ? "Đã trang bị vật phẩm." : "Đã gỡ trang bị.");
  }

  return (
    <main className={styles.page}>
      <section className={styles.screen} aria-labelledby="shop-title">
        <header className={styles.topBar}>
          <Link className={styles.iconButton} href="/" aria-label="Về trang chủ">
            <ArrowLeft aria-hidden="true" />
          </Link>
          <div className={styles.navTitle}>
            <h1 id="shop-title">Cửa Hàng</h1>
          </div>
          <div className={styles.coinBadge} aria-label="Số Xu hiện có">
            <Coins aria-hidden="true" />
            {status === "ready" && profile ? profile.totalCoins.toLocaleString("vi-VN") : "—"}
          </div>
        </header>

        {status === "loading" && (
          <div className={styles.stateBlock}>
            <LoaderCircle className={styles.stateSpinner} aria-hidden="true" />
            <h2>Đang tải cửa hàng</h2>
          </div>
        )}

        {status !== "loading" && (
          <>
            <div className={styles.tabs} role="tablist" aria-label="Lọc vật phẩm">
              {FILTER_TABS.map((tab) => (
                <button
                  key={tab.key}
                  className={`${styles.tab} ${filterTab === tab.key ? styles.tabActive : ""}`}
                  type="button"
                  role="tab"
                  aria-selected={filterTab === tab.key}
                  onClick={() => setFilterTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {status === "guest" && (
              <p className={styles.guestNotice}>
                <LogIn aria-hidden="true" />
                Đăng nhập để mua và trang bị vật phẩm.{" "}
                <Link href={buildAuthPath("/auth/sign-in", "/shop")}>Đăng nhập ngay</Link>
              </p>
            )}

            {loadError && <p className={styles.errorText}>{loadError}</p>}

            {!loadError && visibleItems.length === 0 && (
              <div className={styles.stateBlock}>
                <span className={styles.stateIcon}>
                  <ShoppingBag aria-hidden="true" />
                </span>
                <h2>Chưa có vật phẩm</h2>
                <p>Cửa hàng đang được cập nhật, quay lại sau nhé.</p>
              </div>
            )}

            {visibleItems.length > 0 && (
              <div className={styles.itemGrid}>
                {visibleItems.map((item) => {
                  const isOwned = ownedItemIds.has(item.id);
                  const equippedId =
                    item.item_type === "avatar_frame"
                      ? profile?.equippedAvatarFrameId
                      : profile?.equippedProfileFrameId;
                  const isEquipped = isOwned && equippedId === item.id;

                  return (
                    <button
                      className={styles.itemCard}
                      key={item.id}
                      type="button"
                      onClick={() => openPreview(item)}
                    >
                      <span className={styles.itemImage}>
                        <Image alt="" aria-hidden="true" fill sizes="(max-width: 480px) 44vw, 220px" src={item.image_url} unoptimized />
                        {isEquipped && (
                          <span className={styles.itemEquippedBadge}>
                            <Check aria-hidden="true" />
                          </span>
                        )}
                      </span>
                      <span className={styles.itemName}>{item.name}</span>
                      <span className={styles.itemPriceRow}>
                        {isOwned ? (
                          <span className={styles.itemOwnedLabel}>
                            {isEquipped ? "Đang dùng" : "Đã sở hữu"}
                          </span>
                        ) : (
                          <>
                            <Coins aria-hidden="true" />
                            {item.price_coins.toLocaleString("vi-VN")}
                          </>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>

      {previewItem && (
        <div className={styles.modalBackdrop} role="presentation" onClick={closePreview}>
          <section
            aria-labelledby="shop-preview-title"
            aria-modal="true"
            className={styles.modal}
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <button className={styles.closeButton} type="button" aria-label="Đóng xem trước" onClick={closePreview}>
              <X aria-hidden="true" />
            </button>

            <div className={styles.previewImage}>
              <Image alt="" aria-hidden="true" fill sizes="(max-width: 768px) 100vw, 28rem" src={previewItem.image_url} unoptimized />
            </div>

            <div className={styles.previewBody}>
              <span className={styles.previewTypeChip}>
                {previewItem.item_type === "avatar_frame" ? (
                  <Frame aria-hidden="true" />
                ) : (
                  <IdCard aria-hidden="true" />
                )}
                {SHOP_ITEM_TYPE_LABELS[previewItem.item_type]}
              </span>
              <h2 id="shop-preview-title">{previewItem.name}</h2>
              {previewItem.description && <p className={styles.previewDescription}>{previewItem.description}</p>}

              {(() => {
                const isOwned = ownedItemIds.has(previewItem.id);
                const equippedId =
                  previewItem.item_type === "avatar_frame"
                    ? profile?.equippedAvatarFrameId
                    : profile?.equippedProfileFrameId;
                const isEquipped = isOwned && equippedId === previewItem.id;
                const canAfford = profile ? profile.totalCoins >= previewItem.price_coins : false;

                if (status === "guest") {
                  return (
                    <Link
                      className={styles.primaryButton}
                      href={buildAuthPath("/auth/sign-in", "/shop")}
                    >
                      <LogIn aria-hidden="true" />
                      Đăng nhập để mua
                    </Link>
                  );
                }

                if (!isOwned) {
                  return (
                    <>
                      <button
                        className={styles.primaryButton}
                        type="button"
                        disabled={isActionPending || !canAfford}
                        onClick={() => handlePurchase(previewItem)}
                      >
                        {isActionPending ? (
                          <LoaderCircle aria-hidden="true" />
                        ) : (
                          <Coins aria-hidden="true" />
                        )}
                        Mua • {previewItem.price_coins.toLocaleString("vi-VN")} Xu
                      </button>
                      {!canAfford && <p className={styles.errorText}>Bạn không đủ Xu cho vật phẩm này.</p>}
                    </>
                  );
                }

                if (!isEquipped) {
                  return (
                    <button
                      className={styles.primaryButton}
                      type="button"
                      disabled={isActionPending}
                      onClick={() => handleEquip(previewItem, true)}
                    >
                      {isActionPending ? <LoaderCircle aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
                      Trang bị
                    </button>
                  );
                }

                return (
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    disabled={isActionPending}
                    onClick={() => handleEquip(previewItem, false)}
                  >
                    {isActionPending ? <LoaderCircle aria-hidden="true" /> : <Check aria-hidden="true" />}
                    Đang sử dụng · Gỡ trang bị
                  </button>
                );
              })()}

              {actionError && <p className={styles.errorText}>{actionError}</p>}
              {actionMessage && <p className={styles.successText}>{actionMessage}</p>}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
