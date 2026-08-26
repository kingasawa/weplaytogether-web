"use client";

import { Check, Coins, LoaderCircle, Pencil, Trophy, UsersRound, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { listUsers, setUserCoins, type AdminUserRow } from "@/lib/admin-shop";
import {
  DEFAULT_PLAYER_AVATAR_KEY,
  getPlayerAvatarSrc,
  getUploadedPlayerAvatarUrl,
  isRemotePlayerAvatarSrc,
} from "@/lib/player-avatars";
import styles from "../admin.module.css";

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("vi-VN");
  } catch {
    return iso;
  }
}

export default function AdminUsersScreen() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingCoins, setEditingCoins] = useState("");
  const [isSavingCoins, setIsSavingCoins] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const timeoutId = window.setTimeout(async () => {
      setIsLoading(true);
      const { data, error } = await listUsers(searchInput);

      if (!isMounted) {
        return;
      }

      setIsLoading(false);

      if (error) {
        setLoadError(error);
        return;
      }

      setLoadError("");
      setUsers(data ?? []);
    }, 300);

    return () => {
      isMounted = false;
      window.clearTimeout(timeoutId);
    };
  }, [searchInput]);

  function startEditCoins(user: AdminUserRow) {
    setEditingUserId(user.id);
    setEditingCoins(String(user.total_coins));
  }

  function cancelEditCoins() {
    setEditingUserId(null);
    setEditingCoins("");
  }

  async function saveCoins(user: AdminUserRow) {
    const nextCoins = Number(editingCoins);

    if (!Number.isFinite(nextCoins) || nextCoins < 0) {
      window.alert("Số Xu không hợp lệ.");
      return;
    }

    setIsSavingCoins(true);
    const { error } = await setUserCoins(user.id, nextCoins);
    setIsSavingCoins(false);

    if (error) {
      window.alert(error);
      return;
    }

    setUsers((current) =>
      current.map((row) => (row.id === user.id ? { ...row, total_coins: Math.trunc(nextCoins) } : row))
    );
    setEditingUserId(null);
    setEditingCoins("");
  }

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1>Người dùng</h1>
          <p>Xem hồ sơ người chơi đã đăng nhập và chỉnh số Xu khi cần.</p>
        </div>
        <input
          className={styles.searchInput}
          placeholder="Tìm theo tên hoặc email..."
          type="search"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
        />
      </div>

      {loadError && <p className={styles.errorText}>{loadError}</p>}

      {isLoading ? (
        <div className={styles.loadingRow}>
          <LoaderCircle aria-hidden="true" />
          Đang tải người dùng...
        </div>
      ) : users.length === 0 && !loadError ? (
        <div className={styles.tableWrapper}>
          <div className={styles.emptyState}>
            <UsersRound aria-hidden="true" />
            <p>Không tìm thấy người dùng nào.</p>
          </div>
        </div>
      ) : (
        !loadError && (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Người chơi</th>
                  <th>Email</th>
                  <th>Điểm</th>
                  <th>Xu</th>
                  <th>Ngày tham gia</th>
                  <th>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const avatarSrc = getPlayerAvatarSrc(
                    user.avatar_key ?? DEFAULT_PLAYER_AVATAR_KEY,
                    getUploadedPlayerAvatarUrl(user.avatar_object_key)
                  );
                  const isEditing = editingUserId === user.id;

                  return (
                    <tr key={user.id}>
                      <td>
                        <div className={styles.userCell}>
                          <span className={`${styles.thumb} ${styles.userAvatar}`}>
                            <Image
                              alt=""
                              fill
                              sizes="44px"
                              src={avatarSrc}
                              unoptimized={isRemotePlayerAvatarSrc(avatarSrc)}
                            />
                          </span>
                          {user.display_name || "(Chưa đặt tên)"}
                        </div>
                      </td>
                      <td>{user.email ?? "—"}</td>
                      <td>
                        <span className={styles.coinCell}>
                          <Trophy aria-hidden="true" />
                          {user.total_points.toLocaleString("vi-VN")}
                        </span>
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            autoFocus
                            className={`${styles.searchInput} ${styles.coinInput}`}
                            min={0}
                            type="number"
                            value={editingCoins}
                            onChange={(event) => setEditingCoins(event.target.value)}
                          />
                        ) : (
                          <span className={styles.coinCell}>
                            <Coins aria-hidden="true" />
                            {user.total_coins.toLocaleString("vi-VN")}
                          </span>
                        )}
                      </td>
                      <td>{formatDate(user.created_at)}</td>
                      <td>
                        <div className={styles.rowActions}>
                          {isEditing ? (
                            <>
                              <button
                                className={styles.iconOnlyButton}
                                type="button"
                                aria-label="Lưu số Xu"
                                disabled={isSavingCoins}
                                onClick={() => saveCoins(user)}
                              >
                                {isSavingCoins ? <LoaderCircle aria-hidden="true" /> : <Check aria-hidden="true" />}
                              </button>
                              <button
                                className={styles.iconOnlyButton}
                                type="button"
                                aria-label="Hủy sửa"
                                onClick={cancelEditCoins}
                              >
                                <X aria-hidden="true" />
                              </button>
                            </>
                          ) : (
                            <button
                              className={styles.iconOnlyButton}
                              type="button"
                              aria-label={`Sửa Xu của ${user.display_name ?? user.email ?? "user"}`}
                              onClick={() => startEditCoins(user)}
                            >
                              <Pencil aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
