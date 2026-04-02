/**
 * Dynamische Sitemap-Generierung für AdTool AI
 * Wird beim Build automatisch ausgeführt
 */

import { writeFileSync } from 'fs';
import { resolve } from 'path';

const BASE_URL = process.env.VITE_BASE_URL || 'https://useadtool.ai';

// Nur öffentliche Seiten — keine Auth-geschützten App-Seiten
const routes = [
  { path: '/', priority: '1.0', changefreq: 'weekly' },
  { path: '/pricing', priority: '0.9', changefreq: 'monthly' },
  { path: '/faq', priority: '0.8', changefreq: 'monthly' },
  { path: '/features', priority: '0.8', changefreq: 'monthly' },
  { path: '/support', priority: '0.7', changefreq: 'monthly' },
  { path: '/legal/privacy', priority: '0.3', changefreq: 'yearly' },
  { path: '/legal/terms', priority: '0.3', changefreq: 'yearly' },
  { path: '/legal/imprint', priority: '0.3', changefreq: 'yearly' },
  { path: '/delete-data', priority: '0.3', changefreq: 'yearly' },
];

const generateSitemap = () => {
  const lastmod = new Date().toISOString().split('T')[0];

  const urlEntries = routes.map(route => {
    const url = `${BASE_URL}${route.path}`;
    return `  <url>
    <loc>${url}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority}</priority>
  </url>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`;
};

const sitemap = generateSitemap();
const outputPath = resolve(process.cwd(), 'public', 'sitemap.xml');

try {
  writeFileSync(outputPath, sitemap, 'utf-8');
  console.log('✅ Sitemap erfolgreich generiert:', outputPath);
  console.log(`📍 ${routes.length} URLs eingetragen`);
  console.log(`🌐 Base URL: ${BASE_URL}`);
} catch (error) {
  console.error('❌ Fehler beim Generieren der Sitemap:', error);
  process.exit(1);
}
