# Nemon Interface Design Standards & Aesthetic Governance

You are operating on the frontend and design system of Nemon. The user interface must be world-class, functionally immaculate, and aesthetically cohesive with a high-density, professional developer workbench standard (inspired by Linear, Cursor, Raycast, and Google AI Studio).

# 1. Aesthetic Identity & Design Hierarchy
1. Visual DNA: Minimalist, obsidian/charcoal dark-first interface, high information density, micro-typography, crisp hairline borders, and subtle glassmorphic translucency.
2. Tone: Engineering-first, precision-machined, clean, and silent. Never playful, loud, cartoonish, or gimmick-ridden.
3. Hierarchy of Styling Authority:
   1. System CSS Variables (`var(--bg-main)`, `var(--border-light)`, `var(--text-primary)`, etc.) are canonical.
   2. Reduced border-radius geometry (`--radius-sm` to `--radius-2xl`: 2px to 8px).
   3. Monochrome & neutral dominance with strict, purposeful semantic accents (emerald for active/healthy, red for error/critical, zinc for neutral).
   4. Brand Accent: White primary arc with vibrant orange `#FF5500` detached slice (`--nemon-logo-accent`).

# 2. Strict Prohibitions & Anti-Patterns (The "Anti-AI" Rules)
- NEVER use generic AI sparkles (`✨`, `Sparkles`, `Wand2`, star clusters) on actions, buttons, chips, or inputs. Tools and actions are technical and engineering-driven, not magic tricks. Use functional, context-specific icons (`Wrench`, `Terminal`, `Sliders`, `Code2`, `Cpu`, `Send`).
- NEVER introduce rogue out-of-palette neon or amber colors (e.g. `bg-amber-500/15`, `border-amber-500/35`, `text-amber-300`, `text-yellow-400`, neon purple/cyan glows) that clash with the dark monochromatic theme.
- NEVER use cartoonish, bubbly pill buttons (`rounded-full`) for standard action toggles or controls. `rounded-full` is strictly reserved for circular icon-only buttons or segmented container tracks.
- NEVER add unsolicited emojis (`✨`, `🚀`, `🔥`, `⚡`, `🤖`) to labels, buttons, or technical logs.
- NEVER use intense, oversized diffuse drop shadows or colored neon glow filters (`shadow-[0_0_20px_...]`). Shadows must be deep, neutral, and ambient.
- NEVER break the application theme variables by hardcoding ad-hoc arbitrary Tailwind colors (`bg-[#...]`) unless anchoring the deepest system root container.

# 3. Color Tokens & Theme System
- All background, surface, border, and text values MUST map to active CSS theme variables:
  - Surfaces: `--bg-main`, `--bg-sidebar`, `--bg-modal`, `--bg-chat-hover`, `--bg-chat-active`, `--bg-nav-active`.
  - Borders: `--border-light` (subtle separators, 1px hairline), `--border-main` (interactive boundaries, hover states).
  - Typography: `--text-bold` (headings and active items), `--text-primary` (body and primary content), `--text-secondary` (labels, inactive states, metadata), `--text-placeholder` (hints and disabled text).
  - Accent: `--accent`, `--accent-hover`, `--accent-text`, `--accent-bg`.
- Dark Mode is the primary design canvas. All components must look pristine, low-contrast, and glare-free in dark mode before any other theme.

# 4. Form Controls, Toggles & Switches
- Toggles and switches must be native micro-switches:
  - Outer track: compact (`w-6 h-3.5` or `w-7 h-4`), `rounded-full`, subtle background (`bg-zinc-700/60` inactive, `bg-emerald-500/80` or `bg-zinc-200` active).
  - Sliding thumb: pure white circular knob (`w-2.5 h-2.5 bg-white rounded-full shadow-xs`), transitioning smoothly via `translate-x`.
  - Container: unified with surrounding toolbars (`bg-(--bg-main) border border-(--border-light) hover:border-(--border-main)`), `rounded-lg`.
  - Label: concise, technical, professional (e.g., `Auto-fix`), never shouting "ON" or "OFF" in neon badges.

# 5. Iconography & Brand Integrity
- The Nemon logo (`<NemonIcon>`) is the exclusive mark of Nemon intelligence:
  - Geometry: 270° white main arc + 90° detached `#FF5500` orange slice.
  - When loading or generating, use `<NemonIcon animated size={...} />`.
- Functional Lucide Icons:
  - Debugging and Fixing: `Wrench`, `Bug`, `Code2`.
  - Navigation & Controls: `ArrowLeft`, `ChevronDown`, `RotateCw`, `Search`, `Menu`.
  - Content & Actions: `Send`, `Terminal`, `FileCode`, `Trash2`, `Copy`, `ExternalLink`.
- Always size icons to fit micro-typography: `w-3 h-3` for inline chips, `w-3.5 h-3.5` for standard button controls, `w-4 h-4` for primary navigation.

# 6. Typography & Spatial Density
- Typography scale:
  - Micro: `text-[10px]` and `text-[11px] font-medium` for badges, timestamps, and tooltips.
  - Controls: `text-xs` (12px) for buttons, tabs, inputs, and code explorer items.
  - Primary: `text-sm` (14px) for conversation text, markdown content, and editor lines.
- High Density Layout:
  - Headers and subheaders must be compact (`h-10` to `h-12`).
  - Dividers must be 1px hairlines using `border-(--border-light)`.
  - Avoid bloated margins and empty padding; preserve maximum screen real estate for user code and content.

# 7. Semantic States & Feedback
- Success / Running: Subtle emerald tint (`text-emerald-400`, `bg-emerald-500/10`, `border-emerald-500/20`), accompanied by micro pulse dot (`w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse`).
- Errors / Failures: Restrained red tint (`text-red-400`, `bg-red-500/10`, `border-red-500/25`), technical description, never loud or panic-inducing.
- Warnings: Muted amber/zinc tint (`text-amber-400`, `bg-amber-500/10`), reserved strictly for compiler warnings or rate limits.
- Idle / Disabled: `opacity-40` or `text-(--text-placeholder) cursor-not-allowed`.
