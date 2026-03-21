
## Diagnose

Ja — es ist sehr wahrscheinlich **ein anderes Grundproblem** als „nur der falsche Soundtrack“.

Ich habe Code, Laufzeitdaten und die Backend-Funktionen geprüft. Dabei zeigen sich **drei harte Ursachen**:

1. **Im Universal Video Creator wird Musik aktuell gar nicht im Render-Template abgespielt**
   - In `src/remotion/templates/UniversalCreatorVideo.tsx` ist nur noch das Voiceover als `<Audio />` aktiv.
   - Die Musik wurde dort bewusst entfernt mit Kommentar: „added post-render via mux-audio-to-video“.

2. **Das Post-Render-Muxing kann in der aktuellen Backend-Umgebung nicht funktionieren**
   - `supabase/functions/mux-audio-to-video/index.ts` nutzt `ffmpeg` / `ffprobe` via `Deno.Command`.
   - Ein direkter Test der Funktion liefert:
     `Spawning subprocesses is not allowed on Supabase Edge Runtime.`
   - Das heißt: **der aktuelle Musik-Fallback ist technisch tot**.

3. **Der Retry-Pfad entfernt die Musik zusätzlich aus den Webhook-Daten**
   - In `auto-generate-universal-video/index.ts` wird bei `audioStripped` die `backgroundMusicUrl` aus den `audioTracks` für den Retry entfernt.
   - Genau das sieht man auch in den Webhook-Logs:
     - erster Render: `backgroundMusicUrl` vorhanden
     - erfolgreicher Retry: `backgroundMusicUrl: "NONE"`, `willMux: false`
   - Ergebnis: selbst wenn Muxing funktionieren würde, bekäme der Erfolgs-Webhook oft **gar keine Musik mehr**.

## Was das praktisch bedeutet

Der aktuelle Aufbau ist widersprüchlich:

```text
Template:
  Voiceover direkt im Lambda
  Musik NICHT im Lambda

Webhook:
  Musik soll nachträglich gemuxt werden

Backend:
  Mux per ffmpeg in Edge Function nicht erlaubt
```

Damit ist der jetzige Pfad strukturell so gebaut, dass **Voiceover funktionieren kann, Musik aber nicht zuverlässig jemals ankommt**.

## Plan zur Behebung

### 1. Dead-End-Muxing aus dem Universal Video Creator entfernen
`mux-audio-to-video` sollte für diesen Flow nicht mehr die Hauptlösung sein, weil es in dieser Runtime keine tragfähige Architektur ist.

### 2. Musik wieder direkt im Remotion-Render aktivieren
In `src/remotion/templates/UniversalCreatorVideo.tsx` die Hintergrundmusik wieder als **Root-Level `<Audio />`** einbauen — analog zum funktionierenden Audio-Grundprinzip des Universal Content Creators.

Wichtig:
- nur interne, validierte Storage-Tracks verwenden
- Voiceover + Musik beide direkt im Lambda rendern
- kein Edge-FFmpeg mehr als Voraussetzung

### 3. `backgroundMusicUrl` wieder in die echten Render-Props geben
In `supabase/functions/auto-generate-universal-video/index.ts`:
- `backgroundMusicUrl` wieder in `inputProps`
- nicht nur in `customData.audioTracks`
- Retry-Logik so ändern, dass bei Problemen **nicht automatisch Musik dauerhaft verloren geht**

Sinnvoller Fallback:
- erst auf einen anderen internen Track wechseln
- nur als letzte Eskalation Musik deaktivieren

### 4. Bundle-Synchronisation ausdrücklich absichern
Die Laufzeitdaten passen nicht ganz sauber zum aktuellen Repo-Zustand. Deshalb würde ich zusätzlich den aktiven Remotion-Bundle-Stand hart verifizieren.

Ziel:
- sicherstellen, dass Lambda wirklich den aktuellen `UniversalCreatorVideo`-Code nutzt
- Versions-/Canary-Logging für Audio aktiv mitprüfen

### 5. Audio-Forensik präziser machen
Für den nächsten Testlauf würde ich die tatsächlichen Audioquellen sauber persistieren/loggen:
- verwendete `voiceoverUrl`
- verwendete `backgroundMusicUrl`
- Quelle/Track-ID aus dem internen Katalog
- ob Musik im Template gerendert wurde oder deaktiviert wurde

Dann sehen wir bei einem erneuten Fehler sofort:
- war es das Voiceover?
- war es ein bestimmter Musik-Track?
- oder war es ein Bundle-Mismatch?

## Betroffene Dateien

| Datei | Änderung |
|---|---|
| `src/remotion/templates/UniversalCreatorVideo.tsx` | Musik wieder direkt als `<Audio />` einbauen |
| `supabase/functions/auto-generate-universal-video/index.ts` | `backgroundMusicUrl` wieder in `inputProps`, Retry-Fallback korrigieren |
| `supabase/functions/remotion-webhook/index.ts` | Muxing für diesen Flow zurückstufen / nur noch Diagnose |
| `supabase/functions/mux-audio-to-video/index.ts` | nicht mehr als Hauptpfad für UVC behandeln |

## Technische Kurzfassung

Das aktuelle Problem ist sehr wahrscheinlich **nicht** „falscher Track aus der Bibliothek“, sondern ein Architekturproblem:

- Musik wurde aus dem Template entfernt
- das Ersatz-Muxing ist in dieser Runtime nicht ausführbar
- der Retry wirft die Musik zusätzlich oft aus den Erfolgsdaten

## Erwartetes Ergebnis nach der Umstellung

- Voiceover bleibt hörbar
- Hintergrundmusik wird wieder direkt im finalen Render erzeugt
- kein Abhängigkeitsproblem mehr von FFmpeg in Edge Functions
- danach können wir Track-Auswahl, Lautstärke und Fade-Out sauber feinjustieren
