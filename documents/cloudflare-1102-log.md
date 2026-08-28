<!-- Last updated: 2026-08-28 (entry #11) -->

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

## Tình trạng hiện tại (cập nhật 2026-08-28, entry #11)

> ⚠️ **Mục ngay dưới đây (về giới hạn 6 kết nối) đã được ĐÍNH CHÍNH ở Entry #11 — đọc Entry #11 trước
> khi dựa vào mục này.** Tóm tắt đính chính: vượt 6 kết nối đồng thời **không tự nó gây lỗi** kể từ khi
> Cloudflare đổi hành vi runtime (4/2026, đang áp dụng cho app này) — chỉ gây xếp hàng chờ, không ném
> exception. Đây là yếu tố GÓP PHẦN gián tiếp vào áp lực CPU/memory, không phải một giới hạn độc lập
> "vi phạm là chắc chắn lỗi". Mức ưu tiên hạ xuống ngang hàng với CPU time/memory — cả 3 đều chưa xác
> nhận được cái nào là nguyên nhân chính.

- **Nguyên nhân đang nghi ngờ nhất (CHƯA FIX, CHƯA xác nhận là nguyên nhân chính — xem đính chính
  trên):** `resolveNightActions()` (`src/app/games/wolf/actions.ts` dòng ~3238) bắn `Promise.all` cập
  nhật ĐỒNG THỜI cho MỌI lá bài (`players.length + 3`, tối đa **13** lá với phòng 10 người). Từ
  4/2026, Cloudflare giới hạn **"tối đa 6 kết nối đang chờ response header cùng lúc / 1 lần Worker
  invocation"** — kết nối thứ 7-13 chỉ bị XẾP HÀNG CHỜ (không lỗi), nhưng việc này kéo dài thời gian
  giữ state/buffer trong bộ nhớ của isolate, góp phần đẩy CPU time/memory của invocation đó (hoặc
  isolate dùng chung) tới gần giới hạn thật hơn. Đây là lời giải hợp lý nhất hiện có cho việc "13 > 6
  xảy ra CỐ ĐỊNH mỗi lần, nhưng lỗi 1102 lại NGẪU NHIÊN" — vì phần "có đủ để vượt ngưỡng CPU/memory
  thật hay không" phụ thuộc tải tại đúng thời điểm đó (bao nhiêu request khác dùng chung isolate, độ
  trễ Supabase lúc đó...), không phải thứ code này tự quyết định được. Root cause thật sự (giữa CPU
  time và memory) vẫn CHƯA xác nhận — xem Entry #11.
- **Dữ liệu thực tế xác nhận throttle (#9) giảm nhưng KHÔNG loại bỏ lỗi:** trong cửa sổ 08:55–10:05
  UTC ngày 27/8 (sau khi throttle 2500ms đã live), 2438 request thì có 40 lỗi `exceededResources`
  (1.64%), vẫn dồn cụm giống các baseline trước throttle. Xem Entry #10.
- **Trạng thái deploy (đã xác nhận bằng commit SHA thật từ GitHub Actions, không suy luận thời gian):**
  commit `2ea36b0` (throttle #9) live từ `2026-08-27T08:55:18Z`; commit `8840920` (tính năng độ trễ
  lượt đêm — migration CHƯA áp remote nên tính năng đang ở trạng thái tắt/fallback) live từ
  `2026-08-27T10:05:43Z` và là bản production HIỆN TẠI.
- **Chưa có cửa sổ tải cao nào sau 10:05:43Z (bản mới nhất) để kiểm chứng** — 363 request/~16 tiếng kể
  từ đó, không đủ để kết luận gì. Nếu user báo lỗi 1102 "hiện tại" mà không kèm thời điểm/Ray ID cụ
  thể, hỏi lại thời điểm chính xác trước khi tra cứu, vì dữ liệu Analytics tính đến lúc viết entry này
  KHÔNG cho thấy lỗi nào sau 2026-08-27T10:00Z.

> ⚠️ **Entry #7 bên dưới SAI một phần — xem Entry #8 để biết bản đã sửa.** Giữ nguyên Entry #7
> trong Timeline (không xoá) để thấy rõ đã sai ở đâu và sửa thế nào, nhưng đừng dựa vào mốc thời gian
> nêu ở Entry #7 nữa.

- **CẢ 3 FIX (#3, #4, #5) ĐÃ LIVE TỪ 2026-08-27T07:58:40Z** — xác nhận bằng cách đọc THẲNG nội dung
  code đã deploy (`git show <commit>:<file> | grep ...`), không chỉ suy luận từ thời điểm lỗi như
  Entry #7 đã làm sai. Commit `d6d4a45` (PR #85, GitHub Actions run 33051881968, deploy lúc
  07:58:40Z) đã chứa đủ cả jitter (#3), compare-and-swap (#4), và payload `phase` (#5).
- **Bài học (đã ghi vào memory để không lặp lại):** KHÔNG được suy luận "code X đã có trong bản
  deploy Y hay chưa" chỉ từ mốc thời gian lỗi xảy ra trước/sau lúc deploy — phải kiểm tra TRỰC TIẾP
  nội dung commit đã deploy (`git show <commit>:<file>`, hoặc hỏi commit SHA nào tương ứng deploy
  nào). Entry #7 đã suy luận sai theo kiểu này và kết luận nhầm. Entry #10 áp dụng đúng bài học này
  bằng cách đối chiếu qua GitHub Actions API (`head_sha` của từng run) thay vì chỉ so mốc thời gian.
- **Hệ quả quan trọng: lỗi Entry #6 (18+8=26 lỗi lúc 08:15–08:20Z) xảy ra SAU KHI cả 3 fix đã live
  được 17-22 phút.** Tức là 3 fix **chưa đủ** để ngăn lỗi ở kịch bản phòng chờ bấm sẵn sàng — đây là
  kết luận khác hẳn Entry #7 (Entry #7 tưởng nhầm là 3 fix chưa deploy nên lỗi vẫn còn "hợp lý").
- Deploy lúc 08:30:12Z (commit `d15f295`) **KHÔNG liên quan tới 1102** — đó là fix riêng cho bug
  "user đăng nhập không đổi được tên trong phòng" (`mapLobbyPlayer`), commit message trùng "fix 1102"
  chỉ là do quy trình commit của user đặt tên lặp lại, không phản ánh nội dung thật.
- **Chưa xác nhận được** lỗi 1102 là do hết CPU time hay hết bộ nhớ (128MB/isolate) — vẫn mở, xem
  phần "CPU vs Memory" bên dưới. (Giới hạn "6 kết nối đồng thời" phát hiện ở Entry #10 là nguyên nhân
  THỨ BA, độc lập với cả hai — không cần phân biệt CPU/memory để xác nhận giả thuyết này.)
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

---

### 2026-08-27 — Entry #7: Xác nhận đã deploy

**User báo:** "tôi vừa deploy xong, tôi tưởng phần fix đó đã được deploy trước đó rồi."

**Điều tra:** gọi API `GET /accounts/{id}/workers/scripts/weplaytogether-web/deployments` để xác
minh (không chỉ tin lời user, vì log này cần chính xác) — thấy deployment mới nhất lúc
**2026-08-27T08:30:12Z** (cách thời điểm gọi API chỉ ~4 giây, khớp "vừa deploy xong"). Deployment
TRƯỚC đó là 07:58:40Z — đối chiếu với thời điểm lỗi Entry #6 (08:15–08:20Z, tức là SAU 07:58Z), suy
ra bản 07:58Z **không hề chứa 3 fix** — đây chính xác là điều user "tưởng nhầm". Có thể bản 07:58Z là
một deploy khác không liên quan (hoặc deploy trước khi code fix được viết xong trong hội thoại).

**Kết luận:** đến giờ (2026-08-27T08:30:12Z), 3 fix Entry #3/#4/#5 mới thực sự lên production lần
đầu tiên. Chưa có ván chơi đông người nào sau mốc này để kiểm chứng hiệu quả.

**Không có file code nào thay đổi ở entry này** — thuần xác minh trạng thái deploy qua API, không
dựa vào lời kể để tránh ghi sai vào nhật ký.

> ⚠️ **Kết luận ở Entry #7 này SAI — xem Entry #8 ngay bên dưới.** Lỗi nằm ở chỗ: suy luận "bản
> 07:58:40Z không có fix" chỉ từ việc lỗi Entry #6 xảy ra SAU mốc đó, mà không kiểm tra nội dung
> code thật sự đã deploy. Khi user gửi link GitHub Actions run của chính bản 07:58:40Z và hỏi lại,
> kiểm tra trực tiếp bằng `git show <commit>:<file>` mới phát hiện bản đó ĐÃ CÓ đủ cả 3 fix.

---

### 2026-08-27 — Entry #8: Sửa lại Entry #7 — 3 fix đã live từ trước, vẫn còn lỗi

**User hỏi lại:** gửi link GitHub Actions run
(https://github.com/kingasawa/weplaytogether-web/actions/runs/33051881968) và hỏi "ý bạn là bản này
chưa fix ah" — nghi ngờ đúng chỗ kết luận sai ở Entry #7.

**Điều tra lại (lần này kiểm tra code thật, không suy luận từ thời gian):**
- `WebFetch` link Actions run → run này chạy lúc 07:57, mất 1m34s, deploy commit `d6d4a45` (nhánh
  `main`, tác giả khanhtranicd), gắn với PR #85 "fix 1102". Repo public nên xem được không cần token.
- Repo chính đã có sẵn các commit này (user tự commit sau mỗi lần tôi sửa xong): `git log` cho thấy
  4 commit "fix 1102" liên tiếp (`71f258e`, `e12fc40`, `d6d4a45`, `d15f295` — mới nhất).
- `git show d6d4a45:src/lib/pusher/use-wolf-room-presence.ts | grep -c "REALTIME_EVENT_JITTER_MS"` →
  **8 lần xuất hiện** — fix #3 (jitter) đã có trong commit này.
- `git show d6d4a45:src/app/games/wolf/actions.ts | grep -c '.eq("phase", "...")'` → **11 lần** — fix
  #4 (compare-and-swap) cũng đã có.
- Diff riêng của `d6d4a45` (so với `e12fc40` trước đó) đúng là 6 file của fix #5 (payload `phase`).
- → **Kết luận đúng: cả 3 fix #3+#4+#5 đã có mặt đầy đủ trong commit `d6d4a45`, deploy lúc
  07:58:40Z** — SỚM HƠN nhiều so với 08:30:12Z mà Entry #7 tưởng nhầm.
- Kiểm tra thêm commit mới nhất `d15f295` (deploy 08:30:12Z, đúng lúc user báo "vừa deploy xong"):
  diff chỉ động tới `avalon/actions.ts`, `wolf-classic/actions.ts`, `wolf/actions.ts` ở đúng hàm
  `mapLobbyPlayer` — **đây là fix bug "đổi tên trong phòng" (từ yêu cầu trước đó của user), HOÀN
  TOÀN KHÔNG LIÊN QUAN tới 1102**, dù message commit cũng ghi "fix 1102" (do quy trình commit lặp lại
  tên, không phản ánh đúng nội dung).

**Ý nghĩa quan trọng của phát hiện này:** lỗi Entry #6 (26 lỗi lúc 08:15–08:20Z) xảy ra **SAU KHI**
cả 3 fix đã chạy trên production được 17-22 phút. Điều này đổi hẳn kết luận: KHÔNG PHẢI "chưa deploy
nên còn lỗi" (như Entry #6/#7 tưởng) mà là **3 fix hiện có CHƯA ĐỦ MẠNH** để chặn hết lỗi ở kịch bản
phòng chờ đông người bấm sẵn sàng.

**Giả thuyết vì sao fix #3 (jitter) chưa đủ — cần cân nhắc khi sửa tiếp:**
1. Cửa sổ jitter 700ms có thể quá ngắn: với N client cùng nhận 1 broadcast, dù mỗi client random
   delay trong [0, 700ms), xác suất vài client rơi gần nhau vẫn cao (hiệu ứng birthday paradox) —
   chưa chắc đã dàn đều đủ để tránh chồng lấn.
2. Cơ chế hiện tại (`scheduleRefetchFromEvent`) chỉ gộp các broadcast đến TRONG LÚC đang có 1 timer
   chờ sẵn. Nếu các hành động người thật cách nhau hơn 700ms (rất dễ xảy ra: vào phòng → đổi avatar →
   bấm sẵn sàng, mỗi việc cách nhau vài giây) thì mỗi broadcast vẫn tạo một đợt fetch-đồng-thời riêng
   biệt, không được gộp giữa các đợt.
3. Có thể còn nguyên nhân khác chưa tìm ra (cần thêm dữ liệu path-level từ Cloudflare — vẫn đang
   thiếu quyền `Zone Analytics: Read`).

**Chưa quyết định/code fix tiếp theo ở entry này** — cần bàn hướng đi trước (tăng cửa sổ jitter lên
đáng kể? đổi debounce thành throttle thật sự theo khoảng thời gian cố định thay vì chỉ "gộp nếu đang
chờ"? xin thêm quyền Cloudflare để tra path cụ thể?).

**Bài học quy trình (đã ghi vào memory):** không suy luận trạng thái deploy từ mốc thời gian lỗi —
luôn kiểm tra trực tiếp nội dung code đã deploy bằng `git show <commit>:<file>` khi có commit SHA cụ
thể (từ link GitHub Actions, deployment API, hoặc user cung cấp).

---

### 2026-08-27 — Entry #9: Tăng cường fix #3 thành throttle thật sự

**User chọn hướng đi** (trong 2 hướng đề xuất ở Entry #8): tăng cửa sổ + đổi thành throttle thật sự,
làm ngay không cần xin thêm quyền Cloudflare trước.

**Fix đã áp dụng** trong `src/lib/pusher/use-wolf-room-presence.ts`:
- Đổi `REALTIME_EVENT_JITTER_MS = 700` → tách thành 2 hằng số: `REALTIME_EVENT_THROTTLE_MS = 2500`
  (khoảng throttle chính) + `REALTIME_EVENT_JITTER_MS = 500` (rải thêm ngẫu nhiên lên trên).
- `scheduleRefetchFromEvent` giờ tính `throttleRemaining` dựa trên
  `Date.now() - lastSyncedAtRef.current` (mốc lần fetch THỰC SỰ CHẠY gần nhất — **tái dùng biến
  `lastSyncedAtRef` đã có sẵn** cho cơ chế phát hiện "kẹt phase", vì nó vốn đã được cập nhật cuối mỗi
  lần `refetchState` thành công bất kể do broadcast/poll/foreground kích hoạt — không cần thêm ref
  mới). Nếu chưa đủ `REALTIME_EVENT_THROTTLE_MS` kể từ lần fetch gần nhất, đợi nốt phần còn thiếu
  + jitter rồi mới fetch. Nếu đã đủ (throttle hết hạn), chỉ đợi jitter (để tránh nhiều client cùng
  "hết hạn throttle" và bắn request cùng lúc sau một khoảng im lặng dài).
- Guard `pendingEventRefetchTimerRef` giữ nguyên — vẫn gộp mọi broadcast đến trong lúc đang có 1 lần
  fetch được lên lịch, KHÔNG đặt thêm timer mới đè lên.

**Vì sao đây là throttle thật sự, khác debounce cũ:** debounce cũ chỉ đợi 1 khoảng ngẫu nhiên CỐ ĐỊNH
kể từ broadcast gần nhất rồi fetch, nên nếu broadcast đến đều đặn cách nhau hơn khoảng đó (rất dễ xảy
ra với hành động người thật cách nhau vài giây), mỗi broadcast vẫn tạo 1 đợt fetch riêng — không có
gì đảm bảo khoảng cách TỐI THIỂU giữa 2 lần fetch liên tiếp. Throttle mới đảm bảo dù broadcast đến
dồn dập cỡ nào trong 2.5 giây, tối đa cũng chỉ có 1 lần fetch thực thi.

**File thay đổi:** `src/lib/pusher/use-wolf-room-presence.ts` (không đổi file nào khác — cơ chế này
dùng chung cho cả 3 game qua hook `useWolfRoomPresence`).

**Kết quả:** `npx tsc --noEmit` sạch, không lỗi Unicode. Test thủ công 1 người chơi (tạo phòng, vào
lobby, thoát phòng) qua trình duyệt — không console error, luồng hoạt động bình thường (không test
được throttle thật sự vì cần nhiều broadcast dồn dập từ nhiều client, không mô phỏng được ở đây).
**CHƯA DEPLOY** — cần hỏi lại user trước khi deploy, và cần ván chơi đông người tiếp theo (sau khi
deploy) để lấy số liệu Cloudflare thật xác nhận hiệu quả, so với baseline Entry #6 (26 lỗi/2 đợt,
lúc vẫn còn debounce 700ms).

### 2026-08-28 — Entry #10: Rà soát toàn diện MỌI nguyên nhân 1102 + phát hiện giới hạn 6 kết nối đồng thời (CHƯA FIX)

**User báo:** vẫn còn bị lỗi 1102, yêu cầu liệt kê **tất cả** case có thể gây lỗi 1102 trên Cloudflare
(không riêng những gì đã điều tra trong log này), kiểm tra trước trên game Ma Sói Một Đêm.

**Điều tra 1 — xác nhận lại trạng thái deploy (đúng bài học Entry #7/#8: dùng commit SHA thật, không
suy luận từ mốc thời gian):**
- `GET /accounts/{id}/workers/scripts/weplaytogether-web/deployments` → deploy gần nhất
  `2026-08-27T10:05:38Z`.
- Đối chiếu GitHub Actions API công khai (`GET api.github.com/repos/kingasawa/weplaytogether-web/
  actions/runs?branch=main`, repo public nên không cần token): workflow "Deploy to Cloudflare Workers"
  hoàn tất lúc `10:05:43Z` ứng với `head_sha = 8840920`; deploy `08:55:18Z` ứng với `head_sha =
  2ea36b0`. Khớp đúng với thời điểm 2 commit này được tạo (08:53:20 và 17:03:38 giờ VN).
- **Xác nhận: commit `2ea36b0` (Entry #9 — throttle 2500ms+jitter500ms) ĐÃ LIVE từ 08:55:18Z UTC.
  Commit `8840920` (thêm tính năng độ trễ lượt đêm ngẫu nhiên, cột `night_turn_reveal_at`) ĐÃ LIVE từ
  10:05:43Z UTC và là bản production hiện tại.** Tính năng độ trễ lượt đêm code đã viết xong nhưng
  **CHƯA thực sự hoạt động** vì migration `202608270001_wolf_night_turn_delay.sql` chưa được áp remote
  (đã kiểm tra `documents/migrations.md` — code tự fallback an toàn khi thiếu cột, hành vi hiện tại vẫn
  như cũ: chuyển lượt/kết thúc đêm ngay lập tức, không có độ trễ).

**Điều tra 2 — dữ liệu lỗi thật sau khi throttle (#9) live, so sánh công bằng với baseline cũ:**
Query `workersInvocationsAdaptive` cho đúng cửa sổ 08:55–10:05 UTC 27/8 (từ lúc throttle live tới lúc
deploy kế tiếp) — đây là cửa sổ DUY NHẤT có tải cao (2438 request) để so sánh với baseline Entry #2
(36 lỗi/2438... à baseline gốc là 36 lỗi, không cùng quy mô traffic nên chỉ so tỷ lệ/hình dạng cụm):
- **success: 2398, exceededResources: 40 → tỷ lệ lỗi 1.64%.** Lỗi vẫn dồn cụm: 09:25 (5), 09:30 (12),
  09:40 (1), 09:55 (21), 10:00 (1).
- **Chi tiết đáng chú ý:** bucket traffic CAO NHẤT (09:35 UTC, 243 request) **không có lỗi nào**, trong
  khi bucket 09:55 UTC (162 success + 21 lỗi = 183 request, THẤP hơn 09:35) lại lỗi nặng nhất. Nếu
  nguyên nhân thuần tuý là "tổng request/5 phút quá cao" thì 09:35 phải lỗi nặng hơn — ngược lại mới
  đúng. Việc lỗi không tỷ lệ thuận với tổng traffic gợi ý mạnh: nguyên nhân là **một THAO TÁC CỤ THỂ
  xảy ra đúng lúc đó** (khớp giả thuyết ở Điều tra 3 bên dưới), không phải do throttle chưa đủ mạnh.
- **Kết luận: throttle 2500ms (#9) làm GIẢM nhưng KHÔNG LOẠI BỎ lỗi 1102.** Cần thêm nguyên nhân khác
  ở phía SERVER (một loại request tự nó tốn tài nguyên/kết nối vượt giới hạn), không chỉ do nhiều
  client gọi trùng nhau.
- Cửa sổ sau đó (10:05:43Z 27/8 → hiện tại lúc viết entry, 2026-08-28T02:04Z): 363 request, 0 lỗi —
  **KHÔNG dùng được để kết luận "đã hết lỗi"** vì lưu lượng quá thấp (~16 tiếng không có ván đông người
  nào), chỉ đơn giản là chưa có tải tương đương để kiểm chứng bản mới nhất.

**Điều tra 3 — đọc lại code ở góc độ MỚI (subrequest/connection, không chỉ "số lần gọi lại state" như
các entry trước):**

Tra lại `developers.cloudflare.com/workers/platform/limits/` (chính thức) — xác nhận một giới hạn
RIÊNG BIỆT với CPU/memory mà log này **chưa từng nhắc tới trước entry này**:
**"Simultaneous open connections: tối đa 6 kết nối đang mở cùng lúc / 1 lần Worker invocation"**
(gộp chung `fetch()`, KV, Cache API, R2, Queues, WebSocket — áp dụng CẢ Free lẫn Paid, KHÔNG nâng cấp
được bằng cách trả tiền, khác với CPU time).

Đọc lại `resolveNightActions()` (`src/app/games/wolf/actions.ts` dòng ~3238-3261 — hàm chạy mỗi khi
đêm kết thúc, gọi từ `settleNightTurnDelay` trong `getWolfPlayState`):

```ts
await Promise.all(
  cards.map((card) => supabase.from("game_cards").update({ current_role: ... }).eq("id", card.id))
);
```

- Số lá bài = `players.length + 3` (xác nhận tại `validateSelectedRoleDeck(selectedRoles,
  players.length + 3)` và `centerCards = roles.slice(players.length)...` lúc `startWolfGame`) — đúng
  luật Ma Sói Một Đêm chuẩn (mỗi người 1 lá + 3 lá giữa bàn).
- Với `MAX_PLAYERS = 10`, số lá bài tối đa = **13** → `resolveNightActions` bắn **13 request UPDATE
  Supabase đồng thời** qua `Promise.all`, kể cả khi CHỈ MỘT request duy nhất (không trùng lặp) gọi hàm
  này. **Đây là điểm khác biệt cốt lõi so với mọi phân tích trước:** các fix throttle/CAS (#3/#4/#9)
  chỉ ngăn NHIỀU request gọi TRÙNG NHAU — không ngăn được việc MỘT lần gọi hợp lệ, đúng thiết kế, tự nó
  đã vượt giới hạn 6 kết nối đồng thời của chính Cloudflare. Giải thích tốt hơn cho hiện tượng lỗi dồn
  cụm không tỷ lệ với tổng traffic ở Điều tra 2 (khớp lúc nhiều ván đồng thời cùng kết thúc đêm, hơn là
  khớp lúc tổng lưu lượng cao nhất).
- **Đã rà thêm để loại trừ khả năng khác trong cùng khu vực code (tránh kết luận vội):**
  - `awardWolfGameScores` (dòng ~3133): gộp toàn bộ người chơi vào 1 mảng, gọi ĐÚNG 1 RPC
    `award_wolf_game_points` — không fan-out, KHÔNG phải nguyên nhân.
  - `nightResolutionCache` (dòng ~2263): dùng `WeakMap` (không phải `Map`), khoá theo mảng `cards`,
    có comment giải thích rõ mục đích tránh giữ rác giữa các request — KHÔNG rò rỉ bộ nhớ qua isolate.
  - `getActivePlayers`, `getLivePlayerProfilesByUserId`: đều là 1 query duy nhất, không phải kiểu N+1
    lặp theo từng người chơi.
  - `Promise.all` khác trong codebase (`wolf-classic/actions.ts`, `pusher/server.ts`): chỉ gộp 2-3
    lời gọi cố định, không có nguy cơ vượt giới hạn 6 kết nối.

**Chưa fix ở entry này** — chỉ mới XÁC ĐỊNH nguyên nhân, chưa chọn hướng sửa (2 hướng khả dĩ: gộp 13
lệnh UPDATE riêng lẻ thành 1 lệnh `upsert` hàng loạt duy nhất; hoặc giữ nhiều lệnh nhưng chạy theo lô
nhỏ ≤5-6 lệnh mỗi đợt thay vì tất cả cùng lúc) — cần bàn hướng với user trước khi code.

**Việc phụ đã làm:** tổng hợp bảng đầy đủ MỌI case có thể gây 1102 theo tài liệu chính thức Cloudflare
(không riêng case đang nghi ở app này), đối chiếu từng case với code Ma Sói Một Đêm — gửi cho user
dạng bảng trong hội thoại/artifact, không lưu lại nội dung bảng vào file này (chỉ lưu phát hiện mới có
giá trị lâu dài như trên).

---

### 2026-08-28 — Entry #11: Đính chính Entry #10 — vượt 6 kết nối KHÔNG tự nó gây lỗi (runtime đã đổi hành vi từ 4/2026)

**User hỏi đúng trọng tâm:** "bắn 13 kết nối đồng thời, vượt giới hạn 6 kết nối/lần Worker chạy, thì
sẽ bị lỗi gì, có phải là 1102 không, và tại sao lúc nào nó cũng vượt giới hạn mà lỗi 1102 thì ngẫu
nhiên?" — câu hỏi lộ ra một chỗ Entry #10 chưa giải thích được: nếu 13 > 6 xảy ra ở MỌI lần
`resolveNightActions` chạy (code cố định, không đổi), tại sao lỗi 1102 lại không xảy ra ở MỌI lần?

**Điều tra lại (đúng tinh thần "kiểm chứng trước khi khẳng định" mà log này luôn theo — không lặp lại
kiểu suy luận vội đã bị sửa ở Entry #7/#8):** tra lại tài liệu chính thức Cloudflare, phát hiện có một
**thay đổi hành vi runtime** mà Entry #10 chưa biết tới:

- Tìm thấy changelog chính thức:
  [Relaxed simultaneous connection limiting for Workers](https://developers.cloudflare.com/changelog/post/2026-04-09-relaxed-connection-limiting/)
  (ngày **2026-04-09** — đã có hiệu lực từ lâu trước khi dự án này gặp lỗi 1102 đầu tiên, nên áp dụng
  cho toàn bộ traffic đang được phân tích trong log này).
- **Hành vi CŨ (trước 4/2026):** giới hạn 6 kết nối áp dụng cho TOÀN BỘ vòng đời kết nối (kể cả lúc
  đang đọc response body, không chỉ lúc chờ header). Runtime dùng "deadlock avoidance algorithm" —
  nếu cả 6 kết nối cùng "trông có vẻ" idle dù chỉ trong khoảnh khắc, nó sẽ HỦY kết nối lâu-không-hoạt-
  động-nhất để nhường chỗ. Việc hủy này ném ra lỗi cụ thể tên **"Response closed due to connection
  limit"** — MỘT LOẠI LỖI KHÁC, có tên/thông báo riêng, không phải "1102 Worker exceeded resource
  limits". Lỗi này cũng dễ bị kích hoạt "giả" (spurious) vì các thao tác nội bộ như giải nén gzip tạo
  ra khoảng lặng I/O ngắn khiến kết nối đang hoạt động thật bị tưởng nhầm là idle.
- **Hành vi MỚI (từ 4/2026, đang áp dụng CHO APP NÀY ngay lúc này):** giới hạn 6 chỉ còn áp dụng cho
  giai đoạn "đang chờ response header" — ngay khi 1 kết nối nhận được header, chỗ trống được giải
  phóng lập tức (dù body vẫn đang đọc dở). Kết nối thứ 7 trở đi khi cả 6 đang chờ header **chỉ đơn
  giản bị XẾP HÀNG CHỜ**, không có exception/lỗi nào bị ném ra. Lỗi "Response closed due to connection
  limit" đã **bị loại bỏ hoàn toàn**.

**Kết luận đính chính:** claim ở Entry #10 rằng đây là "vi phạm xác nhận" tương đương CPU/memory là
**QUÁ MẠNH so với bằng chứng thật**. Chính xác hơn:
- Bắn 13 kết nối đồng thời **không tự nó gây ra lỗi nào cả** (kể cả 1102 lẫn bất kỳ lỗi nào khác) —
  chỉ khiến 7 trong 13 request phải xếp hàng chờ, kéo dài thời gian chạy thực tế (wall-clock) của
  `resolveNightActions()`.
- Đây LÀ điều kiện **CẦN nhưng KHÔNG ĐỦ**: việc xếp hàng chờ này giữ nhiều state/buffer hơn (Supabase
  client, promise, response đang chờ) sống lâu hơn trong bộ nhớ của isolate — **góp phần làm tăng áp
  lực lên đúng 2 giới hạn THẬT SỰ gây 1102** (CPU time và memory 128MB/isolate dùng chung), chứ không
  phải bản thân nó là một giới hạn thứ 3 độc lập.
- **Đây chính là lời giải cho câu hỏi "luôn vượt mà lỗi lại ngẫu nhiên":** 13 > 6 xảy ra CỐ ĐỊNH mỗi
  lần (code không đổi), nhưng việc điều đó có ĐỦ để đẩy CPU/memory của đúng invocation đó (hoặc isolate
  đang dùng chung) vượt ngưỡng hay không lại phụ thuộc các yếu tố **ngẫu nhiên tại đúng thời điểm đó**:
  isolate đó đang xử lý thêm bao nhiêu request khác cùng lúc (bộ nhớ dùng chung), độ trễ phản hồi thật
  của Supabase lúc đó (chậm hơn → giữ hàng chờ lâu hơn → chiếm bộ nhớ lâu hơn), có bao nhiêu ván khác
  đang cùng lúc kết thúc đêm... — không phải thứ code kiểm soát được.

**Có cần fix `resolveNightActions` nữa không?** CÓ, vẫn nên chia thành lô nhỏ (≤5-6/đợt) như đã đề
xuất ở Entry #10 — nhưng vì lý do KHÁC: giảm đỉnh bộ nhớ/thời gian giữ trạng thái mỗi invocation, qua
đó giảm XÁC SUẤT góp phần vượt CPU/memory, không phải vì "tránh 1 giới hạn kết nối gây lỗi trực tiếp"
(giới hạn đó không còn gây lỗi trực tiếp nữa từ 4/2026). Mức độ ưu tiên hạ từ "vi phạm xác nhận" xuống
"yếu tố góp phần đáng ngờ, chưa chắc là nguyên nhân chính" — ngang hàng với CPU time và memory, cả 3
đều CHƯA xác nhận được cái nào là nguyên nhân trực tiếp/chính.

**File/artifact đã cập nhật lại cho khớp:** bảng chẩn đoán (artifact đã gửi user) — đổi mức độ dòng
"6 kết nối đồng thời" từ 🔴 sang 🟡, viết lại phần bằng chứng theo đúng cơ chế mới. Đã sửa lại phần
"Tình trạng hiện tại" và mục 1 "Việc cần làm tiếp" bên dưới cho khớp.

---

## Việc cần làm tiếp (chưa làm, ghi lại để không quên)

1. **[Entry #10, đính chính mức độ ở Entry #11 — vẫn CHƯA FIX, nghi vấn ngang hàng CPU/memory]**
   `resolveNightActions()` (`src/app/games/wolf/actions.ts` dòng ~3238) bắn 13 lệnh UPDATE Supabase
   đồng thời qua `Promise.all` (1 lệnh/lá bài, tối đa `players.length + 3 = 13` với phòng 10 người).
   Từ 4/2026 Cloudflare chỉ XẾP HÀNG CHỜ kết nối vượt quá 6 (không lỗi trực tiếp) — nên đây là yếu tố
   GÓP PHẦN vào áp lực CPU/memory của isolate, không phải một vi phạm tự nó gây lỗi (xem Entry #11).
   Vẫn đáng sửa để giảm đỉnh bộ nhớ/thời gian giữ state mỗi invocation: (a) gộp thành 1 lệnh `upsert`
   hàng loạt duy nhất thay vì 13 lệnh riêng, hoặc (b) giữ nhiều lệnh nhưng chạy theo lô ≤5-6 lệnh/đợt.
   Bàn với user trước khi chọn hướng — không còn là "khẩn cấp nhất" mà là 1 trong vài nghi vấn ngang
   nhau, nên cân nhắc làm cùng lúc với việc tìm cách xác nhận CPU hay memory mới là nguyên nhân chính
   (mục 3 bên dưới) thay vì coi đây là đủ để giải quyết một mình.
2. **[ĐÃ XONG — deploy thật sự lúc 07:58:40Z, KHÔNG PHẢI 08:30:12Z như Entry #7 tưởng nhầm, xem
   Entry #8]** ~~Deploy cả 3 fix (Entry #3, #4, #5) lên production~~.
   **[ĐÃ DEPLOY từ 2026-08-27T08:55:18Z, xác nhận qua commit SHA `2ea36b0` — xem Entry #10]**
   ~~Tăng cường fix #3 thành throttle thật sự (2.5s + jitter 500ms)~~. **KẾT QUẢ ĐÃ CÓ DỮ LIỆU (Entry
   #10): throttle làm giảm nhưng KHÔNG loại bỏ lỗi — vẫn 1.64% lỗi (40/2438 request) trong cửa sổ tải
   cao duy nhất quan sát được sau khi fix live.** Không cần deploy lại fix này — đã live và đã có đủ
   dữ liệu đánh giá. Việc còn lại chuyển sang mục 1 ở trên (nguyên nhân mới).
3. Cân nhắc thêm quyền `Zone Analytics: Read` vào token Cloudflare để tra được `clientRequestPath`
   cụ thể (hiện bị từ chối quyền) — sẽ biết chính xác endpoint nào gây lỗi thay vì chỉ biết ở mức
   Worker chung, giúp xác nhận đúng hướng trước khi sửa thêm.
4. Nếu vẫn còn lỗi sau khi fix mục 1: xem xét giảm khối lượng tính toán/bộ nhớ MỖI REQUEST ở
   server, không chỉ giảm số lượng/tần suất request — trọng tâm nghi ngờ: các hàm tính toán nặng
   trong `src/app/games/wolf/actions.ts` (`getActiveNightTurn`, `buildNightReviewMessages`,
   `getRoleByPlayerIdAfterCopycat`, `buildWolfResultSnapshotFromDatabase` — xử lý logic Nhân
   Bản/Copy Cat lồng nhau và build kết quả cuối game khá tốn), và kiểm tra xem `getWolfPlayState` có
   trả về payload quá lớn cho client hay không. (Đã loại trừ `awardWolfGameScores` và
   `nightResolutionCache` khỏi danh sách nghi vấn ở Entry #10 — xem chi tiết ở entry đó.)
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
6. **Giờ đã deploy — theo dõi thực tế xem bộ đếm "X/N đã sẵn sàng"/"X/N đã vote" có tự cập nhật
   đúng trong vòng ~8s (qua poll định kỳ) khi có người thao tác hay không**, tránh trường hợp bị
   "kẹt" hiển thị sai do lỗi logic so sánh phase ở fix #5 (trước đó chỉ verify được 1 người chơi qua
   trình duyệt + `tsc`, chưa test nhiều phiên đồng thời thật).
7. Lỗi 1101 ở Entry #1 vẫn còn mở — nếu tái diễn, giờ đã có Worker Name thật nên tra được qua
   `status: "exception"` trên `workersInvocationsAdaptive`.
8. Migration `202608270001_wolf_night_turn_delay.sql` (cột `night_turn_reveal_at`) vẫn CHƯA áp remote
   — tính năng độ trễ lượt đêm (Entry #9 commit `8840920`) đang ở trạng thái tắt/fallback dù code đã
   live từ 2026-08-27T10:05:43Z. Không khẩn cấp cho riêng vấn đề 1102, nhưng cần nhớ để không tưởng
   nhầm tính năng đã hoạt động khi theo dõi log/hành vi game.

## Việc phụ phát hiện được (không phải 1102, nhưng liên quan trong lúc điều tra)

- `wrangler.jsonc` đang commit `PUSHER_SECRET` dạng plaintext vào git (không bị gitignore). Đã tạo
  task riêng để chuyển sang Cloudflare secret + rotate key mới — chưa làm, cần user xác nhận vì ảnh
  hưởng Pusher đang chạy production.
