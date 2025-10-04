# GermanVerbMaster UI/UX & Design System Guidelines

This unified reference keeps the product experience and the component system in sync. All UI or UX updates must uphold these principles **before** shipping.

---

## 1. Experience Principles
- **Practice-first layout**: The exercise input box stays the main focal point and spans the usable width on every screen. Avoid clamping the practice card with arbitrary `max-w-*` classes—let it inherit the full column width so the input, buttons, and feedback breathe.
- **Responsive navigation**:
  - Desktop → collapsible left sidebar for navigation with analytics in an optional side panel.
  - Mobile → bottom navigation with analytics available below the practice flow (accordion or collapsible blocks).
- **Header discipline**: Keep headers within 10–15% of viewport height and collapse/shrink on scroll.
- **Information density**:
  - Surface a single primary metric upfront (accuracy *or* streak).
  - Move secondary metrics (attempts, milestones) into expandable "Details" areas to avoid repetition.
- **Typography hierarchy**:
  - Titles 20–24px, subtitles/prompts 18–20px, body 14–16px, labels/help text 12–14px.
  - Quiz prompt is always the largest text on screen; key numbers slightly larger (16–18px) than their labels.
  - Reserve bold weight for prompts, active navigation, and key numbers to maintain contrast discipline.
- **Touch targets & focus**: Inputs/buttons maintain ≥44px height, and visible focus rings remain intact at all times.
- **Tooltips for depth**: Use tooltips or info icons for long explanations instead of sticky paragraphs.
- **Internationalisation**:
  - All user-facing copy lives in language files with English as the fallback.
  - No mixed-language UI; add i18n keys for new strings and keep the language toggle reachable from top navigation.

---

## 2. Visual Language & Theming
- Use **design tokens** (`--fg`, `--bg`, `--card`, `--border`, `--ring`, `--primary`, `--success`, `--warning`, `--danger`, etc.) declared in `globals.css`; never hardcode hex values or Tailwind palette classes.
- Map tokens in `tailwind.config.ts` with `hsl(var(--token))` so Tailwind utility classes stay in sync (CI guards already fail when palette classes/hex codes sneak into `src/components/`).
- Accent colors highlight **interactive elements** only (buttons, selections, toggles) to keep the UI calm and focused.
- Dark mode toggles the `.dark` class on `<html>`; components must remain visually correct using the same tokens in both themes.
- Avoid whole-screen color washes—prefer subtle pops of accent to reinforce focus on the practice experience.
- **Data visualisations**: Theme Recharts (and any third-party SVG/canvas output) by overriding fill/stroke via token-backed values (`hsl(var(--border))`, `hsl(var(--muted))`, etc.). Never target vendor defaults like `stroke="#ccc"`; instead, apply scoped selectors that set the full element state with token colours.

---

## 3. Component System Expectations
- Wrap Radix primitives inside `src/components/ui/*` wrappers (Button, Input, Label, Switch, Dialog, Popover, Dropdown/Menu, Tabs, Toast, Tooltip) and always forward refs/`asChild` props correctly.
- Apply interactive styling through Radix `data-*` attributes (`data-[state=checked]`, `data-[disabled]`, etc.) rather than brittle native selectors.
- Share focus treatment via a `.focus-ring` utility: `focus-visible:ring-2 ring-[hsl(var(--ring))] ring-offset-2 ring-offset-[hsl(var(--bg))]`.
- Provide layout primitives like `<Page>`, `<Section>`, and `<Card>` with consistent surfaces (`bg-card text-fg border border-border rounded-2xl shadow-md`). Reuse them rather than redefining surfaces.
- Follow the spacing rhythm: pages (`container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8`), sections (`space-y-6`), and grids (`gap-4` or `gap-6`).
- Use CVA variants on UI components for `size: sm | md | lg` and `tone: default | primary | success | warning | danger` to avoid duplicated class strings.
- Standardise z-index values by extending Tailwind with named levels (`indicator: 10`, `overlay: 50`, `modal: 60`, `popover: 70`, `toast: 80`) and applying `z-indicator`, `z-overlay`, `z-modal`, etc. No ad-hoc `z-[9999]` values or unnamed `z-[number]` escapes.
- Keep motion subtle (`duration-200`) and respect reduced motion preferences by clamping animation/transition durations when `prefers-reduced-motion: reduce` is set.
- Maintain the documented file structure: Radix wrappers in `src/components/ui`, layout primitives in `src/components/primitives`, utility helpers in `src/lib`, and shared tokens/styles in `src/styles` + root config files. App-specific composites live in `src/components/*` and only consume the primitives.
- Stick to the shared design language: avoid mixing in other component libraries (DaisyUI/HyperUI/etc.) or inline styling for colors when a tokenized class is available.

---

## 4. Accessibility & Testing Discipline
- Every interactive element requires an accessible label (`<label htmlFor>` or `aria-label`).
- Ensure keyboard navigation works end-to-end (Tab/Shift+Tab, Escape, arrow keys for Radix menus/tabs).
- Validate both desktop and mobile layouts for new features before merging.
- Preserve keyboard focus order and visible feedback when components open/close (dialogs, popovers, menus, toasts).

---

## 5. Do & Don't Quick Reference
**Do**
- Use token classes (`bg-card`, `text-fg`, `border-border`, `bg-primary`, `ring-ring`).
- Leverage CVA variants for size/tone extensions.
- Style states with Radix `data-*` attributes and the shared `.focus-ring`.
- Keep analytics secondary through collapsible or off-canvas treatments.

**Don't**
- Hardcode colors or rely on Tailwind palette classes.
- Introduce sticky headers/panels that cannot collapse.
- Mix design systems or import primitives outside `src/components/ui/*`.
- Inline `style={{ color: … }}` unless reading token values inside icon-only components.

---

## 6. Regression Prevention Checklist
Before shipping UI work, confirm:

- [ ] Practice box remains dominant with header height within limits.
- [ ] Practice inputs/buttons stay full-width where needed and meet the ≥44px target sizing.
- [ ] Typography scale and bold usage follow the hierarchy above.
- [ ] All colors/spacing derive from design tokens and shared primitives (no hex or Tailwind palette classes).
- [ ] Components depend on `src/components/ui/*` wrappers and CVA variants for size/tone.
- [ ] Focus rings, hit areas (≥44px), and accessible labels are intact.
- [ ] Works in both light and dark themes without ad-hoc `dark:` color overrides.
- [ ] Z-index uses the shared named scale (no `z-[9999]`).
- [ ] Analytics and secondary metrics stay collapsible/off the primary path.
- [ ] Keyboard interaction and reduced-motion preferences are respected.
- [ ] i18n keys exist for any new text with English fallback verified.

---

## 7. Implementation Prompts (for automation or pairing sessions)
- **Tokenize & clean colors**: Replace Tailwind palette/hex colors in `src/components/` with mapped token classes (`bg/fg/card/border/ring/primary/success/warning/danger`) and keep `globals.css` tokens in sync.
- **Wrap Radix primitives**: Standardise wrappers in `src/components/ui/*` (Dialog, Popover, Dropdown, Tabs, Tooltip, Switch) using the shared surface + `.focus-ring`, replacing direct Radix usage elsewhere.
- **Add CVA variants**: Ensure Button, Badge, Switch (and similar primitives) expose `size: sm|md|lg` and `tone: default|primary|success|warning|danger` variants to remove duplicated classes.
- **Strengthen theming**: Use class-based dark mode (toggle `.dark` on `<html>`) and confirm all components rely on tokens with no ad-hoc `dark:` overrides.
- **Align z-index & portals**: Extend Tailwind with named z-index levels `{overlay:50, modal:60, popover:70, toast:80}` and apply them across Radix portals to avoid stacking conflicts.

Keeping to this checklist ensures GermanVerbMaster stays clean, consistent, and learner-focused across every device.
