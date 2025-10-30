# E2E Tests for AdTool AI

## Setup

```bash
npm install
npx playwright install chromium
```

## Run Tests

```bash
# Run all tests
npx playwright test

# Run specific test
npx playwright test smoke.spec.ts

# Run with UI
npx playwright test --ui

# Debug mode
npx playwright test --debug
```

## Test Coverage

### Smoke Tests (`smoke.spec.ts`)
- ✅ Landing page loads with correct pricing
- ✅ Sidebar navigation structure
- ✅ Analytics page accessibility
- ✅ Performance metrics (LCP < 2s, no layout shifts)
- ✅ Feature gating (Quick-Post for Pro/Enterprise)
- ✅ Console error checks
- ✅ Responsive design (mobile)

## CI/CD Integration

Add to your GitHub Actions workflow:

```yaml
- name: Install Playwright
  run: npx playwright install --with-deps chromium

- name: Run E2E Tests
  run: npx playwright test

- name: Upload Test Results
  uses: actions/upload-artifact@v3
  if: always()
  with:
    name: playwright-report
    path: playwright-report/
```

## Performance Testing

Run Lighthouse CI:

```bash
npm install -g @lhci/cli
lhci autorun
```

Targets:
- Performance Score: ≥ 95
- LCP: < 2.0s
- CLS: < 0.05
