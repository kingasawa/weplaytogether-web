<!-- Last updated: 2026-08-27 (entry #6) -->

# Nhật ký lỗi Cloudflare 1102 (Worker exceeded resource limits)

> **Mục đích file này:** mỗi khi user báo lỗi 1101/1102 trên Cloudflare, đọc lại toàn bộ file này
> trước khi điều tra — để không lặp lại các bước đã làm, và để hiểu ngay những gì đã loại trừ /
> đã xác nhận. Sau mỗi lần điều tra hoặc fix mới, cập nhật thêm entry vào phần Timeline, và sửa lại
> phần "Tình trạng hiện tại" nếu hiểu biết thay đổi. Đổi ngày ở dòng `Last updated` phía trên.

## Bối cảnh quan trọng — vì sao đây là vấn đề nghiêm trọng

**Game chỉ tối đa 10 người chơi cùng lúc.** Việc chạm giới hạn tài nguyên (CPU hoặc bộ nhớ) của
Cloudflare Worker ở quy mô nhỏ như vậy là **rất đáng lo ngại** — đây không phải vấn đề "quá nhiều
user" mà là vấn đề kiến trúc/hiệu năng: có chỗ nào đó trong code đang tốn tài nguyên bất thường
trên mỗi request, hoặc pattern gọi request đang tạo ra tải dồn (burst) không cần thiết. Nếu không
xử lý tận gốc, vấn đề sẽ tái diễn ngay cả khi không tăng thêm người chơi.

## Tình trạng hiện tại (cập nhật 2026-08-27, entry #6)

- **QUAN TRỌNG:** Entry #6 xác nhận lỗi 1102 vẫn xảy ra ở **phòng chờ (lobby)**, không chỉ lúc chơi
  — 4 người bấm "Sẵn sàng" gần nhau là đủ gây lỗi. Đây KHÔNG PHẢI bug mới — cùng cơ chế thundering
  herd đã tìm ra ở Entry #3 (broadcast `WOLF_ROOM_UPDATED_EVENT` lúc toggle ready cũng đi qua đúng
  `scheduleRefetchFromEvent` chưa được deploy). Vì 3 fix trước giờ vẫn CHƯA DEPLOY nên lỗi tiếp tục
  xảy ra ở bất kỳ đâu có nhiều người thao tác gần nhau — không riêng lúc vote. **Việc cần làm ngay là
  deploy, không phải viết thêm code mới.**

- **3 fix đã làm, liên quan tới việc nhiều người thao tác gần nhau (ban đầu thấy ở bước vote gần
  cuối ván, giờ Entry #6 xác nhận CŨNG xảy ra ở phòng chờ khi nhiều người bấm sẵn sàng — tức là cơ
  chế lỗi áp dụng cho MỌI broadcast realtime, không riêng lúc chơi):**
  1. **Thundering herd đọc (Entry #3):** mỗi broadcast khiến TẤT CẢ client gọi lại full-state cùng
     lúc. Fix: jitter/gộp refetch phía client (`use-wolf-room-presence.ts`).
  2. **Race condition ghi + tính toán trùng lặp (Entry #4):** logic tự động chuyển phase
     (`maybeAutoAdvancePhase`, `advanceWolfPhase`) không có khoá — nhiều request gần như đồng thời
     có thể CÙNG thấy "đủ điều kiện chuyển phase" và CÙNG chạy tác vụ nặng song song. Fix:
     compare-and-swap (`.eq("phase", <cũ>)`) ở mọi điểm chuyển phase.
  3. **Payload Pusher mang theo `phase` + bỏ qua fetch khi phase không đổi (Entry #5):** trước đây
     MỌI broadcast đều khiến client full-fetch dù chỉ để cập nhật 1 con số đếm. Fix: payload giờ có
     `phase`, client so với phase đang render, bỏ qua fetch nếu giống nhau (trừ phase "night" — luôn
     fetch vì lượt hành động đổi liên tục trong cùng phase đó).
- **Đã fix, CẢ 3 ĐỀU VẪN CHƯA DEPLOY** lên production — xem Entry #3, #4, #5. Production tính đến
  entry #6 vẫn chạy code CŨ, chưa có fix nào — Entry #6 chính là bằng chứng thực tế cho việc chưa
  deploy thì lỗi vẫn tái diễn đều đặn. Nếu user báo lỗi 1102 mới mà chưa xác nhận đã deploy, đây LUÔN
  là việc đầu tiên cần hỏi lại, không cần điều tra thêm nếu triệu chứng khớp mẫu "nhiều người thao
  tác gần nhau" đã biết.
- **Chưa xác nhận được** lỗi 1102 hôm 2026-08-27 là do hết CPU time hay hết bộ nhớ (128MB/isolate)
  — hai cơ chế khác nhau, cách khắc phục khác nhau (xem phần "CPU vs Memory" bên dưới). Cần dữ
  liệu của lần lỗi TIẾP THEO (sau khi deploy cả 3 fix) để so sánh và kết luận rõ hơn.
- Lỗi 1101 (Worker throw exception, KHÁC 1102) user báo "hôm qua" (trước 2026-08-27) **chưa điều
  tra được** — không có Ray ID/thời điểm cụ thể, không có Sentry. Vẫn đang mở.

## CPU time vs Memory limit — phân biệt để không sửa sai

| | CPU time limit | Memory limit |
|---|---|---|
| Giá trị | Free: rất thấp (thấy `cpuTimeP50` các request lỗi đúng bằng 10000 μs = 10ms); Paid: nâng được tới 5 phút | **128MB / isolate, GIỐNG NHAU ở cả Free và Paid** |
| Nâng gói Paid có giúp không? | Có | **KHÔNG** |
| Cơ chế | Thời gian CPU thực thi code (loop, parse JSON...), KHÔNG tính thời gian chờ network | Một isolate có thể xử lý NHIỀU request đồng thời — bộ nhớ bị CHIA SẺ giữa các request đó |
| Vì sao dễ nhầm | Request "success" vẫn có thể có `cpuTime` > 10ms mà không lỗi — nên nếu chỉ nhìn `cpuTimeP50 = 10000` ở bucket lỗi mà kết luận ngay "CPU" là **chưa chắc chắn** |

**Bài học:** đừng vội khuyên nâng gói Paid nếu chưa chắc nguyên nhân là CPU. Ưu tiên xử lý nguyên
nhân dễ kiểm chứng và ít rủi ro hơn trước: giảm số request đồng thời (đã làm ở fix #3), giảm bộ nhớ/
tính toán mỗi request.

## Cách tra dữ liệu Cloudflare (đã verify chạy được)

Xem chi tiết & ví dụ query đầy đủ ở memory `reference_cloudflare_worker_logs_unavailable` (skill
`cloudflare`, thư mục `references/graphql-api/`). Tóm tắt:

- Worker Name: `weplaytogether-web` — Zone ID: `1b390145e1f590989938652197384f98` — Account ID:
  `94696f5bec8eb48c3487e8b683beff46` (xem `documents/project-config.md`).
- Dataset `workersInvocationsAdaptive` (account-scoped) — token hiện tại **CÓ** quyền
  `Account Analytics: Read`, dùng được.
- Dataset `httpRequestsAdaptiveGroups` (zone-scoped, để tra theo `clientRequestPath` cụ thể) —
  token hiện tại **THIẾU** quyền `Zone Analytics: Read`, bị từ chối. Muốn tra theo path/endpoint cụ
  thể thì cần thêm quyền này vào token trước.
- `status: "exceededResources"` = lỗi 1102. `status: "exception"` = lỗi 1101.
- **Luôn đọc token từ `documents/project-config.md` vào biến tại runtime trong script PowerShell**,
  KHÔNG viết literal token vào lệnh — tránh bị auto-mode classifier chặn, và đúng nguyên tắc AGENTS.md.

## Timeline điều tra & fix

### Trước 2026-08-27 (phát hiện qua đọc code, không rõ ngày gốc)

**Vấn đề:** lỗi 1102 liên quan `/_next/image`.

**Nguyên nhân:** app chạy trên Cloudflare Workers (OpenNext) không có binding IMAGES, nên
`/_next/image` không resize được — trả nguyên file gốc, mỗi ảnh là 1 lần Worker chạy + đệm cả file
trong RAM, không có Cache-Control.

**Fix:** `images.unoptimized: true` trong `next.config.ts` — ảnh đi thẳng qua Cloudflare static
assets (có CDN cache), Worker không đụng tới nữa.

**Kết quả:** không có dữ liệu xác nhận rõ ràng (áp dụng trước khi có nhật ký này), nhưng đợt lỗi
1102 tra được ngày 2026-08-27 xảy ra trong lúc chơi game (không phải lúc tải ảnh), nên khả năng cao
fix này vẫn đang có hiệu lực cho riêng vấn đề ảnh.

---

### 2026-08-27 — Entry #1: Lỗi 1101 báo "hôm qua"

**User báo:** bị lỗi 1101 lần nữa, không rõ thời điểm.

**Điều tra:** không có Sentry/error-tracking trong code. Lúc này Worker Name trong
`project-config.md` còn để `TODO` nên không tra được qua API. Không có Ray ID.

**Kết quả:** **CHƯA GIẢI QUYẾT** — cần Ray ID hoặc thời điểm cụ thể từ user để tra tiếp. (Lưu ý: từ
Entry #2 trở đi đã biết Worker Name thật, nên nếu lỗi 1101 tái diễn, giờ tra được bằng
`status: "exception"` trên `workersInvocationsAdaptive`.)

---

### 2026-08-27 — Entry #2: Lỗi 1102 trong lúc chơi (điều tra ban đầu)

**User báo:** người chơi bị lỗi 1102 liên tục trong ván vừa chơi, trong khoảng 1 tiếng đổ lại.

**Điều tra:** tìm ra Worker Name thật (`weplaytogether-web`) từ `wrangler.jsonc` (trước đó
`project-config.md` để TODO — đã điền lại). Query `workersInvocationsAdaptive` cho khung giờ
04:43–05:43 UTC (11:43–12:43 giờ VN) hôm 2026-08-27:

- Tổng **36 lỗi `exceededResources`**, dồn vào 4 mốc 5 phút: 12:00 (4 lỗi), 12:25 (15), 12:30 (16),
  12:35 (1) giờ VN.
- `cpuTimeP50` của cả 4 bucket lỗi đều đúng bằng `10000` (10ms).
- Zone `weplaytogether.online` đang ở plan "Free Website" ($0).

**Kết luận lúc đó (SAU NÀY PHÁT HIỆN LÀ CHƯA ĐỦ CĂN CỨ):** nghĩ đây là giới hạn CPU time 10ms của
Workers Free, đề xuất nâng lên Workers Paid ($5/tháng).

**Vấn đề của kết luận này:** các bucket "success" cùng khung giờ cũng có `cpuTime` vượt 10ms mà
không lỗi (ví dụ `cpuTimeP99` tới 385369 = 385ms) — mâu thuẫn với giả thuyết "cứ quá 10ms là chết".
Nghĩa là chưa chắc CPU time là nguyên nhân — xem Entry #3.

---

### 2026-08-27 — Entry #3: Tìm ra nguyên nhân cơ chế thật + fix jitter

**User cung cấp đầu mối quan trọng:** lỗi hay xảy ra ở **bước vote gần cuối ván**, lúc nhiều người
thao tác cùng lúc.

**Điều tra lại:** WebSearch + đọc trực tiếp trang docs Cloudflare về lỗi 1102 — xác nhận 1102 có thể
do **CPU time HOẶC memory (128MB/isolate)**, và memory limit **giống nhau ở mọi gói** (nâng Paid
không giúp được nếu nguyên nhân là memory). Việc "success" vượt 10ms CPU mà không chết càng củng cố
khả năng đây là vấn đề memory/tải đồng thời, không phải CPU.

Đọc code `src/lib/pusher/use-wolf-room-presence.ts` (hook dùng chung cho Ma Sói, Ma Sói Nhiều Đêm,
Avalon) — phát hiện: mỗi khi 1 người submit hành động, server broadcast qua Pusher, và **TẤT CẢ**
client khác lập tức gọi lại full-state action cùng lúc (`channel.bind(WOLF_PLAY_UPDATED_EVENT, () =>
{ void refetchState(); })`). Ở bước vote, nếu 8-10 người vote dồn dập trong vài giây → mỗi vote là
1 broadcast → mỗi broadcast kích TẤT CẢ client fetch lại → hàng chục request dồn vào Worker gần như
đồng thời trong vài giây. Đây là kiểu tải khớp chính xác với "nhiều isolate cùng xử lý nhiều request
→ chia sẻ bộ nhớ → 1102" mà tài liệu Cloudflare mô tả.

**Fix đã áp dụng:** thêm `REALTIME_EVENT_JITTER_MS = 700` và hàm `scheduleRefetchFromEvent` trong
`use-wolf-room-presence.ts` — khi có broadcast, KHÔNG gọi refetch ngay, mà đặt 1 timer với độ trễ
ngẫu nhiên 0–700ms; nếu có broadcast khác đến trong lúc đang chờ, bỏ qua (gộp vào lần gọi đã lên
lịch). Giảm cả số lần gọi (khi nhiều vote dồn dập) lẫn đỉnh tải đồng thời (rải thời điểm gọi ra).

**File thay đổi:** `src/lib/pusher/use-wolf-room-presence.ts`.

**Kết quả:** `npx tsc --noEmit` sạch. **CHƯA DEPLOY lên production, CHƯA có số liệu thực tế xác
nhận hiệu quả** (không mô phỏng được nhiều client đồng thời trong môi trường hiện tại). Cần: (1)
deploy, (2) chờ lần chơi đông người tiếp theo, (3) tra lại `workersInvocationsAdaptive` cho khung
giờ đó, so với baseline 36 lỗi/4 đợt ở Entry #2 để xem có giảm không.

---

### 2026-08-27 — Entry #4: Race condition ở logic tự động chuyển phase

**User đặt câu hỏi đúng trọng tâm:** "mỗi khi chuyển qua 1 phase mới thì có khả năng đó không, vì
khi nhiều người cùng bấm vào button, thì thường nó sẽ kiểm tra xem ai chưa bấm ở phase cũ" — yêu cầu
check case này.

**Điều tra:** đọc kỹ `maybeAutoAdvancePhase` (gọi từ `submitWolfVote`, `submitWolfNightAction`,
`submitWolfPhaseConfirmation` — tức MỌI hành động submit của người chơi) và `advanceWolfPhase` (host
bấm tay). Phát hiện: hàm này đọc trạng thái (số người đã vote/xác nhận, `getActiveNightTurn`...) rồi
mới UPDATE phase — **không có khoá/atomic nào giữa bước đọc và bước ghi**. Khi nhiều người submit
gần như đồng thời (đúng như user mô tả — điển hình nhất là vài người vote cuối cùng gần như cùng
lúc), NHIỀU request có thể cùng đọc thấy "đã đủ điều kiện" TRƯỚC KHI bất kỳ ai kịp ghi phase mới, nên
tất cả cùng chạy tiếp phần việc lẽ ra chỉ nên chạy 1 lần:

- **`voting` → `result`** (đúng bước user nghi ngờ nhất): gọi `setWolfGameResultPhase` →
  `buildWolfResultSnapshotFromDatabase` (tính toán nặng nhất trong game: toàn bộ kết quả, ai thắng
  thua, di chuyển lá bài...) + RPC `award_wolf_game_points` cộng điểm/Xu. Nếu 3-4 người vote cuối
  cùng gần như đồng thời → 3-4 lần build snapshot + gọi RPC chạy song song, đúng vào lúc nhiều người
  đang online nhất.
- **`night` → `discussion`**: gọi `resolveNightActions` (tính lại `current_role` cho MỌI lá bài rồi
  bắn tối đa ~13 lệnh UPDATE Supabase đồng thời qua `Promise.all` — bản thân 1 lần gọi đã tạo ra khá
  nhiều subrequest, chạy trùng vài lần thì nhân lên).
- Đã kiểm tra: **KHÔNG có bug cộng Xu/điểm trùng** — bảng `player_score_events` đã có
  `unique (game_id, user_id)` + RPC dùng `on conflict do nothing` (xem
  `supabase/migrations/202608250001_wolf_scoring_currency.sql`), nên phần thưởng vẫn đúng dù RPC bị
  gọi trùng. Vấn đề THUẦN TUÝ là lãng phí tài nguyên Worker do tính toán/ghi trùng lặp — không phải
  lỗi kinh tế game.

**Fix đã áp dụng:** đổi các UPDATE chuyển phase từ `.eq("id", gameId)` đơn thuần sang
`.eq("id", gameId).eq("phase", "<phase cũ>").select("id")` — kiểu "compare-and-swap": chỉ request
nào UPDATE thực sự khớp được điều kiện (rows trả về > 0, tức phase vẫn đúng như lúc request đó đọc
được) mới tiếp tục chạy phần việc nặng phía sau (`resolveNightActions`, `awardWolfGameScores`); các
request "thua" tự dừng lại ngay, không tính toán/ghi trùng nữa. Áp dụng cho toàn bộ điểm chuyển phase
trong CẢ `maybeAutoAdvancePhase` lẫn `advanceWolfPhase` (host bấm tay) — kể cả những phase không có
tác vụ nặng đi kèm cũng được thêm guard cho nhất quán, dù rủi ro ở đó thấp hơn.

**File thay đổi:** `src/app/games/wolf/actions.ts` (hàm `maybeAutoAdvancePhase`,
`setWolfGameResultPhase`, `advanceWolfPhase`).

**Kết quả:** `npx tsc --noEmit` sạch. **CHƯA DEPLOY, CHƯA có số liệu thực tế xác nhận hiệu quả** —
giống Entry #3, cần deploy rồi chờ ván chơi đông người tiếp theo để so sánh với baseline Entry #2.
Đây là fix ở tầng SERVER (ngăn tính toán/ghi trùng), khác và bổ sung cho fix #3 ở tầng CLIENT (giảm
số lần gọi lại state) — cả hai cùng nhắm vào việc giảm tải dồn khi nhiều người thao tác cùng lúc.

---

### 2026-08-27 — Entry #5: Payload Pusher mang `phase` + bỏ qua fetch khi không đổi

**Bối cảnh:** sau khi bàn về việc đổi sang Socket.IO (kết luận: không đáng, xem lý do trong hội
thoại — Socket.IO cần server chạy liên tục, không hợp mô hình Cloudflare Workers, và không giải
quyết đúng gốc rễ), user chọn hướng rẻ hơn: để payload Pusher mang theo dữ liệu cần thiết thay vì chỉ
báo "có gì đó đổi rồi tự đi fetch lại". Đã thống nhất plan qua vài lượt trao đổi trước khi làm.

**Thiết kế cuối cùng (tối giản nhưng đủ hiệu quả):**
- Payload broadcast giờ có thêm `phase` (kiểu `WolfGamePhase`, optional — thiếu thì client hiểu là
  "cứ fetch lại cho chắc", không có rủi ro breaking nếu quên truyền ở đâu đó).
- Client nhớ phase đang render (`currentPhase` truyền từ component vào hook qua ref), so với
  `phase` trong payload nhận được: **giống nhau → bỏ qua, không fetch; khác nhau → full-fetch**.
- **Ngoại lệ cố ý: phase `"night"` luôn full-fetch**, không áp dụng so sánh — vì trong cùng phase
  đêm, lượt hành động đổi liên tục giữa các vai trò (Sói → Tiên Tri → Kẻ Trộm...), so phase không
  đủ để biết "tới lượt mình chưa". Đây là phase phức tạp nhất, để nguyên hành vi cũ là an toàn nhất.
  Đúng lúc user báo lỗi (bước **vote**) lại là phase đơn giản, không vướng ngoại lệ này.
- Với `maybeAutoAdvancePhase`, không biết trước có transition hay không (vd. vote cuối cùng có thể
  làm chuyển sang "result") nên hàm này được sửa để **trả về phase thực-tế-sau-khi-gọi** (không phụ
  thuộc request nào "thắng" race condition ở Entry #4 — chỉ cần điều kiện đủ để chuyển phase đúng là
  phase chắc chắn đổi, bất kể ai thắng) — nhờ vậy broadcast luôn đúng phase mới nhất, không báo sai.
- **Đánh đổi duy nhất:** bộ đếm kiểu "5/8 đã vote" không nhảy số tức thời khi bỏ qua fetch — cập
  nhật vào lần poll định kỳ tiếp theo (đã có sẵn, 8 giây/lần). Chấp nhận được, gần như không ai nhận
  ra khác biệt.
- **Phạm vi:** mới áp dụng cho Ma Sói (`src/app/games/wolf/actions.ts` + `wolf-play-screen.tsx`).
  Avalon dùng chung hàm `broadcastWolfPlayUpdate`/hook nhưng CHƯA truyền `phase` ở lệnh gọi nào —
  payload của Avalon vẫn thiếu `phase` nên tự động fallback về hành vi cũ (an toàn, chỉ là chưa được
  tối ưu) — xem mục "Việc cần làm tiếp".

**File thay đổi:**
- `src/lib/pusher/channels.ts` — thêm type `WolfPlayUpdatePayload { roomCode, phase? }`.
- `src/lib/pusher/server.ts` — `broadcastWolfPlayUpdate`/`safeBroadcastWolfPlayUpdate` nhận thêm
  tham số `phase?` optional, đưa vào payload.
- `src/app/games/wolf/actions.ts` — `maybeAutoAdvancePhase` đổi thành trả về `Promise<WolfGamePhase>`
  (phase sau khi gọi); toàn bộ ~9 điểm gọi `safeBroadcastWolfPlayUpdate` (trong
  `submitWolfNightAction`, `submitWolfPhaseConfirmation`, `submitWolfVote`, `advanceWolfPhase`, lúc
  bắt đầu ván) truyền kèm phase tương ứng.
- `src/lib/pusher/use-wolf-room-presence.ts` — thêm prop `currentPhase`, hàm
  `shouldRefetchForPhaseChange` (có set `PHASES_ALWAYS_NEEDING_REFETCH = ["night"]`), handler event
  `WOLF_PLAY_UPDATED_EVENT` đọc payload và quyết định bỏ qua hay fetch.
- `src/app/games/wolf/rooms/[roomId]/play/wolf-play-screen.tsx` — truyền
  `currentPhase: playState.game.phase` vào hook.

**Kết quả:** `npx tsc --noEmit` sạch, không lỗi Unicode. Test thủ công 1 người chơi (tạo phòng, vào
lobby, thoát phòng) qua trình duyệt — không có console error, luồng hoạt động bình thường. **Chưa
test được tình huống nhiều người vote đồng thời** (cần nhiều phiên trình duyệt cùng lúc, không mô
phỏng được trong môi trường hiện tại) nên chưa xác nhận hiệu quả giảm tải thực tế — vẫn cần deploy +
số liệu ván chơi đông người tiếp theo như Entry #3, #4.

---

### 2026-08-27 — Entry #6: Xác nhận lỗi tái diễn ở phòng chờ (chưa deploy)

**User báo:** 4 người vào phòng chờ Ma Sói Một Đêm, bấm "Sẵn sàng" — người thứ 4 vừa bấm xong thì bị
lỗi 1102.

**Điều tra:** đọc lại toàn bộ file này trước (đúng quy trình đã đặt ra). Tra `workersInvocationsAdaptive`
khung giờ 07:25–08:25 UTC (14:25–15:25 giờ VN) hôm nay: có **26 lỗi `exceededResources`** dồn vào 2
mốc 5 phút liên tiếp — 08:15 (18 lỗi) và 08:20 (8 lỗi) UTC, tức 15:15 và 15:20 giờ VN — khớp đúng thời
điểm user mô tả. `cpuTimeP50` lại đúng bằng 10000 như các lần trước.

Kiểm tra code `toggleWolfReady` (dòng ~3654): hàm này TỰ NÓ rất nhẹ (chỉ 1 update + 1 broadcast,
không có logic tự-động-bắt-đầu-ván nào — bắt đầu ván vẫn cần chủ phòng bấm tay). Nhưng broadcast của
nó (`safeBroadcastWolfRoomUpdate`) bắn event `WOLF_ROOM_UPDATED_EVENT`, và event này đi qua ĐÚNG hàm
`scheduleRefetchFromEvent` đã fix jitter/gộp ở Entry #3 — nghĩa là đây **không phải bug mới**, mà là
**cùng cơ chế thundering herd ở Entry #3**, chỉ khác là bị kích hoạt qua nhánh phòng chờ (mỗi lần
toggle sẵn sàng → tất cả client trong phòng lập tức gọi lại `getWolfLobbyState` cùng lúc) thay vì
nhánh vote. Đã kiểm tra `getWolfLobbyState`/`getLivePlayerProfilesByUserId` — không có gì bất thường
nặng riêng cho lobby, nên tải dồn (nhiều request cùng lúc) vẫn là nguyên nhân chính, không phải một
endpoint cụ thể nào quá nặng.

**Kết luận:** đây là bằng chứng thực tế rằng lỗi 1102 KHÔNG giới hạn ở lúc chơi/vote — nó xảy ra ở
BẤT KỲ đâu có broadcast realtime dồn dập khi nhiều người thao tác gần nhau, kể cả phòng chờ trước khi
vào game. Fix Entry #3 (đã viết, đã qua `tsc`) vốn đã bao phủ đúng case này (áp dụng chung cho cả
`WOLF_ROOM_UPDATED_EVENT` lẫn `WOLF_PLAY_UPDATED_EVENT`) — **chỉ là chưa được deploy nên chưa có hiệu
lực**. Không cần sửa thêm code cho riêng case phòng chờ này.

**Không có file nào thay đổi ở entry này** — thuần điều tra + xác nhận lại chẩn đoán cũ bằng dữ liệu
mới, không phát hiện gì cần code thêm.

**Việc cần làm:** deploy 3 fix đã có (Entry #3/#4/#5) là bước DUY NHẤT cần làm tiếp để giải quyết cả
2 lần lỗi đã ghi nhận (vote + phòng chờ). Sau khi deploy, nếu vẫn còn lỗi ở quy mô tương tự (4-10
người) thì mới cần điều tra sâu hơn (giảm tải tính toán mỗi request — xem mục "Việc cần làm tiếp" #4).

## Việc cần làm tiếp (chưa làm, ghi lại để không quên)

1. **Deploy cả 3 fix (Entry #3, #4, #5) lên production — ĐANG LÀ VIỆC ƯU TIÊN NHẤT**, có bằng chứng
   thực tế (Entry #6) là lỗi tái diễn đều đặn chỉ vì chưa deploy. Hỏi lại user trước khi deploy (ảnh
   hưởng người chơi thật), nhưng đừng trì hoãn thêm bằng cách điều tra lại từ đầu nếu user báo thêm
   một lần lỗi 1102 nữa có cùng đặc điểm "nhiều người thao tác gần nhau" — mẫu này đã được xác nhận
   2 lần (vote + phòng chờ), khả năng cao là cùng nguyên nhân.
2. Sau khi deploy và có ván chơi đông người tiếp theo bị lỗi (nếu còn), tra lại
   `workersInvocationsAdaptive` cùng khung giờ, so sánh số lỗi/`cpuTime`/`wallTime` với baseline
   Entry #2 (36 lỗi/4 đợt) để đánh giá hiệu quả của CẢ 3 fix cộng lại.
3. Nếu vẫn còn lỗi: cân nhắc thêm quyền `Zone Analytics: Read` vào token Cloudflare để tra được
   `clientRequestPath` cụ thể (hiện bị từ chối quyền) — sẽ biết chính xác endpoint nào gây lỗi thay
   vì chỉ biết ở mức Worker chung.
4. Nếu vẫn còn lỗi: xem xét giảm khối lượng tính toán/bộ nhớ MỖI REQUEST ở server, không chỉ giảm
   số lượng/tần suất request — trọng tâm nghi ngờ: các hàm tính toán nặng trong
   `src/app/games/wolf/actions.ts` (`getActiveNightTurn`, `buildNightReviewMessages`,
   `getRoleByPlayerIdAfterCopycat`, `buildWolfResultSnapshotFromDatabase` — xử lý logic Nhân
   Bản/Copy Cat lồng nhau và build kết quả cuối game khá tốn), và kiểm tra xem `getWolfPlayState` có
   trả về payload quá lớn cho client hay không.
5. **Avalon (và Wolf Classic nếu có) chưa được audit/tối ưu tương tự:**
   - Chưa kiểm tra Avalon có cùng kiểu race condition ở logic chuyển phase như fix #4 không — cần
     xem `src/app/games/avalon/actions.ts` có hàm tương đương `maybeAutoAdvancePhase` thiếu guard
     `.eq("phase", ...)` hay không.
   - Fix #5 (payload mang `phase`) mới áp dụng cho Ma Sói — Avalon vẫn gọi
     `safeBroadcastWolfPlayUpdate(room.code)` không kèm `phase` ở toàn bộ ~11 điểm gọi trong
     `avalon/actions.ts`. Muốn Avalon cũng được tối ưu thì cần: (a) audit xem Avalon có phase nào có
     tính "lượt xoay vòng trong cùng phase" giống "night" của Ma Sói không (nếu có, thêm vào
     `PHASES_ALWAYS_NEEDING_REFETCH`), (b) truyền `phase`/`mapAvalonPhaseToSessionPhase(...)` vào các
     lệnh gọi `safeBroadcastWolfPlayUpdate`, (c) truyền `currentPhase` từ `avalon-play-screen.tsx`
     vào `useWolfRoomPresence`.
6. **Chưa test được bằng nhiều phiên đồng thời thật** (fix #5) — chỉ verify được 1 người chơi qua
   trình duyệt + `tsc`. Cần theo dõi kỹ sau khi deploy xem bộ đếm "X/N đã sẵn sàng" có tự cập nhật
   đúng trong vòng ~8s (qua poll định kỳ) khi có người thao tác hay không, tránh trường hợp bị "kẹt"
   hiển thị sai do lỗi logic so sánh phase.
7. Lỗi 1101 ở Entry #1 vẫn còn mở — nếu tái diễn, giờ đã có Worker Name thật nên tra được qua
   `status: "exception"` trên `workersInvocationsAdaptive`.

## Việc phụ phát hiện được (không phải 1102, nhưng liên quan trong lúc điều tra)

- `wrangler.jsonc` đang commit `PUSHER_SECRET` dạng plaintext vào git (không bị gitignore). Đã tạo
  task riêng để chuyển sang Cloudflare secret + rotate key mới — chưa làm, cần user xác nhận vì ảnh
  hưởng Pusher đang chạy production.
