"use client";

import { Frame, IdCard, LoaderCircle, Package, Pencil, Plus, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { deleteShopItem, listAllShopItems } from "@/lib/admin-shop";
import { SHOP_ITEM_TYPE_LABELS } from "@/lib/shop";
import type { ShopItemRow, ShopItemType } from "@/lib/supabase/types";
import styles from "../admin.module.css";

export default function AdminItemsScreen() {
  const [items, setItems] = useState<ShopItemRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  async function refresh() {
    setIsLoading(true);
    const { data, error } = await listAllShopItems();
    setIsLoading(false);

    if (error) {
      setLoadError(error);
      return;
    }

    setLoadError("");
    setItems(data ?? []);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleDelete(item: ShopItemRow) {
    if (!window.confirm(`Xóa vật phẩm "${item.name}"? Hành động này không thể hoàn tác.`)) {
      return;
    }

    setPendingDeleteId(item.id);
    const { error } = await deleteShopItem(item.id);
    setPendingDeleteId(null);

    if (error) {
      window.alert(error);
      return;
    }

    void refresh();
  }

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1>Vật phẩm shop</h1>
          <p>Quản lý khung avatar và khung thông tin người chơi bán trong shop.</p>
        </div>
        <Link className={styles.primaryButton} href="/admin/items/new">
          <Plus aria-hidden="true" />
          Thêm vật phẩm
        </Link>
      </div>

      {loadError && <p className={styles.errorText}>{loadError}</p>}

      {isLoading ? (
        <div className={styles.loadingRow}>
          <LoaderCircle aria-hidden="true" />
          Đang tải vật phẩm...
        </div>
      ) : items.length === 0 && !loadError ? (
        <div className={styles.tableWrapper}>
          <div className={styles.emptyState}>
            <Package aria-hidden="true" />
            <p>Chưa có vật phẩm nào. Bấm &quot;Thêm vật phẩm&quot; để tạo mới.</p>
          </div>
        </div>
      ) : (
        !loadError && (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Ảnh</th>
                  <th>Tên</th>
                  <th>Loại</th>
                  <th>Giá</th>
                  <th>Trạng thái</th>
                  <th>Thứ tự</th>
                  <th>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <span className={styles.thumb}>
                        <Image alt="" fill sizes="44px" src={item.image_url} unoptimized />
                      </span>
                    </td>
                    <td>{item.name}</td>
                    <td>
                      <span className={`${styles.badge} ${styles.badgeType}`}>
                        {item.item_type === "avatar_frame" ? (
                          <Frame aria-hidden="true" className={styles.badgeIcon} />
                        ) : (
                          <IdCard aria-hidden="true" className={styles.badgeIcon} />
                        )}
                        {SHOP_ITEM_TYPE_LABELS[item.item_type as ShopItemType]}
                      </span>
                    </td>
                    <td className={styles.coinCell}>{item.price_coins.toLocaleString("vi-VN")} Xu</td>
                    <td>
                      <span className={`${styles.badge} ${item.is_active ? styles.badgeActive : styles.badgeInactive}`}>
                        {item.is_active ? "Đang bán" : "Đã ẩn"}
                      </span>
                    </td>
                    <td>{item.sort_order}</td>
                    <td>
                      <div className={styles.rowActions}>
                        <Link className={styles.iconOnlyButton} aria-label={`Sửa ${item.name}`} href={`/admin/items/${item.id}`}>
                          <Pencil aria-hidden="true" />
                        </Link>
                        <button
                          className={`${styles.iconOnlyButton} ${styles.danger}`}
                          type="button"
                          aria-label={`Xóa ${item.name}`}
                          disabled={pendingDeleteId === item.id}
                          onClick={() => handleDelete(item)}
                        >
                          {pendingDeleteId === item.id ? (
                            <LoaderCircle aria-hidden="true" />
                          ) : (
                            <Trash2 aria-hidden="true" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
