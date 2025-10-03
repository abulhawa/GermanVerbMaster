# GermanVerbMaster UI/UX Guidelines

This document serves as a **rule book** for UI and UX design across the app.  
All future features must follow these principles to maintain consistency and prevent regressions.

---

## 1. Layout & Structure
- **Header height**: Max 10–15% of screen height. Shrinks or collapses on scroll.
- **Primary focus**: The practice input box must always be the main visual focal point.
- **Analytics & stats**: Consolidate into a single side panel (desktop) or accordion (mobile).
- **Navigation**:
  - Desktop → left sidebar (collapsible).
  - Mobile → bottom navigation bar.

---

## 2. Typography
- **Hierarchy scale** (shared desktop + mobile):
  - Titles: 20–24px
  - Subtitles / Prompts: 18–20px
  - Body text: 14–16px
  - Labels & helper text: 12–14px
- **Quiz prompt**: Always the **largest** text on the screen.
- **Numbers/stats**: Slightly larger than labels (e.g., 16–18px numbers, 12–14px labels).
- **Bold**: Use only for input prompts, active navigation, and key numbers.

---

## 3. Color & Theming
- Use **design tokens** (`--fg`, `--bg`, `--accent`, `--muted`) instead of hardcoded colors.
- Accent color highlights **interactive elements** only (buttons, selections, toggles).
- Dark mode → background dark, text light, accent remains consistent.
- Avoid full-page color washes; apply color only in **small pops**.

---

## 4. Information Density
- Show only **1 primary metric** upfront (accuracy *or* streak).
- Secondary details (attempts, milestones) → behind “Details” or collapsible sections.
- Avoid repeating the same metric across multiple cards.

---

## 5. Mobile vs Desktop
- **Desktop**: Sidebar + main panel + optional analytics panel.
- **Mobile**: Single vertical flow; analytics stacked below practice; bottom nav replaces sidebar.
- Practice box must be **full-width** and finger-friendly (min 44px height for inputs & buttons).

---

## 6. Interaction & Accessibility
- Input and button tap areas ≥ **44px** height.
- Keyboard focus ring must always remain visible.
- Long descriptions → tooltips or info icons, not sticky paragraphs.

---

## 7. Regression Prevention
Every new feature or refactor must:
1. Respect the **font scale**.
2. Keep the **practice box dominant** on screen.
3. Use **design tokens** for spacing, colors, and fonts.
4. Avoid new sticky headers or panels unless collapsible.
5. Be tested in **both desktop and mobile** layouts before merging.

---
## 8. Internationalization & Language Consistency
- All user-facing text must come from **language files** (no hardcoded strings).  
- Default app language = **English** (unless user chooses otherwise).  
- Mixed-language UI is not allowed — the interface should always be consistent.  
- Add **i18n keys** for all new text at the time of development.  
- Fallback language must exist (if a translation is missing, default to English).  
- Do not introduce new copy without adding it to the i18n resource files.  
- Language toggle should always be accessible from the top navigation.
---

✅ Following this guideline ensures GermanVerbMaster remains **clean, consistent, and learner-focused** across all devices.
