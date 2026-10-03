# WALLEX web — design system

The web app's look is defined in one place and used everywhere: **design tokens** (CSS custom
properties) plus a small set of shared components. This document explains the ideas behind them and
how to extend them. Scope: the React app in `web/`; the Expo app in `mobile/` implements the same
system in React Native (see [Mobile](#mobile-mobile) at the end).

## Design direction — "Sage & Linen"

WALLEX should feel like a calm ledger, not a dashboard template:

- **Warm neutrals instead of white and black.** Pages are linen (`#f4f2ea`), cards a soft off-white;
  the dark theme is deep graphite with a faint green cast. Pure `#fff` / `#000` are never used as a
  background (a test enforces this).
- **One accent: muted sage green.** Everything else is quiet semantic colour — muted coral for
  spending, teal for saving, amber for "watch this", soft blue for information.
- **Tonal separation over borders and shadows.** Surfaces step by tone (page → card → raised);
  hairline borders do the rest. Shadows exist only for things that float (menus, dialogs, toasts).
- **One typeface with real numerals.** Plus Jakarta Sans (variable, self-hosted). Amounts use
  tabular figures so columns line up and values don't jitter.
- **A signature shape.** The WALLEX ring — three unequal, round-ended arcs (sage, teal, sand) —
  is the logo, the loading indicator and the auth-screen illustration.

Usability wins over decoration: nothing is added that doesn't help someone understand or act.

## Where things live

| What | File |
|---|---|
| All tokens (colour, type, space, radius, shadow, motion, layout) | `web/src/styles/_tokens.scss` |
| Breakpoints and Sass mixins (`tablet-up`, `focus-ring`, `tabular-numbers` …) | `web/src/styles/_mixins.scss` |
| Base styles: reset, typography, focus, selection, reduced motion | `web/src/styles/global.scss` |
| Theme state (System / Light / Dark) | `web/src/hooks/useTheme.tsx` |
| Flash-free theme at load | `web/public/theme-init.js` |
| Shared components | `web/src/components/*` |
| Icons (drawn in-house, no library) | `web/src/components/icons/` |
| App shell (sidebar, top bar, bottom nav, account menu) | `web/src/layouts/` |
| Contrast guard | `web/src/styles/tokens.test.ts` |

**Rule: components never hard-code a colour, size or duration.** They use `var(--color-surface)`,
`var(--space-4)`, `var(--radius-lg)` … Raw hex values appear only in `_tokens.scss`.

## Themes

Three states, stored as `wallex-theme` in `localStorage`:

| Choice | Behaviour |
|---|---|
| **System** (default) | Follows the OS (`prefers-color-scheme`) — **live**, including when the OS switches while the app is open. No attribute is set on `<html>`; the stylesheet's media query does the work. |
| **Light** | `<html data-theme="light">` — always light. |
| **Dark** | `<html data-theme="dark">` — always dark. |

How it works: `_tokens.scss` defines the colours twice (`@mixin light-tokens`, `@mixin dark-tokens`) and
applies the dark set for `[data-theme="dark"]` and for `:root:not([data-theme="light"])` inside
`@media (prefers-color-scheme: dark)`. `ThemeProvider` (mounted in `App.tsx`) keeps the preference,
applies the attribute, updates `<meta name="theme-color">`, reacts to OS changes and to changes made in
another tab, and cross-fades a manual switch for ~300 ms (skipped for `prefers-reduced-motion`).
`public/theme-init.js` runs synchronously in `<head>` so a saved Light/Dark choice never flashes the
other theme; it's an external file because the production CSP forbids inline scripts.

The switch is in the account menu (sidebar footer / phone top bar), in **Settings → Appearance** and on
the log-in / register screens. `ThemeSelector` is the component.

## Colour

Semantic tokens (light → dark values are in `_tokens.scss`):

| Group | Tokens |
|---|---|
| Surfaces | `--color-bg`, `--color-bg-subtle` (sunken), `--color-surface`, `--color-surface-subtle`, `--color-surface-raised` |
| Lines | `--color-border`, `--color-border-strong`, `--color-divider`, `--color-control-border` (form controls, 3:1) |
| Text | `--color-text`, `--color-text-secondary`, `--color-text-tertiary` |
| Brand | `--color-primary`, `-hover`, `-pressed`, `-soft`, `-ink` (text on soft), `--color-on-primary` |
| Money & status | `--color-success` (income), `--color-danger` (spending/errors), `--color-warning`, `--color-info`, `--color-savings`, each with a `-soft` background |
| Charts | `--chart-income`, `--chart-expense`, `--chart-savings`, `--chart-warning`, `--chart-neutral`, `--chart-grid`, `--chart-axis` |

**Colour is never the only signal.** Income is `+` and green, spending is `−`; budgets say "On track /
Near limit / Over budget" with an icon; changes carry an arrow and a sign. Expense amounts in long
lists use the normal text colour (the `−` does the work) so a page of spending isn't a wall of red.

**Contrast is tested.** `tokens.test.ts` parses `_tokens.scss` and fails if any text/background pair used
in the UI drops below WCAG 2.2 AA (4.5:1 text, 3:1 for control borders, focus rings and chart series) in
**either** theme. Change a colour, run `npm test`.

### Category identity

A category's own `color` (from the API) is the only input. `CategoryMark` / `CategoryDot` and
`categoryTone()` (`utils/categoryStyle.ts`) derive every presentation from it with `color-mix()` —
a soft tile, an ink colour that stays legible in both themes, a chart fill calmed toward
`--category-mix`. So one category is one recognisable look in lists, charts and budgets. Default
categories also get a hand-picked glyph (`categoryIconName`); custom names fall back to their initial.

## Typography

- Family: `--font-sans` — Plus Jakarta Sans Variable (`@fontsource-variable/plus-jakarta-sans`), with a
  system-font fallback. Served from the app's own origin (CSP `font-src 'self'`); `vite.config.ts`
  never inlines `.woff2` files for that reason.
- Scale: `--text-2xs` 11 · `xs` 12 · `sm` 13 · `base` 15 · `md` 16 (inputs — never smaller, iOS zooms) ·
  `lg` 18 · `xl` 20 · `2xl` 24 · `3xl` page titles (fluid) · `display` the dashboard balance (fluid).
- Weights 400/500/600/700; headings use `--tracking-tight`. Overlines use `--tracking-wide`.
- **Numbers:** anything numeric uses `@include tabular-numbers` (tabular figures).

## Spacing, radius, shadow, motion, layout

- Spacing is a 4px scale: `--space-1` (4) `2` (8) `3` (12) `4` (16) `5` (20) `6` (24) `8` (32) `10` (40) `12` (48) `16` (64).
- Radius: `--radius-xs` 6 · `sm` 8 · `md` 10 (buttons, inputs) · `lg` 16 (cards) · `xl` 22 (hero, dialogs) · `full`.
- Shadows `--shadow-xs … lg` are soft; dark mode uses darker, tighter ones.
- Motion: `--duration-fast/base/slow` (120/180/300 ms) and two easings. A global rule in `global.scss`
  reduces all animation and transitions for `prefers-reduced-motion`.
- Layout tokens: `--sidebar-width`, `--topbar-height`, `--bottom-nav-height`, `--content-max` (72rem),
  `--control-height` (44px — the touch target).

### Responsive behaviour

Mobile-first. Breakpoints (Sass, `_mixins.scss`): tablet `768px`, desktop `1024px`, wide `1440px`.

| Width | Shell | Notes |
|---|---|---|
| < 768 | Top bar + bottom tab bar with a floating **New transaction** button; **More** sheet for the rest | Dialogs become bottom sheets; secondary sections fold away |
| 768 – 1023 | Same shell, two-column grids | |
| ≥ 1024 | Sidebar; no top/bottom bars | Content is capped at `--content-max` and centred |

Only one navigation exists in the DOM at a time (`useMediaQuery` picks Sidebar *or* TopBar + BottomNav),
so assistive technology never meets two copies. On short desktop windows the sidebar's navigation scrolls
by itself while the account row stays pinned at the bottom.

## Components

Primitives: `Button`, `ButtonLink`, `IconButton`, `TextField`, `Select`, `Checkbox`, `SegmentedControl`,
`Card`, `Badge`, `Avatar`, `Modal` (also the **drawer**: `placement="right"`; both become a bottom sheet
on phones), `ConfirmDialog`, `Toast`, `Notice`, `ErrorBanner`, `EmptyState`, `ErrorState`, `Skeleton`,
`Spinner`, `ProgressBar`, `Disclosure`, `DetailList`, `SummaryStrip`, `PageHeader`, `MonthNavigator`,
`ThemeSelector`.

Domain components: `CategoryMark`, `TransactionRow` / `TransactionList` / `TransactionAmount`,
`BudgetRow`, `ListRow` / `RowList` (recurring, subscriptions), `DashboardHero`, chart wrappers in
`components/charts` (`ChartContainer`, `ChartTooltip`, `chartTheme`).

Conventions worth knowing:

- **Empty states** explain what's missing, why it matters and what to do next
  (`EmptyState` with `title`, `icon`, `action`). Inside a card a bare `message` is a quiet line.
- **Loading** uses skeletons sized like the finished content, so pages don't jump. `Button isLoading`
  keeps its label.
- **Errors** are per-section: a failed card shows a plain message and **Retry**; the rest of the page
  keeps working. Form errors sit under their field (with an icon) and in an `ErrorBanner`.
- **Row actions**: on pointer devices a transaction row reveals edit / delete on hover or keyboard focus, in
  the quiet space before the amount (the amounts keep the row's right edge). On touch, tapping the row opens
  the details drawer, where both actions live. Lists without a details view (recurring, subscriptions) keep
  their actions visible.
- **Forms** share `form.module.scss` (`stack`, `row`, `amountRow`, `actions`). The amount of a transaction
  is the focal point of its form (`TextField variant="amount"`).
- **Dialogs** trap focus, return it on close, close on Esc / backdrop, lock scroll and mark the page behind
  `inert` (`useFocusTrap`, `Modal`).
- **Confirmations** ("Transaction added") use `useToast()` (polite live region; errors use `role="alert"`).
- **Icons**: one 24px, 1.75px-stroke set in `components/icons/iconPaths.tsx`. Add a name to `ICON_NAMES`
  and its geometry to `ICON_PATHS`; `<Icon name="…" />` does the rest. Icons are decorative unless given a `title`.

## Accessibility checklist (what the redesign guarantees)

- Skip link, one `<main>`, one `<h1>` per page, per-page `<title>` (`usePageTitle`).
- Visible focus ring on every interactive element (`:focus-visible`, `--color-focus`); logical tab order.
- Every form control has a label; errors and hints are tied with `aria-describedby`; `aria-invalid` is set.
- Touch targets ≥ 44px (icon buttons keep a 44px hit area); verified at 320–1920px with no horizontal scroll.
- Radio-style controls (`SegmentedControl`) are real radio groups with arrow-key navigation.
- Charts are labelled, have a legend and a tooltip, and the figures are also available as text elsewhere.
- Reduced motion is respected (CSS and chart animations).

## Decisions and limits

- No UI library and no icon library were added; the only new dependency is the font package.
- **Categories** is still a placeholder page (category management was never built) and there is no UI to
  **create budgets** — both were left functionally as they were; the pages were redesigned, not extended.
- The transaction model has no merchant/account/notes/recurring flag, so the detail drawer shows the fields
  that exist (description, category, date, currencies and rate, timestamps).
- The mobile app has its own implementation of the same system; see **Mobile** below.

## Mobile (`mobile/`)

Same brand and palette as the web app, but its own mobile-first layout: one set of colours, one
font, one icon language, built from React Native components instead of Sass.

- **Tokens:** `mobile/theme/tokens.ts` mirrors the web `_tokens.scss` values (light and dark palettes,
  shadows, a 4px spacing scale, radii, motion, layout sizes, fonts and text variants).
  `__tests__/theme/tokens.test.ts` checks WCAG AA contrast of the text/surface pairs in both themes and
  that each palette colour exists in the web tokens, so the two can't drift apart.
- **Themes:** System / Light / Dark (More → Appearance), saved in AsyncStorage (`wallex_theme`).
  "System" follows the phone live; an explicit choice is never overridden by it. Components never
  import colours: they call `useTheme()` or `makeStyles((theme) => styles)` (`theme/makeStyles.ts`).
- **Type:** Plus Jakarta Sans, loaded per weight (`theme/fonts.ts`; RN can't synthesise weights).
  Text variants cap their font scaling (`maxFontScale`) so layouts survive large system text.
- **Navigation:** four tabs (Home, Transactions, Budgets, More) with a raised add button in the middle
  (`components/navigation/AppTabBar.tsx`, a custom `tabBar`). Assistant, Recurring and Analytics open
  from Home and More as stack screens; add / edit / scan open as modals.
- **Components:** `components/ui/` (Text, Button, IconButton, TextField, AmountInput, SegmentedControl,
  Chip, Card, Badge, ProgressBar, Skeleton, EmptyState, Notice, ListRow, BottomSheet, …). Screen
  frames use `components/Screen.tsx` (safe areas, phone-width column on tablets, pinned footer,
  keyboard avoidance). Icons are the web's set ported to `react-native-svg` (`components/icons`).
- **Rules carried over from the web app:** amounts stay API strings and are only converted for bar
  sizes; an expense is a neutral "−" and an income a green "+"; a status (on track / near limit / over
  budget) is never colour alone; every destructive action asks first; every text is translated (en, hu).
- **Touch:** targets are at least 44 pt, controls have roles, labels and states, motion respects
  "reduce motion", and the long lists (transactions, chat) are virtualised.
- **Tests:** component and screen tests run with `npm test` in `mobile/`; the stand-in used for the
  screenshots is not part of the repo.

Limits: this design has been checked in the Expo web target (light, dark, 320 px, tablet width) and
in unit tests; it has not been run on iOS or Android devices or simulators yet, so keyboard and
edge-to-edge behaviour on a real Android phone is unverified.
