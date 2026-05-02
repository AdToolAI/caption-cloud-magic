## Problem

Im Director's Cut Studio gibt es im Timeline-Bereich einen `+`-Button mit einem Dropdown („Leere Szene (Blackscreen)" / „Video aus Mediathek"). Beim Klick auf **„Video aus Mediathek"** erscheint aktuell nur die Toast-Meldung *„Mediathek-Integration kommt bald! Nutze für jetzt den Upload in der Sidebar."* statt des bereits existierenden `AddMediaDialog`.

Der Dialog ist im Editor schon vollständig vorhanden (State `showAddMediaDialog`, Komponente `<AddMediaDialog>` gerendert) und wird vom Sidebar-Button „Video hinzufügen" bereits korrekt geöffnet — nur der Timeline-Eintrag ist noch an den alten Toast gebunden.

## Lösung

Eine kleine Änderung in `src/components/directors-cut/studio/CapCutEditor.tsx`, Zeile 1780:

**Vorher**
```tsx
onSceneAddFromMedia={() => toast.info(t('dc.mediaLibraryComingSoon'))}
```

**Nachher**
```tsx
onSceneAddFromMedia={() => setShowAddMediaDialog(true)}
```

Damit öffnet der Timeline-Eintrag „Video aus Mediathek" denselben `AddMediaDialog` wie der Sidebar-Button — Videos aus `video_creations`, `media_assets` und `content_items` sind direkt auswählbar, plus Upload-Tab.

## Auswirkung

- 1 Zeile Code geändert, keine neuen Dateien
- Kein Refactoring nötig, kein DB-Change
- Konsistentes Verhalten zwischen Sidebar-Button und Timeline-Dropdown

Soll ich das so umsetzen?