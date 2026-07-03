## Was gefixt wird

1. **Studio-Sidebar schneidet Text ab** (Screenshot: „chladen", „bliothek", „the Magic")
2. **Preview-Player ruckelt am Szenen-Übergang** — Bild UND Musik pausieren kurz, obwohl der Export inzwischen sauber ist

Beide sind reine Frontend/Preview-Fixes. Render-Pipeline und Export bleiben unangetastet.

---

## Fix 1 — Sidebar-Spalte

**Ursache:** `PanelDivider` erlaubt aktuell `min={56}` für die linke Library-Spalte (`CapCutEditor.tsx:2589`). Bei ~140 px Breite reicht der Platz nicht mehr für die Inhalte, und die Panels (`CutPanel`, `LookPanel`, `FXPanel`, `ExportPanel`, `CapCutSidebar` selbst) verwenden an mehreren Stellen `truncate` / `whitespace-nowrap`, wodurch Text hart abgeschnitten wird statt umzubrechen.

Der User will explizit: **„lieber in die Länge ziehen als zu breit werden"** — d. h. Text soll umbrechen und die Liste soll vertikal weiterlaufen (Scrollbar), nicht horizontal abgeschnitten werden.

**Änderungen:**

- `src/components/directors-cut/studio/CapCutEditor.tsx` (Zeile 2589)
  - `min={56}` → `min={280}` für die Library-Sidebar. `56` bleibt nur der Wert für den *collapsed*-Rail (der separat über `sidebarCollapsed` mit `width: 56` gerendert wird, siehe Zeile 2354). Der Resize-Griff soll den User nie unter eine lesbare Breite ziehen lassen.
  - Default-Width in `useState`-Initializer (Zeile 234) auf min. 320 clampen, falls localStorage einen kleineren Wert enthält.

- `src/components/directors-cut/studio/CapCutSidebar.tsx`
  - Zeilen 208, 209, 500, 1686: `truncate` → `break-words` (bzw. `line-clamp-2` bei Track-Namen), damit lange Namen (Songs, Voiceovers, Datei-Uploads) umbrechen statt abgeschnitten zu werden.
  - Zeile 1616: `overflow-x-auto` bleibt (Timeline-Marker) — nicht ändern.

- `src/components/directors-cut/studio/sidebar/CutPanel.tsx` (Zeile 576)
  - `truncate` → `line-clamp-2 break-words` für Szenen-Labels.

- `src/components/directors-cut/studio/sidebar/LookPanel.tsx`, `FXPanel.tsx`, `ExportPanel.tsx`
  - Kurzer Pass: alle `truncate` / `whitespace-nowrap` innerhalb schmaler Listenzeilen durch `break-words` ersetzen; `min-w-0` auf umschließenden Flex-Kindern erhalten, damit die Zeilen sich vertikal ausdehnen dürfen.

Ergebnis: Text bricht sauber um, die Liste wird länger (die Sidebar hat bereits eine `ScrollArea` in `CapCutSidebar.tsx:924` — vertikales Scrollen funktioniert dann out-of-the-box).

---

## Fix 2 — Preview-Player Rucker (Bild + Musik) am Szenen-Übergang

**Ursache:** In `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx` bei Szenen-Ende (Zeilen 1131–1166) wird ein *Mini-Seek* auf dem aktiven Video ausgeführt (`video.currentTime = nextSourceStart + 0.05`). Damit muss der Browser dekodierten Buffer verwerfen und neu suchen → 100–400 ms Video-Freeze. Die Audio-Elemente (source / VO / Musik) laufen dabei linear weiter, aber:

- Es gibt für „normal advance" keinen Ping-Pong-Slot-Swap wie in der Composer-Preview (siehe Memory `preview-triple-buffer-and-prewarm`), obwohl `videoRefA` / `videoRefB` existieren.
- Bei Gap-Fällen (Zeile 1141–1144, 1200–1203) werden `sourceAudioRef` / `voiceoverAudioRef` / `backgroundMusicAudioRef` **hart pausiert**. Beim Übergang ohne Gap sollen sie das explizit NICHT — der User berichtet aber trotzdem einen Musik-Rucker. Das lässt sich mit zwei kleinen Anpassungen beheben:

**Änderungen (DirectorsCutPreviewPlayer.tsx):**

1. **Standby-Slot vorwärmen und atomar swappen** (Zeilen 1131–1166):
   Statt `video.currentTime = nextSourceStart + 0.05` auf dem aktiven Slot:
   - Standby-Slot (`getStandbyVideo()`) bekommt `src` (falls verschieden), `currentTime = nextSourceStart`, `playbackRate = nextRate`, `play()` bereits ~250 ms *vor* dem Cut (basierend auf `sceneInfo.scene.end_time - visualTimeRef.current`).
   - Am Cut: nur `activeSlotRef.current = otherSlot`, alter Slot wird `.pause()` + `opacity=0` **nach** einem RAF-Frame Delay (damit kein sichtbarer Sprung entsteht).
   - Fällt in dieselbe Architektur wie die bereits produktive Composer-Preview (Memory `preview-triple-buffer-and-prewarm`) — nur ohne HTTP-Prewarm, weil Director's Cut mit einer einzelnen `videoUrl` arbeitet.

2. **Kein Audio-Touch beim Non-Gap-Advance:**
   Sicherstellen, dass im `if (gapDuration > 0.2)` Zweig (Zeile 1136) und nur dort Audio pausiert wird. Der Non-Gap-Pfad (Zeile 1152–1165) darf `sourceAudioRef` / `voiceoverAudioRef` / `backgroundMusicAudioRef` **nicht** anfassen — bereits so, aber wir fügen einen expliziten Kommentar + Guard ein („audio stays continuous across cut").

3. **Kleine A/V-Drift-Korrektur nach Slot-Swap:**
   Direkt nach dem Swap: `sourceAudioRef.current.currentTime` an `activeVideo.currentTime` angleichen, aber **nur** wenn die Drift > 60 ms ist (sonst hörbarer Click). Das verhindert langsames Auseinanderlaufen über viele Szenen.

Kein Eingriff in:
- `useTransitionRenderer` / `NativeTransitionLayer` / `NativeTransitionOverlay` (aktive Transition-Animation läuft bereits sauber).
- Timeline, Waveforms, Timing des exportierten Videos.
- `render-directors-cut`, `check-remotion-progress`, `remotion-webhook`, `DirectorsCutVideo.tsx` (Export ist laut User jetzt korrekt).

---

## Verifikation

**Sidebar:**
1. Sidebar auf 280 px verkleinern (Minimum) → Songtitel „Time to leave the Magic" bricht auf 2 Zeilen um statt abgeschnitten zu werden. Kein „chladen"/„bliothek" mehr.
2. Weiter ziehen unmöglich unter 280 px.

**Preview-Player:**
1. Fresh Projekt mit 2 Szenen + Musik-Track laden, im Preview durchlaufen lassen.
2. Erwartet: Bild läuft flüssig durch den Cut, keine sichtbare Pause am Übergang. Musik läuft linear weiter, kein Klick / kein Pause-Artefakt.
3. Regression: Gap-Szenario (> 0.2 s Lücke zwischen Szenen) zeigt weiterhin Blackscreen + pausiert Audio wie zuvor.
4. Export-Regression-Check: Ein Test-Render bestätigt, dass die Änderungen keinen Preview-only-Code betreffen und der Export unverändert korrekt bleibt.

---

## Betroffene Dateien

- `src/components/directors-cut/studio/CapCutEditor.tsx` (2 Zeilen: Divider-min + Width-Clamp)
- `src/components/directors-cut/studio/CapCutSidebar.tsx` (4 truncate → break-words)
- `src/components/directors-cut/studio/sidebar/CutPanel.tsx` (1 truncate → line-clamp)
- `src/components/directors-cut/studio/sidebar/LookPanel.tsx`, `FXPanel.tsx`, `ExportPanel.tsx` (Cleanup)
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx` (Ping-Pong-Advance + Audio-Guard + Drift-Korrektur, ~40 Zeilen)

## Nicht geändert

- Render-Pipeline / Remotion-Templates / Lambda-Bundle
- Edge Functions
- Transition-Resolver / Easing / Timing-Model
- Timeline-Component / Waveforms
