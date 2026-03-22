# TC-Guard Design System

Visual design tokens and component patterns for TC-Guard's overlay, popup, and settings UI. All UI components must use these tokens via CSS custom properties.

## Design Philosophy

- **Polished and modern:** Subtle shadows, rounded corners, smooth transitions. Linear/Raycast aesthetic.
- **Unobtrusive:** The overlay should feel like a helpful assistant, not an intrusion on the page.
- **Accessible:** Semantic HTML, keyboard navigation, visible focus indicators. Color alone never conveys meaning.
- **Consistent:** Every component uses the same spacing, typography, and color tokens.

## Color Palette

### Light Theme

```css
:host, .tc-theme-light {
  --tc-bg: #ffffff;
  --tc-surface: #f8f9fa;
  --tc-text: #1a1a1a;
  --tc-text-secondary: #6b7280;
  --tc-text-tertiary: #9ca3af;
  --tc-border: #e5e7eb;
  --tc-border-strong: #d1d5db;
  --tc-accent: #2563eb;
  --tc-accent-hover: #1d4ed8;
  --tc-accent-text: #ffffff;
  --tc-focus-ring: rgba(37, 99, 235, 0.5);
  --tc-hover-bg: #f3f4f6;
  --tc-code-bg: #f1f5f9;
}
```

### Dark Theme

```css
.tc-theme-dark {
  --tc-bg: #1e1e2e;
  --tc-surface: #2a2a3c;
  --tc-text: #e0e0e0;
  --tc-text-secondary: #9ca3af;
  --tc-text-tertiary: #6b7280;
  --tc-border: #3a3a4a;
  --tc-border-strong: #4a4a5a;
  --tc-accent: #60a5fa;
  --tc-accent-hover: #93bbfd;
  --tc-accent-text: #1e1e2e;
  --tc-focus-ring: rgba(96, 165, 250, 0.5);
  --tc-hover-bg: #2f2f42;
  --tc-code-bg: #252538;
}
```

### Severity Colors (consistent across themes)

```css
:host {
  /* Low - Green */
  --tc-severity-low: #22c55e;
  --tc-severity-low-bg-light: #dcfce7;
  --tc-severity-low-bg-dark: #14532d;
  --tc-severity-low-text-light: #166534;
  --tc-severity-low-text-dark: #86efac;

  /* Medium - Yellow */
  --tc-severity-medium: #eab308;
  --tc-severity-medium-bg-light: #fef9c3;
  --tc-severity-medium-bg-dark: #713f12;
  --tc-severity-medium-text-light: #854d0e;
  --tc-severity-medium-text-dark: #fde68a;

  /* High - Orange */
  --tc-severity-high: #f97316;
  --tc-severity-high-bg-light: #ffedd5;
  --tc-severity-high-bg-dark: #7c2d12;
  --tc-severity-high-text-light: #9a3412;
  --tc-severity-high-text-dark: #fdba74;

  /* Critical - Red */
  --tc-severity-critical: #ef4444;
  --tc-severity-critical-bg-light: #fee2e2;
  --tc-severity-critical-bg-dark: #7f1d1d;
  --tc-severity-critical-text-light: #991b1b;
  --tc-severity-critical-text-dark: #fca5a5;
}
```

Use the theme-appropriate `-bg-light`/`-bg-dark` and `-text-light`/`-text-dark` variants depending on active theme.

## Typography

```css
:host {
  --tc-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;

  /* Font sizes */
  --tc-font-xs: 11px;    /* badge labels, metadata */
  --tc-font-sm: 13px;    /* secondary text, descriptions */
  --tc-font-base: 14px;  /* body text, key points */
  --tc-font-lg: 16px;    /* section headings */
  --tc-font-xl: 18px;    /* overlay/popup title */

  /* Line heights */
  --tc-leading-tight: 1.3;
  --tc-leading-normal: 1.5;
  --tc-leading-relaxed: 1.7;

  /* Font weights */
  --tc-font-normal: 400;
  --tc-font-medium: 500;
  --tc-font-semibold: 600;
}
```

## Spacing Scale

Base unit: 4px. All spacing is a multiple of 4.

```css
:host {
  --tc-space-0: 0;
  --tc-space-1: 4px;
  --tc-space-2: 8px;
  --tc-space-3: 12px;
  --tc-space-4: 16px;
  --tc-space-5: 20px;
  --tc-space-6: 24px;
  --tc-space-8: 32px;
  --tc-space-10: 40px;
  --tc-space-12: 48px;
}
```

## Border Radius

```css
:host {
  --tc-radius-sm: 4px;     /* badges, pills */
  --tc-radius-md: 8px;     /* cards, buttons */
  --tc-radius-lg: 12px;    /* overlay panel, popup */
  --tc-radius-full: 9999px; /* circular elements */
}
```

## Shadows

```css
:host {
  /* Light theme shadows */
  --tc-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --tc-shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
  --tc-shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);
}

.tc-theme-dark {
  --tc-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.2);
  --tc-shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -2px rgba(0, 0, 0, 0.25);
  --tc-shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -4px rgba(0, 0, 0, 0.25);
}
```

## Animations & Transitions

```css
:host {
  --tc-duration-fast: 150ms;
  --tc-duration-normal: 200ms;
  --tc-duration-slow: 300ms;
  --tc-ease-out: cubic-bezier(0.16, 1, 0.3, 1);
}
```

### Overlay slide-in

```css
@keyframes tc-slide-in {
  from {
    opacity: 0;
    transform: translateX(20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.tc-guard-overlay {
  animation: tc-slide-in var(--tc-duration-normal) var(--tc-ease-out);
}
```

### Overlay fade-out dismiss

```css
@keyframes tc-fade-out {
  from { opacity: 1; }
  to { opacity: 0; }
}

.tc-guard-overlay--dismissing {
  animation: tc-fade-out var(--tc-duration-fast) var(--tc-ease-out) forwards;
}
```

### Expandable card toggle

```css
.tc-guard-card-content {
  overflow: hidden;
  max-height: 0;
  transition: max-height var(--tc-duration-normal) var(--tc-ease-out);
}

.tc-guard-card-content--expanded {
  max-height: 300px; /* generous max, actual height determined by content */
}
```

### Button and interactive hover

```css
.tc-guard-btn {
  transition: background-color var(--tc-duration-fast), box-shadow var(--tc-duration-fast);
}

.tc-guard-btn:hover {
  background-color: var(--tc-accent-hover);
}

.tc-guard-btn:focus-visible {
  box-shadow: 0 0 0 3px var(--tc-focus-ring);
  outline: none;
}
```

### Trigger icon hover

```css
.tc-guard-trigger {
  transition: transform var(--tc-duration-fast), box-shadow var(--tc-duration-fast);
}

.tc-guard-trigger:hover {
  transform: scale(1.1);
  box-shadow: var(--tc-shadow-md);
}
```

## Component Patterns

### Overlay Panel (Task 32)

```
+--[Overlay Panel, max 380x500px]--------+
|                                         |
|  [severity dot] TC Guard           [X]  |  <- Header row
|                                         |
|-----------------------------------------|
|                                         |
|  Summary paragraph text here that       |  <- Summary section
|  explains what the user is agreeing to  |
|  in plain English.                      |
|                                         |
|-----------------------------------------|
|                                         |
|  Key Points                             |  <- Key points heading
|  * First key point                      |
|  * Second key point                     |
|  * Third key point                      |
|                                         |
|-----------------------------------------|
|                                         |
|  Red Flags (3)                          |  <- Red flags heading
|                                         |
|  +------------------------------------+ |
|  | [!] Data Selling            [HIGH] | |  <- Collapsed card
|  +------------------------------------+ |
|                                         |
|  +------------------------------------+ |
|  | [!] Arbitration Clause       [MED] | |  <- Expanded card
|  |                                    | |
|  | You waive your right to a jury     | |
|  | trial and must resolve disputes    | |
|  | through private arbitration.       | |
|  |                                    | |
|  | > "All disputes shall be resolved  | |  <- Blockquote
|  |    through binding arbitration..." | |
|  +------------------------------------+ |
|                                         |
|-----------------------------------------|
|                                         |
|  [View Full Summary]  [Version History] |  <- Footer links
|                                         |
+-----------------------------------------+
```

- `position: fixed`
- `z-index: 2147483647`
- Shadow DOM: `mode: 'closed'`
- `:host { all: initial }` to prevent host page style leakage
- Content area: `overflow-y: auto` for scroll
- Border: `1px solid var(--tc-border)`
- Background: `var(--tc-bg)`
- Border-radius: `var(--tc-radius-lg)`
- Shadow: `var(--tc-shadow-lg)`
- Padding: `var(--tc-space-4)` (16px)

### Severity Badge

```
  [*] Critical       <- dot (8px circle) + label text
```

- Dot: `width: 8px; height: 8px; border-radius: var(--tc-radius-full)`
- Dot color: `var(--tc-severity-{level})`
- Label: `var(--tc-font-xs)`, `var(--tc-font-semibold)`, uppercase
- Badge container background: severity bg color for current theme
- Badge container text: severity text color for current theme
- Padding: `var(--tc-space-1) var(--tc-space-2)`
- Border-radius: `var(--tc-radius-full)`

### Red Flag Card (Expandable)

**Collapsed state:**

```
+----------------------------------------------+
| [!]  Category Name               [SEVERITY]  |
+----------------------------------------------+
```

**Expanded state:**

```
+----------------------------------------------+
| [!]  Category Name               [SEVERITY]  |
|                                               |
|  Description paragraph explaining the         |
|  concern in plain English.                    |
|                                               |
|  > "Exact verbatim quote from the T&C text   |
|     that triggered this red flag."            |
+----------------------------------------------+
```

- Left border: `3px solid var(--tc-severity-{level})`
- Background: `var(--tc-surface)`
- Border-radius: `var(--tc-radius-md)`
- Padding: `var(--tc-space-3)`
- Click or Enter/Space to toggle
- `aria-expanded="true|false"` attribute
- Blockquote: `border-left: 2px solid var(--tc-text-tertiary); padding-left: var(--tc-space-3); color: var(--tc-text-secondary); font-style: italic`

### Trigger Icon (After Overlay Dismiss)

```
  [ shield ]    <- 24x24px, severity-colored border
```

- Size: `24px x 24px`
- Border: `2px solid var(--tc-severity-{level})`
- Border-radius: `var(--tc-radius-sm)`
- Background: `var(--tc-bg)`
- `cursor: pointer`
- `role="button"`, `tabindex="0"`, `aria-label` via i18n
- Hover: `transform: scale(1.1); box-shadow: var(--tc-shadow-md)`
- Focus: `box-shadow: 0 0 0 3px var(--tc-focus-ring)`

### Popup Layout (Task 36)

```
+--[Popup, 400px wide, max 600px tall]---+
|                                         |
|  [logo] TC Guard       example.com      |  <- Header
|                                         |
|-----------------------------------------|
|                                         |
|  [severity badge]                       |
|                                         |
|  Summary text explaining what the       |
|  terms say in plain English...          |
|                                         |
|  3 Key Points  |  2 Red Flags           |  <- Stats
|                                         |
|-----------------------------------------|
|                                         |
|  [Expandable red flag cards]            |
|                                         |
|-----------------------------------------|
|                                         |
|  [Analyze Page] [Settings] [History]    |  <- Footer nav
|                                         |
+-----------------------------------------+
```

- Width: `400px`
- Max height: `600px`
- Padding: `var(--tc-space-4)`
- Background: `var(--tc-bg)`
- Font: `var(--tc-font-family)`, `var(--tc-font-base)`

### Empty State (No T&C Detected)

```
+-----------------------------------------+
|                                         |
|  [logo] TC Guard       example.com      |
|                                         |
|-----------------------------------------|
|                                         |
|         [shield icon, large]            |
|                                         |
|   No T&C detected on this page          |
|                                         |
|      [Analyze This Page]                |
|                                         |
+-----------------------------------------+
```

### Settings Panel (Task 38)

```
+-----------------------------------------+
|  Settings                          [<]  |
|-----------------------------------------|
|                                         |
| [Providers] [Detection] [Cache] [Notif] |  <- Tab bar
|                                         |
|-----------------------------------------|
|                                         |
| Active Provider:                        |
|   ( ) OpenAI                            |
|   (*) Claude                            |
|   ( ) Gemini                            |
|   ( ) Ollama                            |
|   ( ) Custom                            |
|                                         |
|-----------------------------------------|
|                                         |
| Claude Configuration                    |
|                                         |
| API Key                                 |
| [*************xxxx] [Show] [Test]       |
|                                         |
| Model                                   |
| [claude-sonnet-4-20250514     v]        |
|                                         |
+-----------------------------------------+
```

- Tab bar: horizontal, `border-bottom: 2px solid var(--tc-border)`. Active tab: `border-bottom-color: var(--tc-accent)`
- Form inputs: `border: 1px solid var(--tc-border); border-radius: var(--tc-radius-md); padding: var(--tc-space-2) var(--tc-space-3)`
- Input focus: `border-color: var(--tc-accent); box-shadow: 0 0 0 3px var(--tc-focus-ring)`
- Buttons: `background: var(--tc-accent); color: var(--tc-accent-text); border-radius: var(--tc-radius-md); padding: var(--tc-space-2) var(--tc-space-4)`

### Version Timeline (Task 30)

```
+---------------------------------------------+
| Version History — example.com               |
|---------------------------------------------|
|                                             |
| v3  Mar 15, 2026  [CRITICAL]  (latest)     |
|  |                                          |
|  | +2 red flags, severity: high -> critical |
|  |                                          |
| v2  Jan 8, 2026   [HIGH]                   |
|  |                                          |
|  | +1 red flag, -1 key point               |
|  |                                          |
| v1  Nov 20, 2025  [MEDIUM]                 |
|     First recorded version                  |
|                                             |
+---------------------------------------------+
```

- Timeline line: `2px solid var(--tc-border)`, vertical
- Version nodes: `12px` circles on the timeline line
- Node color: severity color for that version
- Annotations: `var(--tc-font-sm)`, `var(--tc-text-secondary)`
- Clickable nodes: `cursor: pointer`, show full summary on click

## Accessibility Patterns

### Focus indicator

```css
*:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--tc-focus-ring);
}
```

Never use `outline: none` without a replacement focus indicator.

### Keyboard navigation

- Tab through all interactive elements in overlay and popup.
- Enter and Space activate buttons and toggles.
- Escape closes the overlay.
- Arrow keys navigate within radio groups and tab bars.

### ARIA attributes

- Overlay: `role="complementary"` or `role="region"`, `aria-label="TC Guard summary"`
- Close button: `aria-label="Close"` (via i18n)
- Expandable cards: `aria-expanded="true|false"`
- Severity badge: text label alongside colored dot (color alone never conveys meaning)
- Tab panels: `role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-selected`

### Minimum interactive target

All clickable elements: minimum `32px x 32px` touch target.
