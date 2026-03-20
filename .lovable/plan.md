

# Plan: Audio-Corruption Fix — MP3-Validierung + Graceful Degradation

## Problem

Der ffprobe-Crash in Lambda (`"Failed to find two consecutive MPEG audio frames"`) wird durch eine korrupte/ungültige MP3-Datei verursacht. Die `proxyAudioToStorage`-Funktion validiert nur die Dateigröße (>10KB), prüft aber nicht die **Magic Bytes** des MP3-Headers. Wenn Pixabay z.B. eine HTML-Fehlerseite (>10KB) zurückgibt, wird diese als `.mp3` gespeichert.

**Ablauf aktuell:**
1. Render 1: Audio URLs werden an Lambda übergeben → ffprobe crasht → `audio_corruption`
2. Retry: `silentRender: true` → Video ohne Ton ✅ aber stumm

**Lösung:** MP3-Magic-Byte-Validierung + bei Audio-Corruption nicht komplett stumm schalten, sondern nur die korrupte Quelle entfernen.

## Umsetzung

### Schritt 1: MP3 Magic-Byte-Validierung in `proxyAudioToStorage`
**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`

Nach dem Download die ersten Bytes prüfen:
- MP3: `0xFF 0xFB`, `0xFF 0xF3`, `0xFF 0xF2` (MPEG frame sync)
- MP3 mit ID3: `0x49 0x44 0x33` ("ID3")
- Wenn keine gültigen Magic Bytes → `return null` statt Upload

### Schritt 2: Audio-Corruption-Retry intelligenter machen
**Datei:** `supabase/functions/auto-generate-universal-video/index.ts` (Render-Only Retry, Zeile 1938-1942)

Statt bei `audio_corruption` komplett auf `silentRender: true` zu fallen:
- Background-Music-URL aus den inputProps entfernen (wahrscheinliche Ursache)
- Voiceover-URL behalten (ElevenLabs-Dateien sind zuverlässig)
- `muted: false` und `audioCodec: 'aac'` beibehalten
- Nur wenn der zweite Versuch ebenfalls mit `audio_corruption` fehlschlägt, dann `silentRender: true`

### Schritt 3: Voiceover-URL ebenfalls validieren
**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`

Vor dem Render einen schnellen HEAD-Check auf die Voiceover-URL ausführen (Content-Type + Größe), um ungültige URLs frühzeitig auszuschließen.

## Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `supabase/functions/auto-generate-universal-video/index.ts` | Magic-Byte-Validierung, intelligenteres Audio-Corruption-Recovery |

## Erwartetes Ergebnis
- Korrupte Audio-Dateien werden VOR dem Lambda-Render erkannt und verworfen
- Bei Audio-Corruption wird nur die problematische Quelle entfernt, Voiceover bleibt erhalten
- Video hat Voiceover auch nach einem Retry

## Hinweis
Reine Edge-Function-Änderung — kein Bundle-Redeploy nötig.

