

# Plan: Sound Effects crashen Lambda — nicht die Hintergrundmusik

## Root Cause gefunden

Das Problem war **nie** die Hintergrundmusik. Der ffprobe-Crash kommt von den **Sound Effects**.

Beweis:
- Im Lambda-Payload des letzten Renders fehlt `backgroundMusicUrl` komplett
- Trotzdem crasht Lambda mit `Failed to find two consecutive MPEG audio frames`
- Jede Szene hat `soundEffectType: "whoosh"`, `"alert"`, `"success"`, `"pop"`
- `getSoundUrlSync()` gibt **immer** `data:audio/mp3;base64,...` zurück (Zeile 213-215 in EmbeddedSoundLibrary.ts)
- Remotion Lambda lädt data-URIs als Assets herunter, speichert sie als `.mp3` im temp-Verzeichnis
- ffprobe kann die resultierenden Dateien nicht parsen → Crash
- Der Retry strippt die **Hintergrundmusik** (falscher Schuldiger) aber lässt die Sound Effects aktiv → nächster Crash
- Erst wenn `audioStripped=true` greift UND `r33_audioStripped` das Sound-Effect-Rendering in Zeile 3020 deaktiviert, läuft der Render durch

## Lösung

### Schritt 1: Sound Effects auf echte HTTP-URLs umstellen
**Datei:** `src/remotion/components/EmbeddedSoundLibrary.ts`

`getSoundUrlSync()` darf in Lambda **keine** `data:` URIs zurückgeben. Stattdessen:
- Die Base64-Sounds als echte MP3-Dateien in den `background-music` oder `audio-assets` Storage-Bucket hochladen
- `EMBEDDED_FALLBACKS` Map auf die echten Storage-URLs umstellen
- Alternativ: CDN-URLs als primäre Quelle nutzen (Pixabay-URLs sind bereits definiert, aber nie im Sync-Pfad verwendet)

### Schritt 2: Hintergrundmusik wieder aktivieren
**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`

Sobald die Sound Effects nicht mehr crashen, wird auch die Hintergrundmusik durchlaufen. Die validierten Tracks aus der DB können dann genutzt werden.

### Schritt 3: Remotion-Bundle deployen
Da die Änderung in `EmbeddedSoundLibrary.ts` (Client-seitig im Bundle) liegt, muss das Remotion-Bundle nach dem Fix neu deployed werden, damit Lambda den aktuellen Code nutzt.

## Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `src/remotion/components/EmbeddedSoundLibrary.ts` | `data:` URIs → echte Storage/CDN URLs |
| Sound-Dateien in Storage hochladen | 5-7 kurze MP3s (whoosh, pop, success, alert, click, swoosh, chime) |

## Warum alle bisherigen Fixes nicht geholfen haben
- Wir haben immer die **Hintergrundmusik** verdächtigt und repariert
- Aber die Sound Effects waren **immer aktiv** und haben **immer** den Crash verursacht
- Erst wenn `r33_audioStripped=true` gesetzt wurde, wurden auch Sound Effects deaktiviert (Zeile 3020)
- Deshalb funktionierte der finale Retry (ohne Musik UND ohne Sound Effects) — aber das wurde als "Voiceover-only funktioniert" interpretiert

## Erwartetes Ergebnis
- Sound Effects laden als echte HTTP-URLs → ffprobe kann sie parsen
- Hintergrundmusik funktioniert wieder (war nie das eigentliche Problem)
- Kein Retry-Karussell mehr nötig

