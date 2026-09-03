# Plan Tính Năng Report Bug Sau Game

Ngày: 2026-09-03
Nhánh: `feature/game-report-system`

## Mục Tiêu

Sau khi một ván kết thúc, người chơi thấy nút `Báo lỗi`. Khi bấm, app mở một modal chỉ có một input nội dung bug. Người chơi không cần chọn game, phòng, phase, hay thông tin kỹ thuật. Server tự xác định game vừa chơi là game nào, gom context cần debug, rồi lưu report vào DB. Admin có trang riêng để xem danh sách bug user đã report.

## Nền Tảng Hiện Có

Repo hiện có 3 game dùng chung bảng phòng:

- Ma Sói Một Đêm: `game_key = 'wolf'`
- Ma Sói nhiều đêm: `game_key = 'classic_wolf'`
- Avalon: `game_key = 'avalon'`

Các bảng chung:

- `public.rooms`: có `game_key`, `code`, `status`, `current_game_id`.
- `public.room_players`: có `session_id`, `name`, `avatar_key`, `avatar_object_key`, `user_id`.
- `public.game_sessions`: có `id`, `room_id`, `phase`, `round_number`, `result_snapshot`.

State riêng từng game:

- Ma Sói Một Đêm dùng `game_sessions.result_snapshot`, `game_cards`, `game_actions`, `game_votes`, `game_phase_confirmations`.
- Ma Sói nhiều đêm dùng `classic_wolf_game_states.state`.
- Avalon dùng `avalon_game_states.state`.

UI result hiện đã có `resultActionBar` ở cả 3 màn:

- `src/app/games/wolf/rooms/[roomId]/play/wolf-play-screen.tsx`
- `src/app/games/wolf-classic/rooms/[roomId]/play/wolf-classic-play-screen.tsx`
- `src/app/games/avalon/rooms/[roomId]/play/avalon-play-screen.tsx`

Admin hiện có shell/nav:

- `src/app/admin/admin-shell.tsx`
- `/admin/items`
- `/admin/users`

## Quyết Định Sản Phẩm

- Chỉ hiển thị nút report ở phase kết quả.
- Chỉ cần một textarea nhập nội dung bug.
- Không cho user chọn game thủ công. Server tự suy ra từ `rooms.game_key`.
- Chỉ người đang là player của phòng/ván đó mới được report. Spectator không report trong MVP.
- User đăng nhập sẽ lưu `reporter_user_id`; guest player vẫn được report nhưng lưu `reporter_user_id = null` và lưu snapshot tên/player id.
- Report phải sống sót sau cleanup phòng, nên không dùng FK cascade tới `rooms`, `room_players`, hoặc `game_sessions`.
- Admin có thể lọc theo trạng thái, game, room code, user, thời gian.

## Data Model Plan

Migration đề xuất:

- `supabase/migrations/202609030002_game_bug_reports.sql`

Tạo enum:

```sql
create type public.game_bug_report_status as enum (
  'open',
  'investigating',
  'fixed',
  'duplicate',
  'wont_fix'
);
```

Tạo bảng:

```sql
create table public.game_bug_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid null references public.users(id) on delete set null,
  reporter_player_id uuid null,
  reporter_name text not null,
  game_key text not null,
  game_id uuid not null,
  room_id uuid not null,
  room_code text not null,
  game_phase text not null,
  report_text text not null,
  game_context jsonb not null default '{}'::jsonb,
  client_context jsonb not null default '{}'::jsonb,
  status public.game_bug_report_status not null default 'open',
  admin_note text null,
  resolved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint game_bug_reports_text_length check (
    char_length(trim(report_text)) between 5 and 1000
  ),
  constraint game_bug_reports_game_key_check check (
    game_key in ('wolf', 'classic_wolf', 'avalon')
  )
);
```

Indexes:

- `(status, created_at desc)`
- `(game_key, created_at desc)`
- `(room_code, created_at desc)`
- `(reporter_user_id, created_at desc)` where `reporter_user_id is not null`
- `(game_id)`

Không nên FK `game_id`, `room_id`, `reporter_player_id` tới bảng game/phòng/player vì các bảng đó có cleanup định kỳ. Report là dữ liệu audit nên cần tồn tại độc lập.

## RLS Plan

Enable RLS trên `game_bug_reports`.

Policies:

- Admin select all: `public.is_shop_admin()`
- Admin update status/note: `public.is_shop_admin()`
- Reporter select own reports nếu đã đăng nhập: `auth.uid() = reporter_user_id`
- Không mở insert/update/delete trực tiếp cho user thường.

Insert report đi qua server action dùng service role. Lý do: server cần xác thực player bằng cookie `boardverse_wolf_session`, tự gom game context, sanitize payload, và chống spoof `game_key`.

## Submit Flow

Tạo server action dùng chung:

- `src/app/games/report-actions.ts`

API đề xuất:

```ts
export async function submitGameBugReport(input: {
  roomCode: string;
  gameId: string;
  reportText: string;
  clientContext?: {
    path?: string;
    viewport?: { width: number; height: number };
    userAgent?: string;
  };
}): Promise<{ ok: true; reportId: string } | { ok: false; error: string }>;
```

Server action xử lý:

1. Normalize `roomCode`, validate 4 ký tự.
2. Lấy `session_id` từ `WOLF_PLAYER_SESSION_COOKIE`.
3. Load `game_sessions` theo `gameId`.
4. Load `rooms` theo `game.room_id` hoặc `roomCode`.
5. Kiểm tra `room.code` trùng input và `game.room_id = room.id`.
6. Load `room_players` trong phòng và tìm current player theo `session_id`.
7. Nếu không có current player, trả lỗi `Bạn không còn ở trong ván này.`
8. Tự xác định `game_key = room.game_key`.
9. Chỉ cho submit khi ván đã kết thúc:
   - `wolf`: `game_sessions.phase = 'result'`
   - `classic_wolf`: `game_sessions.phase = 'result'`
   - `avalon`: `avalon_game_states.state->>'phase' = 'result'`
10. Validate `reportText.trim()` từ 5 đến 1000 ký tự.
11. Build `game_context` theo game.
12. Insert vào `game_bug_reports`.

## Game Context Cần Lưu

Context chung:

- `room`: `id`, `code`, `game_key`, `status`, `current_game_id`, `created_at`, `updated_at`
- `game`: `id`, `phase`, `round_number`, `discussion_ends_at`, `created_at`, `updated_at`
- `players`: `id`, `name`, `user_id`, `is_host`, `joined_at`
- `reporter`: `player_id`, `user_id`, `name`, `is_host`

Context riêng:

- `wolf`:
  - `result_snapshot`
  - `game_cards`
  - `game_actions`
  - `game_votes`
  - `game_phase_confirmations`
- `classic_wolf`:
  - `classic_wolf_game_states.state`
- `avalon`:
  - `avalon_game_states.state`

Giới hạn payload:

- Không lưu access token, cookies, email nếu không cần.
- `client_context.userAgent` tối đa 300 ký tự.
- `game_context` chỉ admin đọc được.

## UI Player Plan

Tạo component dùng chung:

- `src/components/game/game-bug-report-dialog.tsx`

Props:

```ts
type GameBugReportDialogProps = {
  roomCode: string;
  gameId: string;
  disabled?: boolean;
};
```

UI:

- Button trong `resultActionBar` với icon `Bug` từ `lucide-react`.
- Label: `Báo lỗi`.
- Modal có một textarea:
  - Placeholder: `Mô tả lỗi bạn gặp trong ván này...`
  - Min 5, max 1000 ký tự.
- Submit button icon `Send`.
- Sau khi gửi thành công, đóng modal và hiện trạng thái `Đã gửi report`.
- Không thêm dropdown game, không thêm input room, không bắt user chụp màn hình.

Vị trí gắn:

- Ma Sói Một Đêm: thêm vào `resultActionBar` cạnh `Thoát`.
- Ma Sói nhiều đêm: thêm vào `resultActionBar` cạnh `Thoát`.
- Avalon: thêm vào `resultActionBar` cạnh `Thoát`.

Responsive:

- Button phải đạt touch target tối thiểu 44px.
- Modal mobile dùng gần full width, không overflow ngang.
- Nếu có preview tool khi implement UI, chụp 390px và 1280px.

## Admin Plan

Thêm nav item:

- File: `src/app/admin/admin-shell.tsx`
- Route: `/admin/reports`
- Icon: `Bug` từ `lucide-react`
- Label: `Report lỗi`

Thêm data layer:

- `src/lib/admin-reports.ts`

Functions:

- `listGameBugReports(filters)`
- `updateGameBugReportStatus(reportId, status)`
- `updateGameBugReportNote(reportId, note)`

Thêm page:

- `src/app/admin/reports/page.tsx`
- `src/app/admin/reports/admin-reports-screen.tsx`

Admin list columns:

- Trạng thái
- Game
- Room code
- Người report
- Nội dung rút gọn
- Thời gian
- Hành động

Detail modal/drawer:

- Full `report_text`
- Reporter info
- Game id, room id, room code
- `game_context` dạng JSON collapsible
- `client_context`
- Status selector
- Admin note textarea

## Fallback Khi Migration Chưa Apply

Giống các feature Supabase hiện tại:

- Nếu table `game_bug_reports` chưa tồn tại, report action trả lỗi thân thiện: `Hệ thống report chưa sẵn sàng.`
- Admin `/admin/reports` hiển thị empty/not-ready state thay vì crash.
- Không làm ảnh hưởng luồng chơi game hiện tại.

## Implementation Steps

1. Đọc `documents/project-config.md` trước khi tạo/chạy migration theo rule repo.
2. Tạo migration `202609030002_game_bug_reports.sql`.
3. Cập nhật docs bắt buộc:
   - `documents/schema.md`
   - `documents/rls-policies.md`
   - `documents/migrations.md`
4. Cập nhật `src/lib/supabase/types.ts`.
5. Tạo `src/app/games/report-actions.ts`.
6. Tạo `src/components/game/game-bug-report-dialog.tsx`.
7. Gắn component vào 3 màn result.
8. Tạo `src/lib/admin-reports.ts`.
9. Tạo route admin `/admin/reports` và thêm nav item.
10. Verify:
   - `npm run check:encoding`
   - `npx tsc --noEmit`
   - manual flow report sau result cho cả 3 game
   - nếu có UI preview: screenshot 390px và 1280px

## Test Cases

- Player trong ván `wolf` gửi report sau result, DB lưu `game_key = 'wolf'`.
- Player trong ván `classic_wolf` gửi report sau result, DB lưu `game_key = 'classic_wolf'`.
- Player trong ván `avalon` gửi report sau result, DB lưu `game_key = 'avalon'`.
- User nhập dưới 5 ký tự bị chặn.
- User nhập trên 1000 ký tự bị chặn.
- Spectator hoặc người không còn trong phòng không gửi được.
- Host đã reset về lobby nhưng `gameId` vẫn còn: report vẫn resolve đúng game nếu `game_sessions` còn tồn tại.
- Admin list thấy report mới, đổi status được.
- User thường không đọc được report của người khác qua RLS.

## Open Questions

- Có cần cho guest report trong MVP không? Plan hiện cho phép guest nếu vẫn là player trong phòng, nhưng admin sẽ không có email/user id để liên hệ.
- Có cần gửi notification ngoài DB cho admin không? MVP chỉ lưu DB và hiển thị admin list.
- Có cần attach screenshot không? MVP chưa làm vì yêu cầu hiện tại chỉ cần một input nội dung bug.
