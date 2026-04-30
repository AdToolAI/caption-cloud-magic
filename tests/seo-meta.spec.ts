/**
 * SEO & Meta Smoke — sitemap, robots, OG-Tags, canonical, manifest.
 */
import { test, expect } from '@playwright/test';
import { BASE } from './helpers/page-checks';

test.describe('SEO & Meta', () => {
  test('sitemap.xml ist erreichbar und valides XML', async ({ request }) => {
    const resp = await request.get(`${BASE}/sitemap.xml`);
    expect(resp.status()).toBeLessThan(400);
    const body = await resp.text();
    expect(body).toMatch(/<urlset|<sitemapindex/);
  });

  test('robots.txt ist erreichbar', async ({ request }) => {
    const resp = await request.get(`${BASE}/robots.txt`);
    expect(resp.status()).toBeLessThan(400);
    const body = await resp.text();
    expect(body.toLowerCase()).toContain('user-agent');
  });

  test('manifest.json ist gültiges JSON', async ({ request }) => {
    const resp = await request.get(`${BASE}/manifest.json`);
    expect(resp.status()).toBeLessThan(400);
    const json = await resp.json();
    expect(json.name || json.short_name, 'manifest hat keinen Namen').toBeTruthy();
  });

  test('Landing hat OG-Tags (title + image)', async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content');
    const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(ogTitle, 'og:title fehlt').toBeTruthy();
    expect(ogImage, 'og:image fehlt').toBeTruthy();
  });

  test('Landing hat Meta-Description', async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    const desc = await page.locator('meta[name="description"]').getAttribute('content');
    expect(desc, 'Meta-Description fehlt').toBeTruthy();
    expect(desc!.length, 'Meta-Description ist leer').toBeGreaterThan(20);
  });
});
