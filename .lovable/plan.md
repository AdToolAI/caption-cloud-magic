# Public Status Page — Stage 1 (dezent integriert)

Eine kunden-freundliche, öffentlich zugängliche Status-Page unter `/status`, die Live-Daten aus Synthetic Probes, Lambda Health und manuellen Incidents auf 6 kunden-relevante Komponenten aggregiert. **Keine prominente Verlinkung** auf der Startseite — Zugang nur dezent über Einstellungen + direkten URL-Aufruf.

## Was der Kunde sieht

```text
┌─────────────────────────────────────────────────────┐
│  ● All Systems Operational                          │
│  Last checked: 2 min ago                            │
├─────────────────────────────────────────────────────┤
│  [Banner: Manual Incident, falls aktiv]             │
├─────────────────────────────────────────────────────┤
│  Component                Status        90d Uptime  │
│  ─────────────────────────────────────────────────  │
│  ● Web App & Login        Operational   99.94%  ▁▂▁ │
│  ● Database               Operational   99.99%  ▁▁▁ │
│  ● Video Rendering        Operational   99.71%  ▁█▁ │
│  ● AI Generation          Degraded      99.52%  ▁▃▁ │
│  ● File Storage           Operational   99.98%  ▁▁▁ │
│  ● Social Publishing      Operational   99.85%  ▁▁▂ │
├─────────────────────────────────────────────────────┤
│  Past Incidents (last 30 days)                      │
│  • 2026-04-28 — Replicate API degraded (resolved)   │
└─────────────────────────────────────────────────────┘
```

Status-Levels: `Operational` (grün), `Degraded` (gelb), `Partial Outage` (orange), `Major Outage` (rot).

## Wo die Page verlinkt wird (dezent)

- **NICHT** im globalen Footer, **NICHT** auf Landing/Dashboard.
- **Settings → Help & Support**: Neue Sektion "System Status" mit kleinem Live-Status-Dot + Link zu `/status`.
- **Auth-Page (Login/Signup)**: Mini-Indikator unten rechts ("● All systems operational" / "● Service issue") — nur sichtbar wenn `degraded` oder schlechter, sonst stumm. Begründung: bei Login-Problemen schauen Kunden zuerst hier.
- **Direkter URL-Aufruf**: `/status` ist öffentlich erreichbar, indexierbar (kann später für Sales/Trust-Gespräche geteilt werden).

## Komponenten-Mapping (Probe → Kunde)

| Kunden-Komponente | Datenquelle | Logik |
|---|---|---|
| Web App & Login | `synthetic_probe_runs`: `landing_page`, `auth_endpoint` | beide pass = green; einer fail in letzter Stunde = degraded |
| Database | `synthetic_probe_runs`: `db_read_latency` | pass = green; >threshold = degraded |
| Video Rendering | `lambda_health_recent` (failure_rate_1h) | <2% = green; 2-10% = degraded; >10% = outage |
| AI Generation | `synthetic_probe_runs`: `edge_generate-caption` + `edge_check-subscription` | analog |
| File Storage | `synthetic_probe_runs`: `storage_endpoint` | analog |
| Social Publishing | manuell (Stage 1) — Default green; via Incident-Toggle setzbar | Auto-Detection in Stage 2 |

## Was gebaut wird

### 1. Neue Tabelle: `status_incidents`

Manuell von Admins gepflegt für externe Provider-Outages (Replicate, HeyGen, Meta, etc.) die nicht automatisch erkannt werden.

```sql
create table public.status_incidents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  affected_components text[] not null default '{}',
  severity text not null check (severity in ('degraded','partial_outage','major_outage')),
  status text not null default 'investigating' check (status in ('investigating','identified','monitoring','resolved')),
  started_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.status_incidents enable row level security;
create policy "Public can read incidents" on public.status_incidents for select using (true);
create policy "Admins can manage incidents" on public.status_incidents for all
  using (public.has_role(auth.uid(), 'admin'));
```

### 2. Edge Function: `public-status` (no JWT, public)

- `verify_jwt = false` in `supabase/config.toml`
- 60s in-memory Cache (verhindert DB-Hammering)
- Aggregiert aus `synthetic_probe_runs` (60min für Status, 90 Tage für Uptime), `lambda_health_recent`, `status_incidents` (active + last 30d resolved)
- Returnt schlankes, kunden-freundliches JSON — **keine internen Probe-Namen, keine Latenz-Zahlen, keine Error-Messages**:
  ```json
  {
    "overall": "operational",
    "updated_at": "...",
    "components": [{"key":"video_rendering","name":"Video Rendering","status":"operational","uptime_90d":99.71,"sparkline":[100,100,99.5,...]}],
    "active_incidents": [...],
    "past_incidents": [...]
  }
  ```

### 3. Public Page: `src/pages/Status.tsx`

- Route in `App.tsx` ohne Auth-Wrapper, ohne Sidebar-Layout (eigenständig, accessible auch ohne Login)
- React-Query mit `refetchInterval: 60_000`, `staleTime: 30_000`
- James-Bond-2028-Design (deep black, gold accents, glassmorphism) aber **bewusst zurückhaltend** — Status-Pages sollen ruhig wirken
- Komponenten:
  - `StatusHeader` (Overall-Badge + Last-Checked)
  - `IncidentBanner` (nur wenn `active_incidents.length > 0`)
  - `ComponentRow` × 6 (Name, Status-Dot, 90d-Uptime %, 90-Tage-Sparkline)
  - `PastIncidentsList` (collapsible)
  - Footer mit Link zurück zur App

### 4. Settings-Integration (dezent)

In `src/pages/Account.tsx` (oder Settings-Equivalent) eine kleine neue Karte **"System Status"** unter "Help & Support":
- Live-Dot (grün/gelb/rot) via gleichem `public-status` Endpoint
- Text: "All systems operational" / "Service degraded — view details"
- Sekundär-Button: "Open Status Page" → `/status`

### 5. Auth-Page Mini-Indikator (nur bei Issues)

In `Auth.tsx` (Login/Signup) ein kleiner Status-Indikator unten rechts:
- **Stumm** wenn `operational` (kein UI-Element sichtbar)
- **Sichtbar** wenn `degraded` / `outage` mit Link auf `/status`
- Verhindert Support-Tickets bei Login-Problemen während Outages

### 6. Admin-UI: Incident Manager

Neuer Tab im bestehenden `/admin/qa-cockpit` (passt thematisch zu Watchdog/Probes):
- Liste aktiver Incidents
- "New Incident" Dialog: Title, Severity, betroffene Komponenten (Multi-Select), Description
- "Resolve" Button setzt `resolved_at = now()`, `status = 'resolved'`

## Was bewusst NICHT in Stage 1 ist

- E-Mail/Push-Subscriptions auf Status-Updates → Stage 2
- RSS-Feed → Stage 2
- Externes Hosting für "wenn-Supabase-down"-Fallback → Stage 2
- Auto-Detection für Replicate/HeyGen-Outages → Stage 2
- Incident-Update-Timeline (mehrere Posts pro Incident) → Stage 2
- Footer-Link / Landing-Verlinkung → bewusst weggelassen, Startseite bleibt clean

## Sicherheit

- `public-status` öffentlich, gibt nur **aggregierte** Daten zurück — keine internen Details.
- RLS auf `status_incidents`: SELECT public, Mutationen nur Admin via `has_role()`.
- 60s Cache schützt vor Abuse.

## Geschätzter Umfang

1 Migration, 1 Edge Function, 1 Public Page, 1 Settings-Karte, 1 Auth-Indikator, 1 Admin-Tab. Realistisch in einem Durchgang machbar.