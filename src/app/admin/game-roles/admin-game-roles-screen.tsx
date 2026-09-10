"use client";

import { Check, Contact, ImageOff, LoaderCircle, Pencil, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { listAllGameRoles, updateGameRole } from "@/lib/admin-game-roles";
import type { GameRoleKey, GameRoleRow } from "@/lib/game-roles";
import styles from "../admin.module.css";

type FilterTab = "all" | GameRoleKey;

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "wolf", label: "Ma Sói Một Đêm" },
  { key: "classic_wolf", label: "Ma Sói Nhiều Đêm" },
  { key: "avalon", label: "Avalon" },
];

const GAME_LABELS: Record<GameRoleKey, string> = {
  wolf: "Ma Sói Một Đêm",
  classic_wolf: "Ma Sói Nhiều Đêm",
  avalon: "Avalon",
};

type EditDraft = { displayNameVi: string; displayNameEn: string; imageUrl: string };

export default function AdminGameRolesScreen() {
  const [roles, setRoles] = useState<GameRoleRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft>({ displayNameVi: "", displayNameEn: "", imageUrl: "" });
  const [isSaving, setIsSaving] = useState(false);
  const [rowError, setRowError] = useState("");

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    setIsLoading(true);
    const { data, error } = await listAllGameRoles();
    setIsLoading(false);

    if (error) {
      setLoadError(error);
      return;
    }

    setLoadError("");
    setRoles(data ?? []);
  }

  function startEdit(role: GameRoleRow) {
    setEditingId(role.id);
    setDraft({ displayNameVi: role.displayNameVi, displayNameEn: role.displayNameEn, imageUrl: role.imageUrl });
    setRowError("");
  }

  function cancelEdit() {
    setEditingId(null);
    setRowError("");
  }

  async function saveEdit(role: GameRoleRow) {
    const displayNameVi = draft.displayNameVi.trim();
    const displayNameEn = draft.displayNameEn.trim();
    const imageUrl = draft.imageUrl.trim();

    if (!displayNameVi || !displayNameEn) {
      setRowError("Vui lòng nhập tên hiển thị cho cả 2 ngôn ngữ.");
      return;
    }

    if (!imageUrl) {
      setRowError("Vui lòng nhập URL ảnh.");
      return;
    }

    setIsSaving(true);
    setRowError("");
    const { data, error } = await updateGameRole(role.id, { displayNameVi, displayNameEn, imageUrl });
    setIsSaving(false);

    if (error || !data) {
      setRowError(error ?? "Không thể lưu.");
      return;
    }

    setRoles((current) => current.map((row) => (row.id === role.id ? data : row)));
    setEditingId(null);
  }

  const visibleRoles = filterTab === "all" ? roles : roles.filter((role) => role.gameKey === filterTab);

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
                  <th className={styles.imageColumn}>Ảnh</th>
                  <th>Game</th>
                  <th>Role (key)</th>
                  <th>Tên hiển thị (VI)</th>
                  <th>Tên hiển thị (EN)</th>
                  <th>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {visibleRoles.map((role) => {
                  const isEditing = editingId === role.id;

                  return (
                    <tr key={role.id}>
                      <td className={styles.imageColumn}>
                        <span className={styles.thumb}>
                          {(isEditing ? draft.imageUrl : role.imageUrl) ? (
                            <Image
                              alt=""
                              width={44}
                              height={44}
                              src={isEditing ? draft.imageUrl : role.imageUrl}
                              unoptimized
                            />
                          ) : (
                            <ImageOff aria-hidden="true" />
                          )}
                        </span>
                      </td>
                      <td>{GAME_LABELS[role.gameKey]}</td>
                      <td>
                        <code>{role.roleKey}</code>
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            autoFocus
                            className={styles.searchInput}
                            maxLength={60}
                            type="text"
                            value={draft.displayNameVi}
                            onChange={(event) => setDraft((current) => ({ ...current, displayNameVi: event.target.value }))}
                          />
                        ) : (
                          role.displayNameVi
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            className={styles.searchInput}
                            maxLength={60}
                            type="text"
                            value={draft.displayNameEn}
                            onChange={(event) => setDraft((current) => ({ ...current, displayNameEn: event.target.value }))}
                          />
                        ) : (
                          role.displayNameEn
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <div className={styles.rowActions}>
                            <button
                              className={styles.iconOnlyButton}
                              type="button"
                              aria-label={`Lưu ${role.roleKey}`}
                              disabled={isSaving}
                              onClick={() => void saveEdit(role)}
                            >
                              {isSaving ? <LoaderCircle aria-hidden="true" /> : <Check aria-hidden="true" />}
                            </button>
                            <button className={styles.iconOnlyButton} type="button" aria-label="Hủy sửa" onClick={cancelEdit}>
                              <X aria-hidden="true" />
                            </button>
                          </div>
                        ) : (
                          <div className={styles.rowActions}>
                            <button
                              className={styles.iconOnlyButton}
                              type="button"
                              aria-label={`Sửa ${role.roleKey}`}
                              onClick={() => startEdit(role)}
                            >
                              <Pencil aria-hidden="true" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {editingId && (
              <div className={styles.formField}>
                <label htmlFor="game-role-image-url">URL ảnh lá bài đang sửa</label>
                <input
                  id="game-role-image-url"
                  placeholder="/images/boards/cards/... hoặc URL đầy đủ"
                  type="text"
                  value={draft.imageUrl}
                  onChange={(event) => setDraft((current) => ({ ...current, imageUrl: event.target.value }))}
                />
              </div>
            )}
            {rowError && <p className={styles.errorText}>{rowError}</p>}
          </div>
        )
      )}
    </div>
  );
}
