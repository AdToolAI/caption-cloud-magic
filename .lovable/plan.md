## Problem

Der aktuelle Zustand hat zwei getrennte Fehlerquellen:

1. **Der Ladebalken startet zu hoch**
   - `usePipelineProgress` berechnet den Gesamtfortschritt aus allen sichtbaren Phasen.
   - Wenn nur Lip-Sync läuft, sind die Clip-Phasen durch alte/fertige Szenen praktisch schon „voll“, dadurch springt der Balken direkt auf ca. 60–77%.
   - Zusätzlich läuft der Soft-Floor monoton weiter und kann alte Läufe in den neuen Lauf hineintragen.

2. **Lip-Sync bleibt hängen**
   - Es gibt Szenen mit `twoshot_stage = master_clip` und `lip_sync_status = pending/null`, die nicht sauber weiterkommen.
   - Der Webhook-Auto-Trigger wurde deaktiviert, aber der clientseitige Trigger allein ist zu fragil: wenn der User den Tab verlässt, Realtime nicht sauber feuert oder der Poll nicht läuft, bleibt die Szene stehen.
   - Bei echten Sync.so-Jobs gibt es zwar `poll-twoshot-lipsync`, aber die UI behandelt lange Zwischenstände zu optimistisch und zeigt keinen klaren Fehler/Timeout.

## Plan

### 1. Progress-Balken nur für den aktuellen Lauf berechnen
- `usePipelineProgress.ts` so umbauen, dass ein neuer `clips:start`-Lauf bei **0%** beginnt.
- Bereits fertige Clips/alte Lip-Sync-Ergebnisse werden nur als Baseline behandelt und nicht in den neuen Fortschritt eingerechnet.
- Wenn der aktuelle Lauf nur Lip-Sync betrifft, darf die Anzeige nicht bei 60% starten, sondern ebenfalls bei 0% der aktuellen sichtbaren Operation.

### 2. Schritte erst bei echter Fertigstellung grün machen
- `PipelineProgressBar.tsx`/Hook-Status so synchronisieren:
  - „Clips“ grün nur, wenn alle im aktuellen Lauf betroffenen Clips fertig sind.
  - „Lipsync“ grün nur, wenn `lip_sync_status = done` und `lip_sync_applied_at` gesetzt ist oder `twoshot_stage = done`.
  - Bei `failed` kein grüner Zustand, sondern klarer Fehlerzustand.

### 3. Lip-Sync zuverlässig starten
- `useTwoShotAutoTrigger.ts` härten:
  - Szenen mit `twoshot_stage = master_clip` und `lip_sync_status = pending/null` werden sicher als Kandidaten erkannt.
  - Beim Trigger wird ein `lipsync:start` Event emittiert, damit der Storyboard-Balken sofort reagiert.
  - Der Kandidat wird nicht durch alte `twoshotStage`-Werte blockiert.

### 4. Backend-Webhook wieder sicher als Fallback nutzen
- `compose-clip-webhook` nicht einfach blind deaktiviert lassen, sondern als sicheren Fallback ausbauen:
  - Nach fertigem Cinematic-Sync-Clip wird Lip-Sync serverseitig angestoßen, wenn genug Daten vorhanden sind.
  - Die Lip-Sync-Funktion bekommt dafür einen internen, sicheren Aufrufpfad über Service-Kontext/Projekt-Owner statt User-JWT-Zwang.
  - Keine doppelten Jobs: wenn bereits `running`, `done` oder ein `sync:` Job existiert, wird nicht erneut gestartet.

### 5. Hängende Jobs sauber beenden oder wieder aufnehmen
- `useTwoShotAutoTrigger.ts` und `poll-twoshot-lipsync` so abstimmen:
  - `running + sync:<jobId>` wird weiter gepollt.
  - `running ohne sync:<jobId>` nach definierter Zeit wird auf `pending` zurückgesetzt und neu gestartet.
  - Provider-Fehler landen in `failed` mit sichtbarer Meldung statt endlosem Spinner.

### 6. Statusanzeigen im Szenenboard korrekt halten
- `SceneInlinePlayer.tsx` bleibt streng:
  - „Generiert“ nur nach finalem Clip plus fertigem Lip-Sync.
  - Während Clip fertig, aber Lip-Sync noch läuft: „Lip-Sync läuft“.
  - Bei Lip-Sync-Fehler: Fehlerbadge und kein grüner Haken.

## Betroffene Dateien

- `src/hooks/usePipelineProgress.ts`
- `src/components/video-composer/PipelineProgressBar.tsx`
- `src/hooks/useTwoShotAutoTrigger.ts`
- `src/components/video-composer/SceneInlinePlayer.tsx`
- `supabase/functions/compose-clip-webhook/index.ts`
- `supabase/functions/compose-twoshot-lipsync/index.ts`
- ggf. `supabase/functions/compose-lipsync-scene/index.ts`

## Erwartetes Ergebnis

- Der Ladebalken startet sichtbar bei **0%**, nicht bei 60–77%.
- Der Balken zeigt eine realistische 7–8-Minuten-Illusion, ohne alte fertige Arbeit einzurechnen.
- Fertige Steps leuchten erst dann grün, wenn sie wirklich abgeschlossen sind.
- Lip-Sync startet zuverlässig nach der Clip-Erstellung, auch wenn der Client-Poll kurz nicht greift.
- Hängende Lip-Sync-Jobs werden nicht endlos geladen, sondern weitergepollt, neu gestartet oder als Fehler markiert.