<!-- Last updated: 2026-08-27 -->

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

## Tình trạng hiện tại (cập nhật 2026-08-27)

- **Nguyên nhân cơ chế đã xác định khá chắc:** ở bước bỏ phiếu (và nhìn chung là bất kỳ lúc nào
  nhiều người thao tác gần nhau), mỗi hành động submit sẽ bắn broadcast qua Pusher, và **TẤT CẢ**
  client khác lập tức gọi lại server action full-state (`getWolfPlayState`/tương đương) cùng lúc —
  kiểu "thundering herd". Đây là nguyên nhân khớp nhất với triệu chứng "nhiều người vote cùng lúc
  thì lỗi" mà user quan sát được.
- **Đã fix (chưa deploy — xem entry 2026-08-27 #3):** thêm jitter + gộp refetch trong
  `src/lib/pusher/use-wolf-room-presence.ts`. Hook này dùng chung cho cả 3 game (Ma Sói, Ma Sói
  Nhiều Đêm, Avalon) nên fix áp dụng cho toàn bộ, không riêng game nào.
- **Chưa xác nhận được** lỗi 1102 hôm 2026-08-27 là do hết CPU time hay hết bộ nhớ (128MB/isolate)
  — hai cơ chế khác nhau, cách khắc phục khác nhau (xem phần "CPU vs Memory" bên dưới). Cần dữ
  liệu của lần lỗi TIẾP THEO (sau khi deploy fix jitter) để so sánh và kết luận rõ hơn.
- **Chưa deploy** bản fix jitter lên production — nghĩa là tính đến thời điểm cập nhật file này,
  production vẫn đang chạy code CŨ (chưa có fix). Nếu user báo lỗi 1102 mới mà chưa xác nhận đã
  deploy, đây là việc đầu tiên cần hỏi lại.
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

## Việc cần làm tiếp (chưa làm, ghi lại để không quên)

1. **Deploy fix ở Entry #3 lên production** — hỏi lại user trước khi deploy (ảnh hưởng người chơi
   thật). Nếu user đã báo lỗi 1102 mới mà chưa deploy fix này, ưu tiên deploy trước rồi mới điều
   tra thêm.
2. Sau khi deploy và có ván chơi đông người tiếp theo bị lỗi (nếu còn), tra lại
   `workersInvocationsAdaptive` cùng khung giờ, so sánh số lỗi/`cpuTime`/`wallTime` với baseline
   Entry #2 để đánh giá hiệu quả fix.
3. Nếu vẫn còn lỗi sau fix #3: cân nhắc thêm quyền `Zone Analytics: Read` vào token Cloudflare để
   tra được `clientRequestPath` cụ thể (hiện bị từ chối quyền) — sẽ biết chính xác endpoint nào gây
   lỗi thay vì chỉ biết ở mức Worker chung.
4. Nếu vẫn còn lỗi: xem xét giảm khối lượng tính toán/bộ nhớ MỖI REQUEST ở server, không chỉ giảm
   số lượng request — trọng tâm nghi ngờ: các hàm tính toán nặng trong
   `src/app/games/wolf/actions.ts` (`getActiveNightTurn`, `buildNightReviewMessages`,
   `getRoleByPlayerIdAfterCopycat` — xử lý logic Nhân Bản/Copy Cat lồng nhau khá tốn), và kiểm tra
   xem `getWolfPlayState` có trả về payload quá lớn cho client hay không.
5. Avalon dùng chung hook `useWolfRoomPresence` nên được hưởng lợi từ fix #3, nhưng CHƯA kiểm tra
   riêng xem action state của Avalon có phần tính toán nặng tương tự cần tối ưu hay không.
6. Lỗi 1101 ở Entry #1 vẫn còn mở — nếu tái diễn, giờ đã có Worker Name thật nên tra được qua
   `status: "exception"` trên `workersInvocationsAdaptive`.

## Việc phụ phát hiện được (không phải 1102, nhưng liên quan trong lúc điều tra)

- `wrangler.jsonc` đang commit `PUSHER_SECRET` dạng plaintext vào git (không bị gitignore). Đã tạo
  task riêng để chuyển sang Cloudflare secret + rotate key mới — chưa làm, cần user xác nhận vì ảnh
  hưởng Pusher đang chạy production.
