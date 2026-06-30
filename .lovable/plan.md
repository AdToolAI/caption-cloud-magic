## Diagnose
Der Screenshot zeigt nicht primär ein neues UI-Problem, sondern eine Lücke im Location-ID-Vertrag:

- `home-office` wird als Location-Mention erkannt.
- Der Backend-Resolver prüft aber nur `brand_locations` per `user_id`.
- Die Frontend-Liste nutzt zusätzlich Katalog-/World-Locations (`catalog:location:...`) aus der auswählbaren Liste.
- Dadurch kann eine Location in der UI sichtbar sein, aber im Briefing-Plan trotzdem als „nicht in der Bibliothek gefunden“ markiert werden.
- Zusätzlich löst der Auto-Resolve-Button aktuell nur Cast, nicht Locations.

## Plan: v179 — Location ID Contract schließen

### 1. Einheitlichen Location-Normalizer einführen
Ich erstelle/verwende eine zentrale Normalisierung für Location-Namen und IDs:

```text
@Home Office
home-office
Home_Office
catalog:location:<uuid>
<uuid>
```

werden deterministisch auf denselben Match-Key gebracht.

### 2. Backend-Resolver erweitert auf Katalog-Locations
In `briefing-deep-parse` wird der Location-Snapshot erweitert:

- weiterhin persönliche Locations aus `brand_locations`
- zusätzlich verfügbare World-/Catalog-Locations aus `location_catalog_previews`
- IDs sauber als `catalog:location:<uuid>` markieren
- Resolver darf dann entweder echte Library-UUIDs oder `catalog:location:*` zurückgeben

Wichtig: Das betrifft nur Briefing-Analyse/Plan-Erstellung, nicht Lip-Sync oder Render-Pipeline.

### 3. Plan-Validation darf Catalog-Location-IDs akzeptieren
Die aktuelle Warnlogik behandelt nicht aufgelöste `locationId` als Fehler. Ich passe sie so an:

- echte UUID aus `brand_locations` = resolved
- `catalog:location:<uuid>` aus Catalog-Snapshot = resolved
- nur unbekannte Slugs bleiben Warnung

Damit verschwindet „Location home-office nicht gefunden“, wenn Home Office in der auswählbaren Liste existiert.

### 4. ProductionPlanSheet Auto-Resolve für Locations ergänzen
Der Button „Auto-Resolve“ soll nicht mehr nur Sprecher reparieren, sondern auch Locations:

- jede Szene mit `locationId === null` gegen `locOptions` matchen
- exakter Slug-Match vor fuzzy Match
- alle gleichen Mentions in Szene 1/2/3 gemeinsam aktualisieren
- offene Punkte live entfernen

### 5. Dropdown-Value stabilisieren
Im Review-Sheet wird geprüft, ob `s.location.locationId` wirklich in `locOptions` existiert:

- wenn ja: Dropdown zeigt die Location korrekt ausgewählt
- wenn nein: Wert bleibt leer und Warnung bleibt sichtbar
- verhindert tote IDs, die nicht auswählbar sind

### 6. Apply-Hook schützt Catalog-IDs korrekt
Beim Übernehmen ins Storyboard:

- `mentionedLocationIds` speichert echte UUIDs weiterhin als UUID
- Catalog-Locations bleiben als `catalog:location:<uuid>` erhalten, statt durch UUID-Filter verloren zu gehen
- Prompt-/Render-Pipeline bleibt unverändert, nur Metadaten werden sauberer

### 7. Kurzer Smoke-Test-Pfad
Nach Umsetzung prüfe ich per Codepfad:

```text
Briefing: Location @home-office
Plan: location.locationId = catalog:location:<uuid> oder echte UUID
Review-Sheet: Dropdown zeigt Home Office
Offene Punkte: keine location.locationId-Warnung mehr
Apply: Szene behält mentionedLocationIds
```

## Nicht angefasst
- keine Änderungen an Sync.so / Lip-Sync
- keine Änderungen an HappyHorse/Hailuo Providerlogik
- keine Render- oder Clip-Tab-Änderungen
- keine Datenbank-Schemaänderung nötig