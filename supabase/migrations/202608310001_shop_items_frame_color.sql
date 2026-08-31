-- Thêm màu riêng cho từng khung thông tin (shop_items.item_type = 'profile_frame'), dùng để tô
-- màu lớp kính (.playerRowFrameInnerGlass) bên trong khung theo đúng tông màu của ảnh khung đó,
-- thay vì luôn cố định 1 màu --primary-light cho mọi khung. Cột để trống (null) với khung nào
-- chưa set màu -> UI tự fallback về màu mặc định --primary-light như trước (xem
-- src/lib/frame-glass-style.ts). Giá trị là chuỗi màu CSS hợp lệ (admin nhập qua <input
-- type="color">, ví dụ "#5D7CFF") — không ràng buộc CHECK vì color-mix() chấp nhận nhiều định
-- dạng (hex/rgb/hsl); nhập sai chỉ khiến CSS bỏ qua giá trị, không có tác dụng phụ khác.
alter table public.shop_items
  add column if not exists frame_color text null;
