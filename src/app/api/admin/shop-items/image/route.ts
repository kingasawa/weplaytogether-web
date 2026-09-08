import { createClient } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/admin";
import { deleteAvatarObject, putAvatarObject } from "@/lib/avatar-storage";

export const runtime = "nodejs";

// Ảnh đã được nén + chuyển sang WebP (hoặc PNG fallback) ngay ở trình duyệt trước khi tới
// đây (xem src/lib/shop-item-image.ts) — route này chỉ xác thực quyền admin rồi lưu vào GCS.
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const ALLOWED_EXTENSION_BY_TYPE = new Map([
  ["image/webp", "webp"],
  ["image/png", "png"],
]);

// Route API (không phải Supabase) nên không tự có RLS bảo vệ — app này lưu session ở
// localStorage của trình duyệt (không phải cookie), nên phải tự xác thực bằng access token
// client gửi kèm rồi so email với whitelist admin, giống cơ chế is_shop_admin() ở Postgres.
async function getRequestAdminEmail(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return null;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return null;
  }

  const supabase = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const { data, error } = await supabase.auth.getUser(token);
  const email = data.user?.email?.trim() ?? null;

  if (error || !isAdminEmail(email)) {
    return null;
  }

  return email;
}

export async function POST(request: Request) {
  const adminEmail = await getRequestAdminEmail(request);

  if (!adminEmail) {
    return Response.json({ error: "Không có quyền quản trị." }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const itemType = formData.get("itemType");

  if (!(file instanceof File)) {
    return Response.json({ error: "Thiếu file ảnh." }, { status: 400 });
  }

  if (itemType !== "avatar_frame" && itemType !== "profile_frame") {
    return Response.json({ error: "Loại vật phẩm không hợp lệ." }, { status: 400 });
  }

  const extension = ALLOWED_EXTENSION_BY_TYPE.get(file.type.toLowerCase());

  if (!extension) {
    return Response.json(
      { error: "Định dạng ảnh không hợp lệ (chỉ nhận WebP/PNG đã nén sẵn từ trình duyệt)." },
      { status: 400 }
    );
  }

  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "Ảnh vượt quá 3MB sau khi nén. Hãy thử ảnh khác." }, { status: 400 });
  }

  const objectKey = `shop/${itemType}/${crypto.randomUUID()}.${extension}`;

  try {
    await putAvatarObject(objectKey, file, file.type);
  } catch {
    return Response.json({ error: "Không thể tải ảnh lên. Vui lòng thử lại." }, { status: 503 });
  }

  const publicBaseUrl = process.env.NEXT_PUBLIC_AVATAR_PUBLIC_URL?.trim().replace(/\/+$/, "");

  if (!publicBaseUrl) {
    return Response.json({ error: "Chưa cấu hình public URL cho ảnh." }, { status: 503 });
  }

  const imageUrl = `${publicBaseUrl}/${objectKey
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}`;

  return Response.json({ imageUrl });
}

// Dọn ảnh vừa tải lên nếu admin huỷ/thoát form mà không lưu vật phẩm (xem
// admin-items/item-form-screen.tsx) — chỉ nhận imageUrl thuộc đúng prefix "shop/" của bucket này
// (không cho xoá object bất kỳ qua route này) và luôn dùng ignoreNotFound nên gọi lại nhiều lần
// vẫn an toàn.
export async function DELETE(request: Request) {
  const adminEmail = await getRequestAdminEmail(request);

  if (!adminEmail) {
    return Response.json({ error: "Không có quyền quản trị." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { imageUrl?: string } | null;
  const imageUrl = body?.imageUrl?.trim();

  if (!imageUrl) {
    return Response.json({ error: "Thiếu imageUrl." }, { status: 400 });
  }

  const publicBaseUrl = process.env.NEXT_PUBLIC_AVATAR_PUBLIC_URL?.trim().replace(/\/+$/, "");

  if (!publicBaseUrl) {
    return Response.json({ error: "Chưa cấu hình public URL cho ảnh." }, { status: 503 });
  }

  const prefix = `${publicBaseUrl}/shop/`;

  if (!imageUrl.startsWith(prefix)) {
    return Response.json({ error: "URL ảnh không hợp lệ." }, { status: 400 });
  }

  const objectKey = decodeURIComponent(imageUrl.slice(publicBaseUrl.length + 1));

  try {
    await deleteAvatarObject(objectKey);
  } catch {
    return Response.json({ error: "Không thể xoá ảnh. Vui lòng thử lại." }, { status: 503 });
  }

  return Response.json({ ok: true });
}
