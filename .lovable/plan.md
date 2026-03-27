

## Fix: Videos werden nicht in Mediathek gespeichert + "In Mediathek gespeichert" lügt

### Befund

1. **Webhook wurde nie aufgerufen** — die zwei Videos für den Testuser (`3faf219a`) haben `video_url` mit temporären `replicate.delivery`-URLs. Der Auto-Save-Code im Webhook wurde erst danach deployed. Keine Webhook-Logs vorhanden → der Webhook wurde für diese Videos nie getriggert.

2. **`video_creations` ist leer** für diesen User — null Einträge. Die Mediathek zeigt nur das Demo-Video.

3. **UI lügt** — Zeile 323-326 zeigt "✓ In Mediathek gespeichert" für JEDES completed Video, ohne zu prüfen ob es wirklich in `video_creations` existiert.

### Lösung

**1. Retroaktives Speichern (Edge Function oder Client-Logik)**

Die UI muss beim Laden prüfen, ob ein completed Video schon in `video_creations` existiert. Falls nicht, einen "In Mediathek speichern"-Button anzeigen, der `save-ai-video-to-library` aufruft (die bestehende Fallback-Funktion).

**2. `VideoGenerationHistory.tsx` — ehrliche Statusanzeige**

- Beim Laden der Generierungen auch `video_creations` abfragen (mit `metadata->>'ai_generation_id'`)
- Für jedes completed Video prüfen ob es in der Mediathek ist
- Falls ja: "✓ In Mediathek gespeichert" anzeigen
- Falls nein: "In Mediathek speichern"-Button anzeigen, der die Funktion `save-ai-video-to-library` aufruft

**3. `save-ai-video-to-library` anpassen**

Die bestehende Funktion versucht von `generation.video_url` herunterzuladen. Da die URLs abgelaufen sein können, muss sie:
- Prüfen ob die URL noch erreichbar ist
- Falls nicht: einen Fehler anzeigen wie "Video nicht mehr verfügbar — bitte neu generieren"

### Dateien

- `src/components/ai-video/VideoGenerationHistory.tsx` — Query erweitern, Button statt statischem Text
- `supabase/functions/save-ai-video-to-library/index.ts` — bessere Fehlerbehandlung bei abgelaufenen URLs

### Erwartetes Ergebnis
- "In Mediathek gespeichert" wird nur angezeigt wenn wirklich gespeichert
- Für nicht-gespeicherte Videos erscheint ein Button zum Nachholen
- Zukünftige Videos werden via Webhook automatisch gespeichert (wie schon implementiert)

