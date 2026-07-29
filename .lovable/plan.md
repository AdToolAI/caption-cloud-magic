## Wie Artlist (und Epidemic/Soundstripe) es machen

Artlist zeigt nie einen Live-API-Katalog. Sie betreiben einen **eigenen, indexierten Katalog** mit:
1. **Nightly-Ingest** des kompletten Anbieter-Katalogs in eine eigene Tabelle (nicht die Provider-API im Request-Pfad).
2. **Facetten-Suche**: Sprache, Geschlecht, Alter, Akzent/Region, Use-Case, Stimmung, Tempo — als Filter-Chips, nicht als Dropdown.
3. **Volltext-Suche + Sortierung** (Popularität, Neu, Name) mit serverseitiger Pagination/Infinite-Scroll.
4. **Sofort-Preview** direkt in der Liste (gecachte Preview-Files, kein TTS-Call).
5. **Kuratierte Ebenen obendrauf**: „Staff Picks", „Für Werbespots", „Deine Favoriten", „Zuletzt benutzt" — damit der 100k-Katalog nicht erschlägt.

Genau diese Architektur ist bei uns schon zu 70 % vorhanden — sie liefert nur keine Daten.

## Was heute wirklich der Fall ist (verifiziert)

- `voice_library_cache`: **0 Zeilen** (Query bestätigt) → der Community-Teil der Bibliothek ist faktisch leer.
- Cron `refresh-voice-library-nightly` läuft täglich um 03:15 und meldet „succeeded", aber die Tabelle bleibt leer → die Edge Function schreibt nichts (Ursache noch **unbestätigt**; wahrscheinlichster Kandidat: der Shared-Voices-Call filtert mit `featured=true` **und** `category=professional`, was den Katalog auf fast null reduziert, bzw. der API-Key hat keinen Shared-Library-Zugriff).
- `list-voices` liefert daher nur: ~20 kuratierte `PREMIUM_VOICES` + die wenigen Voices im eigenen ElevenLabs-Account + geklonte Stimmen. Das erklärt exakt die beobachteten „~20 Stimmen".
- Der gute Picker (`UniversalVoiceLibraryPicker` mit Suche, Filtern, Infinite Scroll) wird nur an 4 Stellen benutzt. Mindestens 6 weitere Stellen haben **fest verdrahtete Kurzlisten**: `AvatarVoicePicker` (Cast & World, 9 Stimmen), `adTonalityVoiceMap`, `autoVoiceAssignment` (14), `VoiceOverEditor`, `CompanionSettings`, `AIToolsSidebar`.
- Nur `de/en/es` werden überhaupt ingestiert; nur 3 Sprachen sind in `VoiceLanguage` typisiert.

## Plan

### Phase 1 — Ingest reparieren und skalieren (Datenbasis)
1. `refresh-voice-library` zunächst manuell aufrufen und die Function-Logs auswerten, um die tatsächliche Fehlerursache zu bestätigen, bevor etwas geändert wird.
2. Ingest entschärfen und ausweiten:
   - `featured=true` entfernen, `category=professional` als *Ranking-Signal* statt Hard-Filter (zusätzlich `high_quality_base_model_ids` / Sortierung `trending`).
   - Paging von 5×100 auf „bis leer oder Limit" mit Cursor, Ziel-Größenordnung 5.000–20.000 Stimmen.
   - Sprachliste erweitern (de, en, es, fr, it, pt, nl, pl, tr, …) — konfigurierbar.
   - Robuste Fehlerbehandlung: Statuscode + Body loggen, Teil-Ergebnisse trotzdem upserten, `voice_library_sync_runs` (Zeit, geholt, upserted, Fehler) für Admin-Sichtbarkeit.
3. Cron zusätzlich mit Retry und Alarm bei „0 upserted".

### Phase 2 — Suche & Facetten serverseitig (Artlist-Mechanik)
4. `voice_library_cache` erweitern: `tsvector` Volltext-Spalte (Name, Beschreibung, Labels), Indizes auf `language`, `gender`, `age`, `accent`, `use_case`, `popularity`, GIN auf `supported_languages` + Volltext.
5. `list-voices` umbauen: echte SQL-Query mit Pagination und Facetten-Counts, statt 1000 Zeilen zu laden und im Speicher zu filtern. Premium/Cloned bleiben oben angepinnt.
6. Neuer Endpoint bzw. Response-Feld `facets`, damit die UI Filter-Chips mit Trefferzahlen zeigt.

### Phase 3 — Ein Picker für die ganze Plattform
7. `UniversalVoiceLibraryPicker` zum Standard machen: Facetten-Chips, Sortierung, Instant-Preview über `preview_url` (nur Fallback auf TTS), Sprachumschaltung, „Native only"-Toggle.
8. Kuratierung: Tabs „Empfohlen / Meine Stimmen / Favoriten / Zuletzt benutzt / Alle". Favoriten in neuer Tabelle `voice_favorites` (RLS auf `auth.uid()`), „Zuletzt benutzt" aus lokalem Verlauf.
9. Alle hartkodierten Listen ersetzen: `AvatarVoicePicker`, `VoiceOverEditor`, `CompanionSettings`, `AIToolsSidebar`, `SceneDialogStudio`, `ContentVoiceStep`.
10. `adTonalityVoiceMap` und `autoVoiceAssignment` behalten ihre 14 Stimmen **nur als Fallback**; die Auto-Zuweisung zieht künftig aus dem Katalog (gefiltert nach Sprache + Geschlecht + Use-Case „advertisement/narration"), damit vier Sprecher in einer Szene wirklich unterschiedlich klingen.

### Phase 4 — Absicherung
11. Preview-Rate-Limit pro User, damit die offene Bibliothek keine TTS-Kosten verursacht.
12. Admin-Panel-Kachel: letzte Sync-Zeit, Anzahl Stimmen pro Sprache, manueller „Jetzt synchronisieren"-Button.

## Technische Details

- Tabelle `voice_library_cache` bleibt Primärquelle; Änderungen additiv (neue Spalten + Indizes), keine Datenmigration nötig, da leer.
- Neue Tabellen `voice_favorites` und `voice_library_sync_runs` bekommen GRANTs + RLS (`voice_favorites`: nur eigener User; `sync_runs`: nur Admin-Read via `has_role`).
- `list-voices` behält den bestehenden Request-Vertrag (`useVoiceLibrary` bleibt kompatibel), Antwort wird um `facets` erweitert.
- ElevenLabs `/v1/shared-voices` gibt für jede Stimme `preview_url` zurück — die Vorschau kostet damit nichts.

## Offene Punkte

- Die genaue Ursache des leeren Ingests ist noch nicht bestätigt; Schritt 1 klärt das, bevor am Filter geschraubt wird.
- Sprachumfang: Vorschlag DE/EN/ES zuerst vollständig, dann FR/IT/PT/NL/PL/TR — anpassbar.
