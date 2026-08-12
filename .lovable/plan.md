# Seedance-Fehler + Fortschrittsleiste endgültig korrigieren

## Bestätigter Befund

### 1. Seedance erhielt weiterhin die falschen Bilder
Der letzte Live-Lauf der Szene `696e…aa02` scheiterte mit `InputImageSensitiveContentDetected.PrivacyInformation`.

Die Backend-Logs zeigen eindeutig:
- Der komponierte Szenen-Anker wurde erfolgreich erzeugt und mit **4/4 Personen** geprüft.
- Beim anschließenden Seedance-Aufruf stand der Visual-Plan trotzdem auf `inputMode=references`, `refs=4`.
- ModelArk meldete entsprechend `content[1]` bis `content[4]` als einzelne Personenbilder.

Der aktuelle Quellcode enthält bereits die vorgesehene Anker-Priorisierung, der fehlgeschlagene Live-Lauf hat diese Fassung aber noch nicht ausgeführt. Der Text „Es wird jetzt der komponierte Szenen-Anker gesendet“ war deshalb für diesen Lauf verfrüht.

### 2. Eine fehlgeschlagene Szene gilt weiterhin als aktiv
In `usePipelineProgress.ts` zählt `twoshotStage='anchor'` als aktiver Backend-Schritt, selbst wenn dieselbe Szene bereits `clipStatus='failed'` hat. Dadurch bleibt:
- `clipsReal.running=true`,
- das Clips-Event aktiv,
- der obere Balken im Ladezustand.

Die Datenbank bestätigt genau diese Kombination: `clip_status='failed'`, aber `twoshot_stage='anchor'`.

### 3. Re-Render muss sichtbar bei exakt 0 % beginnen
Der Re-Render-Button läuft über `useSceneGenerate` und sendet `clips:start`. Die lokale Reset-Logik räumt bereits alte Floors und Snapshots auf, aber der globale Run-Floor erzwingt unmittelbar mindestens 1 %, und die bisherige Live-Fassung kann noch den alten Snapshot/Floor verwenden. Der Neustart wird daher nicht zuverlässig als echter 0-%-Start sichtbar.

## Umsetzung

### Schritt 1 — Terminalzustand hat immer Vorrang
In `usePipelineProgress.ts` wird ein gemeinsamer Terminal-Guard für Master-Clips verwendet:
- `clipStatus='failed'` oder `canceled` beendet jede Clip-Aktivität sofort.
- Alte `replicatePredictionId`, `twoshotStage`, `dialogShots` oder Lip-Sync-Felder dürfen eine terminale Szene nicht wieder als laufend markieren.
- Fehlgeschlagene Szenen zählen als „abgeschlossen mit Fehler“; die Clips-Phase wird `failed`, das Event-Flag wird entfernt und die Laufzeit/ETA stoppt.
- Die gleiche Priorität wird in Lazy-Baseline und Stall-Erkennung angewendet, damit kein Nebenpfad den Spinner erneut aktiviert.

### Schritt 2 — Re-Render als atomarer neuer Lauf
Bei jedem `clips:start`, einschließlich „Neu rendern“ an einer einzelnen Szene:
- aktuellen Projekt-Snapshot und alten `default`-Snapshot löschen,
- Pipeline-Zeit, Run-Floor, Phasen-Floors, Baseline, Stall-Messung und alte Event-Flags in einem Reset zurücksetzen,
- den ersten sichtbaren Zustand auf **0 %** setzen (kein Mindestwert von 1 %),
- erst danach den neuen Generating-Status fortschreiben.

Damit beginnt auch ein Re-Render nach einem Fehler unabhängig vom vorherigen Prozentstand bei 0 %.

### Schritt 3 — Seedance-Ankervertrag im Live-Backend durchsetzen
Für `ai-seedance25` mit Lip-Sync/Identity-Schutz:
- `reference_image_url` belegt exklusiv den ModelArk-Eingabeslot als `first_frame`,
- sämtliche einzelnen Cast-Porträts werden aus `referenceImageUrls` entfernt,
- der Request wird vor Versand abgebrochen, falls ein geschützter Lauf dennoch mehrere Personenreferenzen statt des Ankers enthält,
- die Nutzerfehlermeldung behauptet die automatische Korrektur nur, wenn diese Fassung tatsächlich aktiv ist.

Die betroffenen Backendfunktionen werden anschließend aktualisiert, damit Live-Code und Repository übereinstimmen.

### Schritt 4 — Regressionstests und Live-Nachweis
Tests decken mindestens ab:
1. `failed + twoshotStage='anchor'` → Clips-Phase `failed`, `isActive=false`, keine weiterlaufende ETA.
2. `failed + alte Prediction-/Dialog-Daten` → ebenfalls terminal.
3. Re-Render nach hohem altem Floor → erster Wert 0 %, danach normal ansteigend.
4. Seedance 2.5 + Lip-Sync + vier Cast-Mitglieder + Anker → genau ein `first_frame`, null `reference_image`-Porträts.
5. Normale Seedance-Multireferenz ohne geschützten Anker bleibt weiterhin möglich.

Danach kontrollieren wir einen neuen Lauf anhand der Logs: `inputMode=first-frame`, `refs=0`; bei einem absichtlich simulierten Fehler stoppt die Leiste sofort, und „Neu rendern“ startet bei 0 %.

## Scope
Betroffen sind die Fortschrittsableitung, ihre Tests sowie die Seedance-/Visual-Input-Dispatchlogik. Die Lip-Sync-Baseline, Credits und übrigen Provider werden nicht umgebaut.
