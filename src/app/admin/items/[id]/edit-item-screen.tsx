"use client";

import { AlertTriangle, ArrowLeft, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getShopItemById } from "@/lib/admin-shop";
import type { ShopItemRow } from "@/lib/supabase/types";
import ItemFormScreen from "../item-form-screen";
import styles from "../../admin.module.css";

// Route /admin/items/[id] chỉ nhận id qua URL (khác trước, khi mở modal sửa từ danh sách đã tải
// sẵn item trong state) — nên phải tự fetch lại đúng row này khi mount.
export default function EditItemScreen({ itemId }: { itemId: string }) {
  const [item, setItem] = useState<ShopItemRow | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setIsLoading(true);
      const result = await getShopItemById(itemId);

      if (!isMounted) {
        return;
      }

      setIsLoading(false);

      if (result.error) {
        setError(result.error);
        return;
      }

      setItem(result.data);
    }

    void load();

    return () => {
      isMounted = false;
    };
  }, [itemId]);

  if (isLoading) {
    return (
      <div className={styles.loadingRow}>
        <LoaderCircle aria-hidden="true" />
        Đang tải vật phẩm...
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className={styles.tableWrapper}>
        <div className={styles.emptyState}>
          <AlertTriangle aria-hidden="true" />
          <p>{error || "Không tìm thấy vật phẩm."}</p>
          <Link className={styles.secondaryButton} href="/admin/items">
            <ArrowLeft aria-hidden="true" />
            Về danh sách vật phẩm
          </Link>
        </div>
      </div>
    );
  }

  return <ItemFormScreen formMode={{ mode: "edit", item }} />;
}
