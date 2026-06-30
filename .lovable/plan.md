## Ziel
Alle Szenen im Production Plan müssen immer bearbeitbare Felder für **Sprecher, Outfit, Location und Voice** haben. Szene 2/3 dürfen nicht mehr ohne Cast-Feld erscheinen, und Lip-Sync-Szenen dürfen nach dem Anwenden nicht mehr als „ohne Voice-ID“ verifiziert werden.

## Diagnose
Der Screenshot zeigt drei gekoppelte Probleme im Review-/Apply-Mapping, nicht in der Lip-Sync-Renderpipeline:

1. **Cast-Feld wird versteckt**, sobald `s.cast.length === 0` ist. Deshalb fehlt bei Szene 2/3 das Sprecher-/Outfit-Feld komplett.
2. **Location-Healing funktioniert nur für vorhandene Location-Objekte.** Wenn Szene 2/3 kein `location` Objekt haben, bleibt das Dropdown zwar sichtbar, aber ohne echte Zuordnung.
3. **Voice-ID-Warnung ist eine Folge des fehlenden Casts.** Der Apply-Hook kann nur eine automatische Voice-ID zuweisen, wenn ein Sprecher/Charakter in der Szene vorhanden ist. Wenn Szene 2/3 keinen Cast haben, gibt es keinen Speaker-Key für `dialog_voices` und `character_voice_id`.

Wichtig: Es gibt bereits einen Auto-Voice-Pool mit echten Voice IDs. Wir brauchen also nicht zwingend manuell neue Voice IDs, sondern müssen sicherstellen, dass jede Lip-Sync-Szene einen Sprecher-Slot hat, damit die Auto-Voice-Zuweisung greifen kann.

## Plan

### 1. ProductionPlanSheet: fehlende Slots automatisch hydratisieren
Im Review-State wird jede Szene vor dem Anzeigen normalisiert:

```text
Für jede Szene:
- cast fehlt oder ist leer → cast[0] als leerer editierbarer Slot
- location fehlt → leeres location Objekt
- Continuity: "same founder / gleicher Avatar" → Cast + Outfit aus vorheriger gültiger Szene übernehmen
- Continuity: "same desk / gleiche Location" → Location aus vorheriger gültiger Szene übernehmen
```

Dadurch sind Szene 2 und 3 auch dann vollständig editierbar, wenn die KI unvollständige Arrays liefert.

### 2. Cast-UI immer anzeigen
Die aktuelle Bedingung:

```text
nur anzeigen, wenn s.cast.length > 0
```

wird entfernt. Stattdessen zeigt jede Szene mindestens einen Slot:

```text
Cast: — nicht zugeordnet —
Outfit: erscheint nach Avatar-Auswahl
Voice: Auto/Default-Badge, sobald eine Stimme ableitbar ist
```

### 3. Update-Funktionen robust machen
`updateSceneCastChar` und `updateSceneCastOutfit` werden so geändert, dass sie fehlende Slots erzeugen statt abzubrechen.

```text
Nutzer wählt Samuel in Szene 2
→ cast[0] wird angelegt
→ characterId = Samuel
→ outfitLookId separat wählbar
→ Auto-Voice kann greifen
```

### 4. Location-Zuordnung auf alle Szenen ausweiten
Die Location-Logik wird erweitert:

- `findLocationOption` prüft weiter echte Library-IDs und `catalog:*` IDs.
- Wenn Szene 2/3 keine Location haben, wird der beste bekannte Location-Wert aus Szene 1/Continuity übernommen.
- Wenn „Home Office“ in der Liste existiert, wird es im Dropdown ausgewählt statt `— nicht zugeordnet —`.

### 5. Auto-Resolve repariert fehlende Slots, nicht nur vorhandene
Der Auto-Resolve-Button soll künftig auch leere Szenen reparieren:

```text
Cast leer → primären Sprecher aus erster gültiger Szene übernehmen
Outfit leer → Outfit des gleichen Avatars aus erster/vorheriger Szene übernehmen
Location leer → Location aus erster/vorheriger Szene übernehmen
```

### 6. Voice-ID-Fallback im Apply-Hook absichern
Zusätzlich wird der Apply-Hook defensiv gehärtet:

- Wenn eine Lip-Sync-Szene einen Cast hat, aber keine `voiceId`, wird weiter der vorhandene Auto-Voice-Pool genutzt.
- Wenn `character_voice_id` leer wäre, wird die erste Stimme aus `dialogVoices` gesetzt.
- Die Verifikation soll nur noch warnen, wenn wirklich kein Sprecher vorhanden ist oder die Voice-Zuordnung technisch nicht geschrieben wurde.

### 7. Kein Eingriff in die Render-/Lip-Sync-Pipeline
Nicht angefasst werden:

- Sync.so Pipeline
- HappyHorse/Hailuo Providerlogik
- `dialog_shots`
- Clip-Rendering
- Anchor-/Plate-Generation

## Erwartetes Ergebnis
Nach Umsetzung:

```text
S01: Sprecher auswählbar, Outfit auswählbar, Location Home Office, Voice vorhanden
S02: Sprecher auswählbar, Outfit auswählbar, Location Home Office, Voice vorhanden
S03: Sprecher auswählbar, Outfit auswählbar, Location Home Office, Voice vorhanden
```

Und beim Anwenden sollte die Warnung `Lip-Sync-Szene(n) ohne Voice-ID` verschwinden, sofern mindestens ein Sprecher pro Lip-Sync-Szene ausgewählt oder automatisch übernommen wurde.