import type { createSupabaseAdminClient } from "@/lib/supabase/server";

export type EquippedFrameUrls = {
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
