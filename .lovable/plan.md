## Entscheidung
Auto-Eintrag des Dialog-Skripts wird **entfernt** — analog zum Voice-Konzept. Die KI plant weiterhin alles rundherum (Szenen, Sprecher-Slots, Timing, Location, Outfits, Continuity), aber der eigentliche Wortlaut kommt vom Kunden.

## Umsetzung

### 1. Skript nicht mehr automatisch setzen
Datei: `src/hooks/useApplyProductionPlan.ts`

- Beim Anwenden des Production Plans:
  - `dialog_script` wird als `null`/leer persistiert.
  - `dialog_turns` wird als leeres Array `[]` persistiert.
  - `dialog_mode` bleibt korrekt gesetzt (true, wenn Dialog-Szene geplant ist).
  - `character_shots`, `dialog_voices` (leer), Sprecher-Slots, Timing usw. bleiben erhalten.
- Keine `spokenTurns`-Ableitung, keine `ensureContinuousSceneDialogTurns`-Aufrufe, keine LITERAL-/AUTO-Rekonstruktion mehr im Apply-Pfad.

### 2. UI-Signal für den Kunden
Datei: `src/components/video-composer/SceneDialogStudio.tsx`

- Wenn `dialog_mode=true`, aber Skriptfeld leer ist, wird ein dezenter Hinweis angezeigt:
  „Skript eintragen — Sprecher und Timing wurden für dich vorbereitet."
- Sprecher-Slots (`character_shots`) und deren Anzahl bleiben sichtbar, damit der Kunde weiß, für wen er schreibt.

### 3. Studio-Zähler als Sicherheitsnetz härten
Datei: `src/components/video-composer/SceneDialogStudio.tsx`

- Der Header-Zähler (`Blöcke • Sprecher • ~Xs`) darf nicht auf `0` hängen bleiben, wenn sichtbarer Text existiert.
- Fallback-Parser erkennt jede Zeile im Format `Name: Text` als Block, auch wenn der Cast noch nicht vollständig aufgelöst ist.
- Sprecher, die im Text auftauchen aber (noch) nicht im `sceneCast` sind, werden temporär gezählt, damit die Anzeige nie „lügt".

### 4. Apply-Blockade endgültig entfernen
- „Plan anwenden" wird nicht mehr durch fehlende Voice-IDs oder fehlende Turns blockiert.
- Der Toast „X Lip-Sync-Szene(n) ohne Voice-ID" wird zu einem neutralen Hinweis statt einer Warnung.

### 5. Server-Aufräumen (defensiv)
Datei: `supabase/functions/briefing-deep-parse/index.ts`

- Der Server darf weiterhin ein vorgeschlagenes Skript ausliefern (für spätere Features/Analytics), aber der Client **nutzt** es nicht mehr für `dialog_script`/`dialog_turns`.
- Keine Änderungen an Sprecher-, Szenen-, Timing-, Location- oder Outfit-Erkennung.

## Was bleibt gleich
- Briefing-Analyse: Szenen, Sprecher, Timing, Locations, Outfits, Cast-IDs, Continuity, Voice-Pool-Vorschläge.
- Manuelle Voice-Zuordnung durch den Kunden.
- Lip-Sync-Pipeline, Render-Pipeline, alles Downstream.

## Was wegfällt
- Automatisch generierter Dialog-Text im Skriptfeld.
- Alle Fehlerklassen rund um „Meta-Zeilen als Dialog", „0 Blöcke trotz Text", „Plan blockiert wegen fehlender Turns".

## Erwartetes Ergebnis
Nach „Plan anwenden" sieht der Kunde: vorbereitete Szenen mit Sprecher-Slots, leerem Skriptfeld und klarem Hinweis, den Dialog selbst einzutragen. Sobald er tippt, zählt der Header korrekt. Stimmen ordnet er wie bisher manuell zu.