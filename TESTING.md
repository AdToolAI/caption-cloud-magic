# Testing Guide - Phase 29

## Overview

Phase 29 implements a comprehensive testing suite including:
- **Unit Tests** (Vitest)
- **E2E Tests** (Playwright)
- **Integration Tests** (Vitest + React Testing Library)
- **Visual Regression Tests** (Playwright Screenshots)
- **Performance Tests** (Lighthouse CI)
- **Load Tests** (k6)

## Setup

### 1. Install Dependencies
```bash
npm ci
npx playwright install --with-deps
```

### 2. Configure Test Environment
```bash
cp .env.test.example .env.test
# Edit .env.test with your test credentials
```

### 3. Create Test Admin User
```bash
npm run test:setup
```

## Running Tests

### All Tests
```bash
npm run test:all
```

### Unit Tests
```bash
npm run test:unit          # Run once
npm run test              # Watch mode
npm run test:coverage     # With coverage
```

### E2E Tests
```bash
npm run test:e2e          # Headless
npm run test:e2e:ui       # UI mode
npm run test:e2e:debug    # Debug mode
```

### Visual Tests
```bash
npm run test:visual
```

### Integration Tests
```bash
npm run test:integration
```

### Performance Tests
```bash
npm run test:performance
```

### Load Tests
```bash
npm run test:load
```

## Test Structure

```
tests/
├── e2e/                  # E2E tests
├── visual/               # Visual regression tests
├── fixtures/             # Test data and helpers
├── setup/                # Setup scripts
└── .auth/                # Playwright auth state
```

## CI/CD

Tests run automatically on:
- **Push to main/develop**: All tests
- **Pull Requests**: Unit + E2E + Visual
- **Weekly**: Load tests

## Cleanup

```bash
npm run test:cleanup
```
