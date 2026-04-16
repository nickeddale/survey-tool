---
date: "2026-04-13"
ticket_id: "ISS-235"
ticket_title: "Frontend TypeScript types and API service for email invitations"
categories: ["testing", "api", "database", "ui", "bug-fix", "feature", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-13"
ticket_id: "ISS-235"
ticket_title: "Frontend TypeScript types and API service for email invitations"
categories: ["frontend", "typescript", "api-client", "testing", "msw"]
outcome: "success"
complexity: "low"
files_modified:
  - frontend/src/types/survey.ts
  - frontend/src/services/emailInvitationService.ts
  - frontend/src/mocks/handlers.ts
  - frontend/src/services/__tests__/emailInvitationService.test.ts
---

# Lessons Learned: Frontend TypeScript types and API service for email invitations

## What Worked Well
- The existing participantService.ts and webhookService.ts provided near-perfect templates; the class-based singleton pattern (`class Foo { ... }; export const fooService = new Foo()`) required no adaptation.
- Exporting a named `EmailInvitationType` union type (`'invite' | 'reminder'`) and reusing it in both `EmailInvitationCreate` and `EmailInvitationResponse` eliminated duplication and improved refactor safety.
- Defining `EmailInvitationFetchParams` as a separate exported interface (not inlined) kept the service signature readable and allowed tests to import it directly for typed assertions.
- The MSW `stats` handler was registered **before** the generic `invitations` list handler to prevent the wildcard `:invitationId` param from matching the literal `stats` path segment.
- The stats handler computed open_rate and click_rate dynamically from `mockEmailInvitations`, making the `getStats` test self-consistent without hard-coded magic numbers.

## What Was Challenging
- **MSW handler ordering for overlapping routes**: `GET /invitations/stats` and `GET /invitations/:invitationId` share the same prefix. MSW matches the first registered handler, so `stats` must appear before the parameterized `:invitationId` route. The same ordering concern applies to `POST /invitations/batch` vs `POST /invitations`.
- The `deleteInvitation` method returns `void`, so the test uses `.resolves.toBeUndefined()` rather than asserting on response data — a subtle difference from other methods that's easy to miss when writing tests by analogy.

## Key Technical Insights
1. **Handler registration order matters in MSW**: Literal path segments (e.g., `/stats`, `/batch`) must be registered before parameterized segments (e.g., `/:invitationId`) for the same HTTP method and parent path. MSW does not automatically prefer specificity over registration order.
2. **`invitation_type` is a filter param, not a required field**: The backend accepts optional `invitation_type` on create, and the list endpoint accepts it as a query filter. Both the service interface and the MSW handler must treat it as optional.
3. **Batch endpoint returns a count summary, not a list**: `EmailInvitationBatchResponse` (`{ sent, failed, skipped }`) has a fundamentally different shape from `EmailInvitationListResponse`. Tests should assert on the count fields, not on `items`.
4. **Stats are derived, not stored**: The stats endpoint response is computed from invitation records. MSW can faithfully mirror this by filtering `mockEmailInvitations` in the handler rather than returning a hardcoded fixture.

## Reusable Patterns
- **Singleton service class**: `class XService { async method(...) { const r = await apiClient.get<T>(...); return r.data } }; export const xService = new XService(); export default xService`
- **Params interface co-located with service**: Define `XFetchParams` in the same file as the service, export it for consumers and tests.
- **Test auth setup**: `beforeEach(() => { clearTokens(); localStorage.clear(); setTokens(mockTokens.access_token) })` is the standard test preamble for authenticated service tests.
- **URL capture pattern for param forwarding tests**: Override the handler with `server.use(http.get(..., ({ request }) => { capturedUrl = request.url; return HttpResponse.json(...) }))` to assert query strings were forwarded correctly.
- **Payload capture pattern**: `let capturedBody = null; server.use(http.post(..., async ({ request }) => { capturedBody = await request.json(); return HttpResponse.json(...) }))` for asserting request bodies.

## Files to Review for Similar Tasks
- `frontend/src/services/participantService.ts` — primary reference for nested survey resource services
- `frontend/src/services/webhookService.ts` — reference for top-level resource services
- `frontend/src/mocks/handlers.ts` — note handler registration order for overlapping routes
- `frontend/src/services/__tests__/participantService.test.ts` — reference for test structure, auth setup, and MSW override patterns

## Gotchas and Pitfalls
- **MSW route shadowing**: Registering `GET /invitations/:invitationId` before `GET /invitations/stats` causes the stats endpoint to be matched as if `stats` were an invitation ID, returning a 404. Always register literal sub-paths first.
- **`deleteInvitation` returns `void`**: The Axios call returns `Promise<void>` (no `.data` extraction). Tests must use `.resolves.toBeUndefined()`, not `.resolves.toBeDefined()` or data assertions.
- **`pages` vs `total_pages` pagination field**: The participant mock uses `pages` (matching an older backend response shape), while the email invitation mock uses `total_pages`. Confirm the backend schema before naming the field in new types — inconsistency causes silent type mismatches.
- **Optional vs nullable in TypeScript**: Fields that are `string | null` in the backend response should be typed as `string | null`, not `string | undefined`, to avoid incorrect `?.` usage at call sites.
```
