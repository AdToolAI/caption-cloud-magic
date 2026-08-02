# Plan v377 — Alte Pipeline-Läufe strukturell unmöglich machen

## Warum dieser Plan und kein weiterer Patch

Die bisherigen Versionen v373–v376 waren inhaltlich richtig, aber an der falschen Stelle verankert: Der „harte Neustart" ist heute eine **Frontend-Konvention**. Jeder Aufrufpfad, der sie nicht befolgt, umgeht sie folgenlos.

Nachgewiesen am letzten Lauf:

- Drei **gleichzeitig offene** Plate-Attempts in **derselben Generation 1**.
- `AnchorPreviewGate` startet den Render direkt, komplett ohne Hard-Reset.
- `useSceneGenerate` wartet zwar auf den Reset, ignoriert aber dessen Fehlschlag und rendert trotzdem weiter.
- Der `audio_plan` trug noch abgeleitete Daten vom 01.08., 21:28.
- Die Datenbank erlaubt mehrere offene Läufe pro Szene; der vorhandene Index verhindert nur identische Provider-Job-IDs.

Konsequenz: Der Vertrag muss dorthin, wo er nicht umgangen werden kann — in die Datenbank und in genau **einen** Startpunkt. Bewusst **keine** zusätzlichen Watchdogs, Retries oder Heuristiken; davon existieren bereits zu viele und sie waren mehrfach selbst Fehlerquelle.

## Umsetzung

### 1. Genau eine Eintrittstür

Neue Funktion `composer-start-scene-generation` wird der **einzige** erlaubte Weg, einen kostenpflichtigen Clip-Render zu starten:

1. Szene exklusiv sperren
2. Generation atomar erhöhen, alte Attempts tombstonen
3. Locks, Inflight-Slots und abgeleitete Zustände löschen
4. Alte Artefakte entfernen
5. Unveränderliche `run_id` erzeugen
6. Erst danach `compose-video-clips` mit `scene_id + generation + run_id` starten

Reset und Render sind damit **eine** Transaktion statt zweier Client-Requests.

### 2. Invariante in der Datenbank statt im Client

Migration ergänzt:

- `run_id` auf `plate_attempts` und am aktuellen Szenenlauf
- Partieller Unique Index: **höchstens ein offener Attempt pro Szene**
- Atomare Startfunktion mit Row Lock, die Generation und Run-ID gemeinsam setzt
- Attempts werden nur registriert, wenn Generation **und** Run-ID zum aktuellen Lauf passen

Ein zweiter Dispatch wird abgelehnt, **bevor** Providerkosten entstehen. Grants, RLS und Service-Role-Zugriff werden in derselben Migration gesetzt.

### 3. Ein Reset darf nicht mehr still scheitern

- `hardResetSceneJob` liefert ein typisiertes Ergebnis statt `boolean`
- Fehler beim logischen Invalidieren **stoppen** den Start hart
- Nur physische Löschwarnungen sind tolerierbar, und auch nur wenn Generation und Run-ID sicher invalidiert wurden
- `composer-hard-reset-scene` meldet nicht länger `ok: true`, wenn intern Fehler auftraten

### 4. Alle Startpfade vereinheitlichen

Umgestellt werden: einzelnes „Clip generieren" / „Neu rendern", „Alle Clips generieren", Anchor-Preview → „Bestätigen & rendern", Preview-Neuerstellung sowie verbleibende direkte `compose-video-clips`-Aufrufe.

Preview-only bleibt kostenfrei, bekommt aber eine Preview-ID — bestätigt werden kann ausschließlich die aktuelle Preview.

### 5. Nur Nutzerinhalte überleben den Neustart

Erhalten bleiben: Skript, Sprecher- und Stimmauswahl, Timing-Vorgaben.

Gelöscht werden alle abgeleiteten Laufdaten: `audio_plan.twoshot`, `lipsync`, `segments_payload`, alte Dispatch-/Mux-/Preclip-/FaceMap-/Tracking-Daten, `dialog_shots`, `dialog_takes`, Provider-IDs, Locks, Inflight-Zeilen und Storage-Artefakte.

### 6. Webhooks an die Run-ID binden

- Plate-, Audio-, Sync.so- und Mux-Callbacks müssen `scene_id + generation + run_id` nachweisen
- `unregistered` ist für neue Jobs **nicht mehr** fail-open
- Nur ausdrücklich markierte Legacy-Jobs dürfen übergangsweise ohne Run-ID durch
- Watchdog und Recovery starten keinen Job, solange ein aktueller offener Attempt existiert

### 7. Die aktuell blockierte Szene bereinigen

Konkurrierende Attempts tombstonen, Locks und Inflight-Zeilen löschen, abgeleiteten Audio-/Lip-Sync-Zustand entfernen, Szene in einen sauberen Ruhezustand versetzen. **Kein automatischer kostenpflichtiger Neustart.**

## Verifikation

Regressionstests:

1. Doppelklick erzeugt genau einen Provider-Job
2. Anchor-Confirm kann den Reset nicht umgehen
3. Fehlgeschlagener Reset verhindert jeden Dispatch
4. Alter Webhook kann die neue Generation nicht beschreiben
5. Zwei parallele Starts ergeben einen Gewinner und einen sauberen Konflikt
6. Alte Audio-/Lip-Sync-Daten überleben den Neustart nicht
7. Watchdog erzeugt keinen zweiten Attempt
8. Fehlgeschlagene Szene beendet Fortschrittsanzeige und Locks

Danach ein kontrollierter Testlauf mit Prüfung von Logs und Datenbank: genau eine aktuelle Run-ID, genau ein offener Attempt, kein wiederverwendetes Artefakt.