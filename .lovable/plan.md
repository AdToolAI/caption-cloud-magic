
## Plan: Director's Cut bei interner Navigation wirklich behalten

### Ursache
Der aktuelle F5-Check in `DirectorsCut.tsx` ist noch fehlerhaft:  
`performance.getEntriesByType('navigation')[0].type` beschreibt den ursprünglichen Seiten-Load der ganzen App, nicht den späteren Seitenwechsel innerhalb der App. Wenn die App einmal per Reload geladen wurde, wird der Draft beim späteren Zurückkehren in den Director's Cut erneut gelöscht.

Zusätzlich wird der 500ms-Autosave beim Verlassen nur abgebrochen. Wenn man direkt nach einer Änderung wegklickt, wird der letzte Stand gar nicht mehr gespeichert.

### Umsetzung
1. **Reload nur einmal behandeln**
   - die aktuelle `isReload`-Prüfung so umbauen, dass sie nur einmal pro echtem Browser-Load ausgewertet wird
   - danach bei interner Navigation niemals mehr `clearDraft()` ausführen

2. **Draft beim Verlassen sofort sichern**
   - den aktuellen Studio-Stand als Snapshot zentral aufbauen
   - beim Unmount / Cleanup den letzten Stand sofort speichern statt nur den Debounce-Timer zu löschen

3. **Restore robuster machen**
   - beim Mount immer zuerst den gespeicherten Draft wiederherstellen, solange kein echter Reload-Reset aktiv ist
   - optional auch `projectId` mitpersistieren, damit das Projekt vollständig weitergeführt wird

### Technische Änderungen
- **`src/pages/DirectorsCut/DirectorsCut.tsx`**
  - fehlerhafte Reload-Logik ersetzen
  - Snapshot-Helper für den kompletten Draft ergänzen
  - Debounced Save so anpassen, dass beim Verlassen sofort geflusht wird
- **`src/lib/directors-cut-draft.ts`**
  - falls nötig kleinen Helper für einmalige Reload-Behandlung ergänzen
  - optional `projectId` ins Draft-Modell aufnehmen

### Ergebnis
- Klick auf andere Bereiche der App: Director's Cut bleibt erhalten
- Rückkehr zum Director's Cut: man landet wieder im laufenden Projekt statt bei der Videoauswahl
- Nur echter F5/Reload setzt den Director's Cut zurück
