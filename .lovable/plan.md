Beide Schritte sind **begonnen, aber nicht abgeschlossen**. Ich habe den aktuellen Stand gerade geprüft — hier ist, was wirklich steht und was fehlt.

## Stand heute (geprüft)

**Schritt 1 — teilweise erledigt.** Umgestellt sind: der Sync.so-Webhook (Vorwärtswechsel), der Mux-Versand und der zentrale Lip-Sync-Anstoß im Dialogpfad.

Noch direkt schreibend (56 Stellen in 9 Dateien):

| Datei | direkte Schreibvorgänge | davon vorwärts |
|---|---|---|
| `compose-dialog-segments` | 27 | 5 (`plate_ready`, `idle`, `audio_ready` ×3, `lipsync_running`) |
| `compose-video-clips` | 14 | 13 (alle `plate_rendering`) |
| `render-sync-segments-audio-mux` | 5 | 0 |
| `sync-so-webhook` | 4 | 0 |
| `_shared/clip-terminal-failure.ts`, `report-lipsync-motion-probe`, `hybrid-extend-scene`, `compose-twoshot-audio`, `_shared/scene-hard-reset.ts` | je 1–2 | gemischt |

**Schritt 2 — halb scharf.** Der Wächter `composer_scene_state_guard()` läuft, blockt aber nur zwei Klassen:
- Klasse A: Wiederbelebung einer fehlgeschlagenen/abgebrochenen Szene → blockiert
- Klasse B: Sprung in Ton-/Lip-Sync-Phase ohne fertige Plate → blockiert
- Klasse C: jeder andere nicht freigegebene Wechsel → **nur protokolliert, nicht abgewiesen**

Genau das ist die Lücke: Solange Klasse C nur mitschreibt, bleibt der Vertrag Konvention. Die Protokolltabelle ist derzeit leer — seit dem Ausrollen des Wächters lief noch kein Durchlauf, es gibt also noch keine Praxisdaten.

## Der Plan

**1a — Plate-Pfad umstellen (`compose-video-clips`).** Die 13 `plate_rendering`-Schreibvorgänge laufen künftig über `transitionScene(..., { from, runId, generation })`. Das ist der Pfad, der zuletzt Szenen verfrüht weitergeschoben hat; er bekommt damit Zeilensperre und Generationsabgleich.

**1b — Dialogpfad-Reste (`compose-dialog-segments`).** Die 5 verbliebenen Vorwärtswechsel umstellen. Der `idle`-Schreibvorgang (Zeile 1181) wird zusätzlich geprüft: Ein Rücksetzen auf `idle` mitten im Lauf gehört in den Reset, nicht in den Dialogpfad.

**1c — Randfunktionen.** `report-lipsync-motion-probe`, `hybrid-extend-scene`, `compose-twoshot-audio` und `_shared/clip-terminal-failure.ts` auf denselben Weg ziehen. `_shared/scene-hard-reset.ts` bleibt bewusst direkt — der Reset ist der einzige legitime Zwangsschreiber und bekommt stattdessen die Sitzungsmarkierung des Wächters.

**1d — Fehlerpfade.** Die ~40 `failed`-Schreibvorgänge bleiben inhaltlich, werden aber über den einheitlichen Helfer geführt, damit Protokoll, Erstattung und Zustand immer zusammen passieren statt an 40 Stellen getrennt.

**2 — Wächter scharf schalten.** Klasse C wechselt von „protokollieren" auf „abweisen": Jede Zustandsänderung ohne die Sitzungsmarkierung der Übergangsfunktion wird zurückgerollt und protokolliert. Reihenfolge ist wichtig — das passiert **nach** 1a–1d, sonst blockiert der Wächter noch nicht umgestellte Pfade und die Pipeline steht.

**3 — Absicherung vor dem Scharfschalten.** Ein Trockenlauf: Wächter bleibt im Protokollmodus, ein vollständiger 4-Sprecher-Durchlauf läuft durch, danach muss die Protokolltabelle **leer** sein. Erst wenn sie leer ist, wird abgewiesen. Findet sie Einträge, sind das exakt die vergessenen Stellen — die kommen zuerst dran.

### Technische Details

- Umstellungsmuster überall gleich: `.update({ pipeline_state: X, ... })` → `transitionScene(supabase, sceneId, { to: X, from: erwarteterZustand, runId, generation, reason })`; Nebenfelder (`clip_url`, `dialog_shots`, …) bleiben im selben Aufruf als Nutzlast erhalten
- Reset-Ausnahme: `scene-hard-reset.ts` setzt `set_config('composer.transition_scene', scene_id, true)` in seiner Transaktion
- Schritt 2 als Migration, die nur den Klasse-C-Zweig der bestehenden Wächterfunktion ersetzt — keine Schemaänderung, keine Datenmigration
- Vertragstest (Deno): scannt die vier Hauptfunktionen auf `pipeline_state:` in `.update(`-Aufrufen und lässt den Build scheitern, sobald wieder direkt geschrieben wird — Ausnahmeliste nur für `scene-hard-reset.ts`

Der Aufwand liegt in 1a–1d. Schritt 2 selbst ist ein kleiner Migrationseingriff — aber er ist der, der die Fehlerklasse endgültig schließt.
