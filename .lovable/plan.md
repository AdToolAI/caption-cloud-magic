

## Fix: "Projekt muss zuerst gespeichert werden" bei Untertitel-Entfernung

### Problem

Wenn der User auf "Eingebrannte Untertitel entfernen" klickt, prüft `handleRemoveBurnedSubtitles` ob eine `projectId` existiert. Da das Projekt noch nie gespeichert wurde, ist `projectId` null → Fehlermeldung statt Aktion.

### Lösung

Statt den User zu blockieren, speichern wir das Projekt automatisch im Hintergrund, bevor wir die KI-Entfernung starten.

### Umsetzung

**`src/components/directors-cut/studio/CapCutEditor.tsx`**

- Neues Prop `onSaveProject` vom Typ `() => Promise<string | null>` hinzufügen
- In `handleRemoveBurnedSubtitles`: wenn `projectId` fehlt, erst `onSaveProject()` aufrufen
- Erst wenn die `projectId` zurückkommt, den Replicate-Call starten
- Falls Speichern fehlschlägt, Toast "Projekt konnte nicht gespeichert werden"

```text
handleRemoveBurnedSubtitles:
  1. if (!projectId) → projectId = await onSaveProject()
  2. if still no projectId → toast error, return
  3. proceed with API call using projectId
```

**`src/pages/DirectorsCut/DirectorsCut.tsx`**

- `saveProject` als Prop `onSaveProject` an `CapCutEditor` weitergeben

### Betroffene Dateien

1. `src/components/directors-cut/studio/CapCutEditor.tsx` — Auto-Save vor Removal
2. `src/pages/DirectorsCut/DirectorsCut.tsx` — `saveProject` als Prop übergeben

