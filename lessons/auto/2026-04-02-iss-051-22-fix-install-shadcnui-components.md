---
date: "2026-04-02"
ticket_id: "ISS-051"
ticket_title: "2.2-fix: Install shadcn/ui components"
categories: ["testing", "api", "database", "ui", "refactoring", "bug-fix", "feature", "security", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-02"
ticket_id: "ISS-051"
ticket_title: "2.2-fix: Install shadcn/ui components"
categories: ["frontend", "shadcn-ui", "refactoring", "tailwind", "testing"]
outcome: "success"
complexity: "medium"
files_modified:
  - frontend/components.json
  - frontend/src/utils/cn.ts
  - frontend/src/utils/index.ts
  - frontend/src/components/ui/button.tsx
  - frontend/src/components/ui/input.tsx
  - frontend/src/components/ui/label.tsx
  - frontend/src/components/ui/card.tsx
  - frontend/src/components/ui/badge.tsx
  - frontend/src/components/ui/dialog.tsx
  - frontend/src/components/ui/dropdown-menu.tsx
  - frontend/src/components/ui/table.tsx
  - frontend/src/components/ui/tabs.tsx
  - frontend/src/components/ui/tooltip.tsx
  - frontend/src/components/ui/skeleton.tsx
  - frontend/src/pages/LoginPage.tsx
  - frontend/src/pages/RegisterPage.tsx
  - frontend/src/pages/DashboardPage.tsx
  - frontend/src/pages/SurveysPage.tsx
  - frontend/src/pages/SurveyFormPage.tsx
  - frontend/src/pages/SurveyDetailPage.tsx
  - frontend/tailwind.config.ts
  - frontend/src/index.css
  - frontend/package.json
  - frontend/package-lock.json
---

# Lessons Learned: 2.2-fix: Install shadcn/ui components

## What Worked Well
- The implementation plan correctly anticipated all major risk areas (non-interactive CLI, CSS variable setup, cn() path, test fragility) before work began.
- Running `npx tsc --noEmit` before and after shadcn installation successfully isolated pre-existing TypeScript errors from installation-introduced issues.
- Running `npx vitest run` incrementally after each page refactor (rather than batching) kept regressions easy to isolate and fix.
- Using `--yes` flag with `npx shadcn@latest add` prevented interactive prompts from hanging in the non-TTY container environment.
- Semantic HTML selectors (getByRole('button'), getByRole('textbox')) survived the refactor intact since shadcn renders native HTML elements underneath.
- All 183 pre-existing frontend tests passed after the full refactor, confirming the incremental approach was sound.

## What Was Challenging
- Determining the correct cn() utility path required checking components.json `aliases.utils` first — the shadcn CLI defaults to `src/lib/utils.ts` but the project had `src/utils/cn.ts` as the target, requiring careful reconciliation.
- CSS variable blocks in index.css needed to be verified (and potentially added) before installing components — missing `:root` variable declarations cause shadcn components to render with broken styles.
- Auditing test files for className-based assertions and `container.querySelector` patterns across six page files was tedious but necessary to prevent silent regressions.
- The shadcn CLI install touches tailwind.config.ts and index.css in addition to generating component files — changes to these shared config files needed verification to avoid breaking existing styles.

## Key Technical Insights
1. `npx shadcn@latest add` in a non-TTY container environment will hang indefinitely without `--yes` — this flag is mandatory for CI/container use.
2. The canonical source of truth for the cn() utility path is `components.json` under `aliases.utils`, not the shadcn documentation default. Always read this field before creating or referencing the utility file.
3. shadcn components depend on CSS custom properties (e.g., `--background`, `--foreground`, `--primary`) defined in `:root` in `index.css`. If these are absent, components render with broken/invisible styles — verify this block exists before any install.
4. shadcn component files import from `@radix-ui/*` packages. After installation, a `npx tsc --noEmit` check will surface any missing Radix peer dependencies before page refactors begin.
5. Tests written with semantic ARIA role queries (`getByRole`, `getByLabelText`, `getByPlaceholderText`) are robust across this type of refactor. Tests using raw class name strings or `container.querySelector('input')` are fragile and should be updated proactively.
6. tailwind.config.ts must include the shadcn content glob patterns and the `tailwindcss-animate` plugin — verify these are present after install or the Tailwind purge step will strip shadcn utility classes from the production build.

## Reusable Patterns
- **Non-interactive shadcn install:** `npx shadcn@latest add <components...> --yes` inside the frontend directory.
- **Pre/post install TypeScript check:** `npx tsc --noEmit` before install to baseline errors, then again after to surface new ones from shadcn-generated files.
- **Incremental refactor testing:** run `npx vitest run` after each individual page refactor rather than after all pages — makes regressions trivially isolatable.
- **cn() path resolution:** read `components.json` → `aliases.utils`, map it through `tsconfig.json` `compilerOptions.paths` to find the actual filesystem path.
- **Test audit before refactor:** grep each page's test file for `className`, `querySelector`, and hard-coded element type selectors before touching the page — fix these selectors first, then refactor the component.
- **CSS variable verification:** before installing shadcn components into any project, confirm `:root { --background: ...; --foreground: ...; }` exists in `index.css`; if not, copy the full shadcn init CSS block in first.

## Files to Review for Similar Tasks
- `frontend/components.json` — canonical config for shadcn aliases, style, base color, and CSS variable mode
- `frontend/tailwind.config.ts` — must include shadcn content paths and `tailwindcss-animate` plugin
- `frontend/src/index.css` — must contain `:root` CSS variable block for shadcn theming
- `frontend/src/components/ui/` — reference any existing installed components before adding new ones to avoid duplication
- `frontend/src/utils/cn.ts` (or `src/lib/utils.ts`) — verify this exists and exports `cn` before importing in new components
- Test files alongside each refactored page (`*.test.tsx`) — audit for fragile selectors before beginning each page refactor

## Gotchas and Pitfalls
- **Hanging CLI install:** omitting `--yes` from `npx shadcn@latest add` causes the process to hang waiting for TTY input in container/CI environments — always include it.
- **Wrong cn() path:** assuming `src/lib/utils.ts` without checking `components.json` aliases will cause import errors in generated component files if the project uses a different path.
- **Missing CSS variables:** installing shadcn components before the `:root` CSS variable block is present in `index.css` results in components that render but appear unstyled or invisible — not an error, so easy to miss.
- **Radix peer dependency gaps:** shadcn component files reference `@radix-ui/*` packages that may not be installed; the TypeScript compiler will catch these but only if `tsc --noEmit` is run after install.
- **tailwind.config.ts content paths:** if the shadcn content glob is missing, Tailwind's purge step removes shadcn utility classes in production builds — the dev server will look fine but `npm run build` output will be broken.
- **Batching refactors before testing:** refactoring multiple pages before running the test suite makes it very difficult to determine which page change broke a given test — always test after each page.
- **Class name assertions in tests:** any test that asserts `expect(element).toHaveClass('bg-blue-500')` will break when the underlying element changes from a raw `<button>` with inline Tailwind to a shadcn `<Button>` with CVA-managed classes — these must be replaced with behavior-based assertions.
```
