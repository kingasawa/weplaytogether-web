import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { getAuthDisplayName, getGmailAvatarUrl } from "@/lib/supabase/auth-client";
import { MAX_GUEST_PLAYER_NAME_LENGTH } from "@/lib/guest-player";
import {
  DEFAULT_PLAYER_AVATAR_KEY,
  normalizePlayerAvatarKey,
  normalizePlayerAvatarObjectKey,
  type PlayerAvatarKey,
} from "@/lib/player-avatars";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const USERS_COLUMNS = "id, email, display_name, avatar_key, avatar_object_key";
export const ACCOUNT_PROFILE_STORAGE_KEY = "boardverse:account-profile";

export type UserProfile = {
  id: string;
  email: string | null;
  displayName: string;
  avatarKey: PlayerAvatarKey;
  avatarObjectKey: string | null;
};

export type StoredAccountProfile = {
  displayName: string;
  avatarKey: PlayerAvatarKey;
  avatarObjectKey: string | null;
};

// Lưu bản rút gọn của hồ sơ vào localStorage để game đọc đồng bộ (không cần fetch async).
function saveStoredAccountProfile(profile: UserProfile | null) {
  if (typeof window === "undefined") {
    return;
  }

  if (!profile) {
    window.localStorage.removeItem(ACCOUNT_PROFILE_STORAGE_KEY);
    return;
  }

  const stored: StoredAccountProfile = {
    displayName: profile.displayName,
    avatarKey: profile.avatarKey,
    avatarObjectKey: profile.avatarObjectKey,
  };

  window.localStorage.setItem(ACCOUNT_PROFILE_STORAGE_KEY, JSON.stringify(stored));
}

export function readStoredAccountProfile(): StoredAccountProfile | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(ACCOUNT_PROFILE_STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<StoredAccountProfile>;

    return {
      displayName: typeof parsed.displayName === "string" ? parsed.displayName : "",
      avatarKey: normalizePlayerAvatarKey(parsed.avatarKey),
      avatarObjectKey: normalizePlayerAvatarObjectKey(parsed.avatarObjectKey),
    };
  } catch {
    return null;
  }
}

type UserRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_key: string | null;
  avatar_object_key: string | null;
};

function persistProfile(profile: UserProfile): UserProfile {
  saveStoredAccountProfile(profile);
  return profile;
}

function mapProfile(row: UserRow): UserProfile {
  return {
    id: row.id,
    email: row.email ?? null,
    displayName: (row.display_name ?? "").trim(),
    avatarKey: normalizePlayerAvatarKey(row.avatar_key),
    avatarObjectKey: normalizePlayerAvatarObjectKey(row.avatar_object_key),
  };
}

function normalizeDisplayName(name: string) {
  return name.trim().slice(0, MAX_GUEST_PLAYER_NAME_LENGTH);
}

// Đọc hồ sơ của chính user đang đăng nhập (RLS chỉ trả về hàng của họ).
export async function getMyProfile(): Promise<UserProfile | null> {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return null;
  }

  const { data, error } = await supabase
    .from("users")
    .select(USERS_COLUMNS)
    .eq("id", session.user.id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return persistProfile(mapProfile(data as UserRow));
}

// Tạo record hồ sơ nếu chưa có (gọi khi login lần đầu). Tên mặc định lấy từ tài khoản Google.
export async function ensureMyProfile(session: Session): Promise<UserProfile | null> {
  const supabase = createSupabaseBrowserClient() as unknown as SupabaseClient;

  const { data: existing } = await supabase
    .from("users")
    .select(USERS_COLUMNS)
    .eq("id", session.user.id)
    .maybeSingle();

  if (existing) {
    const existingRow = existing as UserRow;

    // Tự "vá" hồ sơ cũ tạo trước khi có logic lấy avatar Google ở nhánh insert bên dưới:
    // nếu avatar vẫn còn nguyên mặc định (avatar0 + chưa có avatar_object_key), nghĩa là
    // user chưa từng tự chọn avatar nào — điền avatar Google vào ngay lần đăng nhập này thay
    // vì bắt user phải tự vào Hồ sơ chọn lại. Nếu user đã chọn preset khác hoặc ảnh khác thì
    // giữ nguyên, không ghi đè lựa chọn của họ.
    if (!existingRow.avatar_object_key && existingRow.avatar_key === DEFAULT_PLAYER_AVATAR_KEY) {
      const gmailAvatarUrl = getGmailAvatarUrl(session);

      if (gmailAvatarUrl) {
        const { data: patched } = await supabase
          .from("users")
          .update({ avatar_object_key: gmailAvatarUrl })
          .eq("id", session.user.id)
          .select(USERS_COLUMNS)
          .maybeSingle();

        if (patched) {
          return persistProfile(mapProfile(patched as UserRow));
        }
      }
    }

    return persistProfile(mapProfile(existingRow));
  }

  // Lần đầu tạo hồ sơ: dùng luôn ảnh đại diện Google làm avatar mặc định (nếu có), thay vì
  // avatar0 trắng trơn — trước đây avatar Google chỉ được tính tạm ở FE để hiển thị, không
  // lưu vào users nên các nơi đọc thẳng từ DB (vd. trang admin) không thấy được.
  const { data, error } = await supabase
    .from("users")
    .insert({
      id: session.user.id,
      email: session.user.email ?? null,
      display_name: normalizeDisplayName(getAuthDisplayName(session)),
      avatar_key: DEFAULT_PLAYER_AVATAR_KEY,
      avatar_object_key: getGmailAvatarUrl(session),
    })
    .select(USERS_COLUMNS)
    .single();

  if (error || !data) {
    return null;
  }

  return persistProfile(mapProfile(data as UserRow));
}

// Cập nhật tên hiển thị + avatar mặc định của user.
// Dùng upsert để tự tạo hàng nếu chưa có (tránh lỗi khi record chưa được tạo lúc login).
export async function updateMyProfile(input: {
  displayName: string;
  avatarKey: string;
  avatarObjectKey?: string | null;
}): Promise<{ profile: UserProfile | null; error: string | null }> {
  const supabase = createSupabaseBrowserClient() as unknown as SupabaseClient;
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return { profile: null, error: "Bạn chưa đăng nhập." };
  }

  const { data, error } = await supabase
    .from("users")
    .upsert(
      {
        id: session.user.id,
        email: session.user.email ?? null,
        display_name: normalizeDisplayName(input.displayName),
        avatar_key: normalizePlayerAvatarKey(input.avatarKey),
        avatar_object_key: normalizePlayerAvatarObjectKey(input.avatarObjectKey ?? null),
      },
      { onConflict: "id" }
    )
    .select(USERS_COLUMNS)
    .single();

  if (error || !data) {
    console.error("[profile] Lưu hồ sơ thất bại:", error);
    return { profile: null, error: error?.message ?? "Không thể lưu hồ sơ." };
  }

  return { profile: persistProfile(mapProfile(data as UserRow)), error: null };
}
