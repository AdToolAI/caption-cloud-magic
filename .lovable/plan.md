## Launch-Readiness-Audit — Stand 29.07.2026

Backend läuft normal (Cloud healthy, public published). Ergebnis: **noch NICHT launch-ready** — es gibt drei harte Blocker in Security/Storage sowie mehrere schwerwiegende Performance- und SEO-Punkte. Unten die vollständige Befundliste, sortiert nach Schweregrad, plus konkrete Fix-Reihenfolge.

---

### 🔴 BLOCKER (vor Live-Gang beheben)

**B1 — Private Lipsync-Frames sind weltweit lesbar**
`lipsync-plates` Bucket privat, aber Policy `lipsync_plates_public_read` gibt `SELECT` an Rolle `public`. Jeder mit URL sieht Deepfake-Frames fremder Nutzer.
Fix: Policy droppen, ersetzen durch `auth.uid()::text = (storage.foldername(name))[1]` — analog `brand-characters`.

**B2 — Talking-Head-Renders vollständig öffentlich**
Bucket `talking-head-renders` ist `public=true`. Fertige KI-Videos mit Nutzergesicht/-stimme sind rateable/enumerierbar.
Fix: Bucket auf `private`, Auslieferung über `createSignedUrl(300)` in den 2 Consumer-Komponenten.

**B3 — Kritische Supply-Chain-Vulns**
`@huggingface/transformers 3.8.1` + `posthog-js 1.363.6` (protobufjs RCE, GHSA-xq3m-2v4x-88gg), `vitest 3.2.4` (GHSA-5xrq-8626-4rwp).
Fix: `bun update posthog-js @huggingface/transformers vitest` + `bun install --save-text-lockfile` → Scanner re-verifiziert.

---

### 🟠 HIGH (stark empfohlen vor Traffic-Peak)

**H1 — 289 DB-Linter-Findings**
- 2× `RLS Enabled No Policy` → Tabelle ist gelockt, aber genau das ist gefährlich wenn Frontend darauf schreiben soll → prüfen ob absichtlich.
- ~20× `Function Search Path Mutable` → `ALTER FUNCTION … SET search_path = public, pg_temp` in einer Sammel-Migration.
Fix: Eine Wartungs-Migration, die alle betroffenen Funktionen anpasst + fehlende Policies dokumentiert.

**H2 — Extreme Polling-Last auf pg_stat_statements**
Top-Queries im letzten Fenster:
- `ai_jobs`-Poll: **143 178 Calls**, 381 s Gesamtzeit
- `composer_scenes` Lipsync-Poll: **55 927 Calls**, 299 s
- `video_renders`-Poll: **143 178 Calls**, 176 s
Ursache: Frontend-Polling via React-Query statt Realtime; skaliert linear mit User-Anzahl.
Fix: Polling-Intervalle > 15 s hochziehen wenn kein aktiver Job, oder auf Supabase-Realtime umstellen (Channel besteht bereits für `useAIJobStatus`).

**H3 — `promo_codes.stripe_promo_id` an alle User geleakt**
Policy exponiert Stripe-interne IDs an jeden eingeloggten Nutzer → Coupon-Abuse-Vektor.
Fix: View `public.promo_codes_public` (nur `code, description, discount_pct, valid_until`), RLS für Basistabelle auf `service_role`.

**H4 — Stripe-Idempotency + Webhook-Signature-Check**
Bereits gemeldet als implementiert (v293), aber vor Launch nochmal 60-Sekunden-Verifikation der Edge-Function `stripe-webhook`: `constructEvent` gegen `STRIPE_WEBHOOK_SECRET`, Idempotency-Header auf allen `create_*`-Funktionen.

**H5 — SEO/Sitemap-Lücken**
- `public/sitemap.xml` enthält nur 7 URLs — fehlen: `/home`, `/hub/:hubKey` (dynamisch aus `hubs`-Tabelle), `/pricing`, `/faq`, `/legal/*`, `/status`.
- `og:image` auf Home ohne führenden `/`, `getCanonicalUrl` konstruiert malformed URLs.
- `public/llms.txt` fehlt.
- Google Search Console nicht verifiziert (`meta google-site-verification` Platzhalter noch im `index.html`).
Fix-Bundle: `scripts/generate-sitemap.ts` erweitern (dynamische Hubs), `src/config/seo.ts` reparieren, `public/llms.txt` anlegen, GSC-Token holen + meta setzen + verifizieren.

**H6 — Lighthouse LCP degradiert**
Grund: LCP-Bild ohne `fetchpriority="high"`, Google Fonts synchron geladen (7 Familien!).
Fix: Font-Preload auf `Playfair Display + Inter` reduzieren (Rest lazy), Hero-Image `fetchpriority="high"` + `decoding="async"`, WebP-Variante via `vite-imagetools`.

---

### 🟡 MEDIUM (Housekeeping, nicht launch-blockierend)

- **theme-color** in `index.html` ist `#8B5CF6` (lila) → sollte `#050816` (Bond-Deep-Black) sein.
- **372 `console.log`** in `src/` — via Vite-Plugin (`vite-plugin-remove-console`) im Production-Build strippen.
- **CSP** in `public/_headers` erlaubt `'unsafe-inline'` + `'unsafe-eval'` — dokumentieren warum (Vite HMR/Remotion), evtl. nonces für Production.
- **X-Frame-Options via `<meta>`** ist wirkungslos — Kommentar im `index.html` sagt es richtig, Redundanz entfernen.
- **491 Edge Functions** — Cold-Start-Risiko. Für die 20 kritischsten Live-Pfade (`stripe-webhook`, `create-checkout`, `lipsync-*`, `music-*`) Health-Ping-Cron einrichten.
- Scan-Timestamps sind veraltet (`up_to_date: false` überall) → nach den Fixes komplette Neu-Scan-Runde: `security--run_security_scan` + `seo_chat--trigger_scan` + `supabase--linter`.

---

### 🟢 GRÜN (bereits sauber)

- Cloud-Backend `ACTIVE_HEALTHY`, publish public.
- HSTS + CSP + Permissions-Policy in `_headers` gesetzt.
- Legal-Suite vollständig (`/legal/*`, AGB §8, AI-Refund-Policy).
- Founders-Coupon (`FOUNDERS_VIDEO_20`) verdrahtet.
- Music-Trim (letzter Turn) verifiziert.
- Auth-Flow inkl. HIBP-Check aktiv.

---

### Vorgeschlagene Ausführungs-Reihenfolge (in Build-Mode)

**Sprint 1 — Security-Blocker (~30 Min)**
1. Migration: `lipsync-plates` Policy härten.
2. Migration: `talking-head-renders` auf private + Consumer auf Signed-URL umstellen.
3. Migration: `promo_codes` View + RLS-Neuscoping.
4. `bun update` Trio + Lockfile → dependency-Scanner grün.

**Sprint 2 — Performance & DB-Hygiene (~45 Min)**
5. Migration: `search_path` für alle Funktionen setzen (Sammel-Migration).
6. `useAIJobStatus` / `useLipsyncStatus` / `useRenderStatus` auf Realtime umbauen, Fallback-Polling 30 s statt 2 s.
7. Stripe-Webhook + Idempotency-Verifikation.

**Sprint 3 — SEO/Perf für Launch-Traffic (~45 Min)**
8. Sitemap-Generator dynamisch (Hubs), `seo.ts` fixen.
9. `public/llms.txt` anlegen.
10. GSC-Verifikation (Token + Meta + verify + Sitemap-Submit).
11. Font-Preload verschlanken + Hero `fetchpriority`.

**Sprint 4 — Housekeeping**
12. theme-color, console-strip-plugin, edge-function-warmer.
13. Alle Scanner neu triggern und Findings als `fixed` markieren.

Nach Sprint 1–3 kann publiziert werden; Sprint 4 direkt danach ohne Downtime.

---

### Rückfrage vor Start

Soll ich **alle vier Sprints in einem Rutsch** durchziehen (rechne mit ~2 h Build-Zeit inklusive Migrationen und Re-Scans), oder willst du nur **Sprint 1 (Blocker)** und den Rest in separaten Runden freigeben?
