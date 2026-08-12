# Letzter Lip-Sync-Lauf: Befund und Korrektur

## Was der Lauf tatsächlich zeigt (in der Datenbank geprüft)

Szene 1 (`696e21c8…`, Position 1):
- `clip_source = ai-happyhorse`, `duration_seconds = 15`, `engine_override = cinematic-sync`
- `lip_sync_status = failed`, `twoshot_stage = failed`
- `clip_error = twoshot_audio_prep_failed: dialog_too_long_for_plate`
- 6 Dialogzeilen, 4 verschiedene Sprecher (Matthew spricht zweimal)

Szene 2 (`990b1646…`): ebenfalls `ai-happyhorse`, 15 s, 9 Dialogzeilen, `watchdog_never_dispatched`.

### Zu "6 Zeilen, aber nur 4 Sprecher"
Das ist kein Fehler. Sechs Dialogzeilen von vier Figuren sind korrekt — die Sprecheranzahl (= Lip-Sync-Pässe) wird über `countSceneSpeakers` nach Charakter-ID entdedupliziert, nicht über die Zeilenanzahl. Der Anker-Audit im Lauf hat sauber 4 Gesichter auf 4 Charaktere gemappt.

### Warum trotz Seedance-Auswahl HappyHorse lief
Der Rollout-Schalter `composer.feature.seedance25_lipsync` ist für dein Konto aktiv. Aber der Client-Hook `useSeedance25Lipsync` startet mit `false` und liest den Wert erst asynchron nach. Die Auto-Migration in `SceneCard.tsx` (Zeile 474–482) läuft sofort beim ersten Render — zu diesem Zeitpunkt gilt Seedance 2.5 noch als "nicht erlaubt", und die Szene wird auf HappyHorse zurückgeschrieben (inkl. DB-Write). Das passiert bei jedem Neuladen der Seite, unabhängig davon, was du im Picker gewählt hast.

### Warum der Lauf dann scheiterte
HappyHorse deckelt die Platte auf 15 s. Das gesprochene Skript der Szene ist deutlich länger; die Überlänge liegt über der 5-s-Verlängerungsgrenze in `compose-twoshot-audio` → harter Abbruch mit `dialog_too_long_for_plate`. Mit Seedance 2.5 (bis 30 s) wäre die Szene im Rahmen geblieben. Die beiden Symptome sind also eine einzige Ursachenkette.

## Umsetzung

1. **Auto-Migration nicht mehr auf einem ungeladenen Flag entscheiden**
   - `useSeedance25Lipsync` gibt künftig einen Ladezustand mit zurück (`{ enabled, loading }`, Rückwärtskompatibilität für bestehende Aufrufer bleibt).
   - Die Auto-Migration in `SceneCard` läuft erst, wenn der Flag-Zustand geladen ist. Solange geladen wird, wird keine `clipSource` überschrieben.
   - Ergebnis: eine gespeicherte Seedance-2.5-Szene bleibt beim Öffnen Seedance 2.5.

2. **Bestehende Szenen zurückholen**
   - Kein Auto-Rewrite in der Datenbank. Stattdessen bleibt die Auswahl im Picker erhalten, sobald Punkt 1 greift; die beiden betroffenen Szenen werden einmal manuell auf Seedance 2.5 gestellt.

3. **Ehrliche Längen-Rückmeldung statt Fehlschlag nach Credits**
   - Vor dem Start prüft der Composer: benötigte Sprechdauer gegen Maximaldauer der gewählten Platte.
   - Passt es nicht, erscheint eine klare Meldung mit den zwei möglichen Wegen (Text kürzen **oder** auf Seedance 2.5 wechseln und Szene verlängern) — statt eines Abbruchs mitten in der Pipeline.
   - Die Server-Prüfung in `compose-twoshot-audio` bleibt als letzte Bremse unverändert bestehen.

4. **Gegenprobe**
   - Szene 1 mit 6 Zeilen / 4 Sprechern auf Seedance 2.5, Dauer 30 s: Auswahl bleibt nach Reload stehen, Lauf startet, 4 Lip-Sync-Pässe.

## Technische Details

- `src/hooks/useSeedance25Lipsync.ts` — Ladezustand ergänzen.
- `src/components/video-composer/SceneCard.tsx` — Effekt bei Zeile 474 gated auf `!loading`; Dependency-Liste erweitern.
- Präflight-Meldung im Composer-Dialogpfad (kein Eingriff in die eingefrorene Lip-Sync-Kette, keine Änderung an Schwellenwerten oder Masken).
- Keine Migration, keine Edge-Function-Änderung.
