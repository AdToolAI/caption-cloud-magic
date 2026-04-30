/**
 * Public Pages Smoke — prüft alle öffentlich zugänglichen Routen.
 * Loop-basiert, jede Route ist eigener Test → klare Fehlermeldungen im Cockpit.
 */
import { test } from '@playwright/test';
import { assertPageHealthy } from './helpers/page-checks';

const PUBLIC_ROUTES: Array<{ path: string; allowMissingHeading?: boolean }> = [
  { path: '/' },
  { path: '/pricing' },
  { path: '/faq' },
  { path: '/auth' },
  { path: '/forgot-password' },
  { path: '/legal/privacy' },
  { path: '/legal/terms' },
  { path: '/legal/imprint' },
  { path: '/coming-soon' },
  { path: '/delete-data' },
];

test.describe('Public Pages Smoke', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route.path} rendert sauber`, async ({ page }) => {
      await assertPageHealthy(page, route.path, {
        allowMissingHeading: route.allowMissingHeading,
      });
    });
  }
});
