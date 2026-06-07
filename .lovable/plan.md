## Befund

Die neue Ursache ist nicht mehr der alte `ensureProjectPersisted()`-Cleanup. Ich habe im aktuellen Datenbestand ein Projekt mit genau deinem Symptom gefunden:

```text
Projekt: a2749416...
Szenen in DB: order_index {0,1,3}
fehlende Szene: order_index 2
Szene bei order_index 1 hat Marker: dialog-srs:<eigene scene id>
```

Der Fehler sitzt im Dialog/Lip-Sync-Flow:

- Früher wurden für Dialoge extra Sub-Szenen mit Marker `dialog-srs:*` erzeugt.
- Der Cleanup löscht vor einer neuen Dialog/Lip-Sync-Generation alle Szenen im Projekt mit `cinematic_preset_slug like 'dialog-srs:%'`.
- Inzwischen behält die neue Cinematic-Sync-Pipeline aber die echte Hauptszene als eine Szene und setzt trotzdem genau diesen `dialog-srs:*`-Marker auf die Hauptszene.
- Ergebnis: Beim nächsten Start einer anderen Szene wird die vorherige echte Dialog-Szene als „alte Sub-Szene“ erkannt und gelöscht. Dadurch wird Szene 2 „geschluckt“ und es bleibt eine Order-Lücke.

## Plan

1. **Dialog-Cleanup entschärfen**
   - In `SceneDialogStudio.tsx` darf der Cleanup nicht mehr pauschal alle `dialog-srs:*`-Szenen löschen.
   - Er darf nur noch echte Legacy-Sub-Szenen löschen, aber niemals normale Cinematic-Sync-Hauptszenen.
   - Zusätzlich: die aktuell gerenderte Parent-Szene wird explizit vom Cleanup ausgeschlossen.

2. **Keinen Legacy-SRS-Marker mehr auf Hauptszenen setzen**
   - Beim aktuellen Zwei-/Mehrsprecher-Cinematic-Sync wird `cinematicPresetSlug: dialog-srs:*` nicht mehr auf die echte Szene geschrieben.
   - Der Marker bleibt nur für alte Subscene-Kompatibilität relevant.

3. **Bestehende betroffene Szenen reparieren**
   - Eine kleine Datenbank-Migration räumt falsche Marker auf echten Cinematic-Sync-Hauptszenen weg:
     - `cinematic_preset_slug = null`, wenn `engine_override = 'cinematic-sync'` und Marker `dialog-srs:%` ist.
   - Damit wird verhindert, dass bereits vorhandene Szene 2 beim nächsten Klick erneut gelöscht wird.

4. **Order-Lücken stabilisieren**
   - Nach DB-Refetch sollen Szenen weiterhin stabil nach `order_index` angezeigt werden.
   - Zusätzlich wird eine sichere Reindex-Reparatur für betroffene Projekte vorbereitet, damit `{0,1,3}` wieder zu `{0,1,2}` wird, ohne Szeneninhalte zu ersetzen.

5. **Schutz gegen Rückfall**
   - Eine kurze Test-/Code-Prüfung stellt sicher:
     - Szene 1 fertig, Szene 2 Dialog/Lip-Sync, Szene 3 startet → Szene 2 bleibt erhalten.
     - Dialog-Cleanup löscht keine Szene mit `engine_override='cinematic-sync'`.
     - Es gibt keine pauschalen Projekt-weiten Deletes mehr außer explizites Löschen durch den Nutzer.

## Dateien/Backend-Bereiche

- `src/components/video-composer/SceneDialogStudio.tsx`
- ggf. `src/components/video-composer/VideoComposerDashboard.tsx` für Reindex/Refetch-Stabilität
- neue Datenbank-Migration zur Marker-/Order-Reparatur