## Problem

Aktuell musst du die überlagerten Szenen **frame-genau** an die Schnittpunkte des Originalvideos legen. Liegt eine Szene auch nur 0,1 s daneben, stockt die Wiedergabe, springt zurück oder zeigt kurz Schwarz, weil zwei „Quellen" (Original-Pass-Through + überlagerte Szene) um denselben Bereich konkurrieren und der Player hart zwischen ihnen umschaltet.

Profi-Tools wie Artlist/CapCut/Descript lösen das **nicht**, indem sie den User zwingen, exakt zu treffen — sie lösen es mit drei Mechanismen:

1. **Magnetische Timeline mit Snap-Points** — Szenen rasten automatisch an Schnittkanten, am Playhead und an anderen Clip-Rändern ein (typ. ±8 px / ±200 ms).
2. **Ripple/Overwrite statt Layer-Konflikte** — eine neue Szene *ersetzt* den darunterliegenden Bereich des Originals sauber, statt zwei Spuren parallel laufen zu lassen.
3. **Auto-Detect Cut-Marker** — die KI-erkannten Schnittpunkte werden als unsichtbare „Magnete" auf der Timeline persistiert, an denen alles einrastet.

Genau diese drei Bausteine fehlen uns aktuell.

## Plan

### 1. Cut-Marker als first-class citizens
- Auto-Cut-Erkennung speichert die Schnittpunkte nicht mehr nur als Szenen, sondern zusätzlich als **`cutMarkers: number[]`** im Studio-State (Sekunden, source-time).
- Marker werden als feine vertikale Linien auf der Timeline gerendert (wie in Premiere/CapCut).
- Marker sind manuell hinzufügbar (Shortcut `M` am Playhead) und löschbar.

### 2. Magnetisches Snapping beim Drag/Resize/Add
Neuer Helper `src/lib/directors-cut/snap.ts`:
- Sammelt alle Snap-Targets: `cutMarkers`, Playhead, Start/Ende jeder Szene, Timeline-Start/-Ende.
- Beim Verschieben oder Trimmen einer Szene in `CapCutTimeline.tsx` und beim `handleSceneAdd` in `CapCutEditor.tsx` wird der Wert durch `snapToNearest(value, targets, threshold)` geleitet.
- Threshold dynamisch nach Zoomstufe (Default 200 ms / 8 px).
- Visuelles Feedback: gelbe Snap-Linie + leichtes Haptik-Ticking (CSS-Pulse), wenn eingerastet.

### 3. Konfliktfreie Overlay-Logik (Overwrite-Mode)
Aktuell: Original-Pass-Through und überlagerte Szene laufen parallel → Race-Condition beim Playback.
Neu in `CapCutPreviewPlayer.tsx` + `resolveSourceMode`:
- Eine Szene mit `sourceMode: 'media'` **maskiert** das darunterliegende Originalvideo deterministisch im Bereich `[start_time, end_time]`.
- Pass-Through-Original wird in genau diesen Intervallen *gepausiert* statt konkurrierend weiterzulaufen.
- Übergang zwischen Original → Overlay → Original läuft über die bestehende `NativeTransitionLayer` (Crossfade Default 200 ms), sodass der Wechsel nie hart wirkt, auch wenn die Grenze nicht 100 % auf einem Cut liegt.

### 4. Auto-Align-Button („Snap to nearest cut")
Neue Aktion im Properties-Panel der ausgewählten Szene:
- „An nächsten Schnitt einrasten" → verschiebt `start_time`/`end_time` der Szene an den nächstgelegenen `cutMarker` (innerhalb 1 s Toleranz).
- Bonus: Bulk-Aktion „Alle Szenen ausrichten" oben in der Sidebar.

### 5. Smarter Auto-Cut (weniger, bessere Marker)
`supabase/functions/analyze-video-scenes/index.ts`:
- Mindestabstand zwischen Cuts: 0,8 s (filtert Mikro-Schnitte raus).
- Konfidenz-Schwelle anheben; unsichere Cuts werden als „weak markers" (gestrichelte Linie) angezeigt, snapen aber nicht automatisch.
- Glättung: liegen zwei Detektionen <300 ms auseinander, wird die mit höherer Konfidenz behalten.

### 6. UX-Polish
- Tooltip beim Hover über Szene-Rand: zeigt Distanz zum nächsten Marker („+0,12 s vom Cut").
- Toggle in der Toolbar: Snapping an/aus (Shortcut `N`), wie in Premiere.
- Status-Badge an der Szene: grüner Punkt = aligned, gelber Punkt = innerhalb 200 ms, grau = freistehend.

## Betroffene Dateien
- `src/types/directors-cut.ts` — `cutMarkers`, `snapEnabled` State
- `src/lib/directors-cut/snap.ts` *(neu)* — Snap-Engine
- `src/components/directors-cut/studio/CapCutTimeline.tsx` — Snap beim Drag/Resize, Marker-Rendering, Snap-Linie
- `src/components/directors-cut/studio/CapCutEditor.tsx` — Snap beim Add, Auto-Align-Aktion, Marker-Persistenz
- `src/components/directors-cut/studio/CapCutPreviewPlayer.tsx` — deterministisches Pausieren des Pass-Through bei Overlay
- `src/components/directors-cut/studio/sidebar/CutPanel.tsx` — Snap-Toggle, „Align all"-Button, Marker-Liste
- `supabase/functions/analyze-video-scenes/index.ts` — geglättete, hochwertigere Marker
- `src/lib/translations.ts` — neue UI-Strings (DE/EN/ES)

## Ergebnis
Du musst nicht mehr pixelgenau treffen — die Szene springt von selbst an den richtigen Cut. Wenn sie absichtlich daneben liegen soll, läuft der Übergang dank Crossfade und sauberer Mask-Logik trotzdem flüssig, ohne Stocken oder Schwarzbild.