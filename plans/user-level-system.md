# Plan Hệ Thống Level User

Ngày: 2026-09-03
Nhánh: `feature/user-level-system`

## Nền Tảng Hiện Có

App đã có sẵn phần tính điểm cho user đăng nhập:

- `public.users.total_points`: điểm xếp hạng cạnh tranh.
- `public.users.total_coins`: Xu dùng cho shop.
- `public.player_score_events`: sổ ghi điểm từng ván, có unique `(game_id, user_id)` để chống cộng trùng.
- `public.leaderboard`: view public cho bảng xếp hạng, sort theo `total_points`, rồi `total_coins`.
- `src/app/games/wolf/actions.ts`: Ma Sói Một Đêm cộng điểm khi game vào phase `result`.

Cách tính điểm hiện tại của Ma Sói Một Đêm:

| Kết quả | Điểm | Xu |
|---|---:|---:|
| Phe Dân thắng | +5 | +3 |
| Phe Sói thắng | +10 | +5 |
| Phe thua | -2 | 0 |
| Guest | 0 | 0 |

## Quyết Định Sản Phẩm

Tách level khỏi điểm xếp hạng.

- `total_points` vẫn là điểm leaderboard và có thể giảm khi thua.
- `level_xp` là XP tích lũy trọn đời, chỉ tăng, không giảm.
- Level được tính từ `level_xp`, không lưu cứng `users.level` trong MVP.
- Chỉ user đăng nhập mới nhận XP, cùng điều kiện với điểm/Xu hiện tại.
- XP bám theo phần điểm thắng hiện có:
  - Phe Dân thắng: `+5 XP`
  - Phe Sói thắng: `+10 XP`
  - Thua: `+0 XP`

Lý do: level trong game thường là tiến trình dài hạn, không bị tụt sau vài ván thua. Leaderboard vẫn giữ tính cạnh tranh nhờ `total_points`.

## Backfill Cho User Đã Có Tài Khoản

Khi triển khai cho user hiện tại:

1. Thêm `users.level_xp integer not null default 0`.
2. Thêm `player_score_events.xp_awarded integer not null default 0`.
3. Backfill event XP:
   - `xp_awarded = greatest(points_awarded, 0)` cho các event cũ.
4. Backfill user XP:
   - Nếu có ledger: lấy `sum(player_score_events.xp_awarded)` theo từng user.
   - Nếu user chưa có ledger nhưng có `total_points > 0`: seed `level_xp = greatest(total_points, 0)` như baseline bảo thủ.
5. Không backfill từ `total_coins` vì Xu là tiền tệ, không phải progression.

## Bảng Level Đề Xuất

Bảng này được cân theo yêu cầu: đạt `5000 XP` thì đạt level 100. Trong hệ level, `XP` có thể hiển thị với người chơi là "điểm level"; không nên dùng trực tiếp `total_points` vì điểm leaderboard hiện có thể bị trừ khi thua.

Formula sinh threshold:

```ts
minXp = Math.round(5000 * Math.pow((level - 1) / 99, 1.5));
```

Quy ước cứng:

- Level 1: `0 XP`.
- Level 100: `5000 XP`.
- Nếu chỉ thắng phe Dân, người chơi cần khoảng 28 trận để lên level 10, 349 trận để lên level 50, và 1000 trận để lên level 100.
- Thắng phe Sói lên nhanh hơn vì hiện đã được thưởng gấp đôi XP.

| Level | Bậc | XP tối thiểu | XP tăng từ level trước | Số trận thắng Dân từ 0 |
|---:|---|---:|---:|---:|
| 1 | Tân Binh | 0 | 0 | 0 |
| 2 | Tân Binh | 5 | 5 | 1 |
| 3 | Tân Binh | 14 | 9 | 3 |
| 4 | Tân Binh | 26 | 12 | 6 |
| 5 | Tân Binh | 41 | 15 | 9 |
| 6 | Tân Binh | 57 | 16 | 12 |
| 7 | Tân Binh | 75 | 18 | 15 |
| 8 | Tân Binh | 94 | 19 | 19 |
| 9 | Tân Binh | 115 | 21 | 23 |
| 10 | Đồng | 137 | 22 | 28 |
| 11 | Đồng | 161 | 24 | 33 |
| 12 | Đồng | 185 | 24 | 37 |
| 13 | Đồng | 211 | 26 | 43 |
| 14 | Đồng | 238 | 27 | 48 |
| 15 | Đồng | 266 | 28 | 54 |
| 16 | Đồng | 295 | 29 | 59 |
| 17 | Đồng | 325 | 30 | 65 |
| 18 | Đồng | 356 | 31 | 72 |
| 19 | Đồng | 388 | 32 | 78 |
| 20 | Bạc | 420 | 32 | 84 |
| 21 | Bạc | 454 | 34 | 91 |
| 22 | Bạc | 488 | 34 | 98 |
| 23 | Bạc | 524 | 36 | 105 |
| 24 | Bạc | 560 | 36 | 112 |
| 25 | Bạc | 597 | 37 | 120 |
| 26 | Bạc | 634 | 37 | 127 |
| 27 | Bạc | 673 | 39 | 135 |
| 28 | Bạc | 712 | 39 | 143 |
| 29 | Bạc | 752 | 40 | 151 |
| 30 | Bạc | 793 | 41 | 159 |
| 31 | Bạc | 834 | 41 | 167 |
| 32 | Bạc | 876 | 42 | 176 |
| 33 | Bạc | 919 | 43 | 184 |
| 34 | Bạc | 962 | 43 | 193 |
| 35 | Vàng | 1006 | 44 | 202 |
| 36 | Vàng | 1051 | 45 | 211 |
| 37 | Vàng | 1096 | 45 | 220 |
| 38 | Vàng | 1142 | 46 | 229 |
| 39 | Vàng | 1189 | 47 | 238 |
| 40 | Vàng | 1236 | 47 | 248 |
| 41 | Vàng | 1284 | 48 | 257 |
| 42 | Vàng | 1333 | 49 | 267 |
| 43 | Vàng | 1382 | 49 | 277 |
| 44 | Vàng | 1431 | 49 | 287 |
| 45 | Vàng | 1481 | 50 | 297 |
| 46 | Vàng | 1532 | 51 | 307 |
| 47 | Vàng | 1584 | 52 | 317 |
| 48 | Vàng | 1636 | 52 | 328 |
| 49 | Vàng | 1688 | 52 | 338 |
| 50 | Bạch Kim | 1741 | 53 | 349 |
| 51 | Bạch Kim | 1795 | 54 | 359 |
| 52 | Bạch Kim | 1849 | 54 | 370 |
| 53 | Bạch Kim | 1903 | 54 | 381 |
| 54 | Bạch Kim | 1959 | 56 | 392 |
| 55 | Bạch Kim | 2014 | 55 | 403 |
| 56 | Bạch Kim | 2070 | 56 | 414 |
| 57 | Bạch Kim | 2127 | 57 | 426 |
| 58 | Bạch Kim | 2184 | 57 | 437 |
| 59 | Bạch Kim | 2242 | 58 | 449 |
| 60 | Bạch Kim | 2300 | 58 | 460 |
| 61 | Bạch Kim | 2359 | 59 | 472 |
| 62 | Bạch Kim | 2418 | 59 | 484 |
| 63 | Bạch Kim | 2478 | 60 | 496 |
| 64 | Bạch Kim | 2538 | 60 | 508 |
| 65 | Kim Cương | 2599 | 61 | 520 |
| 66 | Kim Cương | 2660 | 61 | 532 |
| 67 | Kim Cương | 2722 | 62 | 545 |
| 68 | Kim Cương | 2784 | 62 | 557 |
| 69 | Kim Cương | 2846 | 62 | 570 |
| 70 | Kim Cương | 2909 | 63 | 582 |
| 71 | Kim Cương | 2973 | 64 | 595 |
| 72 | Kim Cương | 3037 | 64 | 608 |
| 73 | Kim Cương | 3101 | 64 | 621 |
| 74 | Kim Cương | 3166 | 65 | 634 |
| 75 | Kim Cương | 3231 | 65 | 647 |
| 76 | Kim Cương | 3297 | 66 | 660 |
| 77 | Kim Cương | 3363 | 66 | 673 |
| 78 | Kim Cương | 3430 | 67 | 686 |
| 79 | Kim Cương | 3497 | 67 | 700 |
| 80 | Cao Thủ | 3564 | 67 | 713 |
| 81 | Cao Thủ | 3632 | 68 | 727 |
| 82 | Cao Thủ | 3700 | 68 | 740 |
| 83 | Cao Thủ | 3769 | 69 | 754 |
| 84 | Cao Thủ | 3838 | 69 | 768 |
| 85 | Cao Thủ | 3908 | 70 | 782 |
| 86 | Cao Thủ | 3978 | 70 | 796 |
| 87 | Cao Thủ | 4048 | 70 | 810 |
| 88 | Cao Thủ | 4119 | 71 | 824 |
| 89 | Cao Thủ | 4190 | 71 | 838 |
| 90 | Cao Thủ | 4262 | 72 | 853 |
| 91 | Cao Thủ | 4334 | 72 | 867 |
| 92 | Cao Thủ | 4406 | 72 | 882 |
| 93 | Cao Thủ | 4479 | 73 | 896 |
| 94 | Cao Thủ | 4552 | 73 | 911 |
| 95 | Huyền Thoại | 4626 | 74 | 926 |
| 96 | Huyền Thoại | 4700 | 74 | 940 |
| 97 | Huyền Thoại | 4774 | 74 | 955 |
| 98 | Huyền Thoại | 4849 | 75 | 970 |
| 99 | Huyền Thoại | 4924 | 75 | 985 |
| 100 | Huyền Thoại | 5000 | 76 | 1000 |

Sau level 100:

- MVP giữ cap ở level 100.
- XP dư vẫn tiếp tục được lưu.
- Chỉ mở prestige hoặc level 101-150 sau khi có dữ liệu thật cho thấy người chơi lên level 100 quá nhanh.

## Plan Data Model

Schema MVP:

- `public.users.level_xp integer not null default 0`
- `public.player_score_events.xp_awarded integer not null default 0`

Migration local đã tạo:

- `supabase/migrations/202609030001_user_level_system.sql`

Tùy chọn sau MVP nếu muốn chỉnh bảng level không cần deploy code:

- `public.level_definitions`
  - `level integer primary key`
  - `tier text not null`
  - `min_xp integer not null unique`
  - `created_at timestamptz not null default now()`

Khuyến nghị MVP: dùng constant TypeScript hoặc sinh threshold bằng formula trong app trước. Bảng level ít đổi, nên chưa cần thêm table config nếu chỉ cần ship nhanh.

## Plan Backend

1. Tạo `src/lib/level-system.ts`.
   - Export bảng level.
   - Thêm `getLevelProgress(levelXp)` trả về `level`, `tier`, `currentMinXp`, `nextMinXp`, `xpIntoLevel`, `xpToNextLevel`, `progressPercent`.
2. Tạo migration Supabase.
   - Thêm `level_xp` và `xp_awarded`.
   - Backfill user hiện tại.
   - Sửa `award_wolf_game_points(...)` để insert `xp_awarded` và cộng `users.level_xp`.
3. Giữ idempotency của RPC.
   - XP chỉ được cộng từ các row mới insert vào `player_score_events`.
   - `on conflict (game_id, user_id) do nothing` vẫn phải chặn cộng trùng.
4. Cập nhật TypeScript Supabase types.
   - Thêm `users.level_xp`.
   - Thêm `player_score_events.xp_awarded` nếu bổ sung type cho table ledger.
5. Mở rộng reward trả về UI.
   - Hiện tại: `{ points, coins }`.
   - Đề xuất: `{ points, coins, xp, levelBefore, levelAfter, didLevelUp }`.
   - Nếu sửa RPC để trả before/after quá lớn cho MVP, hiển thị `+XP` ngay và refresh profile/leaderboard sau result.

## Plan UI

Trước khi viết UI phải đọc `design-system/tokens.md`.

Các màn cần cập nhật:

- Profile:
  - Hiển thị level hiện tại, bậc, thanh tiến trình XP, và số XP còn thiếu tới level sau.
  - Tách rõ `điểm xếp hạng`, `Xu`, và `level`.
- Leaderboard:
  - Thêm badge level cạnh tên người chơi.
  - Vẫn sort theo `total_points`; level chỉ là ngữ cảnh bổ sung, không thay rank.
- Game result:
  - Hiển thị `+XP` cạnh phần thưởng điểm/Xu của người chơi đang đăng nhập.
  - Chỉ hiện trạng thái lên level khi vượt threshold.
- Admin users:
  - Hiển thị `level_xp` và level tính toán.
  - MVP không cho sửa level trực tiếp; nếu cần sau này thì sửa XP kèm audit.

## Plan Kiểm Thử

- Unit test `getLevelProgress` tại các mốc threshold.
- SQL check: gọi RPC trùng không cộng XP trùng.
- SQL check: thua bị trừ `total_points` nhưng `level_xp` không giảm.
- Manual test result flow:
  - user đăng nhập thắng
  - user đăng nhập thua
  - guest thắng
  - nhiều request cùng chuyển result phase
- Nếu có UI, chụp kiểm tra 390px và 1280px theo responsive rules của repo.

## Yêu Cầu Tài Liệu Khi Implement

Nếu implementation có thao tác Supabase:

- Cập nhật `documents/schema.md`.
- Cập nhật `documents/migrations.md`.
- Cập nhật `documents/rls-policies.md` nếu policy thay đổi.
- Thêm `<!-- Last updated: YYYY-MM-DD -->` ở đầu mỗi tài liệu được sửa.

Bước hiện tại đã tạo migration local và cập nhật tài liệu, chưa thực hiện thao tác Supabase remote.
