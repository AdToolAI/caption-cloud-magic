

## Befund

Das gerenderte MP4 hat **keinen Sound** und **keine Untertitel/Text-Overlays**, weil das Remotion-Template `ComposedAdVideo.tsx` diese Felder **gar nicht kennt**.

**Konkret:**

1. **Audio fehlt im Render** — Voiceover/Musik werden zwar als Props an Lambda geschickt (`voiceoverUrl`, `backgroundMusicUrl`), aber:
   - Die Edge-Function setzt `muted: !hasAudio` korrekt → Audio wird Lambda-seitig **nicht stummgeschaltet**
   - Im Template ist `<Audio>` zwar eingebaut, aber `audioCodec: 'aac'` allein reicht nicht — die `videoUrl` der Szenen wird mit `muted` eingebunden ✓ (richtig). 
   - **Eigentliches Problem**: Der Lambda-Bundle (REMOTION_SERVE_URL) ist möglicherweise auf einer **älteren Version** des Templates, und die neuen Audio-URLs werden in der gerenderten Version nicht durchgereicht. **ABER:** In ComposedAdVideo (Z. 125–137) ist `<Audio>` korrekt vorhanden — also sollte es laufen. Sehr wahrscheinlich ist der **Lambda-Bundle veraltet** und enthält noch eine alte Version ohne Audio-Section, oder der `voiceoverUrl` wird nicht gesetzt, weil `assemblyConfig.voiceover?.audioUrl` leer ist (Switch aus oder URL nicht gespeichert).

2. **Untertitel & Text-Overlays fehlen komplett** — das ist ein **echter Bug**:
   - `ComposedAdVideoSchema` hat **keine** Felder für `subtitles` oder `globalTextOverlays`
   - Edge-Function sendet beide Felder in `inputProps`, aber Zod verwirft unbekannte Properties stillschweigend
   - Im Template-Body wird **nichts** gerendert dafür → MP4 hat weder Untertitel-Boxen noch globale Text-Overlays

## Plan

### 1. `ComposedAdVideo.tsx` erweitern

**Schema ergänzen:**
```ts
subtitles: z.object({
  enabled: z.boolean(),
  language: z.string().optional(),
  style: z.object({
    font: z.string().optional(),
    size: z.number().optional(),
    color: z.string().optional(),
    background: z.string().optional(),
    position: z.enum(['top', 'bottom']).optional(),
  }).optional(),
  segments: z.array(z.object({
    id: z.string(),
    text: z.string(),
    startTime: z.number(),
    endTime: z.number(),
  })),
}).optional(),
globalTextOverlays: z.array(z.object({
  id: z.string(),
  text: z.string(),
  animation: z.enum(['fadeIn','scaleUp','bounce','typewriter','highlight','glitch']),
  position: z.enum(['top','center','bottom','bottomLeft','bottomRight','topLeft','topRight','centerLeft','centerRight','custom']),
  customPosition: z.object({ x: z.number(), y: z.number() }).optional(),
  startTime: z.number(),
  endTime: z.number().nullable(),
  style: z.object({
    fontSize: z.enum(['sm','md','lg','xl']),
    color: z.string(),
    backgroundColor: z.string(),
    shadow: z.boolean(),
    fontFamily: z.string(),
  }),
})).optional(),
```

**Renderer ergänzen** (im Hauptcomponent, nach `<ColorGrading>`):
- `<TextOverlayRenderer>` (existiert bereits in `src/remotion/components/TextOverlayRenderer.tsx`) für `globalTextOverlays`, jeder mit eigener `<Sequence from={startTime*fps} durationInFrames={...}>`
- Inline-Subtitle-Renderer (nach Vorbild `SubtitleClipRenderer` aus `DirectorsCutVideo.tsx`) für jedes Subtitle-Segment in `subtitles.segments`, mit `<Sequence>` pro Segment

### 2. Audio-Robustheit in `ComposedAdVideo.tsx`
- `<Audio>` für Voiceover und Musik um `pauseWhenBuffering` ergänzen (verhindert Tonabbrüche bei langsamen Netzwerk-Loads im Lambda)
- Volume-Clamping `Math.min(1, Math.max(0, volume))` (verhindert IndexSizeError bei korrupten Werten)

### 3. Edge-Function `compose-video-assemble/index.ts`
- Die globalen Overlays sind als snake_case-freie JSON-Objekte gespeichert — **direkt durchreichen** (keine Konvertierung, da Schema sie 1:1 erwartet)
- Subtitle-Segments-Array bereinigen: nur `id`, `text`, `startTime`, `endTime` (ohne optionale `words`, die das Schema nicht hat)
- Sicherstellen, dass `inputProps.voiceoverUrl` aus `assemblyConfig.voiceover?.audioUrl` UND nur wenn `voiceover.enabled !== false` gesetzt wird (sonst leer-string, damit `muted: !hasAudio` korrekt greift)
- Analog für Musik: `assemblyConfig.music?.enabled !== false && trackUrl` 

### 4. Lambda-Bundle neu deployen (zwingend!)
Nach den Template-Änderungen muss der Remotion-Lambda-Bundle **neu hochgeladen** werden, sonst rendert Lambda weiterhin die alte Version. Plan:
- Nach dem Code-Edit den User darauf hinweisen, dass der Bundle neu deployt werden muss (Edge-Function `deploy-remotion-lambda` oder Admin-Trigger)
- Alternativ: einen Kommentar/Bundle-Version-Bump in `Root.tsx` einfügen, damit der CI-Hook das Bundle automatisch neu baut

### 5. Edge-Function-Logs prüfen (Diagnose)
Nach Edit: Mit `supabase--edge_function_logs` für `compose-video-assemble` prüfen, ob `voiceoverUrl` und `subtitles.segments.length` beim letzten Render tatsächlich gesetzt waren. Falls nein → das Setup-Problem liegt in den Tab-Daten (User hat keinen VO generiert / Subtitle-Switch aus).

## Geänderte Dateien
- `src/remotion/templates/ComposedAdVideo.tsx` — Schema + Renderer für `subtitles` und `globalTextOverlays`, Audio-Hardening
- `supabase/functions/compose-video-assemble/index.ts` — Subtitle-Cleanup, strikteres Audio-Gating
- (optional) `src/remotion/Root.tsx` — Bundle-Version-Bump-Kommentar zur Erzwingung neuen Lambda-Bundles

## Verify
- Tab "Voiceover & Untertitel": VO generieren, Untertitel-Switch an, Text-Overlay hinzufügen
- Render starten → fertiges MP4 herunterladen
- MP4 hat **Sound** (Voiceover + ggf. Musik), **Untertitel-Box** an gewählter Position, **Text-Overlay** zur richtigen Sekunde sichtbar
- Edge-Logs zeigen `voiceoverUrl` gesetzt + `subtitles.segments` mit > 0 Einträgen
- Lambda-Bundle ist auf neuestem Stand (Bundle-Hash-Check via `verify_lambda_bundle`-Funktion oder Admin-UI)

