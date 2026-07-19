## Analyse (bestätigt an DB-Row der fehlgeschlagenen Szene)

Zwei unabhängige Root Causes greifen zusammen — beide müssen sauber gelöst werden, sonst spielen wir Whack-a-Mole:

### Root Cause A — Aktionen werden nicht in den Server-Prompt eingespeist
- `composer_scenes.ai_prompt` enthält nur `[SceneAction]`, **kein `[CastActions]`**.
- `character_shots` enthält für alle 4 Rollen nur `{characterId, name, shotType}` — **kein `actionEn`/`actionUser`**.
- Der Marker-Block-Guard schützt zwar `[CastActions]` vor den Strippern, hilft aber nichts, wenn der Block gar nicht existiert.
- Folge: `compose-scene-anchor` extrahiert 0 CastActions → `asym=false` → Equal-Share Line-up → Personen stehen steif nebeneinander.

Das UI-Textfeld „Aktion — Was tut [Name]?" schreibt entweder in einen anderen Pfad (`actionBeat.characterAction`) oder wird beim Speichern der Szene nicht in die `character_shots[]`-JSONB-Slots gemergt.

### Root Cause B — Identity-Audit ist echt, nicht Falsch-Alarm
- 3 Anchor-Retries scheitern nachweisbar: `swap → swap → clone` (Matthew×2, Samuel fehlt).
- Zwei Cast-Mitglieder heißen „Samuel Dusatko" und „Matthew Dusatko" — laut Portrait offenbar ähnlich aussehende Brüder. Nano Banana 2 verwechselt sie stabil, auch mit Face-Lock.
- Die kleine Preview wirkt für das menschliche Auge ok, weil das Audit (Gemini Vision) auf Feindetails schaut, die im Thumb nicht auffallen.

## Umsetzung

### Fix A1 — Aktions-Wiring vom Client zum Server-Prompt
Ziel: sobald irgendwo in der Szene eine Aktion hinterlegt ist (Aktionsfeld, `character_shots[].actionEn/actionUser`, oder `action_beat.characterAction`), erreicht sie deterministisch `compose-scene-anchor`.

Serverseitig (`supabase/functions/compose-video-clips/index.ts`):
1. `ClipScene.characterShots[]`-Typ um `actionEn?/actionUser?` erweitern.
2. Neuer Helper `getSceneCastActions(scene)` sammelt Aktionen aus (Priorität):
   - `characterShots[].actionEn`/`actionUser` (falls vorhanden)
   - `action_beat.characterAction` (nur für Hauptcharakter → als Slot #1)
3. Neuer Helper `withServerCastActions(scene, prompt)`: prependet einen `[CastActions]\n- Name: action\n[/CastActions]`-Block, **falls der Prompt keinen enthält**.
4. Aufrufsites für Anchor + Master-Plate-Prompt nutzen den angereicherten Prompt.
5. Server persistiert den angereicherten `ai_prompt` zurück in `composer_scenes` (idempotent), damit die UI konsistent wird.

Clientseitig — separater Fix (nicht in diesem Plan):
- Sicherstellen, dass die UI-Aktionsfelder ausschließlich über `applyActionsToPrompt` schreiben; keine parallelen Pfade mehr. Prüfen in einem Folge-Task.

### Fix A2 — Line-up-Prompt entschärfen, wenn Aktionen vorhanden sind
- `neutralTwoShotPrompt` bekommt eine `asymmetric`-Option.
- Trigger: irgendein CastAction-Text enthält Keywords wie `phone`, `typing`, `printer`, `background`, `foreground`, `leaning`, `window`, `standing`, `desk`, `walking`, `sitting`.
- Wenn ja: für 3+ Personen wird kein starres horizontales Line-up mehr erzwungen. Stattdessen: „natürliches Blocking, Vordergrund/Mittelgrund/Hintergrund erlaubt, jede Person genau einmal, Gesichter lip-sync-tauglich sichtbar".
- `compose-scene-anchor` erkennt Asymmetrie bereits (v14, `ASYM_RE`) — hier wird nur der Parallel-Pfad in `compose-video-clips` (Master-Plate) angeglichen.

### Fix B1 — Identity-Audit robuster gegen ähnlich aussehende Cast
`supabase/functions/_shared/identity-audit.ts` und Retry-Logik in `compose-video-clips`:
1. Nach dem 3. gescheiterten Versuch **loggen** wir eine „similar-cast"-Diagnose (Family-Name-Match zwischen mismatched Namen).
2. Anstatt hart zu blocken, aktivieren wir einen **kontrollierten Escape-Path**:
   - Wenn `attempt-3` immer noch `clone`/`swap` liefert **UND** faces=N und humans=N (also headcount ok) **UND** alle Cast-Portraits vorhanden sind → Szene wird **nicht hart abgebrochen**, sondern mit `twoshot_stage='anchor_soft_pass'` und einer Warnung in `clip_error` als „Warnung: Cast-Ähnlichkeit erkannt, bitte Anchor prüfen" weitergefahren.
   - Der User bekommt in der UI eine „Anchor prüfen"-Karte mit Preview + „Trotzdem fortfahren" / „Portraits tauschen" / „Neu rendern"-Buttons.
3. Kein automatischer Credit-Abbuchungs-Fall: Soft-Pass läuft nur, wenn der Anchor tatsächlich N Gesichter zeigt.

### Fix B2 — Präventiv: Identity-Card-Prompt für ähnliche Namen schärfen
Für Cast-Mitglieder mit identischem Nachnamen oder Family-Name-Match:
- `compose-scene-anchor` injiziert einen zusätzlichen Distinguish-Block: „Samuel Dusatko and Matthew Dusatko are DIFFERENT people despite the shared surname — do not merge their faces, preserve each unique facial geometry from their individual reference portraits".
- Erhöht die Chance, dass Nano Banana beide getrennt hält, bevor überhaupt ein Retry nötig wird.

## Akzeptanzkriterien

1. Eine 4-Personen-Szene mit ausgefüllten Aktionsfeldern (auch aus Auto-Director) erzeugt einen `ai_prompt` mit gefülltem `[CastActions]`-Block. Log: `extracted N cast actions, asymmetric=true`.
2. Kein hartes Line-up mehr in Master-Plate/Anchor-Prompt, sobald Aktionen mit asymmetrischen Keywords vorhanden sind.
3. Bei drei aufeinanderfolgenden Identity-Fails mit korrekter Face-Count wird die Szene nicht mehr blockiert — der User bekommt eine handlungsfähige „Anchor prüfen"-Karte.
4. Der neue Distinguish-Block reduziert Retry-Rate bei Family-Name-Cast messbar (Log-Metric).
5. Keine Regression: bestehende Szenen ohne Aktionen verhalten sich exakt wie vorher (Marker-Block-Guard bleibt, Equal-Share-Framing bleibt Default).

## Nicht enthalten (bewusst)

- Kein UI-Rework der Aktionsfelder in diesem Plan — der Serverseitige Enrichment-Pfad greift für alle Quellen (Auto-Director, manuelle Eingabe, Import).
- Kein automatischer Credit-Refund für vergangene identity-Fails — nur der Fix nach vorne.
- Kein neuer Cache-Bump für `scene_anchor_cache` — die Signatur enthält bereits CastActions + `asym`-Flag (v16).

## Aufwand

- `supabase/functions/compose-video-clips/index.ts`: ~40–60 Zeilen (Types, 2 Helpers, 1 asymmetric-Option, Soft-Pass-Zweig).
- `supabase/functions/compose-scene-anchor/index.ts`: ~15 Zeilen (Family-Name-Distinguish-Block).
- `supabase/functions/_shared/identity-audit.ts`: optional Family-Name-Detection-Utility.
- Frontend: minimale UI-Karte für Soft-Pass (kann in Folge-PR gehen; Backend meldet den Zustand bereits sauber).
- Zwei Edge-Function-Deploys (`compose-video-clips`, `compose-scene-anchor`).
- Keine DB-Migration.