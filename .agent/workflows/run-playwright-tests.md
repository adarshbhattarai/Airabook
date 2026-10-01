---
description: How to execute and verify Playwright end-to-end tests for the Aira Book project.
---

### Playwright Test Execution Skill

Follow these steps to run Playwright tests and verify the results:

1.  **Verify Services**: Ensure that the frontend (http://localhost:5173) and backend (http://localhost:4000) are running.
2.  **Select Tests**: Identify relevant test files in the `e2e/` directory.
3.  **Run Specific Test**: Execute a specific test file using the following command:
    ```bash
    npx playwright test e2e/<test-file>.spec.mjs
    ```
4.  **Run All Tests**: Execute all tests using the following command:
    ```bash
    npm run test:e2e
    ```
5.  **Review Results**: 
    - Check the terminal output for "passed" or "failed".
    - If a test fails, review the `test-results/` directory or any generated screenshots.
6.  **Summary**: Provide a clear summary of the test results, including which tests passed and which failed.

### Common Pitfalls & Tips

- **Selectors**: 
    - The login page uses **placeholders** (e.g., `getByPlaceholder(/email address/i)`) instead of labels.
    - There are multiple sign-in buttons (e.g., "Sign in" and "Sign in with Google"). Use **`exact: true`** when targeting the primary "Sign in" button.
- **Environment Variables**:
    - Ensure `PLAYWRIGHT_EMAIL` and `PLAYWRIGHT_PASSWORD` are set.
    - Use `PLAYWRIGHT_BASE_URL=http://localhost:5173` to avoid connection issues on some systems.
- **Flakiness**:
    - Use `toBeVisible()` or other waiting assertions rather than `count()` if the page content loads dynamically.
- **Debugging**:
    - Use the `browser_subagent` to visually verify the page state if tests fail unexpectedly.
