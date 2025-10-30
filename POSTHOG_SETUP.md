# PostHog Analytics Setup

## Übersicht

PostHog ist integriert für Event-Tracking und User-Analytics. Die Integration ist **optional** und funktioniert automatisch, wenn ein API-Key konfiguriert ist.

## Setup-Schritte

### 1. PostHog Account erstellen

1. Registriere dich bei [PostHog](https://app.posthog.com/signup) (kostenlos bis 1M Events/Monat)
2. Erstelle ein neues Projekt

### 2. API Key erhalten

1. Gehe zu **Settings** > **Project** > **Project Settings**
2. Kopiere den **Project API Key** (beginnt mit `phc_...`)

### 3. API Key konfigurieren

**Option A: Lokale Entwicklung (.env Datei)**

Erstelle/bearbeite die `.env` Datei im Projekt-Root:

```env
VITE_POSTHOG_API_KEY=phc_your_api_key_here
```

**Option B: Production (Lovable Cloud)**

1. Öffne **Project Settings** in Lovable
2. Gehe zu **Environment Variables**
3. Füge hinzu:
   - Name: `VITE_POSTHOG_API_KEY`
   - Value: `phc_your_api_key_here`

## Getrackte Events

Die App trackt folgende Events automatisch:

### 1. `signup_completed`
**Wann:** Nach erfolgreicher Benutzer-Registrierung  
**Properties:**
- `plan`: 'free'
- `method`: 'email'

### 2. `first_post_scheduled`
**Wann:** Wenn ein User den ersten Post im Kalender erstellt  
**Properties:**
- `platform`: 'instagram' | 'tiktok' | 'linkedin' | 'facebook' | 'x'
- `from_generator`: boolean (kam Post vom Generator?)
- `has_tags`: boolean (hat der Post Tags?)

### 3. `upgrade_clicked`
**Wann:** Wenn User auf "Upgrade" klickt  
**Properties:**
- `from_plan`: 'free' | 'basic' | 'pro'
- `to_plan`: 'basic' | 'pro' | 'enterprise'
- `feature`: Name des Features, das das Upgrade auslöste

## Zusätzliche Events hinzufügen

Nutze die `trackEvent` Funktion aus `src/lib/analytics.ts`:

```typescript
import { trackEvent, ANALYTICS_EVENTS } from '@/lib/analytics';

// Einfaches Event
trackEvent(ANALYTICS_EVENTS.POST_GENERATED);

// Event mit Properties
trackEvent(ANALYTICS_EVENTS.BRAND_KIT_CREATED, {
  colors_count: 5,
  fonts_count: 2,
  has_logo: true
});
```

## User Identification

Identifiziere User beim Login für personalisierte Analytics:

```typescript
import { identifyUser } from '@/lib/analytics';

identifyUser(user.id, {
  email: user.email,
  plan: 'pro',
  signup_date: user.created_at
});
```

## Dashboard & Insights

Nach dem Setup kannst du in PostHog:
- **Dashboards** erstellen mit Key Metrics (Signups, Posts, Upgrades)
- **Funnels** analysieren (Signup → First Post → Upgrade)
- **Retention** tracken (wie viele User kommen zurück?)
- **Cohorts** bilden (z.B. "Power Users" mit >10 Posts)

## Privacy & DSGVO

PostHog ist DSGVO-konform:
- Daten werden in der EU gespeichert (EU Cloud)
- User können opt-out über Browser-Einstellungen
- Keine Cookies für Tracking nötig (localStorage)

## Troubleshooting

### Events erscheinen nicht
1. Überprüfe API Key in Console: `window.posthog`
2. Öffne Network Tab → Events sollten an `app.posthog.com` gehen
3. In Development ist Tracking deaktiviert (siehe `src/main.tsx`)

### Zu viele Events
Nutze PostHog's **Sampling** Feature in den Project Settings

## Kosten

- **Free Plan:** 1M Events/Monat kostenlos
- **Paid Plans:** Ab $0.00045/Event (sehr günstig)

## Support

- [PostHog Docs](https://posthog.com/docs)
- [PostHog Community](https://posthog.com/questions)
