"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/i18n/language-provider";
import { listGameRoleOverrides, type GameRoleKey } from "@/lib/game-roles";

export type GameRoleOverride = { label: string; imageUrl: string };
export type GameRoleOverrideMap = Record<string, GameRoleOverride>;

// Đọc override tên/ảnh role admin đã chỉnh trong /admin/game-roles cho 1 game, chọn đúng tên
// theo ngôn ngữ hiện tại. Trả về map rỗng nếu chưa admin chưa chỉnh gì hoặc bảng chưa sẵn sàng —
// nơi gọi tự fallback về hằng số hardcode (WOLF_ROLE_LABELS/getWolfRoleImagePath/...) khi role
// không có trong map này.
export function useGameRoleOverrides(gameKey: GameRoleKey): GameRoleOverrideMap {
  const { locale } = useLanguage();
  const [overrides, setOverrides] = useState<GameRoleOverrideMap>({});

  useEffect(() => {
    let isMounted = true;

    void listGameRoleOverrides(gameKey).then((result) => {
      if (!isMounted || !result.data) {
        return;
      }

      const map: GameRoleOverrideMap = {};

      for (const row of result.data) {
        map[row.roleKey] = {
          label: locale === "en" ? row.displayNameEn : row.displayNameVi,
          imageUrl: row.imageUrl,
        };
      }

      setOverrides(map);
    });

    return () => {
      isMounted = false;
    };
  }, [gameKey, locale]);

  return overrides;
}
