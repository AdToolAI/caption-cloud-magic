## Problem

`Kampagne generieren` schlägt mit "Edge Function returned a non-2xx status code" fehl. Edge-Function-Logs zeigen zwei zusammenhängende Bugs:

1. **`campaigns.user_id` NOT NULL Violation** — Die Function erstellt den Service-Role-Client **ohne** das User-JWT weiterzugeben. Deshalb liefert `supabase.auth.getUser()` `null`, und der Insert in `campaigns` setzt `user_id = null` → Constraint-Verletzung (heute nur als Warning geloggt).
2. **`idx_calendar_events_content_hash` Unique Violation (23505)** — Beim zweiten Versuch (gleicher Workspace + gleiches Template) erzeugen die Events identische `content_hash`-Werte (vermutlich aus `workspace_id + title + brief` via DB-Trigger). Das bricht den Insert komplett ab → 500.

## Lösung

### 1. `supabase/functions/calendar-campaign-generate/index.ts`

- **Auth-User korrekt ermitteln**: Authorization-Header lesen, zweiten Supabase-Client mit `global.headers.Authorization` erzeugen und `getUser()` darauf aufrufen. User-ID dann beim `campaigns.insert` mitgeben. Wenn kein User → 401.
- **Eindeutigkeit der Events sicherstellen**, damit `content_hash` nicht kollidiert:
  - Beim Aufbau jedes `eventData` einen unsichtbaren Eindeutigkeits-Marker an `brief` anhängen, z.B. ` \u200B[cmp:${campaignId}#${index}]` (Zero-Width-Space + Kampagnen-ID + Index). Damit ändert sich der gehashte Content pro Kampagnen-Run, der Text bleibt für den User unverändert.
  - Fallback: Wenn `campaignId` null ist, `crypto.randomUUID()` als Marker verwenden.
- **Saubere Fehlerausgabe**: Bei `eventsError` Code/Details strukturiert zurückgeben (statt nur `throw`), damit das Frontend eine lesbare Meldung statt "non-2xx" zeigt. Wenn `campaign`-Insert fehlschlägt → 500 mit klarer Message (nicht mehr "non-critical").

### 2. Kein DB-Migrations-Bedarf

Der Unique-Index bleibt bestehen (dient anderem Dedup-Zweck im Planner). Wir umgehen ihn nur sauber, indem pro Kampagnen-Run unterschiedlicher Content erzeugt wird.

### 3. Frontend (`CampaignTemplateDialog.tsx`) — keine Änderung nötig

Der bestehende `try/catch` zeigt bereits `error.message` an, sobald die Function strukturierte Fehler statt 500 zurückgibt.

## Out of Scope

- Refactor des `campaigns`-Schemas oder des `calendar_events`-Hash-Triggers.
- Andere Templates/Flows.
