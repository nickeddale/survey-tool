---
date: "2026-04-02"
ticket_id: "ISS-030"
ticket_title: "2.4: Registration and Login Pages"
categories: ["testing", "api", "ui", "bug-fix", "feature", "performance", "security", "ci-cd"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```yaml
---
date: "2026-04-02"
ticket_id: "ISS-030"
ticket_title: "2.4: Registration and Login Pages"
categories: ["frontend", "forms", "validation", "testing", "auth"]
outcome: "success"
complexity: "medium"
files_modified:
  - "frontend/src/pages/LoginPage.tsx"
  - "frontend/src/pages/RegisterPage.tsx"
  - "frontend/src/pages/__tests__/LoginPage.test.tsx"
  - "frontend/src/pages/__tests__/RegisterPage.test.tsx"
---

# Lessons Learned: 2.4: Registration and Login Pages

## What Worked Well
- The existing stubs had the correct structure (loading state, error state, `useAuth`, `useNavigate`) so enhancements were additive rather than structural rewrites.
- Extracting validation into a pure `validate()` function kept the submit handler clean and made the validation logic trivially testable in isolation.
- The `FieldErrors` interface with optional keys per field made it easy to render inline errors conditionally without extra boolean state.
- Using React Router `Link` from the start (rather than bare `<a>` tags) prevented dead navigation and enabled `href` assertions in tests.
- The `fillForm` helper in `RegisterPage.test.tsx` reduced repetition across the many validation scenarios that all require a full form state.

## What Was Challenging
- **Testing invalid email format with `type="email"` inputs**: `userEvent.type` triggers HTML5 native constraint validation in JSDOM, which prevents the `submit` event from firing when the email is malformed. The workaround is to use `fireEvent.change` to set the value directly and `fireEvent.submit` on the `<form>` element to bypass the browser's built-in validation and reach the app-level `validate()` function.
- **Backend error test for login (401)**: The API client's 401 interceptor attempts a token refresh before propagating the error. Tests for the "invalid credentials" path need valid tokens stored (`setTokens`) so the interceptor can complete the refresh cycle (which also returns 401 with `_retried=true`), after which the `ApiError` is correctly surfaced to the component.
- **Auto-login after registration**: The MSW register handler accepts any email, but the MSW login handler only accepts specific credentials (`test@example.com`). The successful-registration test must use those same credentials, otherwise the implicit `login()` call after `register()` fails and the page stays on `/register`.

## Key Technical Insights
1. **`fireEvent` vs `userEvent` for constrained inputs**: `userEvent` simulates full browser input events including native HTML5 constraint validation. For `type="email"` inputs where you want to test app-level validation against a malformed value, use `fireEvent.change` + `fireEvent.submit` to bypass the browser gate.
2. **Two-step register+login flow**: After `register()` succeeds, the component calls `login()` with the same credentials to obtain tokens and populate the auth store. This means the component's error handler must cover both failures — a registration 409 and a subsequent login failure both surface through the same `catch` block. This is simpler than a dedicated "register and return tokens" endpoint but requires the MSW mock environment to have consistent credentials across both handlers.
3. **`role="alert"` for inline errors**: Rendering both field-level errors and the global error banner with `role="alert"` allows tests to use `getByRole('alert')` unambiguously for the banner and `findByText(...)` for field errors, keeping assertions semantically grounded.
4. **Hanging MSW handler for loading state**: `() => new Promise<never>(() => {})` keeps the request pending indefinitely, reliably capturing the `isSubmitting=true` state without race conditions.

## Reusable Patterns
- **Pure `validate()` function returning a partial error record**: keeps submit handler clean; pattern can be used for any form page.
- **`fillForm` async helper**: for multi-field forms with many test cases, extract a helper that types into all fields; reduces boilerplate and clarifies intent in individual test cases.
- **`renderPage()` wrapper**: wrapping `render` in a local helper with `MemoryRouter + AuthProvider + Routes` (including a `<LocationDisplay />` route at the redirect target) is the standard pattern for page-level component tests in this project.
- **`resetAuthStore()` + `clearTokens()` + `localStorage.clear()` in `beforeEach`**: always reset all three to guarantee test isolation; omitting any one can cause state leakage between tests.
- **`LocationDisplay` component**: reusable across all page tests to assert navigation without needing a full router mock.

## Files to Review for Similar Tasks
- `frontend/src/pages/LoginPage.tsx` — canonical example of client-side validation with field-level errors, loading state, and backend error display.
- `frontend/src/pages/__tests__/LoginPage.test.tsx` — canonical page test: rendering, client-side validation, loading, success redirect, backend errors.
- `frontend/src/pages/__tests__/RegisterPage.test.tsx` — extends the pattern with multi-field validation and a two-step async success flow.
- `frontend/src/mocks/handlers.ts` — MSW handlers; check accepted credentials and response shapes before writing tests against specific emails/payloads.
- `frontend/src/contexts/AuthContext.tsx` — `AuthProvider` wrapping requirement and the `pendingInit` pattern that must be accounted for in route guard tests.

## Gotchas and Pitfalls
- **`userEvent.type` on `type="email"` will not trigger submit if value is invalid** — use `fireEvent` to bypass HTML5 constraint validation when testing app-level email format errors.
- **MSW login handler is credential-specific** — the successful registration test must use `test@example.com / password123` (the credentials the default MSW handler accepts), not an arbitrary new email, or the auto-login step will fail and the test will hang or assert the wrong state.
- **401 interceptor requires stored tokens for the retry cycle** — when testing the "invalid credentials" backend error path on the login page, call `setTokens(mockTokens.access_token, mockTokens.refresh_token)` before rendering, or the interceptor will short-circuit before the error reaches the component.
- **Do not test navigation by checking `window.location`** — JSDOM does not implement navigation. Use the `<LocationDisplay />` + `data-testid="location"` pattern with `MemoryRouter` instead.
- **Confirm password validation edge case**: only show "Passwords do not match" when `password` is non-empty AND `confirmPassword` differs — otherwise the "Password is required" error fires first and "do not match" is misleading on an empty form.
```
