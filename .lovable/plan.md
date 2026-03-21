

# Plan: Hintergrundmusik zum Laufen bringen

## Problem

Die Logs zeigen eindeutig: **Jeder Render crasht beim ersten Versuch** mit `audio_corruption` wegen der Hintergrundmusik. Der Retry entfernt dann die Musik und behält nur das Voiceover. Das passiert konsistent — die Musik kommt nie im fertigen Video an.

**Ursache:** Die Musik-MP3s von Jamendo haben gültige Magic Bytes (bestehen die r60-Validierung), aber enthalten Encoding-Eigenheiten, die ffprobe in der Lambda-Umgebung nicht verarbeiten kann. Es gibt kein ffmpeg in Edge Functions, um die Dateien vor dem Upload zu re-encoden.

## Lösung: Zweistufiger Ansatz

### Schritt 1: Audio-Rendering im Template von `Html5Audio` auf `Audio` umstellen
**Datei:** `src/remotion/templates/UniversalCreatorVideo.tsx`

`Html5Audio` ist für Browser-Preview gedacht. Für den Lambda-Render ist die Remotion `Audio`-Komponente robuster und toleranter gegenüber Encoding-Varianten. Der Universal Content Creator (`UniversalVideo.tsx`) nutzt möglicherweise bereits `Audio` — ich prüfe das und gleiche die Implementierung an.

### Schritt 2: Musik direkt ins Lambda-Rendering einbinden statt über Template
**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`

Statt die Musik-URL als `inputProps` an das Template zu übergeben (wo ffprobe sie beim Bundling analysiert und crasht), die Musik **als separaten Audio-Track im Lambda-Render-Aufruf** übergeben. Remotion Lambda unterstützt einen `audioTracks`-Parameter, der Audio extern beimixt — ähnlich wie der `mux-audio-to-video` Ansatz, aber nativ in Lambda.

Falls `audioTracks` in der aktuellen Lambda-Version nicht verfügbar ist, Alternative:

### Schritt 2b: Post-Render Audio-Muxing für Musik
**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`

Nach dem erfolgreichen Voiceover-Render die Musik separat via `mux-audio-to-video` Edge Function (FFmpeg) auf das fertige Video legen. Der Ablauf wäre:
1. Lambda rendert Video + Voiceover (funktioniert bereits stabil)
2. Nach Webhook-Callback: `mux-audio-to-video` fügt Musik hinzu (mit niedrigerem Volume)
3. Fertiges Video hat beides

### Schritt 3: Fallback-Musik auf bekannt funktionierende Dateien umstellen
**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`

Die Pixabay-Fallback-URLs (Zeilen 2250-2257) durch vorvalidierte, in Supabase Storage hochgeladene MP3s ersetzen. Damit ist die Musikquelle immer kontrolliert.

## Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `src/remotion/templates/UniversalCreatorVideo.tsx` | `Html5Audio` → `Audio` für Lambda-Kompatibilität |
| `supabase/functions/auto-generate-universal-video/index.ts` | Post-Render Musik-Muxing oder Lambda audioTracks |
| `supabase/functions/remotion-webhook/index.ts` | Musik-Muxing nach erfolgreichem Render triggern |

## Erwartetes Ergebnis
- Voiceover bleibt stabil (wie bisher)
- Hintergrundmusik wird zuverlässig hinzugefügt, ohne Lambda-Crashes
- Kein `audio_corruption` Retry mehr nötig

