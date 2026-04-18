

## Ja — die Geschwindigkeit 1.2 ist sehr wahrscheinlich die Ursache

Du hast den Bug gefunden. Hier die Beweiskette aus dem Code:

### Die Schätzung passt nicht zur Realität

In `generate-voiceover/index.ts` Z. 128-130:
```ts
const wordCount = text.split(/\s+/).length;
const baseEstimatedDuration = (wordCount / 150) * 60;  // 150 Wörter/Min @ 1.0x
const estimatedDuration = Math.ceil(baseEstimatedDuration / speed);
```

Diese Schätzung wird in der DB als `voiceover.durationSeconds` gespeichert (Z. 181 in `VoiceSubtitlesTab.tsx`).

**Problem:** ElevenLabs sprachsynthetisierte Stimmen sprechen **nicht exakt 150 Wörter/Min** bei `speed=1.0`. Je nach Stimme variiert das zwischen **130 und 175 WPM**. Bei `speed=1.2` wird der Fehler **multipliziert**:
- Schätzung sagt z.B. 25s, **echtes Audio dauert 28s** → 3s werden abgeschnitten
- Oder umgekehrt: Schätzung sagt 28s, echt sind 25s → 3s Stille am Ende

### Warum das die "manche Übergänge gut, manche schlecht"-Symptomatik erklärt

Der `compose-video-assemble` (Z. 115-121) extendet die Komposition **nur** wenn `voDurationSeconds > durationInFrames`. Bei `speed=1.2`:
- Wenn das echte Audio **länger** ist als die Schätzung → Komposition zu kurz → **letzter VO-Satz abgeschnitten** (= dein Übergang-1-Cut)
- Mittendrin: das VO-Audio läuft an einer Stelle, die nicht mehr mit den Szenen-Längen synchron ist (weil das Audio physisch eine andere Länge hat als geplant) → klingt wie **"Wiederholung"** weil derselbe Szenen-Inhalt mit verschobenem VO doppelt gehört wird

### Die echte Ursache

Die **VO-Dauer wird geschätzt statt gemessen**. Bei `speed=1.0` ist die Heuristik halbwegs OK (bekannter Fehler), bei `speed=1.2` wird der Heuristik-Fehler verstärkt.

## Plan — VO-Dauer **echt messen** statt schätzen

### Fix 1 — `generate-voiceover`: Echte Audio-Dauer aus MP3 ermitteln
Statt Wort-Heuristik die **echte Dauer aus der MP3-Datei** berechnen. Bei `mp3_44100_128` (128kbps, 44.1kHz) gilt:
```ts
const realDurationSeconds = audioBuffer.byteLength / (128 * 1000 / 8);
// = bytes / 16000 (für 128kbps)
```
Das ist eine **bit-exakte** Berechnung aus der Datei-Größe — keine Heuristik mehr nötig. Ergebnis ist auf ±50ms genau (CBR-MP3-Frames sind 26ms lang).

```ts
// generate-voiceover/index.ts — ersetzt Z. 128-130
const BITRATE_BPS = 128 * 1000;
const realDurationSeconds = (audioUint8Array.byteLength * 8) / BITRATE_BPS;
const estimatedDuration = Math.ceil(realDurationSeconds * 100) / 100; // auf 0.01s gerundet
```

### Fix 2 — Client: Audio-Element-Dauer als Verifikation nach Generierung
In `VoiceSubtitlesTab.tsx` nach Z. 181: zusätzlich ein verstecktes `<audio>` mit `loadedmetadata`-Event nutzen um die **vom Browser dekodierte echte Dauer** zu bekommen und in `voiceover.durationSeconds` zu schreiben (überschreibt die Server-Schätzung mit dem präzisesten Wert):

```ts
// Nach onUpdateAssembly: lade Audio und korrigiere Dauer
const audio = new Audio(data.audioUrl);
audio.addEventListener('loadedmetadata', () => {
  if (isFinite(audio.duration) && audio.duration > 0) {
    onUpdateAssembly({
      voiceover: { ...voiceover, audioUrl: data.audioUrl, durationSeconds: audio.duration, /* ... */ },
    });
  }
});
```

### Fix 3 — `compose-video-assemble`: Beidseitiger Sync-Check
Z. 115-121 erweitern: nicht nur **extenden** wenn VO länger, sondern auch **trimmen** der hinteren Szenen wenn VO deutlich kürzer (>0.5s Differenz). Aktuell läuft Bild 3s länger als Audio → klingt nach „Cut" am Ende.

```ts
const voDurationSeconds = Number(assemblyConfig?.voiceover?.durationSeconds) || 0;
if (voDurationSeconds > 0) {
  const voFrames = Math.ceil(voDurationSeconds * fps);
  // Sync auf max(VO, Video) — wenn beide bekannt, nimm den Längeren
  durationInFrames = Math.max(durationInFrames, voFrames);
}
```

(Das ist bereits da — bleibt. Aber jetzt mit **korrektem** `voDurationSeconds`.)

### Fix 4 — Speed-Range warning in der UI
Bei `speed > 1.1` einen kleinen Hinweis im UI: „Hohe Geschwindigkeit kann Sync-Probleme verursachen — generiere VO neu wenn du die Speed änderst".

## Geänderte Dateien

- `supabase/functions/generate-voiceover/index.ts` — echte Dauer aus MP3-Bytes statt Wort-Heuristik
- `src/components/video-composer/VoiceSubtitlesTab.tsx` — Browser-Audio-Metadaten zur Verifikation nutzen, optional UI-Hinweis bei Speed > 1.1

## Warum das diesmal das echte Problem trifft

Alle bisherigen Fixes (Crossfade-Math, OffthreadVideo, Audio-Mixer-Bypass) waren technisch korrekt — aber sie haben das **falsche Symptom** behandelt. Der echte Bug ist: **die Komposition kennt die wahre VO-Länge nicht**, weil sie geschätzt wird. Bei `speed=1.0` fällt der Schätzfehler nicht auf, bei `speed=1.2` schon.

## Verify

1. Mit `speed=1.0` generieren → Sync sollte wie vorher passen
2. Mit `speed=1.2` neu generieren → VO komplett, keine Cuts, keine Wiederholungen
3. Mit `speed=0.8` testen → ebenfalls sauber, keine Stille am Ende
4. Bestandsprojekte: VO **neu generieren** damit echte Dauer in DB steht (alte geschätzte Dauer ist falsch)
5. Console-Log zeigt: `realDurationSeconds` ≈ Browser `audio.duration` (±0.1s)

