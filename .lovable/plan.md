

# Plan: Hintergrundmusik endlich hörbar machen + Interview-Entwurf speichern

## Teil 1: Hintergrundmusik — Kernursache gefunden

### Diagnose
Die Daten sind jetzt eindeutig:

- **Erster Render:** `backgroundMusicUrl = professional-corporate-019.mp3` → Lambda crasht: `Failed to find two consecutive MPEG audio frames`
- **Retry:** `backgroundMusicUrl = NONE`, `voiceoverUrl = vorhanden` → Video wird ohne Musik gerendert
- **BUILD_TAG in Produktion:** `r67-music-direct-render` (nicht r68!)

**Ursache:** Die Jamendo-Tracks werden **nicht re-encoded** beim Seeding. Sie werden 1:1 von Jamendo heruntergeladen und in Storage gespeichert. Der Magic-Byte-Check (`isValidMp3`) besteht (ID3-Header vorhanden), aber die interne Frame-Struktur ist nicht Lambda-kompatibel. Das ist genau derselbe Fehler wie vorher mit den externen Jamendo-URLs — jetzt nur mit einer lokalen Kopie desselben kaputten MP3.

**Lösung:** Die 114 Tracks im Storage müssen mit FFmpeg **re-encoded** werden, damit sie standardkonforme MPEG-Frames haben. FFmpeg steht in der Sandbox-Umgebung zur Verfügung.

### Schritt 1: Tracks re-encoden und im Storage ersetzen

Per `lov-exec` im Sandbox:
1. Die aktuellen Tracks aus dem `background-music` Bucket herunterladen (direkt via Public URL)
2. Jeden Track mit FFmpeg zu einem standardkonformen MP3 re-encoden: `ffmpeg -i input.mp3 -codec:a libmp3lame -b:a 128k -ar 44100 -ac 2 output.mp3`
3. Re-encodete Dateien via Supabase Storage API zurück hochladen (upsert)
4. Start mit den 5 `professional-corporate` Tracks als Proof-of-Concept

### Schritt 2: Validierung
Nach dem Re-Encoding einen Track mit `ffprobe` lokal testen, um zu bestätigen, dass Lambda ihn akzeptieren würde.

### Schritt 3: Edge Function auf r68 bringen
Der BUILD_TAG in Produktion ist noch `r67`. Die Edge Function `auto-generate-universal-video` muss redeployed werden, damit der DB-basierte MUSIC_CATALOG (r68) aktiv wird.

### Schritt 4: Retry-Logik bei audio_corruption verbessern
**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`

Statt beim Retry die Musik komplett zu entfernen, einen **anderen Track** aus der DB auswählen und erneut versuchen. Nur wenn der zweite Track ebenfalls fehlschlägt, Musik deaktivieren.

## Teil 2: Interview-Antworten speichern (Browser-lokal + Entwurf anbieten)

### Aktueller Stand
Die Interview-Daten werden bereits in `localStorage` gespeichert:
- `universal-video-wizard-state`: Kategorie, Modus, Schritt, Ergebnis
- `universal-video-consultant-state`: Chat-Nachrichten, Fortschritt

Beim Klick auf "Neues Video starten" wird beides gelöscht. Das Verhalten ist fast komplett — es fehlt nur die **Wiederaufnahme-UI**.

### Schritt 5: Entwurf-Dialog beim Laden anzeigen
**Datei:** `src/components/universal-video-creator/UniversalVideoWizard.tsx`

Beim Mounten prüfen, ob ein `universal-video-wizard-state` mit `step > 0` existiert. Falls ja, einen Dialog anzeigen:

- "Du hast ein angefangenes Interview. Möchtest du fortfahren oder neu starten?"
- **Fortfahren**: State wird wie bisher geladen (funktioniert bereits)
- **Neu starten**: `handleResetWizard()` aufrufen → State wird gelöscht

### Schritt 6: "Neues Video" klar vom Zurück-Button trennen
**Datei:** `src/components/universal-video-creator/UniversalVideoWizard.tsx`

Der "Neues Video starten" Button löscht bereits alles korrekt. Sicherstellen, dass der "Zurück" Button bei Schritt 0 **nicht** den gespeicherten State löscht, damit der Entwurf erhalten bleibt.

## Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| Storage: `background-music/library/*.mp3` | 114 Tracks re-encoden |
| `supabase/functions/auto-generate-universal-video/index.ts` | r68 BUILD_TAG deploy + Retry mit alternativem Track |
| `src/components/universal-video-creator/UniversalVideoWizard.tsx` | Entwurf-Dialog beim Laden |

## Erwartetes Ergebnis
- Re-encodete MP3s bestehen Lambda's ffprobe → kein `audio_corruption` mehr
- Hintergrundmusik ist endlich hörbar im fertigen Video
- Interview-Antworten bleiben erhalten und werden beim nächsten Besuch als Entwurf angeboten
- "Neues Video starten" löscht den Entwurf wie gewohnt

