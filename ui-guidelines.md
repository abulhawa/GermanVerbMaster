# UI System Guidelines (Radix + Tailwind)

## 0) Goals
- One visual language across pages, dialogs, popovers, toasts.
- No hardcoded colors. Themes (light/dark) switch without per-component hacks.
- Accessible by default (Radix semantics & keyboard behavior preserved).

---

## 1) Design Tokens (single source of truth)
- Define **all colors** as CSS variables in `globals.css` (`--bg`, `--fg`, `--card`, `--border`, `--ring`, `--primary`, `--success`, `--warning`, `--danger`, etc.).
- Map them in `tailwind.config.ts` to tokenized classes (`bg`, `fg`, `card`, `border`, `ring`, `primary`, …) using `hsl(var(--token))`.
- **DO NOT** use hex or Tailwind palette classes (e.g., `text-gray-700`, `bg-slate-900`) in app code; only token classes.

**CI guard:** fail build if code under `src/components/` contains `#[0-9A-Fa-f]{3,6}` or `text-(gray|slate|zinc|neutral|stone)-` or `bg-(gray|slate|zinc|neutral|stone)-`.

---

## 2) Theming (light/dark)
- Dark mode is **class-based**: toggle `.dark` on `<html>` (use `next-themes` or equivalent).
- **Never** add color with `dark:*` unless it references tokens (e.g., `dark:text-[hsl(var(--fg))]` is redundant—prefer `text-fg`).
- All components must look correct with only token changes between themes.

---

## 3) Radix Composition
- Wrap Radix primitives in `src/components/ui/*` so surfaces are consistent.
  - Required wrappers: **Button**, **Input**, **Label**, **Switch**, **Dialog**, **Popover**, **Dropdown/Menu**, **Tabs**, **Toast** (if used), **Tooltip**.
- **Use `asChild` correctly** when composing triggers; always forward refs.
- Style interactive states with **Radix data attributes** (`data-[state=checked]`, `data-[disabled]`, etc.), not native selectors that may not apply.

---

## 4) Variants (sizes, tones) with CVA
- Each UI component uses **class-variance-authority (CVA)** for:
  - `size`: `sm | md | lg`
  - `tone`: `default | primary | success | warning | danger`
- No duplicated long class strings across files; **extend via variants** only.

---

## 5) Focus & Rings
- Provide a **shared utility** (e.g., `.focus-ring`) applying:
  - `focus-visible:ring-2 ring-[hsl(var(--ring))] ring-offset-2 ring-offset-[hsl(var(--bg))]`
- **Never** remove outlines without adding `.focus-ring`.

---

## 6) Surfaces, Spacing, Radius, Shadows
- Standard surface classes for cards/dialogs/menus:
  - `bg-card text-fg border border-border rounded-2xl shadow-md`
- Spacing rhythm:
  - Pages: `container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8`
  - Sections: `space-y-6`
  - Grids/stack gaps: prefer `gap-4`/`gap-6`
- Provide primitives: `<Page>`, `<Section>`, `<Card>` and **reuse** them.

---

## 7) Z-Index & Portals
- Tailwind extend:
  - `overlay: 50`, `modal: 60`, `popover: 70`, `toast: 80`
- Use those **named levels** (`z-overlay`, `z-modal`, …). No ad-hoc `z-[9999]`.
- All Radix overlays/contents render in portals and must use the standardized z-index scale.

---

## 8) Motion
- Transitions are subtle and consistent (`duration-200`).
- Respect reduced motion:
  ```css
  @media (prefers-reduced-motion: reduce){
    * { animation-duration: 1ms !important; transition-duration: 1ms !important; }
  }
  ```

---

## 9) Accessibility & Targets
- Every interactive control must have a **label** (`<label htmlFor>` or `aria-label`).
- Aim for ~44×44px hit areas; wrap switches/checkboxes with their label for a larger click target.
- Test keyboard navigation: Tab/Shift+Tab, Escape, Arrow keys (Radix covers this if structure is intact).

---

## 10) File Structure & Naming
```
src/
  components/
    ui/                 # Radix wrappers (the “design system”)
      button.tsx
      input.tsx
      label.tsx
      switch.tsx
      dialog.tsx
      popover.tsx
      dropdown.tsx
      tabs.tsx
      tooltip.tsx
    primitives/         # layout primitives
      page.tsx
      section.tsx
      card.tsx
  lib/
    cn.ts               # className join helper
  styles/
    globals.css         # tokens + base + utilities
tailwind.config.ts      # token mapping + z-index scale
```
- **App-specific** composites live in `components/*` and can only consume `components/ui/*` primitives.

---

## 11) “Do / Don’t” Summary
**Do**
- Use token classes: `bg-card`, `text-fg`, `border-border`, `bg-primary`, `ring-ring`.
- Use CVA for variants; extend sizes/tones there.
- Use Radix `data-*` attributes for states.
- Use the shared `.focus-ring`.

**Don’t**
- Hardcode colors or use palette classes.
- Mix DaisyUI/HyperUI styles with Radix wrappers.
- Set random `z-[…]` values.
- Inline `style={{ color: … }}` unless reading from tokens in icon components.

---

## 12) PR Checklist (Codex must satisfy)
- [ ] No hardcoded colors in changed files.
- [ ] Components only import from `components/ui/*` for primitives.
- [ ] CVA variants (`size`, `tone`) used; no duplicated class strings.
- [ ] Focus visible and accessible labels present.
- [ ] Works in light and dark with **no** `dark:` color overrides (tokens only).
- [ ] Z-index uses named scale; portals render correctly.
- [ ] Keyboard tests pass (open/close dialog, popover, menu; tab order intact).

---

## 13) Ready-made Codex Prompts

**A. Tokenize & Clean Colors**
> Replace all Tailwind palette/hex colors in `src/components/` with token classes mapped in `tailwind.config.ts` (bg/fg/card/border/ring/primary/success/warning/danger). Update `globals.css` tokens in light/dark. Add CI grep to fail on hex or Tailwind gray/slate/zinc classes.

**B. Wrap Radix**
> Create/standardize Radix wrappers in `src/components/ui/*` (Dialog, Popover, Dropdown, Tabs, Tooltip, Switch). Each surface uses `bg-card text-fg border border-border rounded-2xl shadow-md` and `.focus-ring`. Replace direct Radix usage in the app with these wrappers.

**C. Add CVA Variants**
> Migrate Button, Badge, Switch to CVA with `size: sm|md|lg` and `tone: default|primary|success|warning|danger`. Remove duplicated class strings. Keep visual parity.

**D. Theming**
> Integrate `next-themes` to toggle `.dark` on `<html>`. Ensure all components render correctly in both themes using tokens only. Remove `dark:*` color overrides.

**E. Z-Index & Portals**
> Extend Tailwind zIndex with {overlay:50, modal:60, popover:70, toast:80}. Apply to Radix portals. Remove ad-hoc z-classes and verify stacking order across overlapping UI.
