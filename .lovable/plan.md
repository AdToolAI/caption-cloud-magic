# V447 — Final Contract Reconciliation

Kein neues Feature. Ein Gate, das die verbliebenen Vertragsbrüche schliesst, damit danach genau ein S11-Abnahmelauf entscheiden kann. Kein Owner-Rerender, kein Frontend-Publish in diesem Gate.

Die fünf Befunde sind am aktuellen HEAD read-only bestätigt:
`pass-face-preclip.ts:316-333` (Reuse-Lookup über `scene_id + pass_idx + face_crop.size`, 15-Minuten-Fenster, ohne Run/Generation/Plate/x-y), `compose-twoshot-audio/index.ts:409` (`eleven_multilingual_v2` ohne `language_code`), `lipsync-frozen-contract.ts:85-87` (`geometryAnchorField: reference_image_url`, `runEntrypoint: beginSceneRun`), `compose-video-clips/index.ts:84` (Anti-Panel-Prompt schreibt „SAME physical room, on the SAME floor" vor), plus der `motion_unverified`-Pfad in `sync-so-webhook` / `lipsync-watchdog`.

## Was gemacht wird

### 1. P0 — Preclip-Reuse an die Run-Identität binden
Der Reuse-Lookup in `renderPassFacePreclip()` bekommt eine vollständige Artefakt-Signatur statt nur der Crop-Grösse: `active_run_id`, `plate_generation`, Plate-URL, `crop.x/y/size/outputSize` und BBox-Signatur müssen exakt übereinstimmen. Fehlt eine dieser Angaben am gefundenen Datensatz (die heutigen Zeilen haben `run_id = NULL`), gilt er als nicht wiederverwendbar. Neue Preclip-Renders schreiben die Signatur beim Anlegen mit. Ergebnis: ein Artefakt aus einem früheren Lauf kann einen neuen Lauf nicht mehr betreten.

### 2. P1 — `motion_unverified` blockiert den Mux
`motion_unverified` wird zu „verification pending" statt „succeeded":
- Der Pass wird nicht als erfolgreicher Sync-Job gezählt; die Aggregationsbarriere zum `audio_mux_pending` schliesst erst, wenn jeder Pass entweder gemessene Bewegung hat oder der einmalige Recheck entschieden hat.
- Der Watchdog-Recheck kann terminalisieren: der Job bleibt bis dahin in einem nicht-terminalen Zustand, damit `ssw:noop_fail` nicht mehr als `conflicting_duplicate` an der Duplicate-Matrix abprallt.
- Bleibt die Messung auch beim Recheck Infra-defekt, entscheidet eine explizite, bounded Auflösung (kein Endloszustand) — Pass läuft weiter und wird als `motion_unverified_accepted` telemetriert.

### 3. P1 — Deutscher Voice-Lock im Dialogpfad
`compose-twoshot-audio` nutzt denselben `withTtsLanguage()`-Lock wie `generate-voiceover` (sprachbewusstes Modell + gesetztes `language_code`) statt hartkodiertem `eleven_multilingual_v2`. Der Legacy-`no_run_stamp`-Direktschreibpfad wird geschlossen oder eindeutig als unerreichbar markiert.

### 4. P1 — T9 wieder explizit machen
Der Pre-Dispatch-Gate-Vertrag wird an einer Stelle sichtbar und fail-closed:
- Face-Share-Floor 0.24 für Mehrsprecher-Szenen als echter Vergleich gegen den bereits gespeicherten `preclip_face_share`.
- Mindestgesichtsgrösse: die heutige Ratio-Prüfung wird fail-closed, statt nach fehlgeschlagenem Framing-Retry mit dem Original weiterzulaufen.
- `syncso-face-gate.ts`: `probe_unavailable` gibt für Mehrsprecher-Szenen nicht mehr `ok: true` zurück.
- Containment bleibt wie in V445 (schon fail-closed).

### 5. P1 — Anti-Panel-Prompt auf Topologie reduzieren
`V446_ANTI_PANEL_SUFFIX` verlangt künftig nur noch: eine Kamera, eine zusammenhängende physische Welt, keine Panels/Seams/Kacheln, gemeinsame Perspektive und Lichtrichtung. Die Handlungsvorschrift („stand together in the SAME physical room, on the SAME floor") entfällt, damit Auto, Telefonat, Sitzen und Maschinenarbeit erhalten bleiben. Dieselbe Bereinigung im Anchor-Prompt in `compose-scene-anchor`. Zusätzlich greift der Split-Screen-Klassifikator ab N ≥ 2 statt N ≥ 3, damit die Zweispalten-Collage nicht durchrutscht.

### 6. Vertragsdokument an den kanonischen Pfad angleichen
`lipsync-frozen-contract.ts` beschreibt wieder, was der Code tut: `runEntrypoint` = `startSceneRun` / `composer_start_scene_run` (alter `beginSceneRun`-Pfad als Legacy markiert), und die Geometrie-Autorität wird zweigeteilt dokumentiert — Anchor = Identität/Assignment, finale Plate = Preclip/Dispatch/Reprojektion. Die Freeze-Tests prüfen danach den tatsächlich gültigen Vertrag.

### 7. P2 — Mux-Worker-Cap
`framesPerLambda`/Worker-Cap zurück auf die dokumentierte Grenze (max 5 Worker). Nur wenn die übrigen Punkte sauber sind; sonst separat.

## Abnahme dieses Gates
Deno-Tests der betroffenen Shared-Module inkl. neuer Regressionstests für Reuse-Signatur, `motion_unverified`-Terminalisierung, T9-Floors und Anti-Panel-Topologie; Vitest-Suite; Build. Deploy nur der berührten Functions (`compose-dialog-segments`, `compose-video-clips`, `compose-scene-anchor`, `compose-twoshot-audio`, `sync-so-webhook`, `lipsync-watchdog`).

Falls Punkt 2 eine DB-Migration an der Duplicate-Matrix-RPC erfordert, wird das vorher explizit als eigener Schritt gemeldet und nicht stillschweigend mitgemacht.

## Danach
Gate 2 — FINAL S11 ACCEPTANCE: genau ein Owner-Rerender ohne parallele Änderungen, Prüfung von Anchor → Plate → Assignment → 6 Preclips → 6 Provider-Outputs → 6 gemessene Outcomes → Reprojektion → Mux → complete, plus visuelle Abnahme (vier korrekte Personen, korrekte Sprecher, bewegte Lippen, keine Panels, keine Crop-Kanten, deutscher Ton, erhaltene Action).
