# Stand der Lip-Sync-Pipeline im Motion Studio

## Was geprüft ist

- Der Composer-/Lip-Sync-Code trägt durchgehend den Juli-Marker `v283-baseline-27-07-full-composer-rollback`. In `compose-dialog-segments`, `sync-so-webhook`, `remotion-webhook`, `render-sync-segments-audio-mux`, `compose-video-clips`, `compose-clip-webhook`, `compose-twoshot-audio` und `lipsync-watchdog` findet sich kein `active_run_id`-, `plate_generation`- oder Enum-Guard-Rest mehr.
- Der Datenbank-Guard `composer_scene_state_guard` protokolliert nur noch (`v400_july_baseline_observe_only`) und blockiert keinen Abschluss.
- Die zuletzt gelaufene Szene `d7402a67…` steht sauber auf `complete / done / ready` mit finalem Clip.

## Was noch offen ist

- Seit der letzten Reparatur (02.08., 23:37 UTC) gab es **keinen neuen Lauf**. „Läuft jetzt problemlos durch“ ist damit nicht belegt, nur plausibel.
- Zwei Geschwisterszenen desselben Projekts (`dc220c23…`, `b88b7dac…`) endeten um 00:36 UTC mit `watchdog_never_dispatched` — sie wurden nie an die Lip-Sync-Kette übergeben. Ob das noch am alten Guard lag oder an einem eigenen Dispatch-Problem, ist unbestätigt.
- Die neuen Zustandsmodule werden noch von Randfunktionen (`composer-cancel-scene`, `composer-hard-reset-scene`, `composer-reset-selftest`, `composer-start-scene-generation`) genutzt. Sie liegen nicht im Hauptpfad, könnten aber beim Abbrechen/Zurücksetzen einer Szene wieder abweichende Zustände schreiben.

## Vorgehen

1. **Verifikationslauf statt weiterer Codeänderung**
   - Ein 4-Sprecher-Projekt neu erzeugen und den kompletten Weg beobachten: Plate → Audio → 4/4 Sync.so → Audio-Mux → Callback → `complete`.
   - Parallel Logs von `compose-dialog-segments`, `sync-so-webhook`, `remotion-webhook` und `lipsync-watchdog` mitlesen.

2. **`watchdog_never_dispatched` klären**
   - Die beiden betroffenen Szenen und die Watchdog-Logs des Zeitfensters auswerten.
   - Nur falls sich ein echter Dispatch-Fehler zeigt: gezielt die Übergabe von Szene 2..n an `compose-dialog-segments` reparieren, ohne neue Gates einzuführen.

3. **Randfunktionen angleichen**
   - Prüfen, ob Abbrechen/Hard-Reset einen Zustand hinterlässt, den die Juli-Kette nicht wieder aufnehmen kann.
   - Falls ja: diese Funktionen so anpassen, dass sie zusätzlich die Legacy-Felder konsistent zurücksetzen.

4. **Ergebnis festhalten**
   - Nach grünem Lauf `docs/lipsync-baseline-v283.md` um das Verifikationsdatum ergänzen.

## Kurzantwort

Der Code und die Datenbank stehen auf dem Juli-Stand, und der letzte Lauf ist vollständig durchgelaufen. Garantieren lässt sich der störungsfreie Ablauf aber erst nach einem frischen 4-Sprecher-Lauf — den sollten wir als nächsten Schritt machen.
