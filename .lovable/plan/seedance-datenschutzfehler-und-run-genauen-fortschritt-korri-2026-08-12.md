# Seedance-Datenschutzfehler und Run-genauen Fortschritt korrigieren

## Bestätigter aktueller Befund

Der letzte Re-Render der betroffenen Szene lief als neuer, isolierter Run (`plate_generation = 8`) und der vorherige Lauf wurde vor dem Dispatch zurückgesetzt. Die Run-Isolierung selbst greift.

Der Seedance-Anker-Fix greift ebenfalls:

- Der Resolver meldete `inputMode=first-frame`, `refs=0` und `anchor_takes_exclusive_slot`.
- ModelArk erhielt damit keine vier Cast-Porträts mehr.
- Der neue Providerfehler nennt nur noch `content[1]`: ModelArk lehnt jetzt den einzelnen komponierten Szenen-Anker ab, weil darin reale Personen erkannt werden.

Der Ladebalken hat einen separaten Fehler: `usePipelineProgress` berechnet den Clips-Abschluss über **alle** KI-Szenen des Storyboards. Ist die aktuelle Szene fehlgeschlagen, während eine andere Szene weiterhin `pending` ist, gilt die Phase weder als vollständig terminal noch als fehlgeschlagen. Das erklärt den weiterlaufenden Balken im Screenshot.

## Umsetzung

### 1. Fortschritt an den tatsächlichen Run binden

- `clips:start` und `clips:end` um `sceneIds` sowie nach der Run-Akquise um die aktuelle `run_id` ergänzen.
- `useSceneGenerate` meldet beim Einzel-Re-Render ausschließlich die betroffene Szene; „Alle generieren“ meldet ausschließlich die tatsächlich gestarteten Szenen.
- `usePipelineProgress` bewertet Ready/Failed/Running nur innerhalb dieser Run-Zielmenge statt über alle KI-Szenen des Projekts.
- Sobald ein Ziel dieses Runs terminal fehlschlägt und kein Ziel desselben Runs mehr aktiv ist, wird die Phase sofort `failed`; wartende oder fertige Szenen außerhalb des Runs haben keinen Einfluss.
- Beim neuen Run werden Snapshot, Floors, Timer, Baseline und vorherige Zielmenge atomar gelöscht. Der sichtbare Wert beginnt garantiert bei 0 %.

### 2. Seedance-Personenschutz als Provider-Capability behandeln

- Zuerst anhand der offiziellen BytePlus/ModelArk-Dokumentation verifizieren, ob für reale Personen eine Account-Freischaltung, Einwilligungsoption oder eigener Digital-Human-Endpunkt existiert.
- Gibt es eine offizielle Freischaltung, wird sie als explizite Server-Capability geprüft und der bestehende `first_frame`-Ankervertrag beibehalten.
- Gibt es keine offizielle Freigabe, wird Seedance 2.5 für Cast-/Lip-Sync-Szenen mit realen Personen bereits **vor Kosten und Dispatch** mit einer klaren Meldung blockiert. Es gibt keinen stillen Wechsel zu HappyHorse oder Hailuo.
- Seedance bleibt für Text-to-Video, Produkte, Umgebungen und zulässige synthetische Figuren verfügbar. Der bestehende Rohporträt-Schutz bleibt bestehen.
- Der Providerfehler wird nicht mehr als vermeintlich reparierbarer Bildfehler dargestellt, sondern erklärt präzise, dass ModelArk das Ankerbild wegen realer Personen abgelehnt hat.

### 3. Serverseitige Absicherung

- Direkt vor `createSeedance25Task` den endgültigen Payload-Vertrag protokollieren: Run-ID, Generation, Input-Modus und Anzahl der Bildrollen, jedoch keine URLs oder Bildinhalte.
- Für geschützte Anker fail-closed: genau ein `first_frame`, null `reference_image`; jede Abweichung bricht vor dem Provider-Aufruf ab.
- Providerfehler werden ausschließlich auf den noch aktiven Run geschrieben; späte Antworten alter Runs bleiben wirkungslos.

## Verifikation

- Einzel-Re-Render einer Szene bei weiteren wartenden Szenen: Fortschritt startet bei 0 %, nur diese Szene zählt.
- Providerfehler dieser Szene: Balken stoppt sofort und zeigt `Fehler`, unabhängig vom Zustand anderer Szenen.
- Direkt danach erneuter Re-Render: neue Run-ID/Generation, alter Snapshot wird nicht hydriert, Anzeige wieder 0 %.
- Seedance-Payload bei geschütztem Anker: exakt ein `first_frame`, keine Cast-Referenzen.
- Reale-Personen-Szene folgt der offiziell unterstützten BytePlus-Route; falls keine existiert, wird sie vor dem kostenpflichtigen Auftrag verständlich blockiert und nie still auf einen anderen Provider umgestellt.

## Technische Grenzen

Keine Änderung an Face-Mapping, Sync.so, Masken, Mux, Credits oder der Lip-Sync-Geometrie. Der Eingriff betrifft Run-Zuordnung, Fortschrittsableitung und den Seedance-Dispatch-Gate.
