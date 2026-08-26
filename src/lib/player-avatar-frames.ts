import type { createSupabaseAdminClient } from "@/lib/supabase/server";

export type EquippedFrameUrls = {
  avatarFrameUrl: string | null;
  profileFrameUrl: string | null;
};

export type LivePlayerProfile = {
  displayName: string | null;
  avatarKey: string | null;
  avatarObjectKey: string | null;
  avatarFrameUrl: string | null;
  profileFrameUrl: string | null;
};

// Tra map user_id -> URL ảnh khung avatar + khung thông tin đang trang bị
// (users.equipped_avatar_frame_id / equipped_profile_frame_id -> shop_items.image_url), dùng
// service role nên bỏ qua RLS. Dùng ở các action lobby/spectator của cả 3 game (wolf,
// wolf-classic, avalon) để hiển thị khung cho MỌI người chơi trong phòng thấy, không chỉ
// chính chủ. Trả về Map rỗng nếu lỗi (bảng/cột chưa tồn tại, user_id null...) để không làm
// hỏng lobby khi shop chưa được khởi tạo.
export async function getEquippedFrameUrlsByUserId(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  userIds: Array<string | null | undefined>
): Promise<Map<string, EquippedFrameUrls>> {
  const distinctUserIds = [...new Set(userIds.filter((id): id is string => Boolean(id)))];

  if (distinctUserIds.length === 0) {
    return new Map();
  }

  const { data: usersData, error: usersError } = await supabase
    .from("users")
    .select("id, equipped_avatar_frame_id, equipped_profile_frame_id")
    .in("id", distinctUserIds);

  if (usersError || !usersData) {
    return new Map();
  }

  const typedUsers = usersData as {
    id: string;
    equipped_avatar_frame_id: string | null;
    equipped_profile_frame_id: string | null;
  }[];

  const frameIds = [
    ...new Set(
      typedUsers.flatMap((row) => [row.equipped_avatar_frame_id, row.equipped_profile_frame_id]).filter((id): id is string => Boolean(id))
    ),
  ];

  if (frameIds.length === 0) {
    return new Map();
  }

  const { data: itemsData, error: itemsError } = await supabase
    .from("shop_items")
    .select("id, image_url")
    .in("id", frameIds);

  if (itemsError || !itemsData) {
    return new Map();
  }

  const imageUrlByItemId = new Map(
    (itemsData as { id: string; image_url: string }[]).map((item) => [item.id, item.image_url])
  );

  const result = new Map<string, EquippedFrameUrls>();

  for (const row of typedUsers) {
    result.set(row.id, {
      avatarFrameUrl: (row.equipped_avatar_frame_id && imageUrlByItemId.get(row.equipped_avatar_frame_id)) || null,
      profileFrameUrl:
        (row.equipped_profile_frame_id && imageUrlByItemId.get(row.equipped_profile_frame_id)) || null,
    });
  }

  return result;
}

// Tra map user_id -> hồ sơ "live" (tên, avatar, khung) đọc thẳng từ public.users, dùng service
// role nên bỏ qua RLS. Dùng ở lobby/spectator của cả 3 game (wolf, wolf-classic, avalon) để tên
// và avatar trong phòng luôn đúng theo tài khoản hiện tại — thay vì tin vào bản snapshot lưu ở
// room_players.name/avatar_key lúc join (bản snapshot chỉ còn ý nghĩa cho guest, những
// người không có hàng nào trong users để tham chiếu). Trả về Map rỗng nếu lỗi (bảng/cột chưa
// tồn tại, user_id null...) để lobby tự fallback về cột snapshot, không bị vỡ.
export async function getLivePlayerProfilesByUserId(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  userIds: Array<string | null | undefined>
): Promise<Map<string, LivePlayerProfile>> {
  const distinctUserIds = [...new Set(userIds.filter((id): id is string => Boolean(id)))];

  if (distinctUserIds.length === 0) {
    return new Map();
  }

  const { data: usersData, error: usersError } = await supabase
    .from("users")
    .select("id, display_name, avatar_key, avatar_object_key, equipped_avatar_frame_id, equipped_profile_frame_id")
    .in("id", distinctUserIds);

  if (usersError || !usersData) {
    return new Map();
  }

  const typedUsers = usersData as {
    id: string;
    display_name: string | null;
    avatar_key: string | null;
    avatar_object_key: string | null;
    equipped_avatar_frame_id: string | null;
    equipped_profile_frame_id: string | null;
  }[];

  const frameIds = [
    ...new Set(
      typedUsers.flatMap((row) => [row.equipped_avatar_frame_id, row.equipped_profile_frame_id]).filter((id): id is string => Boolean(id))
    ),
  ];

  let imageUrlByItemId = new Map<string, string>();

  if (frameIds.length > 0) {
    const { data: itemsData } = await supabase.from("shop_items").select("id, image_url").in("id", frameIds);
    imageUrlByItemId = new Map((itemsData ?? []).map((item) => [item.id as string, item.image_url as string]));
  }

  const result = new Map<string, LivePlayerProfile>();

  for (const row of typedUsers) {
    const displayName = row.display_name?.trim() || null;

    result.set(row.id, {
      displayName,
      avatarKey: row.avatar_key,
      avatarObjectKey: row.avatar_object_key,
      avatarFrameUrl: (row.equipped_avatar_frame_id && imageUrlByItemId.get(row.equipped_avatar_frame_id)) || null,
      profileFrameUrl:
        (row.equipped_profile_frame_id && imageUrlByItemId.get(row.equipped_profile_frame_id)) || null,
    });
  }

  return result;
}
