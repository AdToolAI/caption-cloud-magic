# Template System Tests

This directory contains comprehensive tests for the Remotion template system.

## Test Structure

### Unit Tests
- **`DynamicCompositionLoader.test.ts`**: Tests for field mapping and transformations
  - `mapFieldsToProps`: Field mapping with various transformations
  - `applyTransformation`: Individual transformation functions
  - `getCompositionSettings`: Composition configuration

### Integration Tests
- **`integration/template-workflow.test.tsx`**: End-to-end workflow tests
  - Template selection to customization flow
  - Field mapping loading from database
  - Transformation application in context
  - State persistence across steps

### Component Tests
- **`__tests__/UniversalVideoCreator.test.tsx`**: UI workflow tests
  - Step navigation
  - Form validation
  - State management
  - User interactions

### E2E Tests
- **`e2e/template-system.spec.ts`**: Playwright browser tests
  - Full user workflows
  - Real browser interactions
  - Visual regression testing

## Running Tests

### All Tests
```bash
npm run test
```

### Watch Mode
```bash
npm run test:watch
```

### Coverage Report
```bash
npm run test:coverage
```

### E2E Tests
```bash
npm run test:e2e
```

## Test Coverage Goals

- **Unit Tests**: >90% coverage for transformation logic
- **Integration Tests**: Complete workflow coverage
- **E2E Tests**: Critical user paths

## Writing New Tests

### Unit Test Example
```typescript
import { describe, it, expect } from 'vitest';
import { mapFieldsToProps } from '../DynamicCompositionLoader';

describe('New Feature', () => {
  it('should transform field correctly', () => {
    const result = mapFieldsToProps(/* ... */);
    expect(result).toEqual(/* ... */);
  });
});
```

### Integration Test Example
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('Component Integration', () => {
  it('should integrate with other components', async () => {
    render(<YourComponent />);
    // Test integration behavior
  });
});
```

## Mocking

Common mocks are set up in `src/test/setup.ts`:
- Supabase client
- React Router
- IntersectionObserver
- ResizeObserver

## Debugging Tests

### VSCode Debug Configuration
```json
{
  "type": "node",
  "request": "launch",
  "name": "Vitest Debug",
  "runtimeExecutable": "npm",
  "runtimeArgs": ["run", "test", "--", "--run"],
  "console": "integratedTerminal"
}
```

### Browser Debugging (Playwright)
```bash
npm run test:e2e -- --debug
```

## CI/CD Integration

Tests run automatically on:
- Pull requests
- Main branch commits
- Pre-deployment checks

Minimum requirements:
- All unit tests pass
- Integration tests pass
- >80% code coverage
