---
date: "2026-04-06"
ticket_id: "ISS-143"
ticket_title: "INF-08: Add security scanning tools"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "security", "documentation", "config", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-06"
ticket_id: "ISS-143"
ticket_title: "INF-08: Add security scanning tools"
categories: ["security", "ci-cd", "tooling", "infrastructure"]
outcome: "success"
complexity: "medium"
files_modified:
  - backend/pyproject.toml
  - frontend/package.json
  - frontend/.eslintrc.cjs
  - .github/workflows/ci.yml
---

# Lessons Learned: INF-08: Add security scanning tools

## What Worked Well
- Proactively configuring `[tool.bandit]` skips in `pyproject.toml` before running the first scan prevented noisy false-positive output and made the initial results actionable immediately
- Using `# nosec BXXX` inline comments with rationale kept suppressions auditable and visible during code review, rather than hiding them in global config
- The existing `npm run lint` script already targeted `src/`, so no additional CI step was needed for the frontend — the security plugin checks integrated cleanly by simply extending `.eslintrc.cjs`
- Adding bandit as a dedicated CI step after dependency installation made the scan scope and failure conditions explicit and easy to verify

## What Was Challenging
- Distinguishing true security findings from false positives required understanding the codebase's established patterns (bcrypt variable names, SQLAlchemy `text()` usage, JWT utilities) before suppressing anything
- The `./backend:/app` volume mount risk: bandit must be installed in the same environment the CI job uses, not just the local host or image layer — this required explicit verification
- eslint-plugin-security flagged `localStorage` access in the token service, requiring documented suppression rather than a code change, to avoid scope creep from a pre-accepted risk (ISS-028)

## Key Technical Insights
1. `bandit` B105/B106 fires on variable names containing `password`, `secret`, or `key` regardless of whether they hold actual credentials — variable names like `password_hash` and `SECRET_KEY` in legitimate auth code will always trigger these and must be globally skipped or inline-suppressed with rationale
2. B101 (assert usage) must be skipped globally when the test suite uses `assert` statements, or bandit must be configured to exclude the `tests/` directory from its target
3. B608 fires on any SQLAlchemy `text()` call even when parameters are properly bound — this is a structural false positive for projects using SQLAlchemy's ORM and should be in the global `skips` list
4. `eslint-plugin-security` does not have a `no-storage` rule by default — localStorage flags typically come from `detect-non-literal-fs-filename` or `detect-possible-timing-attacks` depending on usage pattern; identify the exact rule name before writing the disable comment
5. Running bandit with `-ll` in CI (medium severity and above) avoids build failures on low-severity informational findings while still enforcing meaningful coverage
6. The `bandit[toml]` extras install is required to read configuration from `pyproject.toml` — plain `bandit` will not pick up `[tool.bandit]` without it

## Reusable Patterns
- `[tool.bandit]` baseline configuration for FastAPI/SQLAlchemy/bcrypt/jose projects:
  ```toml
  [tool.bandit]
  targets = ["app"]
  skips = ["B101", "B105", "B106", "B608"]
  ```
- CI step for bandit after pip install: `bandit -r app/ -c pyproject.toml -ll`
- eslint-plugin-security integration in `.eslintrc.cjs`: add `"plugin:security/recommended"` to `extends` and `"security"` to `plugins`
- For accepted-risk localStorage suppressions, use: `// eslint-disable-next-line security/<rule-name> -- documented XSS risk; mitigated by CSP headers (see ISS-028)`
- For JWT utility false positives (`atob`, base64 string manipulation): `// eslint-disable-next-line security/<rule-name> -- known false positive for base64url padding normalization`

## Files to Review for Similar Tasks
- `backend/pyproject.toml` — bandit configuration and skip list
- `.github/workflows/ci.yml` — bandit CI step placement and flags
- `frontend/.eslintrc.cjs` — security plugin integration pattern
- `frontend/src/services/tokenService.ts` — example of documented localStorage suppression
- `frontend/src/utils/jwt.ts` — example of eslint-plugin-security false positive suppression on atob/base64 manipulation

## Gotchas and Pitfalls
- Do not install plain `bandit` — install `bandit[toml]` or the `pyproject.toml` config will be silently ignored and all skips will have no effect
- The `./backend:/app` Docker volume mount masks the image's installed packages from the host — always verify bandit is available in the exact execution environment used by CI, not just locally
- Never suppress a bandit or eslint-security finding without a `# nosec BXXX` or `// eslint-disable-next-line` comment that names the rule and provides a one-line rationale; suppressions without rationale will not pass code review scrutiny
- Do not change the localStorage token storage strategy as part of a security tooling ticket — suppressing the eslint finding with documented rationale is the correct scope-bounded response; storage strategy changes belong in a dedicated security remediation ticket
- Verify `npm run lint` covers all of `src/` before assuming the security plugin will catch issues across the full frontend codebase — partial lint targets produce incomplete CI coverage
- `bandit -r app/` will recurse into `tests/` if they are nested under `app/`; ensure the target path and skip list account for test file patterns to avoid B101 noise
```
