# Testing

- [Angular testing (TestBed, Karma to Vitest)](angular-testing.md) - Karma was deprecated (2023).
- [Cypress](cypress.md) - Cypress is still actively developed (v15 adds AI-assisted authoring, a command-log refresh, ESM and TS fixes), but its position shifted to runner-up behind Playwright for new e2e projects.
- [Jest](jest.md) - Jest 30 is faster and leaner with a modernized toolchain (jsdom 26, dropped legacy Node).
- [Playwright](playwright.md) - Playwright is the dominant modern end-to-end default, ahead of Cypress on satisfaction and adoption.
- [Testing Library (React + user-event)](testing-library.md) - From RTL 16, `@testing-library/dom` is a separate peer dependency you install explicitly, and RTL 16 supports React 19.
- [Vitest](vitest.md) - Vitest is the default test runner for Vite-based projects, having displaced Jest for new Vite, React, Vue, and Svelte work because it reuses the Vite config and transform pipeline and runs ESM and...
