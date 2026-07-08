# Motion Studio — Thumbnail-Bug & Übergangs-Integration

Zwei saubere, klar abgegrenzte Änderungen im Motion Studio. Beide bleiben rein im Frontend + Composer-Datenmodell — kein Rendering-Backend, kein Lipsync-Pfad, kein Director's-Cut-Rewrite. Ziel: einmal richtig bauen, danach nicht mehr anfassen.

---

## Teil A — Thumbnail-Bleed-Bug im Storyboard-Strip

### Symptom
Beim Anlegen einer neuen Szene erscheint das **Frontbild** (Referenz-/Anker-Bild) sofort in **allen** Szenen-Kacheln des Storyboard-Strips, obwohl die neuen Szenen noch gar nichts gerendert haben. Rein visuell — die Daten pro Szene sind sauber.

### Ursache
`src/components/video-composer/SceneStripTile.tsx` wählt die Kachel-Vorschau in dieser Reihenfolge:

```
scene.firstFrameUrl → scene.referenceImageUrl → scene.lastFrameUrl → gradient fallback
```

Neue Szenen haben noch **keinen** `firstFrameUrl` und **keinen** `lastFrameUrl`. Sie erben aber die **globale `referenceImageUrl`** (das Frontbild / der Anker), die beim Szene-Erstellen aus der Composer-Konfiguration in jede Scene mitgeschrieben wird. Dadurch zeigen alle drei Kacheln dasselbe Anker-Bild — verwechselbar mit einem echten Render-Ergebnis.

### Fix (minimalinvasiv, präzise)

1. **`SceneStripTile.pickThumbnail` restriktiver machen**
   Kachel-Preview zeigt nur **echte Szenen-Outputs**:
   ```
   scene.firstFrameUrl → scene.lastFrameUrl → gradient fallback
   ```
   `referenceImageUrl` fällt raus — Referenz ≠ Ergebnis.

2. **Klarer Placeholder-Zustand** für „noch nicht gerendert":
   - Bestehender Gradient-Fallback bleibt.
   - Zusätzlich dezentes Icon (`ImageOff` / `Film`) + Mikro-Label „Noch nicht gerendert" (i18n DE/EN/ES).
   - Status-Badge oben rechts (`Wartet` / `Generiert` / `Re-Render empfohlen`) bleibt unverändert — das ist die richtige Signalquelle.

3. **Optional (empfohlen): dedizierter Anker-Hinweis**
   Wenn `referenceImageUrl` gesetzt ist und keine Frames existieren, kleines Referenz-Chip **unten links** einblenden („Anker" mit 12px-Miniatur-Icon) — so bleibt die Anker-Info sichtbar, ohne die Kachel als Ergebnis vorzutäuschen.

### Verifizierung
- Neuer Composer-Run mit Frontbild + 3 Szenen → alle 3 Kacheln zeigen Gradient-Fallback + „Noch nicht gerendert", **nicht** das Frontbild.
- Nach erstem erfolgreichem Render von Szene 1 → nur Szene 1 zeigt den echten `firstFrameUrl`, Szene 2/3 bleiben Placeholder.
- Re-Render einer Szene → Kachel aktualisiert nur die betroffene Szene.

---

## Teil B — Director's-Cut-Übergänge im Motion Studio

### Ziel
Übergänge (Cut, Crossfade, Fade, Slide, Zoom, Wipe, Blur, Push) sollen **zwischen KI-generierten Szenen** direkt im Motion Studio wählbar sein — mit identischer Preview- und Export-Semantik wie im Director's Cut. Keine Neuerfindung, keine Parallelimplementierung.

### Was bereits existiert und wiederverwendet wird

| Baustein | Quelle | Rolle im Motion Studio |
|---|---|---|
| `TransitionSelector` | `src/components/video/TransitionSelector.tsx` | UI-Picker (Grid mit Preview-Tiles) |
| `TransitionPreviewTile` | `src/components/studio-visual/` | Bewegte Mini-Vorschau |
| Transition-Renderer | `src/remotion/components/transitions/*` (Crossfade, Fade, Slide, Zoom, Wipe, Blur, Push) | Export-Zeit-Rendering |
| Easing | `src/lib/directors-cut/transitionEasing.ts` | Kurven für Preview + Export |
| Datenfeld | `ComposerScene.transition` bzw. `SceneTransition` (bereits in `src/types/scene.ts` / `useSceneManager.ts`) | Persistenz pro Szene |

**Keine neue Datenstruktur nötig.** Das Composer-Datenmodell hat bereits ein `transition`-Feld pro Szene — es wird im Motion Studio aktuell nur nicht bearbeitet.

### Architektur

```text
StoryboardSceneStrip
      │  (zwischen zwei Szenen-Tiles)
      ▼
┌──────────────────────────┐
│  TransitionHandle        │  ← neu, minimaler visueller Knoten
│  ⇄  Cut  ▾               │     zeigt aktuellen Übergang der linken Szene
└─────────────┬────────────┘     zur rechten Szene
              │ klick
              ▼
┌──────────────────────────┐
│  TransitionPopover       │  ← neu, hostet <TransitionSelector />
│  · Typ (Grid)            │     schreibt in scene[i].transition
│  · Dauer 0.2–1.5s Slider │
│  · Easing (Smooth/Linear)│
└──────────────────────────┘
```

- **Position:** Handles sitzen **zwischen** den Kacheln im Filmstrip (nicht in der Kachel selbst) — semantisch korrekt, weil ein Übergang zwei Szenen verbindet.
- **Zustand:** `scene[i].transition = { type, duration, easing }` — bestehendes Feld.
- **Erste Szene** hat keinen eingehenden Übergang (kein Handle links davon). **Letzte Szene** hat keinen ausgehenden.
- **StudioPane** (rechte Editor-Spalte) bekommt eine neue Sektion „Übergang zur nächsten Szene" mit demselben `TransitionSelector` — für Tastatur-/A11y-Nutzer und Detailkontrolle.

### Preview-Verhalten
- `ComposerSequencePreview` (bestehender Sequenz-Player) wird um einen dünnen Wrapper erweitert, der zwischen Szenen die entsprechende `transitions/*`-Komponente einblendet. Timing:
  - Übergangsdauer verkürzt die effektive Anzeige der Nachbarszenen um `duration/2` je Seite (CapCut-Standard).
  - Easing über `easeTransition` aus `transitionEasing.ts`.
- Bei `type === 'none'` (Cut): kein Wrapper, harter Schnitt — Null-Overhead.

### Export-Verhalten (Render-Pipeline)
- Der bestehende Composer-Render-Pfad (`compose-video-clips` → Remotion-Lambda) bekommt pro Szenenübergang die drei Felder `type`, `duration`, `easing` mitgeliefert.
- Payload-Feld: `scene.transition_out = { type, duration_ms, easing }` in **snake_case** (Konsistenz mit Director's-Cut-Render-API-Schema).
- Die vorhandenen Remotion-Transition-Komponenten (`src/remotion/components/transitions/*`) werden im Composer-Composition-Loader anhand von `transition_out.type` selektiert — identisch zur Director's-Cut-Auflösung.
- **Kein neuer Remotion-Bundle**, kein neuer Lambda-Deploy nötig — die Komponenten sind bereits im aktuellen Bundle.

### Default-Palette
Motion Studio startet mit derselben minimalen Artlist-Palette wie der Director's Cut:
```
availableTransitions = ['none', 'crossfade']
```
Die restlichen (Fade, Slide, Zoom, Wipe, Blur, Push) sind in derselben UI verfügbar über einen „Mehr Übergänge"-Toggle im Popover — nicht aufdringlich, aber erreichbar.

### Kompatibilität & Grenzen
- **Lipsync-Szenen:** Übergänge greifen **nur außerhalb** des Lipsync-Fensters (Ein-/Ausblenden ins/aus dem Speaker-Clip). Kein Eingriff in Ghost-Mouthing-Sensitives (v190–v209 unangetastet).
- **Kling/nicht-sichere Provider:** Warn-Dialog aus v209 bleibt orthogonal. Übergänge ändern die Lipsync-Risiko-Klassifikation nicht.
- **Audio:** Cross-fade des Audios spiegelt Video-Crossfade-Dauer, außer der Nutzer entkoppelt es explizit (v2 — nicht Teil dieser Runde).

### Deliverables

1. `src/components/video-composer/TransitionHandle.tsx` — kleiner Bus-Knoten zwischen Storyboard-Tiles (~40 Zeilen).
2. `src/components/video-composer/TransitionPopover.tsx` — Popover mit `TransitionSelector` + Duration-Slider + Easing-Toggle (~80 Zeilen).
3. `StoryboardSceneStrip.tsx` — Handles zwischen Tiles einfügen; keine Layout-Umbauten.
4. `SceneCard.tsx` / `StudioPane` — Editor-Sektion „Übergang zur nächsten Szene" (nutzt dieselbe Popover-Logik).
5. `ComposerSequencePreview.tsx` — Transition-Wrapper zwischen Szenen einbinden (nutzt `src/remotion/components/transitions/*` direkt für DOM-Preview via CSS-Fallback für die 6 Nicht-Crossfade-Typen; Crossfade/Fade rein CSS).
6. Composer-Render-Payload — `scene.transition_out` in snake_case in `compose-video-clips` client + edge function durchreichen.
7. Composer-Composition-Loader (bereits vorhanden) — Transition-Selektor pro Szene, spiegelt Director's-Cut-Auflösung.
8. i18n DE/EN/ES für die neuen Labels („Übergang", „Dauer", „Kein Übergang", „Mehr Übergänge", „Übergang zur nächsten Szene", „Weich", „Linear").
9. `mem/features/video-composer/motion-studio-transitions.md` — Kurz-Dokumentation: Datenfluss, Wiederverwendung Director's-Cut-Bausteine, snake_case-Payload, Lipsync-Orthogonalität.

### Verifizierung

- 3 KI-Szenen erzeugen → zwischen jedem Paar erscheint ein Handle mit „Cut ▾".
- Handle klicken → Popover, Crossfade wählen, 0.6s → Handle-Label aktualisiert, Preview zeigt weiches Überblenden.
- Sequenz-Preview spielt alle 3 Szenen mit korrekten Übergängen (Cut → Crossfade → Cut).
- Export der Sequenz → gerendertes MP4 zeigt Crossfade an der markierten Stelle, harten Schnitt an den anderen (Frame-genau).
- Lipsync-Szene mit Kling + Crossfade → v209-Consent-Dialog erscheint unverändert; Übergang bleibt korrekt.
- Erste Szene ohne linkes Handle, letzte Szene ohne rechtes Handle.
- Neuer Composer-Run → keine Transitions gesetzt → Verhalten wie heute (harte Schnitte).

---

## Was NICHT gemacht wird (Scope-Guard)

- Keine Änderung am Lipsync-Pipeline (v190–v209 unangetastet).
- Kein Refactor des Director's-Cut-Editors.
- Keine neuen Übergangs-Effekte über die 8 bestehenden hinaus.
- Kein Audio-Ducking / Musik-Crossfade als Teil dieser Runde (klar abgegrenzte Folge-Story).
- Kein Umbau des Storyboard-Layouts, keine neue Info-Architektur.
- Kein Auto-Vorschlag für Übergänge (könnte später als Autopilot-Feature kommen).

## Reihenfolge der Umsetzung (in einer Iteration)

1. Teil A — Thumbnail-Fix (isoliert, 1 Datei, sofort verifizierbar).
2. Teil B.1 — `TransitionHandle` + `TransitionPopover` + Storyboard-Integration.
3. Teil B.2 — Preview-Wrapper in `ComposerSequencePreview`.
4. Teil B.3 — Payload `transition_out` snake_case + Composition-Loader-Selektion.
5. i18n + Memory-Doku.
6. End-to-End-Verifizierung nach obiger Checkliste.
