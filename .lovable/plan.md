# Warum Übergänge im Preview noch „ruckeln"

**Was CapCut / Premiere / DaVinci machen:**
Sie halten während eines Übergangs **zwei echte Videostreams gleichzeitig aktiv** (outgoing A + incoming B, beide dekodiert und synchron laufend) und blenden diese pro Frame auf der GPU — Crossfade = Alpha-Blend, Wipe = Mask, Slide = Transform. So sind beide Seiten des Übergangs **echte bewegte Bilder**, und das Ganze läuft mit 60 fps im Compositor des Betriebssystems.

**Was unser Preview aktuell macht (`NativeTransitionOverlay.tsx`):**
- Es gibt **nur ein `<video>`-Element**, das die Timeline abspielt.
- Für den Übergang wird das erste Frame der nächsten Szene **einmalig als JPEG (640×360, quality 0.6)** gecaptured und als CSS-Background über das Video gelegt.
- Beim Übergang blendet also ein **eingefrorenes Standbild** ins bewegte Bild — das ist der Grund, warum es „nicht 100% flüssig" wirkt: Die eingehende Seite bewegt sich schlicht nicht.
- Zusätzlich: JPEG-Kompression + `backgroundSize: contain` erzeugen sichtbares Pumpen an der Kante.

Der bessere Layer `NativeTransitionLayer.tsx` (dual video, GPU-Blend) existiert **schon**, wird aber im aktuellen `SceneAnalysisStep` **nicht verwendet** — dort läuft weiterhin der Standbild-Overlay.

---

# Plan: Preview auf echten Dual-Stream-Blend umstellen

## 1. Umschalten auf `NativeTransitionLayer` (Dual-Video Ping-Pong)

- In `SceneAnalysisStep.tsx` und `DirectorsCutPreviewPlayer.tsx` den `NativeTransitionOverlay` durch die bereits existierende Ping-Pong-Architektur (zwei `<video>`-Slots: `active` + `standby`) ersetzen.
- **~1 s vor** einem geplanten Übergang wird der Standby-Slot auf die kommende Szene vorgespult (`preload='auto'`, `currentTime` gesetzt, `pause()`), damit der Decoder warm ist.
- Beim Übergangsstart: Standby `play()`, `useTransitionInfo` liefert `progress` per rAF, `getTransitionStyles` mappt auf `opacity` / `transform` / `clip-path` / `filter` — **beides sind echte laufende Videos**, kein Standbild mehr.
- Nach dem Übergang: Slots tauschen (der Standby wird zum Aktiven), alter Aktiver wird der neue Standby.

## 2. GPU-Fähige CSS-Properties erzwingen

- Nur `opacity`, `transform`, `filter: blur()`, `clip-path` verwenden (schon der Fall) — plus `will-change: opacity, transform` auf beiden Video-Layern, damit Chrome sie auf eigene Compositor-Layer hebt.
- **Kein `backdrop-filter`** (Sandbox-Regel, verursacht CPU-Fallback).
- Video-Elemente auf `object-fit: cover` mit fester Bildgröße, damit während der Transition keine Layout-Neuberechnung passiert.

## 3. Sub-Frame-glatte Progress-Kurve

- Aktuell wird `progress` linear aus der Zeit interpoliert. Für den „butterweichen" Look eine **easing curve** (z.B. `easeInOutCubic`) auf `progress` anwenden, bevor sie in Style-Werte fließt — genau das macht CapCut („Smooth" preset).
- rAF-Loop bereits vorhanden in `useTransitionInfo` (60 fps), keine Änderung nötig.

## 4. Cache-Warmup für sofortigen Play-Start

- Beim Laden der Timeline für **jede Szene außer der ersten** einen versteckten Standby-Videoclip preloaden (nur Metadata + erstes GOP), damit auch bei manuellem Scrubbing der Übergang sofort läuft und nicht erst decodiert werden muss.
- Bei Scrubbing über einen Übergangs-Punkt Progress direkt setzen, kein „Aufholen" per rAF.

## 5. Render-Seite (Lambda / Remotion) prüfen

Die **fertig gerenderte MP4** ist bereits butterweich, weil Remotion beide Szenen Frame-für-Frame komponiert. Der Ruckler existiert **nur im Live-Preview**. Trotzdem kurzer Cross-Check:
- `src/remotion/components/transitions/*` verwenden bereits `safeInterpolate` — keine Änderung nötig.
- Optional: dieselbe Easing-Kurve (Punkt 3) auch in Remotion-Transitions einbauen, damit Preview und Export **exakt identisch** aussehen (WYSIWYG).

---

# Nicht Teil dieses Plans

- Keine neuen Übergangstypen (nur Glättung der vorhandenen).
- Kein Umbau des Lambda-Renderers.
- Kein Ersatz von `<video>` durch WebCodecs / WebGL — wäre ein zweiter Schritt und für die aktuelle Qualität nicht nötig.

---

# Technische Details

| Punkt | Datei | Änderung |
|---|---|---|
| Dual-Slot Preview | `src/components/directors-cut/steps/SceneAnalysisStep.tsx` (Zeile 650) | `NativeTransitionOverlay` → `NativeTransitionLayer` + zwei `<video>`-Elemente |
| Dual-Slot Preview | `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx` | dito, falls dort noch der alte Overlay aktiv ist |
| Easing | neue Utility `src/lib/directors-cut/transitionEasing.ts` | `easeInOutCubic(progress)`, importiert in `NativeTransitionLayer` und optional in Remotion-Transitions |
| Preload | `useFrameCapture.ts` oder neuer `useStandbyVideoPreload.ts` | Metadata-Preload für alle kommenden Szenen |
| GPU-Hints | `NativeTransitionLayer.tsx` | `willChange: 'opacity, transform'` auf beiden Video-Layern |

**Ergebnis:** Übergänge im Preview verhalten sich wie in CapCut — beide Seiten sind bewegte Videos, weich per GPU geblendet, mit einer Easing-Kurve statt linearer Interpolation.
