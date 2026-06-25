## Beobachtete Probleme

### 1) Szene 1 wird im Voiceover-Step schwarz, sobald Szene 2 dazukommt
- In `ComposerSequencePreview.tsx` resettet ein Effekt (`useEffect([playable])`) bei jeder Änderung der Szenen-Liste die Slot-Map (`slotMapRef = {A:-1,B:-1,C:-1}`), behält aber `slotASrcRef`/`slotBSrcRef`.
- `setSrcForSlot('A', sameUrl)` macht dadurch einen Early-Return (`src` unverändert), ruft also weder `el.load()` noch setzt `el.src` neu. Gleichzeitig wird Slot B mit Szene 2 geladen, was die Decoder-Pipeline kurz blockiert. Ergebnis: Slot A behält zwar Opacity 1, hat aber je nach Browser-State keinen dekodierten Frame mehr → schwarz.
- Außerdem wird beim Reset nicht erzwungen, dass Slot A wirklich Szene 0 zeigt (kein `el.currentTime = 0` + `el.load()` bei gleichem URL, kein Re-Sync mit `activeSlotRef = 'A'` falls vorher 'B' aktiv war).

### 2) Szenen sind immer 10 s, egal welche Länge eingestellt ist
- In `compose-video-clips/index.ts` (Zeile ~1124–1231) snappt die „Cinematic-Sync auto-extend"-Logik die Szenendauer immer auf **6 oder 10 s** (Hailuo-Grid), basierend auf der VO-Länge — die Slider-Auswahl des Users (z. B. 5 s) wird dabei überschrieben, sobald die VO länger als 6 s ist.
- Für HappyHorse (3–15 s frei wählbar) und i2v-Plates ohne VO darf das nicht passieren — dort sollte die User-Wahl gelten.
- Zusätzlich liefert `briefing-deep-parse` für AUTO-DIRECTOR-Pläne oft `durationSec` Defaults, die später (HappyHorse-Pfad) ebenfalls nicht respektiert werden, weil die Slider-Werte beim Re-Render durch den Auto-Extend wieder hochgezogen werden.

---

## Plan

### Fix A — Preview „Szene 1 schwarz" (`src/components/video-composer/ComposerSequencePreview.tsx`)
1. Im Reset-Effekt (`useEffect([playable])`) zusätzlich:
   - `slotASrcRef.current = undefined; slotBSrcRef.current = undefined; slotCSrcRef.current = undefined;`
   - `setOpacityForSlot('A', 1); setOpacityForSlot('B', 0);`
   - nach `preloadSlot('A', 0)` direkt `videoARef.current?.load()` + `currentTime = 0` erzwingen.
2. `preloadSlot` so ändern, dass es bei „same URL aber neuer Map-Slot" trotzdem `el.load()` triggert, damit der Decoder einen sichtbaren Frame hat (statt nur Early-Return).
3. `playable` als Dependency nur auf eine **stabile Signatur** (z. B. `playable.map(s => s.id + ':' + s.clipUrl).join('|')`) hashen, damit Re-Renders ohne tatsächliche Änderungen den Slot-Reset nicht unnötig auslösen.

### Fix B — Slider-Dauer respektieren (`supabase/functions/compose-video-clips/index.ts`)
1. Im Cinematic-Sync-Auto-Extend-Block (~Z. 1198–1231) nur noch dann auf 6/10 snappen, wenn `clipSource === 'ai-hailuo'`. Für `ai-happyhorse` stattdessen `targetDur = Math.min(15, Math.max(currentDur, Math.ceil(required)))`.
2. Wenn `voDur <= currentDur`, **gar nichts** verändern (User-Wahl ist King). Aktuell wird `fitDur = required <=6 ? 6 : 10` ohne diese Bedingung berechnet — also schon mit `currentDur >= voDur` werden 5 s auf 6 s gehoben, weil `Math.max(5, 6) = 6`. Fix: erst prüfen `if (required <= currentDur) return;`.
3. HappyHorse-Pfad (~Z. 3094): `const hhDuration = Math.min(15, Math.max(3, Math.round(scene.durationSeconds)))` bleibt — aber wir loggen explizit, wenn auto-extend vorher den Wert verändert hat, damit das nicht versteckt passiert.
4. UI-Hinweis in `SceneCard.tsx` ergänzen: Wenn `clipSource === 'ai-hailuo'` und Slider auf 5 s → kleiner Hinweis „Hailuo unterstützt nur 6 oder 10 s — wird auf 6 s gerundet".

### Verifikation
- Build + Edge Function Deploy.
- Manuell: 2 Szenen á 5 s anlegen (HappyHorse), beide rendern, dann Voiceover-Tab öffnen → Szene 1 muss sichtbar sein, Gesamtdauer = 10 s nicht 20 s.
- Hailuo + langer VO (8 s) → Szene wird auf 10 s erweitert, Log-Eintrag zeigt Begründung.

### Nicht angefasst
- Lipsync-Pipeline (`compose-dialog-segments` v169, Sync.so-Webhook, `compose-twoshot-audio`) bleibt unberührt — wir ändern nur die Auto-Extend-Vorstufe und den Preview-Renderer.
