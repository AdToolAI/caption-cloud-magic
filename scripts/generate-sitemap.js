/**
 * Dynamische Sitemap-Generierung für CaptionGenie
 * Wird beim Build automatisch ausgeführt
 */

import { writeFileSync } from 'fs';
import { resolve } from 'path';

// Base URL aus Environment Variable oder Fallback
const BASE_URL = process.env.VITE_BASE_URL || 'https://useadtool.ai';

// Öffentliche Routen mit SEO-Prioritäten
const routes = [
  {
    path: '/',
    priority: '1.0',
    changefreq: 'weekly',
    languages: ['de', 'en', 'es']
  },
  {
    path: '/pricing',
    priority: '0.9',
    changefreq: 'monthly',
    languages: ['de', 'en', 'es']
  },
  {
    path: '/faq',
    priority: '0.8',
    changefreq: 'monthly',
    languages: ['de', 'en', 'es']
  },
  {
    path: '/features',
    priority: '0.8',
    changefreq: 'monthly',
    languages: ['de', 'en', 'es']
  },
  {
    path: '/support',
    priority: '0.7',
    changefreq: 'monthly',
    languages: ['de', 'en', 'es']
  },
  {
    path: '/hook-generator',
    priority: '0.7',
    changefreq: 'weekly',
    languages: ['de', 'en', 'es']
  },
  {
    path: '/planner',
    priority: '0.7',
    changefreq: 'weekly',
    languages: ['de', 'en', 'es']
  },
  {
    path: '/calendar',
    priority: '0.6',
    changefreq: 'weekly',
    languages: ['de', 'en', 'es']
  },
  {
    path: '/analytics',
    priority: '0.6',
    changefreq: 'weekly',
    languages: ['de', 'en', 'es']
  },
  {
    path: '/privacy',
    priority: '0.3',
    changefreq: 'yearly',
    languages: ['de', 'en']
  },
  {
    path: '/terms',
    priority: '0.3',
    changefreq: 'yearly',
    languages: ['de', 'en']
  },
  {
    path: '/legal',
    priority: '0.3',
    changefreq: 'yearly',
    languages: ['de']
  },
];

// Generiere hreflang Links für Multi-Language Support
const generateHreflangLinks = (route) => {
  if (!route.languages || route.languages.length <= 1) return '';
  
  return route.languages.map(lang => {
    const hreflangUrl = lang === 'de' 
      ? `${BASE_URL}${route.path}`
      : `${BASE_URL}/${lang}${route.path}`;
    
    return `    <xhtml:link rel="alternate" hreflang="${lang}" href="${hreflangUrl}" />`;
  }).join('\n');
};

// Generiere Sitemap XML
const generateSitemap = () => {
  const lastmod = new Date().toISOString().split('T')[0];
  
  const urlEntries = routes.map(route => {
    const url = `${BASE_URL}${route.path}`;
    const hreflangLinks = generateHreflangLinks(route);
    
    return `  <url>
    <loc>${url}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority}</priority>
${hreflangLinks}
  </url>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urlEntries}
</urlset>`;
};

// Schreibe Sitemap in public Ordner
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
