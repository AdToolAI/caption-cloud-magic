

## Befund — Warum die zwei „Rucker" im gerenderten Video

### Das eigentliche Problem
In `supabase/functions/compose-video-assemble/index.ts` (Z. 94-97) wird beim Rendern **jede** vom Nutzer gewählte Transition (slide, fade, etc.) **hartcodiert auf `'none'`** überschrieben:

```ts
// Transitions removed from Motion Studio — always hard cuts.
transitionType: 'none',
transitionDuration: 0,
```

Im Remotion-Template `ComposedAdVideo.tsx` werden Szenen daher mit reinen `<Sequence>`-Hard-Cuts hintereinander gehängt (Z. 213-225). Bei jedem Cut passiert in der Render-Pipeline Folgendes:
1. Lambda mountet ein **neues** `<Video>`-Element für die nächste Szene
2. Der h264-Decoder muss den ersten Keyframe der neuen Quelle dekodieren
3. Wenn die Quelle (Hailuo/Kling-Clip) keinen Keyframe bei Frame 0 hat → **wiederholter oder schwarzer Frame** = sichtbarer Rucker

### Warum genau diese zwei Stellen rucken
- **Übergang 1 (sehr früh)**: Erster Cut überhaupt — Decoder-Cold-Start, neue Quelle, hartes Mounten
- **Übergang 6→7**: Im Screenshot sind Szene 6 (Demo, 7s, Hailuo) und Szene 7 (Social Proof, 8s, Hailuo) — beides AI-Clips mit unterschiedlicher GOP-Struktur. Bei Szene 6 ist `transition: none`, bei Szene 7 aber wieder etwas anderes — die Inkonsistenz fällt visuell besonders auf

Die UI bietet bereits Transition-Auswahl pro Szene (sichtbar in Screenshot: „Übergang: slide / none / fade") und die DB-Spalte `composer_scenes.transition_type` (default `'fade'`) ist befüllt — sie wird beim Render aber **ignoriert**.

---

## Plan — Echte Crossfades im gerenderten Video

### Fix 1 — `compose-video-assemble`: gewählte Transition durchreichen
In Z. 83-98 nicht mehr auf `'none'` zwingen, sondern aus `composer_scenes.transition_type` lesen:

```ts
const remotionScenes = (scenes || []).map((s: any) => ({
  videoUrl: s.clip_url,
  durationSeconds: s.duration_seconds || 5,
  textOverlay: s.text_overlay ? { ... } : undefined,
  transitionType: s.transition_type || 'fade',          // statt 'none'
  transitionDuration: Number(s.transition_duration) || 0.4,
}));
```

Defaultwert `'fade'` wenn Nutzer nichts setzt → garantiert smoothe Übergänge auch für Bestandsprojekte.

### Fix 2 — `ComposedAdVideo.tsx`: Crossfade-Architektur statt reine Hard-Cuts
Aktuell platzieren wir Szenen mit `<Sequence from={frameOffset}>` direkt aneinander. Für echte Crossfades müssen sich aufeinander folgende Szenen **überlappen**:

**Frame-Math anpassen** (Z. 197-204):
```ts
let frameOffset = 0;
const sceneFrames = scenes.map((scene, i) => {
  const durationFrames = Math.ceil(scene.durationSeconds * fps);
  const transitionFrames = scene.transitionType && scene.transitionType !== 'none'
    ? Math.ceil((scene.transitionDuration || 0.4) * fps)
    : 0;
  const entry = { 
    from: frameOffset, 
    duration: durationFrames,
    transitionType: scene.transitionType || 'none',
    transitionFrames,
    isLast: i === scenes.length - 1,
  };
  // Nächste Szene startet `transitionFrames` früher → echte Überlappung
  frameOffset += durationFrames - (entry.isLast ? 0 : transitionFrames);
  return entry;
});
```

**Scene-Komponente erweitern** mit Opacity-Interpolation am Anfang (fade-in) und am Ende (fade-out), analog zu `LongFormVideo.tsx` Z. 92-189:
- `transitionType: 'fade'` / `'crossfade'` → Opacity-Interpolation am Anfang **und** am Ende
- `transitionType: 'slide'` → `translateX` am Anfang
- `transitionType: 'zoom'` → `scale` + Opacity am Anfang
- `transitionType: 'wipe'` → `clipPath` am Anfang
- `transitionType: 'none'` → kein Effekt (Hard-Cut wie bisher, aber nur wenn bewusst gewählt)

### Fix 3 — Frame-Math im assemble-Payload anpassen
Da Crossfades die Gesamtdauer reduzieren (Überlappungen), muss `durationInFrames` im Lambda-Payload mitberechnet werden:

```ts
// Berechne tatsächliche Gesamt-Frames inkl. Crossfade-Überlappung
let totalFrames = 0;
for (let i = 0; i < remotionScenes.length; i++) {
  const s = remotionScenes[i];
  const dFrames = Math.ceil(s.durationSeconds * fps);
  const tFrames = (s.transitionType !== 'none' && i < remotionScenes.length - 1)
    ? Math.ceil((s.transitionDuration || 0.4) * fps)
    : 0;
  totalFrames += dFrames - tFrames;
}
totalFrames += Math.ceil(remotionScenes[remotionScenes.length - 1].durationSeconds * fps) 
              - (totalFrames > 0 ? 0 : 0); // letzte Szene voll
const durationInFrames = Math.max(1, totalFrames);
```

### Fix 4 — `pauseWhenBuffering` + frühes Vorspulen
Bereits in `LongFormVideo` genutzt (Z. 168, 185). Auch in `ComposedAdVideo`'s `<Video>` setzen → Lambda wartet bei Buffering, statt einen Schwarz-Frame einzusetzen.

### Fix 5 — Garantie: keine Regression bei UI/Preview
Der Preview-Player (`ComposerSequencePreview.tsx`) bleibt **unverändert**. Die Änderungen betreffen nur die finale Render-Pipeline (`compose-video-assemble` + `ComposedAdVideo.tsx`). Was der Nutzer im Preview sieht (Stateless Crossfade) bleibt; was im finalen MP4 ankommt, bekommt jetzt **denselben** smoothen Übergang via Remotion-Opacity-Interpolation.

### Skalierbar für 1000+ Nutzer
- Reine Frame-Math + CSS-Opacity → null Render-Overhead pro Lambda
- Keine zusätzlichen Lambda-Calls, keine zusätzliche Bandbreite
- `pauseWhenBuffering` schützt vor variablen Netzwerk-Latenzen am Lambda

## Geänderte Dateien

- `supabase/functions/compose-video-assemble/index.ts` — Transition aus DB durchreichen, korrigierte `durationInFrames`-Berechnung
- `src/remotion/templates/ComposedAdVideo.tsx` — Crossfade-fähiger `Scene`-Renderer mit Opacity-/Transform-Interpolation, überlappende Frame-Offsets

## Verify

1. Bestehendes 7-Szenen-Projekt rendern → kein Schwarz-Frame oder Rucker mehr zwischen Szene 1↔2 und 6↔7
2. Verschiedene Transitions pro Szene testen (fade / slide / zoom / none) — UI-Auswahl wirkt sich tatsächlich im Output aus
3. Gesamtlänge des Videos = Summe der Szenen-Dauern minus Transition-Überlappungen (z. B. 7 Szenen à 6s mit 0.4s fade = 7×6 − 6×0.4 = 39.6s)
4. Audio (VO + Musik) bleibt synchron zur tatsächlichen Gesamtdauer
5. Untertitel-Timing passt weiterhin (Subtitles sind absolute Zeitstempel, nicht relativ zu Szenen)
6. Hard-Cut-Modus (`'none'`) funktioniert weiterhin sauber, falls bewusst gewählt

