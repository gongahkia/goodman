# DESIGN_SYSTEM.md — Conquest Visual Design System

## Design Philosophy

Conquest uses a **glassmorphism dark** theme: semi-transparent dark panels with backdrop blur, crisp typography, and vibrant accent colors. The visual language communicates precision and confidence. Every surface feels like it floats above a dark void, with frosted-glass depth cues.

## Color Palette

### Backgrounds

| Token                    | Value                        | Usage                                    |
|--------------------------|------------------------------|------------------------------------------|
| `--cq-bg-primary`       | `#0a0a1a`                    | Extension page backgrounds (popup, options) |
| `--cq-bg-secondary`     | `#0f0f2a`                    | Card/section backgrounds on extension pages |
| `--cq-bg-tertiary`      | `#161632`                    | Input field backgrounds, subtle layering |
| `--cq-glass-bg`         | `rgba(15, 15, 35, 0.75)`    | Glassmorphism panels (overlay, popup cards) |
| `--cq-glass-bg-heavy`   | `rgba(15, 15, 35, 0.88)`    | Heavier glass for high-contrast needs    |
| `--cq-glass-bg-light`   | `rgba(15, 15, 35, 0.55)`    | Lighter glass for tooltips, hover states |

### Text

| Token                    | Value                        | Usage                                    |
|--------------------------|------------------------------|------------------------------------------|
| `--cq-text-primary`     | `#e8e8f0`                    | Primary body text, headings              |
| `--cq-text-secondary`   | `#a0a0b8`                    | Secondary labels, descriptions           |
| `--cq-text-muted`       | `#6b6b80`                    | Placeholder text, disabled states        |
| `--cq-text-inverse`     | `#0a0a1a`                    | Text on bright accent backgrounds        |

### Accent Colors

| Token                    | Value                        | Usage                                    |
|--------------------------|------------------------------|------------------------------------------|
| `--cq-accent`           | `#6c5ce7`                    | Primary interactive elements (buttons, links, focus rings) |
| `--cq-accent-hover`     | `#7c6cf7`                    | Hover state for accent elements          |
| `--cq-accent-active`    | `#5a4bd6`                    | Active/pressed state                     |
| `--cq-accent-subtle`    | `rgba(108, 92, 231, 0.15)`  | Accent-tinted backgrounds (selected items) |

### Confidence Indicators

| Token                    | Value                        | Usage                                    |
|--------------------------|------------------------------|------------------------------------------|
| `--cq-confidence-high`  | `#00d4aa`                    | Confidence > 0.8 (green/teal)            |
| `--cq-confidence-med`   | `#f0c040`                    | Confidence 0.5 - 0.8 (amber)            |
| `--cq-confidence-low`   | `#e04060`                    | Confidence < 0.5 (red/rose)             |

### Status Colors

| Token                    | Value                        | Usage                                    |
|--------------------------|------------------------------|------------------------------------------|
| `--cq-status-success`   | `#00d4aa`                    | Connected, healthy, success states       |
| `--cq-status-warning`   | `#f0c040`                    | Degraded, slow response warnings         |
| `--cq-status-error`     | `#e04060`                    | Disconnected, errors, failures           |
| `--cq-status-info`      | `#4ea8f0`                    | Informational messages                   |

### Borders

| Token                    | Value                        | Usage                                    |
|--------------------------|------------------------------|------------------------------------------|
| `--cq-border-glass`     | `rgba(255, 255, 255, 0.08)` | Glass panel borders                      |
| `--cq-border-subtle`    | `rgba(255, 255, 255, 0.05)` | Dividers, separators                     |
| `--cq-border-focus`     | `rgba(108, 92, 231, 0.6)`   | Focus ring borders (accent-derived)      |

## Typography

### Font Stack

```css
--cq-font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
--cq-font-mono: 'JetBrains Mono', 'Fira Code', 'SF Mono', 'Cascadia Code', monospace;
```

The extension does not bundle fonts. It relies on the system font stack. Inter or system-ui will be used depending on what the user has installed. Monospace is used for the reasoning text and JSON displays.

### Type Scale

| Token                    | Size    | Weight | Line Height | Usage                        |
|--------------------------|---------|--------|-------------|------------------------------|
| `--cq-text-xs`          | 0.6875rem (11px) | 400 | 1.4 | Badges, timestamps, metadata |
| `--cq-text-sm`          | 0.75rem (12px) | 400 | 1.5 | Secondary labels, captions   |
| `--cq-text-base`        | 0.8125rem (13px) | 400 | 1.5 | Body text in popup/options   |
| `--cq-text-md`          | 0.875rem (14px) | 500 | 1.4 | Overlay body text, inputs    |
| `--cq-text-lg`          | 1.125rem (18px) | 600 | 1.3 | Overlay answer text          |
| `--cq-text-xl`          | 1.375rem (22px) | 700 | 1.2 | Section headings             |
| `--cq-text-2xl`         | 1.625rem (26px) | 700 | 1.15 | Page titles (options page)   |

### Font Weights

```css
--cq-weight-regular: 400;
--cq-weight-medium: 500;
--cq-weight-semibold: 600;
--cq-weight-bold: 700;
```

## Glassmorphism Properties

### Glass Panel (standard)

```css
.cq-glass {
  background: var(--cq-glass-bg);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--cq-border-glass);
  border-radius: 12px;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
}
```

### Glass Panel (elevated — overlay, modal dialogs)

```css
.cq-glass--elevated {
  background: var(--cq-glass-bg-heavy);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid var(--cq-border-glass);
  border-radius: 14px;
  box-shadow:
    0 12px 48px rgba(0, 0, 0, 0.5),
    0 2px 8px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
}
```

### Glass Panel (subtle — tooltips, dropdowns)

```css
.cq-glass--subtle {
  background: var(--cq-glass-bg-light);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--cq-border-subtle);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}
```

## Spacing System

Based on a 4px grid:

| Token              | Value | Usage                                      |
|--------------------|-------|--------------------------------------------|
| `--cq-space-1`    | 4px   | Tight internal padding (badge padding)     |
| `--cq-space-2`    | 8px   | Small gaps, icon margins                   |
| `--cq-space-3`    | 12px  | Standard inner padding                     |
| `--cq-space-4`    | 16px  | Section padding, standard gap              |
| `--cq-space-5`    | 20px  | Card padding                               |
| `--cq-space-6`    | 24px  | Large section margins                      |
| `--cq-space-8`    | 32px  | Page-level padding                         |
| `--cq-space-10`   | 40px  | Large separations                          |
| `--cq-space-12`   | 48px  | Major section breaks                       |

## Border Radius

| Token                    | Value | Usage                        |
|--------------------------|-------|------------------------------|
| `--cq-radius-sm`        | 6px   | Buttons, inputs, badges      |
| `--cq-radius-md`        | 10px  | Cards, dropdowns             |
| `--cq-radius-lg`        | 14px  | Overlay panel, modals        |
| `--cq-radius-xl`        | 20px  | Full-radius pills            |
| `--cq-radius-full`      | 9999px | Circular elements (dots)    |

## Animation and Transitions

### Standard Transitions

```css
--cq-transition-fast: 120ms ease-out;   /* hover, focus, toggles */
--cq-transition-base: 200ms ease-out;   /* panel show/hide, expanding */
--cq-transition-slow: 350ms ease-out;   /* overlay fade in/out */
```

### Overlay Fade In

```css
@keyframes cq-fade-in {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.cq-overlay--entering {
  animation: cq-fade-in var(--cq-transition-slow) forwards;
}
```

### Overlay Fade Out

```css
@keyframes cq-fade-out {
  from {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  to {
    opacity: 0;
    transform: translateY(8px) scale(0.98);
  }
}

.cq-overlay--exiting {
  animation: cq-fade-out var(--cq-transition-slow) forwards;
}
```

### Confidence Bar Fill

```css
@keyframes cq-bar-fill {
  from { width: 0%; }
  to { width: var(--cq-bar-width); }
}

.cq-overlay__confidence-fill {
  animation: cq-bar-fill 600ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
}
```

### Pulse (loading state)

```css
@keyframes cq-pulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

.cq-overlay--loading .cq-overlay__status-dot {
  animation: cq-pulse 1.5s ease-in-out infinite;
}
```

### Drag Feedback

When the overlay is being dragged, apply a subtle scale and shadow increase:

```css
.cq-overlay.is-dragging {
  transform: scale(1.01);
  box-shadow:
    0 16px 64px rgba(0, 0, 0, 0.6),
    0 4px 12px rgba(0, 0, 0, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
  transition: box-shadow var(--cq-transition-fast);
  cursor: grabbing;
}
```

## Component Specifications

### Overlay Panel

The floating answer overlay injected into host pages via Shadow DOM.

```
+-------------------------------------------+
|  [drag handle ============]          [x]  |  <- header, draggable
|                                           |
|  +---------+                              |
|  | MC quiz |  <- question type badge      |
|  +---------+                              |
|                                           |
|  Answer B: Mitochondria                   |  <- answer text, large
|                                           |
|  ██████████████░░░░░░  87%               |  <- confidence bar + %
|                                           |
|  > Reasoning                              |  <- collapsible, closed by default
|    The mitochondria is the powerhouse     |
|    of the cell, making B correct...       |
|                                           |
|  +--------+                               |
|  |wooclap |  <- platform badge (subtle)   |
|  +--------+                               |
+-------------------------------------------+
```

**Dimensions and positioning:**
- Width: 340px (fixed)
- Max height: 400px (scrollable beyond that)
- Default position: 20px from top-right corner of viewport
- Min distance from viewport edge: 8px when dragged

**Specific styles:**

```css
.cq-overlay {
  position: fixed;
  top: 20px;
  right: 20px;
  width: 340px;
  max-height: 400px;
  overflow-y: auto;
  z-index: 2147483647;  /* max z-index to stay above everything */
  padding: var(--cq-space-5);
  font-family: var(--cq-font-sans);
  color: var(--cq-text-primary);
  /* glass properties from .cq-glass--elevated */
}
```

**Header bar:**
- Height: 32px
- Drag handle: 40px wide centered bar, 4px tall, rounded, `rgba(255,255,255,0.2)`, cursor: `grab`
- Close button: 24x24px, top-right, `rgba(255,255,255,0.4)` cross icon, hover brightens to `rgba(255,255,255,0.8)`

**Question type badge:**
- Background: `var(--cq-accent-subtle)`
- Text color: `var(--cq-accent)`
- Font: `var(--cq-text-xs)`, `var(--cq-weight-semibold)`, uppercase, letter-spacing 0.5px
- Padding: 2px 8px
- Border-radius: `var(--cq-radius-sm)`

**Answer text:**
- Font: `var(--cq-text-lg)`, `var(--cq-weight-semibold)`
- Color: `var(--cq-text-primary)`
- Margin: `var(--cq-space-3)` top and bottom

**Confidence bar:**
- Container: full width, height 6px, background `rgba(255,255,255,0.08)`, border-radius 3px
- Fill: height 6px, border-radius 3px, animated width
- Color: `--cq-confidence-high` / `--cq-confidence-med` / `--cq-confidence-low` based on value
- Percentage label: right-aligned, `var(--cq-text-sm)`, `var(--cq-weight-medium)`, same color as bar

**Reasoning section:**
- Collapsed by default, toggleable with a `>` / `v` chevron
- Font: `var(--cq-text-sm)`, `var(--cq-font-mono)`
- Color: `var(--cq-text-secondary)`
- Top border when expanded: `1px solid var(--cq-border-subtle)`
- Max height when expanded: 150px, overflow-y auto
- Transition: max-height `var(--cq-transition-base)`

**Platform badge:**
- Bottom of card, subtle
- Background: `rgba(255,255,255,0.05)`
- Text: `var(--cq-text-xs)`, `var(--cq-text-muted)`
- Padding: 2px 6px
- Border-radius: `var(--cq-radius-sm)`

### Popup (400 x 520px)

The extension popup opened from the toolbar icon.

```
+-------------------------------------------+
|                                           |
|  * Conquest                  [gear]       |  <- header with logo + settings gear
|                                           |
|  +---------------------------------------+|
|  |  Provider: Ollama  * connected        ||  <- status card
|  |  Model: qwen2.5-vl                   ||
|  |  Endpoint: localhost:11434            ||
|  +---------------------------------------+|
|                                           |
|  +---------------------------------------+|
|  |  Last Answer                          ||  <- answer card
|  |  +-----------+                        ||
|  |  | MC quiz   |                        ||
|  |  +-----------+                        ||
|  |  Answer B: Mitochondria               ||
|  |  ██████████████░░░░  87%              ||
|  |  > Reasoning                          ||
|  +---------------------------------------+|
|                                           |
|  +------------------+ +------------------+|
|  |  Full Page       | |  Region          ||  <- action buttons
|  +------------------+ +------------------+|
|                                           |
|  +---------------------------------------+|
|  |  Session Log (3)              [>]     ||  <- log toggle
|  +---------------------------------------+|
|                                           |
+-------------------------------------------+
```

**Dimensions:**
- Width: 400px (set in popup.html body)
- Height: auto, max 520px, overflow-y auto
- Background: `var(--cq-bg-primary)`
- Padding: `var(--cq-space-5)`

**Header:**
- Logo: CSS-rendered diamond shape (rotated square), `var(--cq-accent)` fill, 12x12px
- Title "Conquest": `var(--cq-text-xl)`, `var(--cq-weight-bold)`, `var(--cq-text-primary)`
- Settings gear: 20x20px icon button, `var(--cq-text-muted)`, hover `var(--cq-text-secondary)`
- Flex row, space-between alignment

**Status card:**
- Glass panel (standard `.cq-glass`)
- Provider name: `var(--cq-text-base)`, `var(--cq-weight-medium)`
- Status dot: 8px circle, `var(--cq-status-success)` or `var(--cq-status-error)`, with subtle glow (`box-shadow: 0 0 6px`)
- Model/endpoint: `var(--cq-text-sm)`, `var(--cq-text-secondary)`

**Answer card:**
- Glass panel
- Layout mirrors the overlay panel (badge, answer, confidence, reasoning)
- Uses same component styles as overlay

**Action buttons:**
- Two buttons side by side, flex row, gap `var(--cq-space-3)`
- Each: flex-1, height 40px
- Background: `var(--cq-accent)`
- Text: `var(--cq-text-inverse)`, `var(--cq-text-sm)`, `var(--cq-weight-semibold)`
- Border-radius: `var(--cq-radius-sm)`
- Hover: `var(--cq-accent-hover)`
- Active: `var(--cq-accent-active)`
- Transition: background `var(--cq-transition-fast)`

**Session log toggle:**
- Glass panel, clickable
- Shows count badge: circle, `var(--cq-accent)` background, `var(--cq-text-inverse)` text, `var(--cq-text-xs)`
- Chevron indicates expand/collapse

### Options Page

Full-page settings in a new tab.

**Layout:**
- Max-width: 640px, centered
- Background: `var(--cq-bg-primary)`, full viewport height
- Padding: `var(--cq-space-8)` horizontal, `var(--cq-space-10)` vertical

**Sections:**
Each section (Provider, Capture, Shortcuts, Model Recommendations) is a glass card with:
- Section title: `var(--cq-text-xl)`, `var(--cq-weight-bold)`, margin-bottom `var(--cq-space-4)`
- Glass panel background
- Internal spacing: `var(--cq-space-4)` between fields

**Form inputs:**
```css
.cq-input {
  width: 100%;
  height: 40px;
  padding: 0 var(--cq-space-3);
  background: var(--cq-bg-tertiary);
  border: 1px solid var(--cq-border-glass);
  border-radius: var(--cq-radius-sm);
  color: var(--cq-text-primary);
  font-family: var(--cq-font-sans);
  font-size: var(--cq-text-base);
  transition: border-color var(--cq-transition-fast);
}

.cq-input:focus {
  outline: none;
  border-color: var(--cq-border-focus);
  box-shadow: 0 0 0 3px var(--cq-accent-subtle);
}

.cq-input::placeholder {
  color: var(--cq-text-muted);
}
```

**Select dropdowns:**
Same as `.cq-input` with custom arrow indicator. Use `appearance: none` and a CSS chevron via background-image SVG.

**Toggle switches:**
- Track: 36px x 20px, border-radius 10px
- Off: background `rgba(255,255,255,0.1)`, knob left
- On: background `var(--cq-accent)`, knob right
- Knob: 16px circle, white, subtle shadow
- Transition: `var(--cq-transition-fast)`

**Test Connection button:**
- Secondary style: transparent background, `var(--cq-accent)` border and text
- On success: border and text turn `var(--cq-status-success)`, show checkmark
- On failure: border and text turn `var(--cq-status-error)`, show error message inline below

**Model recommendation cards:**
- Three cards in a row (flexbox, wrapping on small widths)
- Each card: glass-subtle panel
- Tier label at top: "High Accuracy" / "Balanced" / "Lightweight"
- Model name: `var(--cq-text-md)`, `var(--cq-weight-semibold)`
- VRAM requirement: `var(--cq-text-sm)`, `var(--cq-text-secondary)`
- "Already installed" badge: `var(--cq-status-success)` tinted background
- "Pull Model" button: small, secondary style. Shows progress bar during download.

### Badges

```css
.cq-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  font-size: var(--cq-text-xs);
  font-weight: var(--cq-weight-semibold);
  line-height: 1.4;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  border-radius: var(--cq-radius-sm);
}

.cq-badge--accent {
  background: var(--cq-accent-subtle);
  color: var(--cq-accent);
}

.cq-badge--success {
  background: rgba(0, 212, 170, 0.12);
  color: var(--cq-confidence-high);
}

.cq-badge--warning {
  background: rgba(240, 192, 64, 0.12);
  color: var(--cq-confidence-med);
}

.cq-badge--error {
  background: rgba(224, 64, 96, 0.12);
  color: var(--cq-confidence-low);
}
```

### Error Banner (Popup)

Appears at top of popup on error, auto-dismisses after 5 seconds.

```css
.cq-error-banner {
  padding: var(--cq-space-3) var(--cq-space-4);
  background: rgba(224, 64, 96, 0.15);
  border: 1px solid rgba(224, 64, 96, 0.3);
  border-radius: var(--cq-radius-sm);
  color: var(--cq-confidence-low);
  font-size: var(--cq-text-sm);
  font-family: var(--cq-font-mono);
  animation: cq-fade-in var(--cq-transition-base) forwards;
}

.cq-error-banner--dismissing {
  animation: cq-fade-out var(--cq-transition-base) forwards;
}
```

### Scrollbar (inside Shadow DOM and extension pages)

```css
::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.12);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}
```

## Icon Design

The extension icon is a stylized shield or diamond shape with a subtle gradient from `--cq-accent` (#6c5ce7) to a lighter purple (#9b8cf7). The shape is clean and geometric, rendering legibly at 16x16px.

- `icon-16.png`: 16x16, toolbar size. Simplified shape, no fine detail.
- `icon-48.png`: 48x48, extension management page.
- `icon-128.png`: 128x128, Chrome Web Store listing. Full detail with subtle inner gradient.

All icons use transparent backgrounds.

## Accessibility Notes

- All interactive elements must have visible focus indicators (`var(--cq-border-focus)` ring)
- Confidence colors are supplemented with percentage text (do not rely on color alone)
- Minimum touch/click target: 32x32px
- The overlay close button must be reachable by Escape key (not just click)
- Text contrast ratios: primary text on glass panels must meet WCAG AA (4.5:1 minimum). `#e8e8f0` on `rgba(15,15,35,0.88)` computes to approximately 12:1 against the effective background.
