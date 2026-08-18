import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { getAuthDisplayName } from "@/lib/supabase/auth-client";
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
    return persistProfile(mapProfile(existing as UserRow));
  }

  const { data, error } = await supabase
    .from("users")
    .insert({
      id: session.user.id,
      email: session.user.email ?? null,
      display_name: normalizeDisplayName(getAuthDisplayName(session)),
      avatar_key: DEFAULT_PLAYER_AVATAR_KEY,
    })
    .select(USERS_COLUMNS)
    .single();

  if (error || !data) {
    return null;
  }

  return persistProfile(mapProfile(data as UserRow));
}

// Cập nhật tên hiển thị + avatar mặc định của user.
export async function updateMyProfile(input: {
  displayName: string;
  avatarKey: string;
  avatarObjectKey?: string | null;
}): Promise<UserProfile | null> {
  const supabase = createSupabaseBrowserClient() as unknown as SupabaseClient;
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return null;
  }

  const { data, error } = await supabase
    .from("users")
    .update({
      display_name: normalizeDisplayName(input.displayName),
      avatar_key: normalizePlayerAvatarKey(input.avatarKey),
      avatar_object_key: normalizePlayerAvatarObjectKey(input.avatarObjectKey ?? null),
    })
    .eq("id", session.user.id)
    .select(USERS_COLUMNS)
    .single();

  if (error || !data) {
    return null;
  }

  return persistProfile(mapProfile(data as UserRow));
}
