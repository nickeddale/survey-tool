---
date: "2026-04-06"
ticket_id: "ISS-131"
ticket_title: "REL-02: Fix URL.createObjectURL memory leak in FileUploadInput"
categories: ["testing", "api", "ui", "refactoring", "bug-fix", "feature", "performance"]
outcome: "success"
complexity: "medium"
files_modified: []
---

```markdown
---
date: "2026-04-06"
ticket_id: "ISS-131"
ticket_title: "REL-02: Fix URL.createObjectURL memory leak in FileUploadInput"
categories: ["react", "memory-management", "frontend", "testing"]
outcome: "success"
complexity: "low"
files_modified: ["frontend/src/components/question-inputs/FileUploadInput.tsx", "frontend/src/components/question-inputs/__tests__/FileUploadInput.test.tsx"]
---

# Lessons Learned: REL-02: Fix URL.createObjectURL memory leak in FileUploadInput

## What Worked Well
- The useEffect closure pattern naturally handles both file-change revocation and unmount cleanup with a single return statement, eliminating the need for separate cleanup logic
- Mocking `URL.createObjectURL` and `URL.revokeObjectURL` directly on the global `URL` object (without `vi.stubGlobal`) was clean and non-destructive to other URL functionality
- Moving previewUrl population into useEffect (rather than a useState initializer) ensured the img tag only renders when a valid URL is available

## What Was Challenging
- Ensuring the dependency array includes `file` so that file changes without unmount also trigger cleanup — easy to miss and results in silent memory accumulation
- Distinguishing between cleanup on file-change vs. cleanup on unmount: the same closure-based useEffect handles both, but this must be verified with tests for both scenarios

## Key Technical Insights
1. The canonical cleanup pattern `useEffect(() => { if (!file) return; const url = URL.createObjectURL(file); setPreviewUrl(url); return () => URL.revokeObjectURL(url); }, [file])` revokes the captured `url` via closure on both re-render (new file) and unmount — no ref or manual tracking needed.
2. Blob URLs accumulate silently — there are no runtime errors until memory pressure becomes noticeable. Tests are the only reliable guard.
3. Setting previewUrl inside the useEffect (not as an initial useState value) prevents a render cycle where the img tag attempts to use a stale or undefined URL.
4. `vi.stubGlobal('URL', ...)` replaces the entire URL constructor, breaking `new URL(...)` calls elsewhere in the component tree. Always patch only the specific methods: `URL.createObjectURL = vi.fn()`.

## Reusable Patterns
- **Blob URL cleanup useEffect:**
  ```ts
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  ```
- **URL mock setup for Vitest (safe pattern):**
  ```ts
  beforeEach(() => {
    URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  ```
- **Assert revocation on unmount:**
  ```ts
  const { unmount } = render(<FilePreview file={mockFile} />);
  unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  ```
- **Assert revocation on file change:**
  ```ts
  const { rerender } = render(<FilePreview file={file1} />);
  rerender(<FilePreview file={file2} />);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  ```

## Files to Review for Similar Tasks
- `frontend/src/components/question-inputs/FileUploadInput.tsx` — reference implementation of blob URL lifecycle management
- `frontend/src/components/question-inputs/__tests__/FileUploadInput.test.tsx` — reference test patterns for URL mocking and revocation assertions

## Gotchas and Pitfalls
- **Never use `vi.stubGlobal('URL', ...)`** — replaces the entire URL global including the constructor, breaking `new URL(...)` usage anywhere in the render tree.
- **Dependency array must include `file`** — omitting it means the effect only runs on mount/unmount, allowing unreleased blob URLs to accumulate when the user changes the selected file without unmounting.
- **Do not initialize previewUrl with `URL.createObjectURL(file)` in useState** — this runs eagerly outside React's lifecycle, bypasses cleanup, and can result in the img rendering before the state is properly set.
- **Test both scenarios explicitly**: revocation on unmount AND revocation on file change. The useEffect closure handles both, but a test covering only unmount will miss leaks caused by file swaps.
- **`vi.restoreAllMocks()` in afterEach is required** — without it, the patched `URL.createObjectURL` persists across test files and can cause misleading assertion results in unrelated tests.
```
