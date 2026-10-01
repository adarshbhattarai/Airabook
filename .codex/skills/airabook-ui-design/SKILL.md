---
name: airabook-ui-design
description: Use when making Airabook frontend UI changes that should match the existing app layout, Tailwind theme tokens, dashboard patterns, and dark or matrix theme behavior.
---

# Airabook UI Design

Use this skill for React UI work in the Airabook frontend.

## Workflow

1. Inspect the smallest relevant existing screen first.
2. Prefer `@/` imports and existing components from `src/components/ui/` and `src/components/app/`.
3. Match operational app screens: compact header, primary action on the right, stat cards when useful, then dense cards or workspace panels.
4. Use app tokens before raw colors: `text-app-gray-*`, `bg-app-iris`, `bg-app-gray-*`, `shadow-appSoft`, `rounded-2xl`, and existing `Button` variants.
5. Keep tools practical and scannable. Do not turn product workspaces into landing pages.
6. If adding feature-specific classes, check `src/index.css` for dark and matrix theme overrides.
7. For routes, API boundaries, or meaningful screen changes, update docs if needed and run `scripts/refresh_frontend_context.sh`.

## Reference Files

- `src/pages/Books.jsx` for library header, stats, and book rails.
- `src/pages/Media.jsx` for create modal and asset-card patterns.
- `src/pages/Movies.jsx` for Manim/movie workspace patterns.
- `src/components/app/StatCard.jsx` for summary cards.
- `tailwind.config.js` and `src/index.css` for theme tokens and dark/matrix overrides.
