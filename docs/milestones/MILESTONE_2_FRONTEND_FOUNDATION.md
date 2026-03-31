# Milestone 2: Frontend Foundation

## Overview

This milestone establishes the React frontend application with authentication, navigation, and the core survey dashboard. It delivers a fully functional single-page application with user registration, login, JWT-based session management, and a survey list/dashboard page where users can view, create, and manage their surveys.

The frontend uses React 18 with TypeScript, Vite for building, TailwindCSS for styling, shadcn/ui for UI primitives, Zustand for state management, and Axios for API communication. By the end of this milestone, a user can register, log in, see their surveys in a paginated dashboard, and create or edit survey metadata -- all through a polished, responsive web interface.

This milestone also establishes the patterns and infrastructure (API client, stores, routing, layout, testing) that all subsequent frontend work will build upon.

## Prerequisites

- Milestone 1 (Backend Foundation) must be complete -- all auth and survey CRUD endpoints must be functional.

## Success Criteria

- `npm run dev` starts the Vite dev server and proxies API requests to the backend.
- User can register, log in, and see their dashboard.
- JWT tokens are stored securely and automatically refreshed before expiry.
- Protected routes redirect unauthenticated users to the login page.
- Survey list page shows paginated surveys with status badges and search/filter.
- Create/edit survey form works end-to-end with the backend.
- `npm test` passes all unit and integration tests.

## Architecture Notes

- **API client**: Single Axios instance in `src/api/client.ts` with request interceptor (attach JWT) and response interceptor (auto-refresh on 401).
- **State management**: Zustand stores with persist middleware for auth state (survives page refresh). Survey store for dashboard data.
- **Routing**: React Router v6 with a `ProtectedRoute` wrapper that checks auth state before rendering.
- **UI components**: shadcn/ui primitives (Button, Input, Dialog, Badge, Table, etc.) installed via CLI and customized with TailwindCSS.
- **Type safety**: TypeScript types in `src/types/` mirror backend Pydantic schemas exactly.

## Tasks

### Task 2.1: React + Vite + TypeScript Project Scaffolding
**Estimated Complexity:** Small
**Dependencies:** None

**Description:**
Initialize the frontend project using Vite with the React TypeScript template. Set up the `frontend/` directory with `package.json`, `tsconfig.json`, `vite.config.ts`, and `index.html`. Configure Vite to proxy `/api` requests to `http://localhost:8000` during development. Install core dependencies: React 18, React Router, TypeScript.

Create the basic `src/main.tsx` entry point and `src/App.tsx` root component with React Router setup. Create the `Dockerfile` for the frontend that builds the Vite app and serves it with nginx, with nginx configured to proxy `/api` to the backend service.

**Acceptance Criteria:**
- [ ] `npm install` completes without errors
- [ ] `npm run dev` starts the Vite dev server on port 3000
- [ ] API requests to `/api/*` are proxied to the backend
- [ ] `npm run build` produces a production build without errors
- [ ] TypeScript strict mode is enabled
- [ ] React Router is configured with a basic route structure

**Technical Notes:**
- `npm create vite@latest frontend -- --template react-ts`
- Vite proxy config in `vite.config.ts`: `server: { proxy: { '/api': 'http://localhost:8000' } }`
- Nginx config should proxy `/api` to `http://backend:8000` in Docker
- Files: `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/src/main.tsx`, `frontend/src/App.tsx`

---

### Task 2.2: TailwindCSS + shadcn/ui Setup and Theme
**Estimated Complexity:** Small
**Dependencies:** Task 2.1

**Description:**
Install and configure TailwindCSS with the project. Create `tailwind.config.ts` with the content paths pointing to `src/**/*.{ts,tsx}`. Set up the base CSS file with Tailwind directives. Initialize shadcn/ui using their CLI, which will set up the component library infrastructure, CSS variables for theming, and the `components.json` configuration.

Install the initial set of shadcn/ui components needed across the app: Button, Input, Label, Card, Badge, Dialog, DropdownMenu, Table, Tabs, Tooltip, Toast, Skeleton. Set up a consistent color theme and dark mode support via CSS variables.

**Acceptance Criteria:**
- [ ] TailwindCSS utility classes work throughout the application
- [ ] shadcn/ui components are available and render correctly
- [ ] A consistent color theme is defined via CSS variables
- [ ] Components are located in `src/components/ui/` (shadcn convention)
- [ ] The `cn()` utility function is available for conditional class merging

**Technical Notes:**
- `npx shadcn-ui@latest init` to set up the component infrastructure
- `npx shadcn-ui@latest add button input label card badge dialog dropdown-menu table tabs tooltip toast skeleton`
- TailwindCSS config should include shadcn's recommended presets
- Files: `frontend/tailwind.config.ts`, `frontend/src/index.css`, `frontend/components.json`

---

### Task 2.3: Axios API Client with Interceptors
**Estimated Complexity:** Medium
**Dependencies:** Task 2.1

**Description:**
Create the centralized API client in `src/api/client.ts` using Axios. Configure a base instance with `baseURL: '/api/v1'`. Add a request interceptor that attaches the JWT access token from the auth store to every request as `Authorization: Bearer <token>`. Add a response interceptor that detects 401 responses, attempts to refresh the token using the refresh token, retries the failed request, and redirects to login if refresh fails.

Create typed API modules: `src/api/auth.ts` (register, login, refresh, logout, getMe, updateMe, createApiKey, listApiKeys, deleteApiKey) and `src/api/surveys.ts` (createSurvey, listSurveys, getSurvey, updateSurvey, deleteSurvey, activateSurvey, closeSurvey, cloneSurvey).

**Acceptance Criteria:**
- [ ] API client automatically attaches JWT token to requests
- [ ] 401 responses trigger automatic token refresh and request retry
- [ ] If refresh fails, user is redirected to login and auth state is cleared
- [ ] Concurrent 401 responses only trigger one refresh (queue mechanism)
- [ ] All API functions are fully typed with TypeScript generics
- [ ] API errors are caught and normalized into a consistent format

**Technical Notes:**
- Use a flag/promise to prevent multiple simultaneous refresh attempts
- Token refresh flow: intercept 401 -> call refresh endpoint -> update store -> retry original request
- Each API module exports functions that return typed promises: `listSurveys(params): Promise<PaginatedResponse<Survey>>`
- Files: `src/api/client.ts`, `src/api/auth.ts`, `src/api/surveys.ts`

---

### Task 2.4: Zustand Store Setup (Auth and Survey Stores)
**Estimated Complexity:** Medium
**Dependencies:** Task 2.3

**Description:**
Create Zustand stores for application state management. The `authStore` in `src/store/authStore.ts` manages: `user` (UserResponse | null), `accessToken` (string | null), `refreshToken` (string | null), `isAuthenticated` (boolean), and actions: `login`, `logout`, `setTokens`, `setUser`. Use Zustand's `persist` middleware to save auth state to localStorage so sessions survive page refreshes.

Create the `surveyStore` in `src/store/surveyStore.ts` for the dashboard: `surveys` (Survey[]), `total` (number), `page` (number), `perPage` (number), `statusFilter` (string | null), `searchQuery` (string), and actions: `fetchSurveys`, `createSurvey`, `deleteSurvey`, `updateSurvey`.

**Acceptance Criteria:**
- [ ] Auth store persists tokens to localStorage and restores on page load
- [ ] `login` action calls the API, stores tokens, and fetches user profile
- [ ] `logout` action clears all auth state and localStorage
- [ ] Survey store fetches paginated surveys from the API
- [ ] Survey store supports filtering by status and searching by title
- [ ] Stores are fully typed with TypeScript interfaces
- [ ] Stores can be accessed from any component via hooks

**Technical Notes:**
- Zustand persist: `create(persist((set) => ({...}), { name: 'auth-storage' }))`
- Export custom hooks: `useAuthStore = create<AuthState>(...)` with selectors
- Survey store actions should call the API client functions from `src/api/surveys.ts`
- Files: `src/store/authStore.ts`, `src/store/surveyStore.ts`

---

### Task 2.5: Registration Page with Form Validation
**Estimated Complexity:** Medium
**Dependencies:** Task 2.4

**Description:**
Create `src/pages/RegisterPage.tsx` with a registration form containing fields for name, email, password, and password confirmation. Implement client-side validation: required fields, valid email format, minimum password length (8 characters), and password confirmation match. On successful registration, automatically log the user in and redirect to the dashboard.

Style the page with a centered card layout suitable for an auth page. Show validation errors inline below each field. Show API errors (e.g., "A user with this email already exists") in a toast or alert. Include a link to the login page for existing users.

**Acceptance Criteria:**
- [ ] Registration form validates all fields before submission
- [ ] Email field validates format (client-side)
- [ ] Password requires minimum 8 characters
- [ ] Password confirmation must match
- [ ] Successful registration logs the user in and redirects to dashboard
- [ ] API errors (409 conflict) are displayed to the user
- [ ] "Already have an account? Log in" link navigates to `/login`
- [ ] Form shows loading state during submission

**Technical Notes:**
- Use shadcn/ui Card, Input, Label, Button components
- Use React Router `useNavigate()` for programmatic navigation
- Call `authStore.login()` after successful registration (or register then auto-login)
- Route: `/register`
- Files: `src/pages/RegisterPage.tsx`

---

### Task 2.6: Login Page with JWT Handling
**Estimated Complexity:** Medium
**Dependencies:** Task 2.4

**Description:**
Create `src/pages/LoginPage.tsx` with a login form for email and password. On successful authentication, store the JWT access and refresh tokens in the auth store, fetch the user profile, and redirect to the dashboard (or the originally requested URL if redirected from a protected route).

Implement the token refresh logic: before the access token expires, proactively refresh it. Handle the case where both tokens are expired by redirecting to login. Style consistently with the registration page.

**Acceptance Criteria:**
- [ ] Login form accepts email and password
- [ ] Successful login stores tokens in auth store (persisted to localStorage)
- [ ] User is redirected to the dashboard after login
- [ ] Invalid credentials show an error message ("Invalid email or password")
- [ ] "Don't have an account? Register" link navigates to `/register`
- [ ] If user navigates to login while already authenticated, redirect to dashboard
- [ ] Form shows loading state during submission

**Technical Notes:**
- Call `POST /api/v1/auth/login` via `src/api/auth.ts`
- Store both `access_token` and `refresh_token` in authStore
- Fetch user profile with `GET /api/v1/auth/me` after storing tokens
- Route: `/login`
- Files: `src/pages/LoginPage.tsx`

---

### Task 2.7: Protected Route Wrapper and Auth Guard
**Estimated Complexity:** Small
**Dependencies:** Task 2.4

**Description:**
Create `src/components/layout/ProtectedRoute.tsx` that wraps route elements and checks authentication state before rendering. If the user is not authenticated, redirect to `/login` with the current URL as a `returnTo` query parameter so they can be redirected back after logging in.

Implement route configuration in `src/App.tsx` that uses `ProtectedRoute` for all dashboard/app routes while keeping `/login`, `/register`, and public survey response pages unprotected. Add a `NotFoundPage` for unmatched routes.

**Acceptance Criteria:**
- [ ] Unauthenticated users are redirected to `/login` when accessing protected routes
- [ ] The originally requested URL is preserved and restored after login
- [ ] Authenticated users accessing `/login` or `/register` are redirected to the dashboard
- [ ] `NotFoundPage` renders for unmatched routes
- [ ] Route configuration is centralized in `App.tsx`

**Technical Notes:**
- Use `useAuthStore(state => state.isAuthenticated)` to check auth
- Use React Router's `Navigate` component with `state` or query params for return URL
- Route structure: `/login`, `/register`, `/dashboard`, `/surveys/:id`, `/surveys/:id/builder`, etc.
- Files: `src/components/layout/ProtectedRoute.tsx`, `src/App.tsx`, `src/pages/NotFoundPage.tsx`

---

### Task 2.8: App Layout (Sidebar, Header, Navigation)
**Estimated Complexity:** Medium
**Dependencies:** Task 2.7

**Description:**
Create the `AppShell` layout component in `src/components/layout/AppShell.tsx` that provides the application frame: a collapsible sidebar on the left with navigation links, a top header bar with the user's name and a logout button, and a main content area. The sidebar should include links to: Dashboard, Settings, and (for future milestones) placeholder slots for Responses, Participants, etc.

Create `src/components/layout/Sidebar.tsx` for the navigation sidebar with icons, active state highlighting, and collapse/expand functionality. The layout should be responsive: sidebar collapses to icons on smaller screens, and uses a drawer on mobile.

**Acceptance Criteria:**
- [ ] AppShell renders sidebar + header + main content area
- [ ] Sidebar shows navigation links with icons and active state
- [ ] Header shows user name and a logout button/dropdown
- [ ] Logout clears auth state and redirects to login
- [ ] Sidebar is collapsible (toggle button)
- [ ] Layout is responsive (drawer on mobile, sidebar on desktop)
- [ ] All protected routes render inside the AppShell layout

**Technical Notes:**
- Use shadcn/ui DropdownMenu for the user menu in the header
- Navigation items: Dashboard (home icon), Settings (gear icon)
- Use React Router's `Outlet` for nested route content
- Wrap protected routes: `<ProtectedRoute><AppShell><Outlet /></AppShell></ProtectedRoute>`
- Files: `src/components/layout/AppShell.tsx`, `src/components/layout/Sidebar.tsx`

---

### Task 2.9: Survey List / Dashboard Page with Pagination
**Estimated Complexity:** Large
**Dependencies:** Task 2.8

**Description:**
Create `src/pages/DashboardPage.tsx` as the main landing page after login. It displays the user's surveys in a table or card grid with columns: title, status (with colored badges), question count, response count, created date, and actions (edit, clone, delete). Implement pagination controls, a status filter dropdown (All, Draft, Active, Closed, Archived), and a title search input.

Add a prominent "New Survey" button that opens a creation dialog. The page should show a skeleton loading state while fetching surveys and an empty state when no surveys exist yet. Implement delete confirmation with a dialog.

**Acceptance Criteria:**
- [ ] Dashboard fetches and displays surveys from `GET /api/v1/surveys` on load
- [ ] Surveys are shown with title, status badge, dates, and action buttons
- [ ] Status badges use distinct colors (draft=gray, active=green, closed=yellow, archived=red)
- [ ] Pagination controls navigate between pages
- [ ] Status filter dropdown filters the survey list
- [ ] Search input filters surveys by title (debounced, 300ms)
- [ ] "New Survey" button is prominently displayed
- [ ] Delete shows a confirmation dialog and refreshes the list after deletion
- [ ] Empty state shows a helpful message and create button
- [ ] Loading state shows skeleton placeholders

**Technical Notes:**
- Use the `surveyStore` to manage state; call `fetchSurveys()` on mount and filter changes
- Status filter maps to `?status=` query parameter on the API
- Search maps to `?search=` query parameter
- Use shadcn/ui Table, Badge, Button, Dialog, Input, Skeleton components
- Debounce search with a `useEffect` and `setTimeout` or a `useDebouncedValue` hook
- Files: `src/pages/DashboardPage.tsx`, `src/components/common/StatusBadge.tsx`, `src/components/common/DataTable.tsx`

---

### Task 2.10: Create/Edit Survey Modal
**Estimated Complexity:** Medium
**Dependencies:** Task 2.9

**Description:**
Create a dialog/modal component for creating and editing survey metadata. The form includes fields for: title (required), description, welcome message, end message, and default language. In edit mode, it pre-fills with existing survey data and calls `PATCH /api/v1/surveys/{id}`. In create mode, it calls `POST /api/v1/surveys`.

The modal should be triggered from the dashboard's "New Survey" button (create mode) and from survey action menus (edit mode). After successful creation, redirect to the survey builder page. After successful edit, refresh the dashboard list.

**Acceptance Criteria:**
- [ ] Create mode: empty form, "Create Survey" title, calls POST, redirects to builder on success
- [ ] Edit mode: pre-filled form, "Edit Survey" title, calls PATCH, refreshes list on success
- [ ] Title field is required; form cannot submit without it
- [ ] All fields are properly labeled and styled
- [ ] Modal can be dismissed with ESC key or clicking outside
- [ ] Error responses are shown to the user
- [ ] Submit button shows loading state

**Technical Notes:**
- Use shadcn/ui Dialog component
- Create a reusable `SurveyFormDialog` component that accepts `mode: 'create' | 'edit'` and optional `survey` prop
- On create success, navigate to `/surveys/{newId}/builder`
- Files: `src/pages/DashboardPage.tsx` (dialog integration), consider a `src/components/survey/SurveyFormDialog.tsx`

---

### Task 2.11: Survey Detail Page (Read-Only Structure View)
**Estimated Complexity:** Medium
**Dependencies:** Task 2.9

**Description:**
Create `src/pages/SurveyDetailPage.tsx` that displays a read-only view of a survey's full structure. Fetch the survey with `GET /api/v1/surveys/{id}?include=full` to get nested groups, questions, and options. Display the survey metadata (title, description, status, dates) at the top, followed by a hierarchical view of question groups containing their questions and answer options.

Include action buttons in the header: "Edit in Builder" (navigates to builder page), "Activate" / "Close" (status transition buttons, contextual to current status), "Clone", "Export", and "Delete". The page serves as the survey's overview/admin page.

**Acceptance Criteria:**
- [ ] Page fetches and renders the full survey structure including groups, questions, and options
- [ ] Survey metadata (title, description, status, dates) is displayed prominently
- [ ] Question groups are shown as collapsible sections with their questions
- [ ] Questions show type, code, title, required indicator, and answer options
- [ ] "Edit in Builder" button navigates to `/surveys/{id}/builder`
- [ ] Status transition buttons (Activate/Close) call the appropriate endpoints
- [ ] Clone creates a copy and navigates to the new survey's detail page
- [ ] Export downloads the survey JSON
- [ ] Loading and error states are handled

**Technical Notes:**
- Route: `/surveys/:id`
- Fetch with `include=full` query parameter for nested data
- Use collapsible sections (shadcn Accordion or custom) for groups
- Status transitions: call `POST /surveys/{id}/activate` or `/close`, then refresh
- Export: call `GET /surveys/{id}/export` and trigger a JSON file download
- Files: `src/pages/SurveyDetailPage.tsx`

---

### Task 2.12: Frontend Test Infrastructure
**Estimated Complexity:** Medium
**Dependencies:** Task 2.11

**Description:**
Set up the frontend testing infrastructure using Vitest and React Testing Library. Configure Vitest in `vite.config.ts` with jsdom environment. Install and configure `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, and `msw` (Mock Service Worker) for API mocking.

Create test utilities: a `renderWithProviders` helper that wraps components with necessary providers (Router, etc.), MSW handlers for common API endpoints (auth, surveys), and test fixtures for common data (user, survey objects). Write initial tests for: login flow, registration flow, protected route redirect, dashboard rendering, and survey CRUD operations.

**Acceptance Criteria:**
- [ ] `npm test` runs Vitest and all tests pass
- [ ] React Testing Library is configured with jest-dom matchers
- [ ] MSW intercepts API calls in tests with realistic mock responses
- [ ] `renderWithProviders` wraps components with Router and any required context
- [ ] Tests cover: login success/failure, registration, auth redirect, dashboard survey list
- [ ] Test fixtures provide typed mock data matching API response shapes
- [ ] Tests run in isolation (stores are reset between tests)

**Technical Notes:**
- Vitest config: `test: { globals: true, environment: 'jsdom', setupFiles: './src/test/setup.ts' }`
- MSW setup: `src/test/server.ts` with handlers, `src/test/setup.ts` to start/stop server
- Reset Zustand stores in `beforeEach`: `useAuthStore.setState(initialState)`
- Files: `frontend/src/test/setup.ts`, `frontend/src/test/server.ts`, `frontend/src/test/handlers.ts`, `frontend/src/test/utils.tsx`, `frontend/src/pages/__tests__/LoginPage.test.tsx`, `frontend/src/pages/__tests__/DashboardPage.test.tsx`
