

## Fix: KI-Analyse erkennt Videoinhalte nicht + Audio standardmässig stumm

### Problem 1: Szenen-Beschreibungen sind generisch/falsch

**Bestätigte Ursache** (Edge Function Logs):
```
frames: 0
No frames provided, using fallback text analysis
```

Die Frame-Extraktion schlägt fehl, weil das Video von einer externen S3-Domain (`remotionlambda-eucentral1`) kommt. Der Browser blockiert `canvas.toDataURL()` wegen CORS/Canvas-Taint bei `crossOrigin = 'anonymous'`. Der `onerror`-Handler gibt leise ein leeres Array zurück. Die Edge Function fällt dann auf eine **generische Text-Analyse** zurück, die "hypothetische" Szenenbeschreibungen erfindet — ohne das Video je gesehen zu haben.

**Lösung**: Die Frame-Extraktion robuster machen und bei CORS-Blockade die Frames serverseitig extrahieren.

#### Änderung 1a: `src/pages/DirectorsCut/DirectorsCut.tsx`
- Frame-Extraktion mit `try/catch` um `canvas.toDataURL()` wrappen
- Bei Canvas-Taint-Error: leeres Array zurückgeben, aber **explizit loggen** dass CORS das Problem ist
- Die `video_url` wird bereits an die Edge Function gesendet — diese soll die Frames selbst extrahieren können

#### Änderung 1b: `supabase/functions/analyze-video-scenes/index.ts`
- Wenn `frames` leer oder nicht vorhanden: **Frames serverseitig extrahieren** statt auf generische Textanalyse zurückzufallen
- Video-URL per `fetch()` herunterladen (funktioniert serverseitig ohne CORS)
- Mit `ffmpeg`/Frame-Extraction einen alternativen Ansatz verwenden: Video-URL direkt an das Vision-Modell senden
- Gemini 2.5 Flash unterstützt Video-URLs direkt als Input — statt einzelner Frames das **Video selbst** an die API senden
- Dazu den `userContent` um einen `video_url`-Part erweitern (Gemini Vision API akzeptiert `file_data` bzw. `video`-Input)
- Fallback-Text-Analyse ("hypothetische Szenenstruktur") als letztes Mittel behalten, aber klar als "Fallback" kennzeichnen

**Konkreter Ansatz**: Da Gemini Vision das Video auch als URL akzeptieren kann, wird die Edge Function das Video direkt als URL-Referenz an die AI senden, anstatt auf clientseitige Frames angewiesen zu sein. Das ist zuverlässiger und liefert bessere Ergebnisse als einzelne JPEG-Frames.

---

### Problem 2: Audio ist standardmässig stumm

**Ursache**: In `DirectorsCutPreviewPlayer.tsx` Zeile 102 wird `isMuted` mit `true` initialisiert. Der User muss erst manuell auf das Lautsprecher-Icon klicken.

**Lösung**: 

#### Änderung 2: `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`
- Neue optionale Prop `initialMuted?: boolean` (Default: `true` für Rückwärtskompatibilität)

#### Änderung 3: `src/components/directors-cut/steps/SceneAnalysisStep.tsx`
- `DirectorsCutPreviewPlayer` mit `initialMuted={false}` aufrufen, damit Audio im Analyse-Step hörbar ist
- Der User kann weiterhin selbst auf Mute klicken

---

### Zusammenfassung der Dateien
1. `supabase/functions/analyze-video-scenes/index.ts` — Video-URL direkt an Gemini Vision senden statt auf leere Frames zu warten
2. `src/pages/DirectorsCut/DirectorsCut.tsx` — Frame-Extraktion-Fehler besser loggen
3. `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx` — `initialMuted` Prop ergänzen
4. `src/components/directors-cut/steps/SceneAnalysisStep.tsx` — Audio standardmässig an

### Technische Hinweise
- Kein Datenbank-Fix nötig
- Gemini 2.5 Flash/Pro unterstützen multimodale Inputs inkl. Bild-URLs — die Frames müssen nicht als base64 inline gesendet werden
- Die bestehende Vision-Analyse-Logik (Frame-Nummern, Zeitstempel-Berechnung) bleibt als Backup erhalten für den Fall, dass clientseitige Frames doch funktionieren

