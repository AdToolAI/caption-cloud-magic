

# Plan: Demo-Video für neue User ohne eigene Videos anzeigen

## Zusammenfassung
Im `DashboardVideoCarousel` wird der leere Zustand (keine Videos) durch ein automatisch abspielendes Demo-Video ersetzt. Neue User, die noch keine Videos generiert haben, sehen so ein Einführungsvideo.

## Änderung

### `src/components/dashboard/DashboardVideoCarousel.tsx` — Empty State ersetzen (Zeilen 191-204)

Statt der einfachen Card mit "Noch keine Videos erstellt" wird ein vollwertiger Video-Player mit dem existierenden Demo-Video angezeigt:

- **Demo-Video**: Die bereits vorhandene URL aus dem Projekt verwenden (`ai-videos` Bucket)
- **Auto-Play**: Video startet automatisch (muted), mit Mute-Toggle und Fullscreen-Button
- **Styling**: Gleicher 3D-Carousel-Look wie bei normalen Videos, mit einem "LÖSUNG"-ähnlichen Badge und Titel "AdTool AI: Die Lösung"
- **CTA darunter**: Button "Dein erstes Video erstellen" → navigiert zum Video Creator
- **Dismissable**: Kein Dismiss nötig — verschwindet automatisch sobald der User sein erstes eigenes Video generiert hat (da dann `sortedVideos.length > 0`)

### Technisch
- Nur eine Datei wird geändert: `DashboardVideoCarousel.tsx`
- Die Demo-Video-URL ist bereits im Projekt vorhanden (aus `GadgetCardDynamic.tsx`)
- Kein neuer State, keine DB-Änderungen — das Feature basiert rein auf der bestehenden Logik `sortedVideos.length === 0`

