
Ziel: Keine Endlosschleifen mehr, echte Videos statt nur Smoke-Tests, und deutlich geringere externe Kosten pro Fehlversuch.

## Was die Analyse klar zeigt
- `video_renders` (Universal Creator): **262 Runs, 0 mit `renderOnly=true`** → der günstige Retry-Pfad wird praktisch nie genutzt.
- In den letzten 14 Tagen (ein User): extrem viele Fehlstarts, z. B. **86 Runs an einem Tag, 81 failed**, fast alle `rate_limit` / `AWS Concurrency limit reached`.
- Aktuell wird bei Fehlern faktisch immer wieder die Full-Pipeline gestartet (Script/Visuals/Voice neu) statt nur Render-Retry.

## Strategie (stabil + kosteneffizient + professionell)

### 1) Harte Stop-Loss-Guardrails auf Backend-Ebene (nicht nur Frontend)
**Warum:** Frontend-Retry allein reicht nicht, weil alte/abweichende Pfade weiterhin Full-Starts auslösen.

**Umsetzung:**
- In `auto-generate-universal-video`:
  - Wenn der letzte Fehler `rate_limit | timeout | lambda_crash` war und ein `lambdaPayload` existiert, **serverseitig Full-Start blocken** und **zwanghaft Render-Only** ausführen.
  - Maximalregeln serverseitig erzwingen:
    - `render_only_attempts <= 3`
    - `full_pipeline_restarts <= 1` pro Generation
    - Danach Status `capacity_cooldown` statt neuem Start.
- Ergebnis: Keine teuren Full-Loops mehr, selbst wenn Frontend/Cache abweicht.

### 2) Scheduling auf echte Kapazität ausrichten (statt starrer 168)
**Warum:** 60s/1800 Frames mit `framesPerLambda=168` erzeugt ~11 Lambdas; bei niedriger Account-Kapazität führt das reproduzierbar zu Rate-Limits.

**Umsetzung:**
- In `_shared/remotion-payload.ts`:
  - Adaptive Berechnung mit zwei Constraints:
    1. Timeout-Sicherheit (120s)
    2. Ziel-Parallelität (z. B. max 6–8 Lambdas für Produktionsprofil)
  - Für Retry-Profile zusätzlich:
    - Option `fps=24` (bei 60s: 1440 Frames statt 1800) zur deutlichen Entlastung bei kaum sichtbarem Qualitätsverlust.
- Ergebnis: Weniger parallele Lambdas, deutlich geringere 429-Quote.

### 3) Retry-Orchestrierung vereinheitlichen: Backend entscheidet, Frontend zeigt nur Status
**Warum:** Doppel-Logik in Realtime + Polling + mehreren Channels begünstigt Race Conditions und Schleifen.

**Umsetzung:**
- In `UniversalAutoGenerationProgress.tsx`:
  - Alte Realtime-Subscriptions beim Wechsel auf neue `progressId` **aktiv entfernen** (nicht nur Polling stoppen).
  - Auto-Retry nur noch auf explizite Backend-Signale (`errorCategory`, `capacity_cooldown`, `retry_allowed`).
  - Kein automatischer Full-Restart mehr bei Infrastrukturfehlern.
- Ergebnis: deterministisches Verhalten, kein “spukt weiter im Hintergrund”.

## Konkrete Implementierungsphasen

### Phase A (sofort, Stop-Loss)
1. Backend-Zwang auf Render-Only bei Infrastrukturfehlern.
2. `capacity_cooldown` Status + klare User-Meldung.
3. Frontend: bei `capacity_cooldown` nur manueller Retry-Button.

### Phase B (Stabilität)
1. Adaptive Scheduling (`framesPerLambda`, optional 24fps-Retry-Profil).
2. Kanal-/Polling-Entkopplung im Frontend (alte Channels schließen, stale events ignorieren).

### Phase C (Kostenkontrolle & Professionalität)
1. Versuchszähler und Ursache in `content_config`/`result_data` sauber persistieren.
2. Transparente Kosten-/Retry-Anzeige in Diagnosepanel:
   - Attempt Nr.
   - Retry-Typ (full vs render-only)
   - geplante Lambda-Anzahl
   - Abbruchgrund.

## Dateien für die Umsetzung
- `supabase/functions/auto-generate-universal-video/index.ts`
- `supabase/functions/_shared/remotion-payload.ts`
- `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`
- optional ergänzend:
  - `supabase/functions/check-remotion-progress/index.ts`
  - `supabase/functions/remotion-webhook/index.ts`
  (für `capacity_cooldown`/Retry-Metadaten konsistent durchreichen)

## Technische Details (wichtig)
- Primärproblem ist aktuell **nicht Qualität der Komposition**, sondern **Ausführungssteuerung**:
  - RenderOnly wird real nicht genutzt (0 Treffer in `video_renders`).
  - Starres Scheduling überfordert die verfügbare Parallelität.
- Qualität bleibt erhalten:
  - Kein Rückfall auf Smoke-Test-Profile für normale User.
  - Stabilitätsprofil greift nur für Render-Infrastruktur (z. B. 24fps Retry), nicht für kreative Inhalte.
- Erfolgskriterien:
  1. `renderOnly=true` erscheint bei Infra-Fehlern zuverlässig in `video_renders`.
  2. Keine unendlichen Full-Restarts.
  3. Deutlich weniger `rate_limit`-Fehler.
  4. Erste stabil abgeschlossene Produktionsvideos ohne Smoke-Test-Profil.
