-- Thêm 2 tài khoản admin vào whitelist is_shop_admin(): triph@icd-vn.com, khanhtc@icd-vn.com.
-- create or replace nên an toàn chạy lại nhiều lần (idempotent) — không cần drop trước.
-- Đồng bộ tay với ADMIN_EMAILS trong src/lib/admin.ts (đã cập nhật cùng lúc) theo đúng quy tắc
-- ghi ở đầu function gốc trong 202608260001_shop_items.sql.
create or replace function public.is_shop_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') = any (
    array['trancatkhanh@gmail.com', 'triph@icd-vn.com', 'khanhtc@icd-vn.com']
  )
$$;
