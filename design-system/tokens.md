# Board Game — Design System

## Typography

| Role    | Font family | Usage                          |
| ------- | ----------- | ------------------------------ |
| Logo    | **Anton**   | Brand logo, game title         |
| Heading | **Sora**    | Page headings, section titles  |
| Content | **Inter**   | Body text, UI labels, captions |

## Color Tokens

### Backgrounds

| Token           | Value     | Usage                             |
| --------------- | --------- | --------------------------------- |
| `--bg-primary`  | `#0D1324` | Main page background              |
| `--bg-secondary`| `#1B2440` | Sidebar, panels, alternate areas  |
| `--bg-card`     | `#202B4A` | Cards, modals, surface elements   |

### Brand / Interactive

| Token            | Value     | Usage                            |
| ---------------- | --------- | -------------------------------- |
| `--primary`      | `#5D7CFF` | Buttons, links, active states    |
| `--primary-light`| `#8EA8FF` | Hover states, highlights         |

### Text

| Token             | Value     | Usage                            |
| ----------------- | --------- | -------------------------------- |
| `--text`          | `#FFFFFF` | Primary body text                |
| `--text-secondary`| `#B7C0D8` | Subtext, placeholders, metadata  |

### Semantic

| Token       | Value     | Usage                          |
| ----------- | --------- | ------------------------------ |
| `--success` | `#2ECC71` | Score gain, win state, confirm |
| `--danger`  | `#E74C3C` | Error, lose state, destructive |

### Shadows

| Token           | Value     | Usage                         |
| ----------------| --------- | ----------------------------- |
| `--shadow-card` | `#151c31` | View box and panel shadow     |

## Icons

All icons must come from **`lucide-react`**.

```tsx
import { Sword, Trophy, Users } from "lucide-react"
```

- Never use other icon libraries, emoji as icons, or raw `<svg>` markup for icons.
- Browse available icons at [lucide.dev/icons](https://lucide.dev/icons).
- If no icon in lucide-react clearly fits a use case, propose 2–3 candidates with a short rationale and **wait for confirmation** before writing code.

## Rules

- **Never** use arbitrary color values — always reference a token.
- **Never** use fonts outside Anton / Sora / Inter.
- Apply Anton only to the logo/game title. Use Sora for all other headings (`h1`–`h3`). Use Inter everywhere else.
- Dark backgrounds only — this is a dark-mode-first product; do not add light theme variants unless explicitly requested.
- Minimum contrast ratio 4.5:1 between `--text` / `--text-secondary` and their background.
