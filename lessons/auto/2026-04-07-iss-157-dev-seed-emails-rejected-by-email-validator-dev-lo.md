---
date: "2026-04-07"
ticket_id: "ISS-157"
ticket_title: "Dev seed emails rejected by email-validator — dev login shortcuts broken"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "security", "documentation", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```yaml
---
date: "2026-04-07"
ticket_id: "ISS-157"
ticket_title: "Dev seed emails rejected by email-validator — dev login shortcuts broken"
categories: ["developer-experience", "validation", "seed-data"]
outcome: "success"
complexity: "low"
files_modified:
  - "backend/app/cli.py"
  - "frontend/src/components/dev/DevLoginPanel.tsx"
  - "CLAUDE.md"
---
```

# Lessons Learned: Dev seed emails rejected by email-validator — dev login shortcuts broken

## What Worked Well
- Root cause was immediately obvious once the library behavior was understood: `email-validator` v2.3.0 explicitly rejects special-use TLDs like `.local`
- The fix was a pure find-and-replace across a small, well-scoped set of files
- Using `@example.com` is the canonical RFC-2606 reserved domain for examples/testing — no ambiguity about whether it will be accepted by validators now or in the future
- The implementation plan correctly identified all affected files upfront, preventing any missed references

## What Was Challenging
- The failure mode was silent on the frontend (dev login buttons failed with no visible error), making it harder for developers to self-diagnose
- The seed script writes directly to the DB (bypassing Pydantic), so the bad emails were accepted at seed time but rejected at login time — a temporal gap between data creation and validation

## Key Technical Insights
1. `email-validator` v2.3.0 rejects `.local` TLDs as special-use/reserved per IANA registry rules — this is intentional library behavior, not a bug
2. Seed scripts that bypass application-layer validation can introduce data that is technically storable but not usable through normal application flows
3. `@example.com`, `@example.org`, and `@example.net` are RFC-2606 reserved for documentation/testing and will always pass strict email validators
4. Dev convenience data (seed emails, test fixtures) should use RFC-compliant values that pass the same validation as production data — `.local`, `.test`, `.invalid` are all reserved and may be rejected

## Reusable Patterns
- For dev/test email addresses, always use `@example.com` (or `@example.org` / `@example.net`) — never use `.local`, `.dev`, `.test`, or other special-use TLDs
- When a seed script or fixture bypasses Pydantic validation (direct DB writes), run a post-seed smoke test through the actual API to catch validation mismatches early
- Keep dev seed credentials documented in CLAUDE.md Quick Reference so they stay in sync with the actual seed script

## Files to Review for Similar Tasks
- `backend/app/cli.py` — seed script; check email domains whenever adding new seeded users
- `frontend/src/components/dev/DevLoginPanel.tsx` — hardcoded dev account list; must mirror seed script exactly
- `backend/app/schemas/user.py` — `LoginRequest` uses `EmailStr`; any test or fixture submitting to this endpoint must use valid email domains
- `CLAUDE.md` — Quick Reference section documents dev credentials; update here whenever seed emails change

## Gotchas and Pitfalls
- Silent frontend failures on dev login buttons provide no feedback — if dev logins stop working after a schema or seed change, check the network tab for the actual API response
- `email-validator` validation rules can tighten between minor versions; pin or audit the version when upgrading if dev workflows depend on non-standard email formats
- Any future seed email addresses must use RFC-compliant domains — do not use `.local`, `.internal`, `.dev`, `.test`, or other special-use TLDs even for convenience
