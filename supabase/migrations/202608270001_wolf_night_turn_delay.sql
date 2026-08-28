-- Ma Sói Một Đêm: thêm độ trễ ngẫu nhiên giữa các lượt ban đêm (5-10s giữa 2 người chơi, 5-15s
-- trước khi kết thúc đêm) để tạo nhịp game tự nhiên hơn và tránh nhiều client dồn request cùng lúc.
-- Khi cột này có giá trị và còn ở tương lai, server tạm ẩn lượt đêm tiếp theo / tạm hoãn chuyển sang
-- thảo luận cho tới khi hết hạn.

alter table public.game_sessions
  add column if not exists night_turn_reveal_at timestamptz null;

comment on column public.game_sessions.night_turn_reveal_at
is 'Mốc thời gian được phép lộ lượt ban đêm tiếp theo (hoặc kết thúc đêm) — null nghĩa là không đang hoãn.';
