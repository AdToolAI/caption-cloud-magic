# AdTool AI - Production-Ready Checklist

## ✅ PHASE 1: KRITISCHE FIXES (Abgeschlossen)

### Preis-Rundung (69.99 → 69.95)
- [x] `src/config/stripe.ts` korrigiert
- [x] `src/lib/intro.ts` korrigiert
- [x] `src/lib/translations.ts` (DE/EN/ES) korrigiert
- [x] `src/pages/Home.tsx` korrigiert
- [x] `src/pages/Pricing.tsx` korrigiert

### Feature Flags
- [x] Zentrale Feature Flags in `src/config/pricing.ts`
  - `ff_pricing_sst: true`
  - `ff_onboarding_v1: true`
  - `ff_quickpost_gate: true`
  - `ff_reco_card: true`
  - `ff_empty_states_v2: true`
- [x] `Stepper.tsx` nutzt zentrale Flags
- [x] `RecoCard.tsx` nutzt zentrale Flags

### Stripe LIVE Setup (Manuell erforderlich)
- [ ] USD Prices in Stripe Dashboard erstellen:
  - Basic: $14.99/month
  - Pro: $34.95/month
  - Enterprise: $69.95/month
- [ ] Price IDs in `src/config/stripe.ts` aktualisieren (Zeilen 12, 16, 20)
- [ ] Promo-Codes LIVE erstellen:
  - `START-BASIC` (EUR + USD)
  - `START-ENT` (EUR + USD)

---

## ✅ PHASE 2: QUALITÄTS-CHECKS (Abgeschlossen)

### i18n & UI
- [x] 404-Seite (`NotFound.tsx`) i18n-fähig mit `errorPages.404.*` Keys
- [x] ErrorBoundary (`ErrorBoundary.tsx`) i18n-fähig mit `errorPages.500.*` Keys
- [x] Translations für DE/EN/ES hinzugefügt
- [x] "Zurück zum Dashboard" Button in ErrorBoundary

### Performance-Tests (Manuell erforderlich)
- [ ] Lighthouse Audit ausführen:
  ```bash
  npm install -g @lhci/cli
  lhci autorun
  ```
  - Ziel: Desktop Score ≥95, LCP <2.0s, CLS <0.05
- [ ] Playwright Tests ausführen:
  ```bash
  npx playwright test
  ```
  - Alle 7 Smoke-Tests müssen grün sein

---

## ✅ PHASE 3: MONITORING-SETUP (Teilweise abgeschlossen)

### Health-Check Endpoints (Implementiert)
- [x] `health-ig` - Instagram API Health
- [x] `health-x` - X/Twitter API Health
- [x] `health-tt` - TikTok API Health
- [x] `health-li` - LinkedIn API Health
- [x] `health-yt` - YouTube API Health

**Integration in Uptime-Monitor (Manuell erforderlich):**
- [ ] UptimeRobot Account erstellen (oder ähnlichen Service)
- [ ] Monitors für folgende URLs einrichten:
  - `https://lbunafpxuskwmsrraqxl.supabase.co/functions/v1/health-ig`
  - `https://lbunafpxuskwmsrraqxl.supabase.co/functions/v1/health-x`
  - `https://lbunafpxuskwmsrraqxl.supabase.co/functions/v1/health-tt`
  - `https://lbunafpxuskwmsrraqxl.supabase.co/functions/v1/health-li`
  - `https://lbunafpxuskwmsrraqxl.supabase.co/functions/v1/health-yt`
- [ ] Alert-Schwellenwerte konfigurieren (z.B. 3 aufeinanderfolgende Fehler)

### Support-SLA Badge (Implementiert)
- [x] Support-SLA Card auf Account-Seite
  - Basic: Community-Support via Discord
  - Pro: Antwort innerhalb von 24 Stunden
  - Enterprise: Antwort innerhalb von 8 Stunden + Prioritäts-Support

### Event-Tracking (Manuell erforderlich)
Event-Tracking mit PostHog oder Amplitude einrichten:

**Zu trackende Events:**
```typescript
// 1. User-Lifecycle
analytics.track('signup_completed', { plan: 'basic' });
analytics.track('onboarding_step_completed', { step: 1 });
analytics.track('onboarding_finished', { duration_minutes: 5 });

// 2. Feature-Usage
analytics.track('first_post_scheduled', { platform: 'instagram' });
analytics.track('quick_post_triggered', { from: 'calendar' });
analytics.track('upgrade_clicked', { from_plan: 'basic', to_plan: 'pro' });

// 3. Subscription
analytics.track('subscription_started', { plan: 'pro', price: 34.95 });
analytics.track('subscription_cancelled', { plan: 'pro', reason: '...' });
```

**Setup-Schritte:**
1. [ ] PostHog/Amplitude Account erstellen
2. [ ] API Key als Secret hinzufügen
3. [ ] Analytics-Provider in `src/hooks/useAnalytics.ts` initialisieren
4. [ ] Events in kritischen User-Flows einfügen

---

## ⏳ PHASE 4: SICHERHEITS-AUDIT (Manuell erforderlich)

### PII-Logging Review
**Zu überprüfende Dateien:**
- [ ] Alle Edge Functions in `supabase/functions/*/index.ts`
- [ ] Frontend API-Calls in `src/hooks/*`, `src/pages/*`

**Was suchen:**
```javascript
// ❌ NIEMALS loggen:
console.log(user.email)
console.log(token)
console.log(password)
console.log(api_key)

// ✅ OK zu loggen:
console.log('User authenticated', { userId: user.id })
console.log('Token length:', token.length)
```

**Tools:**
```bash
# Suche nach verdächtigen Logs
grep -r "console.log.*email" supabase/functions/
grep -r "console.log.*token" supabase/functions/
grep -r "console.log.*password" supabase/functions/
```

### Upload-Limits testen
**Test mit `MediaUploader.tsx`:**
1. [ ] Datei >50MB hochladen → Fehlermeldung OK?
2. [ ] Ungültiger Dateityp (z.B. .exe) → Fehlermeldung OK?
3. [ ] Fehlermeldungen user-freundlich (Deutsch)?

**Erwartete Limits:**
- Max Dateigröße: 50MB
- Erlaubte Formate: .jpg, .jpeg, .png, .gif, .mp4, .mov
- Fehlermeldung: "Datei zu groß (max. 50MB)" statt "413 Payload Too Large"

### Enterprise Rate-Limits testen
**Test mit Postman/Bruno:**
1. [ ] 100 Requests/Minute an `generate-post` senden
2. [ ] Erwartetes Verhalten:
   - Basic: 429 "Rate limit exceeded" nach 10 Requests/Minute
   - Pro: 429 nach 50 Requests/Minute
   - Enterprise: 429 nach 200 Requests/Minute (nicht "unlimited"!)
3. [ ] Error-Response enthält `Retry-After` Header

**Code-Review:**
- [ ] `supabase/functions/generate-post/index.ts` hat Rate-Limit-Check
- [ ] `rate_limits` Tabelle wird korrekt befüllt
- [ ] Enterprise hat sinnvolles Limit (nicht `null` oder unbegrenzt)

---

## 📊 GO-LIVE CHECKLISTE

### Pre-Launch (1-2 Tage vorher)
- [ ] Alle Checkboxen oben ✅
- [ ] Lighthouse Report gespeichert (Score ≥95)
- [ ] Playwright Tests grün (7/7 passed)
- [ ] Health-Checks in UptimeRobot (alle grün)
- [ ] Stripe Live Mode aktiv + Promo-Codes gesetzt
- [ ] Sentry Projekt eingerichtet (optional)

### Launch Day
- [ ] robots.txt + sitemap.xml überprüfen
- [ ] Google Search Console: Sitemap einreichen
- [ ] "Edit with Lovable" Badge in Prod deaktiviert
- [ ] DSGVO/Cookie-Banner funktioniert
- [ ] Support-E-Mail (bestofproducts4u@gmail.com) monitoren

### Post-Launch (Erste 48h)
- [ ] Error-Rate in Sentry monitoren
- [ ] Conversion Funnel tracken (Signup → Onboarding → 1. Post)
- [ ] Support-Tickets kategorisieren (häufigste Probleme?)
- [ ] Uptime-Status checken (alle Health-Checks grün?)

---

## 🎯 SUCCESS METRICS (30 Tage nach Launch)

### North Star Metrics
- **Time-to-First-Value (TTFV):** < 10 Minuten
  - Von Signup bis 1. geplanter Post
- **Onboarding-Completion-Rate:** > 60%
  - Alle 5 Onboarding-Schritte abgeschlossen
- **Upgrade-Rate aus Quick-Post-Upsell:** > 25%
  - Von Basic → Pro wegen Auto-Planung

### Operational Metrics
- **Uptime:** ≥ 99.5% (30-Tage-Durchschnitt)
- **Support-Tickets pro 100 Signups:** < 15
- **Average Lighthouse Score:** ≥ 95
- **Error-Rate:** < 0.5% aller Requests

---

## 🛠️ OPTIONAL: WEITERE OPTIMIERUNGEN

### Security Headers (Vercel/Nginx)
```
Content-Security-Policy: default-src 'self'; img-src 'self' data: blob: https:; media-src 'self' blob: https:; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.* https://graph.facebook.com https://graph.instagram.com; frame-ancestors 'none'; base-uri 'self';
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```

### Pre-Rendering (SEO)
- React-Snap für statische Seiten (/, /pricing, /faq)
- Oder Migration zu Next.js für SSR (größerer Aufwand)

### Responsive Images
```html
<img 
  srcset="hero-400w.jpg 400w, hero-800w.jpg 800w, hero-1200w.jpg 1200w"
  sizes="(max-width: 600px) 400px, (max-width: 1200px) 800px, 1200px"
  src="hero-800w.jpg"
  alt="..."
/>
```

---

## 📞 SUPPORT

**Bei Problemen:**
1. History-View öffnen → Version vor Problem wiederherstellen
2. Troubleshooting Docs: https://docs.lovable.dev/tips-tricks/troubleshooting
3. Discord Community: https://discord.com/channels/1119885301872070706/1280461670979993613

---

**Stand:** 2025-01-30  
**Status:** 🟢 Production-Ready (nach Abschluss manueller Schritte)
