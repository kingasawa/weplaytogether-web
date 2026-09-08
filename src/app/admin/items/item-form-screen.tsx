"use client";

import { ArrowLeft, LoaderCircle, Trash2, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import FrameEffects from "@/components/ui/frame-effects";
import PlayerRowPreview from "@/components/game/player-row-preview";
import {
  createShopItem,
  deleteShopItemImage,
  updateShopItem,
  uploadShopItemImage,
  type ShopItemInput,
} from "@/lib/admin-shop";
import { DEFAULT_PLAYER_AVATAR_KEY } from "@/lib/player-avatars";
import { SHOP_ITEM_IMAGE_ACCEPT } from "@/lib/shop-item-image";
import { SHOP_ITEM_TYPE_LABELS } from "@/lib/shop";
import type { ShopItemRow, ShopItemType } from "@/lib/supabase/types";
import styles from "../admin.module.css";

export type ItemFormMode = { mode: "create" } | { mode: "edit"; item: ShopItemRow };

// Spec ảnh khuyến nghị để khung hiển thị đúng khi ghép vào avatar/thanh thông tin người chơi.
// Ảnh tải lên sẽ TỰ ĐỘNG được nén + chuyển sang WebP ngay ở trình duyệt (bất kể định dạng/
// kích thước gốc) trước khi lưu lên Google Cloud Storage — không cần tự resize trước.
const IMAGE_SPEC_HINTS: Record<ShopItemType, string> = {
  avatar_frame:
    "Khuyến nghị: nền trong suốt, ảnh vuông, lỗ tròn trong suốt ở giữa ~60-65% canvas để không che avatar. Tự động nén còn tối đa 512×512px.",
  profile_frame:
    "Khuyến nghị: nền trong suốt, ảnh dạng khung dọc (~4:5, ví dụ 1122×1402px), phần giữa để trống cho avatar/tên hiện xuyên qua. Tự động nén còn tối đa cạnh dài 960px.",
};

// Màu mặc định của ô chọn màu (<input type="color">) — bắt buộc chọn ngay từ đầu (không còn ẩn
// sau checkbox bật/tắt như trước) nên EMPTY_FORM và formInputFromItem đều fallback về giá trị
// này thay vì null. --primary-light hiện tại (#8EA8FF) làm chuẩn để khớp đúng cảm giác "màu mặc
// định" của hệ thống.
const DEFAULT_COLOR_PICKER_VALUE = "#8EA8FF";

const EMPTY_FORM: ShopItemInput = {
  itemType: "profile_frame",
  name: "",
  description: "",
  priceCoins: 0,
  imageUrl: "",
  frameColor: DEFAULT_COLOR_PICKER_VALUE,
  isActive: true,
  sortOrder: 0,
};

function formInputFromItem(item: ShopItemRow): ShopItemInput {
  return {
    itemType: item.item_type,
    name: item.name,
    description: item.description ?? "",
    priceCoins: item.price_coins,
    imageUrl: item.image_url,
    frameColor: item.frame_color ?? DEFAULT_COLOR_PICKER_VALUE,
    isActive: item.is_active,
    sortOrder: item.sort_order,
  };
}

// Màn hình riêng (không phải modal) cho cả thêm mới lẫn sửa vật phẩm — dùng ở 2 route
// /admin/items/new và /admin/items/[id], theo yêu cầu tách khỏi modal cũ.
export default function ItemFormScreen({ formMode }: { formMode: ItemFormMode }) {
  const router = useRouter();
  const [formInput, setFormInput] = useState<ShopItemInput>(
    formMode.mode === "edit" ? formInputFromItem(formMode.item) : EMPTY_FORM
  );
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isDeletingImage, setIsDeletingImage] = useState(false);
  // Ảnh vừa tải lên GCS TRONG PHIÊN FORM NÀY (khác formInput.imageUrl — cái đó có thể là ảnh gốc
  // của vật phẩm đang sửa, không phải ảnh mới upload) — dùng để hỏi xoá lại nếu admin huỷ/thoát
  // mà không lưu, tránh rác ảnh mồ côi trên GCS. null nếu chưa upload gì mới trong phiên này.
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleImageFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // cho phép chọn lại đúng file cũ lần sau

    if (!file) {
      return;
    }

    setIsUploadingImage(true);
    setFormError("");

    const { data: imageUrl, error } = await uploadShopItemImage(formInput.itemType, file);

    setIsUploadingImage(false);

    if (error || !imageUrl) {
      setFormError(error ?? "Tải ảnh lên thất bại.");
      return;
    }

    setFormInput((current) => ({ ...current, imageUrl }));
    setUploadedImageUrl(imageUrl);
  }

  // Nút "Xoá ảnh" dưới view box xem trước — chỉ xuất hiện khi có ảnh vừa upload trong phiên form
  // này (uploadedImageUrl). Xoá xong thì clear cả imageUrl (ẩn preview) lẫn uploadedImageUrl
  // (mở lại nút Tải ảnh lên, vốn bị disable khi đã có ảnh để tránh upload chồng ảnh cũ chưa xoá).
  async function handleDeleteUploadedImage() {
    if (!uploadedImageUrl) {
      return;
    }

    setIsDeletingImage(true);
    setFormError("");

    const { error } = await deleteShopItemImage(uploadedImageUrl);

    setIsDeletingImage(false);

    if (error) {
      setFormError(error);
      return;
    }

    setFormInput((current) => ({ ...current, imageUrl: "" }));
    setUploadedImageUrl(null);
  }

  // Dùng cho cả nút "Quay lại danh sách" (mũi tên) lẫn nút "Hủy" — nếu có ảnh vừa upload trong
  // phiên form này chưa được lưu vào vật phẩm nào, hỏi xác nhận xoá khỏi GCS trước khi thoát để
  // không để rác. Từ chối xác nhận thì ở lại form (không thoát, không xoá).
  async function handleExit() {
    if (uploadedImageUrl) {
      const confirmed = window.confirm(
        "Bạn vừa tải 1 ảnh lên nhưng chưa lưu vật phẩm. Thoát sẽ xoá ảnh này khỏi hệ thống lưu trữ. Tiếp tục?"
      );

      if (!confirmed) {
        return;
      }

      await deleteShopItemImage(uploadedImageUrl);
    }

    router.push("/admin/items");
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
      formMode.mode === "edit" ? await updateShopItem(formMode.item.id, input) : await createShopItem(input);

    setIsSaving(false);

    if (result.error) {
      setFormError(result.error);
      return;
    }

    router.push("/admin/items");
  }

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <button className={styles.iconOnlyButton} type="button" aria-label="Quay lại danh sách" onClick={() => void handleExit()}>
            <ArrowLeft aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className={styles.formScreenCard}>
        <h1 className={styles.formScreenTitle}>
          {formMode.mode === "create" ? "Thêm vật phẩm" : `Sửa vật phẩm: ${formMode.item.name}`}
        </h1>

        <form className={styles.formGrid} onSubmit={submitForm}>
          <div className={styles.formLayout}>
            <div className={styles.formLayoutPreview}>
              <div className={styles.formField}>
                <label htmlFor="item-image-url">Ảnh vật phẩm</label>
                <input
                  ref={fileInputRef}
                  accept={SHOP_ITEM_IMAGE_ACCEPT}
                  className={styles.hiddenFileInput}
                  type="file"
                  onChange={handleImageFileSelected}
                />
                <div className={styles.uploadRow}>
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    disabled={isUploadingImage || Boolean(uploadedImageUrl)}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {isUploadingImage ? <LoaderCircle aria-hidden="true" /> : <Upload aria-hidden="true" />}
                    {isUploadingImage ? "Đang tải lên..." : "Tải ảnh lên"}
                  </button>
                  {formInput.itemType === "profile_frame" && (
                    <input
                      aria-label="Màu lớp kính bên trong khung"
                      className={styles.colorSwatch}
                      title="Màu lớp kính bên trong khung"
                      type="color"
                      value={formInput.frameColor ?? DEFAULT_COLOR_PICKER_VALUE}
                      onChange={(event) => setFormInput((current) => ({ ...current, frameColor: event.target.value }))}
                    />
                  )}
                </div>
                <input
                  id="item-image-url"
                  placeholder="hoặc dán URL ảnh có sẵn"
                  type="text"
                  value={formInput.imageUrl}
                  onChange={(event) => setFormInput((current) => ({ ...current, imageUrl: event.target.value }))}
                />
                <p className={styles.formHint}>{IMAGE_SPEC_HINTS[formInput.itemType]}</p>
              </div>
              {formInput.imageUrl.trim() && (
                // View box nền giống hệt nền thật của phòng chờ (wolf_game_bg.webp, xem
                // .avalonTheme.wolfThemeBg trong wolf/page.module.css) — lớp kính bên trong khung
                // là màu trong suốt pha (color-mix), nên MÀU NỀN PHÍA SAU ảnh hưởng trực tiếp tới
                // màu hiển thị cuối cùng; đặt trên nền phẳng/ngẫu nhiên của trang admin sẽ ra màu
                // khác hẳn lúc lên phòng chờ thật. Dùng LẠI đúng component xem trước ở /shop
                // (PlayerRowPreview) để admin thấy khung sẽ trông ra sao khi ghép vào hàng người
                // chơi thật trong lobby. FrameEffects cần render 1 lần để glow/sparkle/flash thật
                // sự chạy (PlayerRowPreview chỉ dựng sẵn DOM, không tự animate).
                <div className={styles.previewViewbox}>
                  <FrameEffects />
                  <PlayerRowPreview
                    name={formInput.name.trim() || "Xem trước"}
                    avatarKey={DEFAULT_PLAYER_AVATAR_KEY}
                    avatarFrameUrl={formInput.itemType === "avatar_frame" ? formInput.imageUrl.trim() : null}
                    profileFrameUrl={formInput.itemType === "profile_frame" ? formInput.imageUrl.trim() : null}
                    profileFrameColor={formInput.itemType === "profile_frame" ? formInput.frameColor : null}
                  />
                </div>
              )}
              {/* Chỉ hiện khi ảnh đang xem trước là ảnh VỪA upload trong phiên form này
                  (uploadedImageUrl) — xoá xong mở lại nút Tải ảnh lên (đang disable ở trên). */}
              {uploadedImageUrl && (
                <button
                  className={`${styles.secondaryButton} ${styles.dangerButton}`}
                  type="button"
                  disabled={isDeletingImage}
                  onClick={() => void handleDeleteUploadedImage()}
                >
                  {isDeletingImage ? <LoaderCircle aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
                  {isDeletingImage ? "Đang xoá..." : "Xoá ảnh vừa tải lên"}
                </button>
              )}
            </div>

            <div className={styles.formLayoutFields}>
              <div className={`${styles.formField} ${styles.formFieldWide}`}>
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
                <label htmlFor="item-price">Giá (Xu)</label>
                <input
                  id="item-price"
                  min={0}
                  type="number"
                  value={formInput.priceCoins}
                  onChange={(event) => setFormInput((current) => ({ ...current, priceCoins: Number(event.target.value) }))}
                />
              </div>

              <div className={styles.formField}>
                <label htmlFor="item-sort-order">Thứ tự hiển thị</label>
                <input
                  id="item-sort-order"
                  type="number"
                  value={formInput.sortOrder}
                  onChange={(event) => setFormInput((current) => ({ ...current, sortOrder: Number(event.target.value) }))}
                />
              </div>

              <div className={`${styles.formCheckboxRow} ${styles.formFieldWide}`}>
                <input
                  checked={formInput.isActive}
                  id="item-is-active"
                  type="checkbox"
                  onChange={(event) => setFormInput((current) => ({ ...current, isActive: event.target.checked }))}
                />
                <label htmlFor="item-is-active">Đang mở bán (hiện trên shop)</label>
              </div>

              <div className={`${styles.formField} ${styles.formFieldWide}`}>
                <label htmlFor="item-description">Mô tả (tùy chọn)</label>
                <textarea
                  id="item-description"
                  maxLength={200}
                  value={formInput.description ?? ""}
                  onChange={(event) => setFormInput((current) => ({ ...current, description: event.target.value }))}
                />
              </div>

            </div>
          </div>

          {formError && <p className={styles.errorText}>{formError}</p>}

          <div className={styles.formActions}>
            <button className={styles.secondaryButton} type="button" onClick={() => void handleExit()}>
              <X aria-hidden="true" />
              Hủy
            </button>
            <button className={styles.primaryButton} type="submit" disabled={isSaving}>
              {isSaving && <LoaderCircle aria-hidden="true" />}
              {formMode.mode === "create" ? "Tạo vật phẩm" : "Lưu thay đổi"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
