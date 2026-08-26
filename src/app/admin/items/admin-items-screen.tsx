"use client";

import { Frame, IdCard, LoaderCircle, Package, Pencil, Plus, Trash2, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useState, type FormEvent } from "react";
import {
  createShopItem,
  deleteShopItem,
  listAllShopItems,
  updateShopItem,
  type ShopItemInput,
} from "@/lib/admin-shop";
import { SHOP_ITEM_TYPE_LABELS } from "@/lib/shop";
import type { ShopItemRow, ShopItemType } from "@/lib/supabase/types";
import styles from "../admin.module.css";

type FormMode = { mode: "create" } | { mode: "edit"; item: ShopItemRow };

const EMPTY_FORM: ShopItemInput = {
  itemType: "avatar_frame",
  name: "",
  description: "",
  priceCoins: 0,
  imageUrl: "",
  isActive: true,
  sortOrder: 0,
};

export default function AdminItemsScreen() {
  const [items, setItems] = useState<ShopItemRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [formInput, setFormInput] = useState<ShopItemInput>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
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

  function openCreateForm() {
    setFormInput(EMPTY_FORM);
    setFormError("");
    setFormMode({ mode: "create" });
  }

  function openEditForm(item: ShopItemRow) {
    setFormInput({
      itemType: item.item_type,
      name: item.name,
      description: item.description ?? "",
      priceCoins: item.price_coins,
      imageUrl: item.image_url,
      isActive: item.is_active,
      sortOrder: item.sort_order,
    });
    setFormError("");
    setFormMode({ mode: "edit", item });
  }

  function closeForm() {
    setFormMode(null);
    setFormError("");
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = formInput.name.trim();
    const trimmedImageUrl = formInput.imageUrl.trim();

    if (!trimmedName) {
      setFormError("Vui lòng nhập tên vật phẩm.");
      return;
    }

    if (!trimmedImageUrl) {
      setFormError("Vui lòng nhập URL ảnh vật phẩm.");
      return;
    }

    if (!Number.isFinite(formInput.priceCoins) || formInput.priceCoins < 0) {
      setFormError("Giá Xu phải là số không âm.");
      return;
    }

    const input: ShopItemInput = {
      ...formInput,
      name: trimmedName,
      imageUrl: trimmedImageUrl,
      description: formInput.description?.trim() || null,
      priceCoins: Math.trunc(formInput.priceCoins),
      sortOrder: Math.trunc(formInput.sortOrder) || 0,
    };

    setIsSaving(true);
    setFormError("");

    const result =
      formMode?.mode === "edit"
        ? await updateShopItem(formMode.item.id, input)
        : await createShopItem(input);

    setIsSaving(false);

    if (result.error) {
      setFormError(result.error);
      return;
    }

    closeForm();
    void refresh();
  }

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
        <button className={styles.primaryButton} type="button" onClick={openCreateForm}>
          <Plus aria-hidden="true" />
          Thêm vật phẩm
        </button>
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
                        <button
                          className={styles.iconOnlyButton}
                          type="button"
                          aria-label={`Sửa ${item.name}`}
                          onClick={() => openEditForm(item)}
                        >
                          <Pencil aria-hidden="true" />
                        </button>
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

      {formMode && (
        <div className={styles.formBackdrop} role="presentation" onClick={closeForm}>
          <section
            aria-labelledby="admin-item-form-title"
            aria-modal="true"
            className={styles.formModal}
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="admin-item-form-title">
              {formMode.mode === "create" ? "Thêm vật phẩm" : `Sửa vật phẩm: ${formMode.item.name}`}
            </h2>

            <form className={styles.formGrid} onSubmit={submitForm}>
              <div className={styles.formField}>
                <label htmlFor="item-name">Tên vật phẩm</label>
                <input
                  id="item-name"
                  maxLength={60}
                  type="text"
                  value={formInput.name}
                  onChange={(event) => setFormInput((current) => ({ ...current, name: event.target.value }))}
                />
              </div>

              <div className={styles.formField}>
                <label htmlFor="item-type">Loại vật phẩm</label>
                <select
                  id="item-type"
                  value={formInput.itemType}
                  onChange={(event) =>
                    setFormInput((current) => ({ ...current, itemType: event.target.value as ShopItemType }))
                  }
                >
                  <option value="avatar_frame">{SHOP_ITEM_TYPE_LABELS.avatar_frame}</option>
                  <option value="profile_frame">{SHOP_ITEM_TYPE_LABELS.profile_frame}</option>
                </select>
              </div>

              <div className={styles.formField}>
                <label htmlFor="item-image-url">URL ảnh</label>
                <input
                  id="item-image-url"
                  placeholder="https://..."
                  type="text"
                  value={formInput.imageUrl}
                  onChange={(event) => setFormInput((current) => ({ ...current, imageUrl: event.target.value }))}
                />
                {formInput.imageUrl.trim() && (
                  <span className={styles.previewThumb}>
                    <Image alt="" fill sizes="200px" src={formInput.imageUrl.trim()} unoptimized />
                  </span>
                )}
              </div>

              <div className={styles.formField}>
                <label htmlFor="item-description">Mô tả (tùy chọn)</label>
                <textarea
                  id="item-description"
                  maxLength={200}
                  value={formInput.description ?? ""}
                  onChange={(event) =>
                    setFormInput((current) => ({ ...current, description: event.target.value }))
                  }
                />
              </div>

              <div className={styles.formField}>
                <label htmlFor="item-price">Giá (Xu)</label>
                <input
                  id="item-price"
                  min={0}
                  type="number"
                  value={formInput.priceCoins}
                  onChange={(event) =>
                    setFormInput((current) => ({ ...current, priceCoins: Number(event.target.value) }))
                  }
                />
              </div>

              <div className={styles.formField}>
                <label htmlFor="item-sort-order">Thứ tự hiển thị</label>
                <input
                  id="item-sort-order"
                  type="number"
                  value={formInput.sortOrder}
                  onChange={(event) =>
                    setFormInput((current) => ({ ...current, sortOrder: Number(event.target.value) }))
                  }
                />
              </div>

              <div className={styles.formCheckboxRow}>
                <input
                  checked={formInput.isActive}
                  id="item-is-active"
                  type="checkbox"
                  onChange={(event) =>
                    setFormInput((current) => ({ ...current, isActive: event.target.checked }))
                  }
                />
                <label htmlFor="item-is-active">Đang mở bán (hiện trên shop)</label>
              </div>

              {formError && <p className={styles.errorText}>{formError}</p>}

              <div className={styles.formActions}>
                <button className={styles.secondaryButton} type="button" onClick={closeForm}>
                  <X aria-hidden="true" />
                  Hủy
                </button>
                <button className={styles.primaryButton} type="submit" disabled={isSaving}>
                  {isSaving && <LoaderCircle aria-hidden="true" />}
                  {formMode.mode === "create" ? "Tạo vật phẩm" : "Lưu thay đổi"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
