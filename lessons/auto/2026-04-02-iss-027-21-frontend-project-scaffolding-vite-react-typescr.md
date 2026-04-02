---
date: "2026-04-02"
ticket_id: "ISS-027"
ticket_title: "2.1: Frontend Project Scaffolding (Vite + React + TypeScript)"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "performance", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-02"
ticket_id: "ISS-027"
ticket_title: "2.1: Frontend Project Scaffolding (Vite + React + TypeScript)"
categories: ["frontend", "docker", "vite", "react", "typescript", "tailwind"]
outcome: "success"
complexity: "medium"
files_modified:
  - docker-compose.yml
  - frontend/package.json
  - frontend/index.html
  - frontend/vite.config.ts
  - frontend/tsconfig.json
  - frontend/tsconfig.node.json
  - frontend/tailwind.config.ts
  - frontend/postcss.config.js
  - frontend/.eslintrc.cjs
  - frontend/.prettierrc
  - frontend/.gitignore
  - frontend/Dockerfile
  - frontend/src/index.css
  - frontend/src/main.tsx
  - frontend/src/App.tsx
  - frontend/src/pages/LoginPage.tsx
  - frontend/src/pages/NotFoundPage.tsx
  - frontend/src/components/.gitkeep
  - frontend/src/hooks/.gitkeep
  - frontend/src/services/.gitkeep
  - frontend/src/types/.gitkeep
  - frontend/src/utils/.gitkeep
  - frontend/components.json
---

# Lessons Learned: 2.1: Frontend Project Scaffolding (Vite + React + TypeScript)

## What Worked Well
- Creating all config files from scratch before running `npm install` allowed dependency conflicts to be caught early in one shot
- Running `npm run build` as a TypeScript strict-mode check before `npm run dev` surfaced type errors at a stage where they are easier to diagnose
- Using named multi-stage Docker targets (`AS dev`) made docker-compose `target: dev` resolution unambiguous
- Scaffolding the full `src/` subdirectory structure with `.gitkeep` files up front established a clean project layout before any feature work begins
- Reading `docker-compose.yml` before modifying it prevented assumptions about existing service configuration (image, volumes, ports, command)

## What Was Challenging
- The existing docker-compose.yml frontend service referenced `./frontend/nginx.conf`, which would silently break unscoped `docker-compose up` if not fully removed during the update
- Vite's default dev server binding to `127.0.0.1` inside Docker caused port 3000 to be inaccessible from the host until `server.host: true` was set in `vite.config.ts`
- The anonymous volume pattern for `node_modules` (`- /app/node_modules`) is easy to forget and causes a subtle failure where the host volume mount shadows the container-installed packages, making the dev server fail to start with no obvious error
- Tailwind v4 config syntax differs meaningfully from v3 — using the wrong config shape causes PostCSS to silently skip utility generation

## Key Technical Insights
1. Vite proxy targets need to account for both Docker (service name `backend:8000`) and local non-Docker (`localhost:8000`) environments — use an environment variable or document the distinction clearly to avoid confusion during local development
2. The Dockerfile dev stage CMD must use `npm run dev -- --host 0.0.0.0` (or rely on `server.host: true` in `vite.config.ts`) to bind to all interfaces; without this the container exposes port 3000 but no traffic reaches Vite
3. Anonymous volume override in docker-compose (`- /app/node_modules`) is required when mounting the host source directory into a container that installs its own `node_modules` during build — the named source mount would otherwise mask the container's installed packages
4. TypeScript path aliases configured in `tsconfig.json` (`@/ -> src/`) must also be mirrored in `vite.config.ts` under `resolve.aliases` — configuring only one side causes runtime module resolution failures even when compilation succeeds
5. `shadcn/ui` requires `components.json` to be present before any component generation; setting it up during scaffolding prevents a missing-config error on first `npx shadcn-ui add` invocation

## Reusable Patterns
- **Dockerfile multi-stage dev target**: `FROM node:20-alpine AS dev` with `CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]` — always use a named stage so docker-compose `target:` field resolves correctly
- **docker-compose node_modules protection**: always follow a source volume mount with `- /app/node_modules` anonymous volume to prevent the host directory from shadowing container-installed packages
- **Vite host binding**: set `server: { host: true }` in `vite.config.ts` rather than relying on the CLI flag — this ensures the setting is version-controlled and applies consistently in all environments
- **Pre-flight build check**: run `npm run build` before `npm run dev` during scaffolding validation; TypeScript strict-mode errors are cleaner to read in build output than in Vite's runtime overlay
- **Remove legacy docker-compose references before adding new ones**: when replacing an nginx stub with a Vite dev service, explicitly verify and remove any dangling file references (e.g., `nginx.conf`) before committing

## Files to Review for Similar Tasks
- `frontend/vite.config.ts` — proxy configuration and host binding; reference when adding new API targets or adjusting dev server behavior
- `frontend/Dockerfile` — multi-stage build pattern; reference for any future service that needs both a dev container and a production nginx stage
- `docker-compose.yml` frontend service block — anonymous volume pattern for `node_modules`; reference when adding other Node-based services
- `frontend/tailwind.config.ts` — content path configuration; reference when adding new source directories that need Tailwind utility scanning
- `frontend/tsconfig.json` + `frontend/vite.config.ts` — path alias configuration; both files must be updated together when adding new aliases

## Gotchas and Pitfalls
- **Dangling nginx.conf reference**: if the old `./frontend/nginx.conf` volume mount or image reference is not fully removed from docker-compose.yml, `docker-compose up` (unscoped) will fail even after the frontend service is updated — always verify the entire service block, not just the `image:` field
- **Vite binds to localhost by default inside Docker**: port 3000 will appear open but refuse connections from the host unless `server.host: true` is set; this is a silent failure that looks like a port-mapping issue
- **Host volume shadows container node_modules**: without the anonymous volume override, `npm install` inside the Docker build is effectively wasted — the container starts without its installed packages and fails with module-not-found errors
- **Tailwind v4 vs v3 config shape**: `tailwind.config.ts` with a `content:` array is v3 syntax; v4 uses a CSS-first approach — confirm the installed Tailwind version before copying config patterns from documentation or prior projects
- **ESLint flat config vs legacy `.eslintrc.cjs`**: newer ESLint versions default to `eslint.config.js` (flat config); using `.eslintrc.cjs` requires ensuring the installed ESLint version supports it or explicitly setting `ESLINT_USE_FLAT_CONFIG=false`
- **`components.json` must be present before first shadcn/ui add**: omitting this file during scaffolding causes the CLI to interactively prompt for configuration, which breaks automated or non-interactive setups
```
