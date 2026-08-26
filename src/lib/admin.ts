// Whitelist email admin, hardcode theo yêu cầu (không dùng cột is_admin riêng trên users).
// Đây là bản sao phía client của is_shop_admin() trong migration
// supabase/migrations/202608260001_shop_items.sql — chỉ dùng để ẩn/hiện UI admin, KHÔNG phải
// lớp bảo mật chính (RLS ở Postgres mới là lớp chặn ghi thật sự). Khi cần thêm/bớt admin,
// sửa CẢ HAI nơi.
export const ADMIN_EMAILS = ["trancatkhanh@gmail.com"];

export function isAdminEmail(email?: string | null) {
  if (!email) {
    return false;
  }

  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}
