<!-- BEGIN:external-config-rules -->
# External Systems — Credentials & Config

All connection details, API keys, and tokens for external systems are stored in:

**`documents/project-config.md`**

Read this file **before** performing any operation involving:
- Supabase (database queries, migrations, edge functions, storage)
- Cloudflare R2 (image upload, asset management)
- GitHub (repo operations via PAT)

Rules:
- Never hardcode credentials in source files — always reference via environment variables or read from this file at task time.
- This file is in `.gitignore`. Never commit it or echo its contents into any tracked file.
- GitHub section is currently TODO — ask the user before attempting any GitHub automation.
<!-- END:external-config-rules -->

<!-- BEGIN:supabase-doc-sync-rules -->
# Supabase — Bắt buộc đồng bộ tài liệu sau mỗi thao tác

**Mỗi khi thực hiện bất kỳ thao tác nào liên quan đến Supabase** (migration, thay đổi schema, tạo/xóa bảng, thêm/sửa column, tạo function/trigger/policy RLS, deploy edge function...), bắt buộc phải cập nhật tài liệu ngay sau khi thao tác hoàn tất.

## Tài liệu cần cập nhật

| Tài liệu | Cập nhật khi nào |
|---|---|
| `documents/schema.md` | Thêm/xóa/sửa bảng, column, index, constraint, enum |
| `documents/rls-policies.md` | Thêm/sửa/xóa RLS policy |
| `documents/edge-functions.md` | Deploy/sửa/xóa edge function |
| `documents/migrations.md` | Mỗi lần chạy migration mới |

> Nếu file tài liệu chưa tồn tại, tạo mới ngay khi cần.

## Quy tắc cứng — không được vi phạm

1. **Không được kết thúc task Supabase mà chưa cập nhật tài liệu** — cập nhật tài liệu là phần cuối bắt buộc của mọi task Supabase.
2. **Schema trong `documents/schema.md` phải phản ánh đúng trạng thái hiện tại** của database, không phải trạng thái dự định hay lịch sử.
3. **Dùng `list_tables` và `execute_sql` để lấy schema thực tế** từ Supabase nếu cần xác nhận trước khi ghi tài liệu — đừng ghi từ trí nhớ.
4. **Ghi rõ ngày cập nhật** ở đầu mỗi file tài liệu theo format `<!-- Last updated: YYYY-MM-DD -->`.
<!-- END:supabase-doc-sync-rules -->

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:design-system-rules -->
# Design System — MANDATORY for all UI work

Before writing any component, style, or CSS, read `design-system/tokens.md`.
The canonical CSS tokens live in `design-system/tokens.css`.

**Hard rules — never violate these:**

1. **Colors**: Only use tokens from `design-system/tokens.css`. Never use arbitrary hex/rgb values.
   - Backgrounds: `--bg-primary`, `--bg-secondary`, `--bg-card`
   - Brand: `--primary` (#5D7CFF), `--primary-light` (#8EA8FF)
   - Text: `--text` (#FFFFFF), `--text-secondary` (#B7C0D8)
   - Semantic: `--success` (#2ECC71), `--danger` (#E74C3C)

2. **Fonts**: Only three font families are allowed.
   - Logo / game title → `var(--font-logo)` → Anton
   - Headings (h1–h3) → `var(--font-heading)` → Sora
   - Body / UI text → `var(--font-body)` → Inter
   Never import or reference any other font.

3. **Dark-mode first**: This product has no light theme. Never add light-mode alternatives unless explicitly asked.

4. **No inline styles for design tokens**: Never write `style={{ color: "#5D7CFF" }}`. Always use the CSS custom property.

5. **Token file is source of truth**: If a color or font variable needs updating, update `design-system/tokens.css` — not scattered CSS files.

6. **Icons**: All icons must come from `lucide-react`. Never use other icon libraries, emoji, or inline SVGs as icons.
   - Import directly: `import { IconName } from "lucide-react"`
   - If no icon in lucide-react fits the use case, **do not pick the closest approximation silently** — list 2–3 candidate icon names with a short rationale and wait for the user to confirm before writing any code.
<!-- END:design-system-rules -->

<!-- BEGIN:responsive-ui-rules -->
# Responsive UI — Bắt buộc cho mọi thành phần giao diện

Mọi component, page, và layout đều phải hiển thị tốt trên cả **desktop** và **mobile**. Không có ngoại lệ.

## Breakpoint chuẩn

| Tên | Chiều rộng | Mô tả |
|---|---|---|
| mobile | < 768px | Smartphone dọc |
| tablet | 768px – 1023px | Tablet / smartphone ngang |
| desktop | ≥ 1024px | Laptop, màn hình lớn |

## Quy tắc cứng — không được vi phạm

1. **Mobile-first CSS**: Viết style mặc định cho mobile, dùng `min-width` media query để mở rộng lên tablet/desktop. Không viết theo hướng ngược lại.
2. **Không dùng giá trị px cố định cho width/height layout** — dùng `%`, `vw`, `rem`, `fr`, hoặc `clamp()` để layout co giãn tự nhiên.
3. **Touch target tối thiểu 44×44px** cho mọi button, link, icon có thể click trên mobile.
4. **Không overflow ngang** — tuyệt đối không để nội dung bị tràn ngang trên mobile. Luôn kiểm tra `overflow-x`.
5. **Font size tối thiểu 14px** trên mobile để đảm bảo dễ đọc.
6. **Navigation/menu trên mobile** phải được thiết kế riêng (hamburger, bottom bar, drawer...) — không thu nhỏ desktop nav thành mobile.
7. **Kiểm tra cả hai** trước khi báo hoàn thành: nếu có preview tool, chụp screenshot ở viewport 390px (mobile) và 1280px (desktop).
<!-- END:responsive-ui-rules -->
