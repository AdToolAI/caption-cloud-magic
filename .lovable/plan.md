## Befund (geprüft, nicht vermutet)

Ich habe den Weg vom Klick bis zur fertigen Szene durchgesehen — Code, Datenbankwächter und Übergangstabelle.

**Was jetzt sauber ist:**

1. **Ein Einstieg.** Kein einziger Client-Aufruf geht mehr direkt an `compose-video-clips`; alle sechs Startpunkte (SceneCard, ClipsTab, AnchorPreviewGate, FaceMapReviewDialog, SceneClipProgress, SceneDialogStudio) laufen über `startSceneGeneration` → `composer-start-scene-generation`.
2. **Ein Schreibpfad.** Im gesamten Funktionsbestand schreibt nur noch `scene-hard-reset.ts` (legitimer Zwangsschreiber) direkt auf `pipeline_state`. Alles andere geht über `transitionScene` / `failSceneState`.
3. **Wächter scharf.** Die Datenbankfunktion weist Klasse A (Wiederbelebung terminaler Szenen), Klasse B (Sprung in Ton/Lip-Sync ohne fertige Plate) und Klasse C (jeder nicht freigegebene Übergang) zurück und rollt inklusive Legacy-Spalten zurück.
4. **Protokolltabelle leer** — allerdings heißt das nur, dass seit dem Scharfschalten noch kein Durchlauf lief. Es ist noch **kein Praxisbeweis**, nur die Abwesenheit von Gegenbeweisen.

## Drei verbliebene Widersprüche

**A — Toter Schreibpfad in `_shared/clip-terminal-failure.ts`.** `buildClipRerenderPatch()` baut ein rohes `{ pipeline_state: 'failed' | 'idle', ... }`-Objekt für ein `.update()`. Aufrufer gibt es aktuell keine — aber die Datei steht auf der Ausnahmeliste des Vertragstests. Wer sie morgen wieder benutzt, bekommt keinen Testfehler und keinen Laufzeitfehler: Der Wächter rollt den Zustand still zurück, die Nebenfelder (`clip_url: null`) bleiben aber geschrieben. Das ist genau die Sorte halb angewendeter Schreibvorgang, die früher Szenen zerlegt hat.

**B — Zwei Besitzer für den Ton-Start.** Nach `plate_ready` ruft sowohl `compose-clip-webhook` (Server, Zeile ~251) als auch `useTwoShotAutoTrigger` (Client, Zeile ~155) `compose-twoshot-audio` auf. Der atomare Claim auf `audio_prep` verhindert den Doppellauf, aber es gibt zwei Auslöser für einen Schritt — und der Client-Pfad ist der, der bei Tab-Wechsel/Reload unvorhersehbar feuert.

**C — Rückwege in der Übergangstabelle sind asymmetrisch.** Aus `lipsync_muxing` führt kein Weg zurück nach `audio_ready` oder `plate_ready` (nur `complete`/`failed`/`idle`/`canceled`). Wenn ein Mux-Retry das versucht, wird er still zurückgerollt statt sichtbar zu scheitern. Aus `lipsync_running`/`lipsync_dispatched` existieren diese Rückwege dagegen. Entweder die Rückwege sind erlaubt — dann fehlt einer — oder sie sind es nicht, dann gehören die anderen weg.

## Der Plan

**1 — Toten Schreibpfad entfernen.** `buildClipRerenderPatch()` und `clipRerenderTargetState()` aus `_shared/clip-terminal-failure.ts` löschen (nur `isTerminalClipFailure` und die Meldungstexte bleiben — die haben Aufrufer). Danach `clip-terminal-failure.ts` von der Ausnahmeliste in `scene-state-write-contract.test.ts` streichen, damit die Datei künftig wieder vom Vertragstest bewacht wird.

**2 — Ton-Start auf einen Besitzer.** Der Server behält ihn: `compose-clip-webhook` bleibt der Auslöser nach `plate_ready`. Im Client wird der `compose-twoshot-audio`-Aufruf in `useTwoShotAutoTrigger` zum reinen Nachzügler-Netz — er feuert nur noch, wenn die Szene länger als 90 Sekunden auf `plate_ready` steht (Server-Webhook verloren gegangen). Der Lip-Sync-Zweig (Zeile ~296) bleibt unverändert.

**3 — Übergangstabelle symmetrisch machen.** Migration, die `lipsync_muxing → audio_ready` und `lipsync_muxing → plate_ready` ergänzt, damit ein Mux-Retry denselben Rückweg hat wie ein Lip-Sync-Retry. Reine Datenzeilen, keine Schemaänderung.

**4 — Praxisnachweis.** Ein vollständiger 4-Sprecher-Durchlauf, danach Kontrolle von `composer_state_guard_violations`. Bleibt sie leer, hält der Vertrag über einen echten Lauf. Einträge zeigen exakt die verbliebene Stelle mit Szene, Von-Zustand, Nach-Zustand und Grund — die kommt dann zuerst dran.

### Technische Details

- Punkt 1 ist eine Löschung plus eine Zeile aus der `ALLOWED`-Menge des Vertragstests; anschließend muss der Test weiterhin grün laufen.
- Punkt 2: Bedingung im Kandidatenfilter ergänzen — `canStartAudioPrep(d) && Date.now() - Date.parse(d.pipeline_state_at) > 90_000`. Dafür muss `pipeline_state_at` in die Select-Liste von Zeile 90 aufgenommen werden.
- Punkt 3: `INSERT INTO composer_scene_transitions ... ON CONFLICT DO NOTHING` für die zwei Paare.
- Kein Eingriff in `scene-hard-reset.ts`, `composer-start-scene-generation` oder die Wächterfunktion selbst — die drei sind geprüft und stimmig.
