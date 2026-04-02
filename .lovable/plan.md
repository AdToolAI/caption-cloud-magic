

## Feature: Eingebrannte Untertitel per KI-Inpainting entfernen

### Ansatz

Da das Projekt bereits Replicate integriert hat (`REPLICATE_API_KEY` ist vorhanden), können wir ein professionelles Video-Inpainting nutzen, um eingebrannte Untertitel tatsächlich aus den Videoframes zu entfernen — kein schwarzer Balken, kein Blur, sondern echte Pixel-Rekonstruktion.

### Wie es funktioniert

```text
1. User klickt "Eingebrannte Untertitel entfernen" in Step 10
2. Edge Function analysiert Video per Gemini Vision → erkennt Untertitel-Region (Bounding Box)
3. Edge Function erstellt eine Maske (weißer Bereich = Untertitelzone)
4. Replicate ProPainter-Modell inpaintet die maskierte Region
5. Bereinigtes Video wird in Storage hochgeladen
6. Preview-Player wechselt auf das bereinigte Video
```

### Neue Edge Function: `director-cut-remove-burned-subtitles`

1. Nimmt `video_url` entgegen
2. Sendet einen Frame an Gemini Vision mit der Frage: "Wo sind eingebrannte Untertitel? Gib die Bounding Box als y_start, y_end (in Prozent) zurück"
3. Erstellt eine Maske (schwarzes Bild mit weißem Rechteck an der erkannten Position)
4. Ruft Replicate ProPainter-Modell auf:
   - Input: Video + Maske
   - Output: Video ohne den maskierten Bereich (mit inpaintetem Hintergrund)
5. Lädt das Ergebnis in Supabase Storage hoch
6. Gibt die neue Video-URL zurück

### UI in CapCutSidebar.tsx (Untertitel-Tab)

- Neuer Abschnitt: "Eingebrannte Untertitel"
- Info-Text: "Falls das Originalvideo fest eingebrannte Untertitel enthält, kann die KI versuchen, diese zu entfernen."
- Button: "Eingebrannte Untertitel entfernen" mit Lade-Indikator
- Status-Anzeige: "Wird analysiert..." → "Wird entfernt..." → "Fertig! Video wurde bereinigt"
- Credit-Kosten: z.B. 10 Credits (wie Object Removal)

### State-Flow in CapCutEditor.tsx

- Neuer State: `cleanedVideoUrl: string | null`
- Wenn `cleanedVideoUrl` gesetzt ist, wird dieser an den Preview-Player als `videoUrl` übergeben statt dem Original
- Button "Original wiederherstellen" setzt `cleanedVideoUrl` auf `null`

### Betroffene Dateien

1. **Neue Datei**: `supabase/functions/director-cut-remove-burned-subtitles/index.ts` — Edge Function mit Gemini Vision + Replicate ProPainter
2. `src/components/directors-cut/studio/CapCutSidebar.tsx` — UI-Button + Status
3. `src/components/directors-cut/studio/CapCutEditor.tsx` — State + Video-URL-Swap
4. `src/lib/directors-cut-draft.ts` — `cleanedVideoUrl` im Draft persistieren

### Hinweis

- Die Verarbeitung dauert ca. 1–3 Minuten je nach Videolänge
- Das Ergebnis hängt vom Hintergrund ab — bei einfarbigem Hintergrund perfekt, bei komplexen Szenen gut aber nicht immer pixelgenau
- Der User kann jederzeit zum Original zurückwechseln

