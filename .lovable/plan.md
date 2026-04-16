

## Fix-Plan — Datenintegrität + Render-Robustheit

### 1. DB-Aufräumung (Migration)
Einmalige Bereinigung: Pro `(project_id, order_index)` nur die **neueste `ready` Szene** behalten, Rest löschen. Bei keiner `ready` Variante: neueste behalten.

```sql
-- Schritt 1: Für jede order_index pro Projekt die "beste" Szene markieren
-- Priorität: ready > pending > failed, bei Gleichstand: neueste
-- Schritt 2: Alle anderen löschen
```

### 2. Persistenz-Hook (`useComposerPersistence.ts`) härten
Beim Speichern des Storyboards: **DELETE alte Szenen vor INSERT** (transaktional via RPC oder upsert mit unique key auf `(project_id, order_index)`). Verhindert künftige Duplikate.

### 3. Unique Constraint auf `composer_scenes`
```sql
ALTER TABLE composer_scenes ADD CONSTRAINT composer_scenes_project_order_unique 
UNIQUE (project_id, order_index);
```
Macht künftige Duplikate technisch unmöglich.

### 4. `compose-video-assemble` defensiv filtern
Auch wenn DB sauber ist: nur Szenen mit `clip_status='ready' OR (clip_source='upload' AND upload_url IS NOT NULL)` in den Render-Payload nehmen, geordnet nach `order_index`. Verhindert künftige False-Positives.

### 5. Klarere Fehlermeldung
Statt `"22 clips are not ready yet"` → konkret welche Szenen-Indizes fehlen, im UI als Toast: *"Szene 2 (Demo) ist noch nicht fertig — bitte erst alle Clips generieren"*.

### 6. Verify
- Nach Cleanup: nur 5 Szenen pro `order_index 0-4` in der DB
- Storyboard-Reload erzeugt keine neuen Duplikate
- "Video rendern" startet erfolgreich, Lambda bekommt 5 Clips
- Bei manuell pending-gelassener Szene → klare Fehlermeldung statt 500

### Was unverändert bleibt
- Pricing-Matrix, Quality-Tier, Webhook-Logik
- Briefing/Storyboard/Audio Tabs UI
- Universal Video Creator

