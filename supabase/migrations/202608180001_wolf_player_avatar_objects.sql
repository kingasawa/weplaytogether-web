-- Thêm cột lưu object key của avatar do người chơi upload lên Cloudflare R2.
-- Object key có dạng: avatar/<sessionId>/<uuid>.(png|jpg|webp)
-- Cơ chế avatar dùng chung cho TOÀN APP: mọi game (Ma sói / wolf, Ma sói cổ điển /
-- wolf-classic, Avalon) đều dùng chung bảng wolf_room_players (phân biệt game bằng
-- game_key trên wolf_rooms), nên chỉ cần một cột này là áp dụng cho tất cả game.
alter table public.wolf_room_players
  add column if not exists avatar_object_key text;
