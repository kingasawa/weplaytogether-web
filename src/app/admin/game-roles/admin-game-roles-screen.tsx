"use client";

import { Contact, ImageOff, LoaderCircle, Pencil } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { listAllGameRoles } from "@/lib/admin-game-roles";
import { GAME_ROLE_KEY_LABELS, type GameRoleKey, type GameRoleRow } from "@/lib/game-roles";
import styles from "../admin.module.css";

type FilterTab = GameRoleKey;

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "wolf", label: GAME_ROLE_KEY_LABELS.wolf },
  { key: "classic_wolf", label: GAME_ROLE_KEY_LABELS.classic_wolf },
  { key: "avalon", label: GAME_ROLE_KEY_LABELS.avalon },
];

// Danh sách CHỈ ĐỌC — sửa role (ảnh, tên VI, tên EN) nằm ở trang riêng /admin/game-roles/[id]
// (không còn sửa inline ngay trong bảng), giống hệt pattern /admin/items.
export default function AdminGameRolesScreen() {
  const [roles, setRoles] = useState<GameRoleRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>("wolf");

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await listAllGameRoles();
    setIsLoading(false);

    if (error) {
      setLoadError(error);
      return;
    }

    setLoadError("");
    setRoles(data ?? []);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const visibleRoles = roles.filter((role) => role.gameKey === filterTab);

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1>Role trong game</h1>
          <p>Đổi tên hiển thị (Việt/Anh) và ảnh lá bài của từng role — không cần sửa code.</p>
        </div>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Lọc theo game">
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

      {loadError && <p className={styles.errorText}>{loadError}</p>}

      {isLoading ? (
        <div className={styles.loadingRow}>
          <LoaderCircle aria-hidden="true" />
          Đang tải role...
        </div>
      ) : visibleRoles.length === 0 && !loadError ? (
        <div className={styles.tableWrapper}>
          <div className={styles.emptyState}>
            <Contact aria-hidden="true" />
            <p>Chưa có dữ liệu role nào. Hãy chạy migration 202609100001_game_roles.sql trước.</p>
          </div>
        </div>
      ) : (
        !loadError && (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.roleImageColumn}>Ảnh</th>
                  <th>Game</th>
                  <th>Role (key)</th>
                  <th>Tên hiển thị (VI)</th>
                  <th>Tên hiển thị (EN)</th>
                  <th>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {visibleRoles.map((role) => (
                  <tr key={role.id}>
                    <td className={styles.roleImageColumn}>
                      <span className={styles.roleThumb}>
                        {role.imageUrl ? (
                          <Image alt="" fill sizes="5.5rem" src={role.imageUrl} unoptimized />
                        ) : (
                          <ImageOff aria-hidden="true" />
                        )}
                      </span>
                    </td>
                    <td>{GAME_ROLE_KEY_LABELS[role.gameKey]}</td>
                    <td>
                      <code>{role.roleKey}</code>
                    </td>
                    <td>{role.displayNameVi}</td>
                    <td>{role.displayNameEn}</td>
                    <td>
                      <div className={styles.rowActions}>
                        <Link
                          className={styles.iconOnlyButton}
                          aria-label={`Sửa ${role.roleKey}`}
                          href={`/admin/game-roles/${role.id}`}
                        >
                          <Pencil aria-hidden="true" />
                        </Link>
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
