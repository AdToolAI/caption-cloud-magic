# Re-Render strikt isolieren + vollständiges Briefing für alle Accounts

## Bestätigter Befund

### Re-Render
Die Datenbank besitzt bereits Laufidentitäten pro Szene (`active_run_id`, `plate_generation`) und der Code enthält einen vollständigen Hard-Reset. Der aktuell aktive Startpfad verwendet diesen vollständigen Reset jedoch nicht:

- `compose-video-clips` ruft nur `beginSceneRun()` auf.
- Dieser Teilreset leert einige sichtbare Felder, löscht aber nicht sämtliche Artefakte, abgeleiteten Audio-/Lip-Sync-Zustände und offenen Renderdatensätze des Vorlaufs.
- Der strengere Single-Run-Pfad wurde beim früheren Rollback im Frontend zum No-op gemacht.
- Beim letzten fehlerhaften Lauf blieb deshalb trotz `clip_status='failed'` noch `twoshot_stage='anchor'` stehen. Genau solche überlebenden Zustände lassen alte und neue Läufe in UI und Pipeline kollabieren.

### Briefing / Motion Studio
Die Screenshots und der Code zeigen zwei getrennte Ursachen:

- Im betroffenen Account ist **Quick** aktiv; Quick blendet mehrere Briefing-Bereiche aus.
- **Cast & World und Sprecher-Mapping sind sogar nur bei `editorMode === 'studio'` sichtbar.** Deshalb reicht der bisherige Default-Wechsel auf Direct nicht aus.
- Der einzige Modusschalter sitzt in der globalen `DirectorBar`. Wenn diese beim Scrollen, durch die Seitenhülle oder in einer älteren Live-Fassung nicht sichtbar ist, gibt es im Briefing selbst keinen verlässlichen Schalter.
- Der kleine Quick-Hinweis kann nur auf Direct wechseln und macht Cast & World weiterhin nicht sichtbar.

Damit war die bisherige Korrektur unvollständig: Sie änderte den Default, beseitigte aber die Feature-Gates nicht.

## Umsetzung

### 1. Ein Re-Render ersetzt den Vorgängerlauf vollständig
Jeder Szenenstart — Einzel-Re-Render, „Alle generieren“, Anchor-Bestätigung und alle weiteren Aufrufer — läuft durch **denselben serverseitig erzwungenen Startvertrag**:

1. Szene atomar sperren, `plate_generation` erhöhen und eine neue `active_run_id` vergeben.
2. Vorherigen Lauf sofort als überholt markieren, sodass verspätete Callbacks nicht mehr schreiben dürfen.
3. Offene Provider-Jobs abbrechen und belegte Slots freigeben.
4. Dispatch-Locks und offene Attempt-/Render-Zeilen des Vorlaufs schließen.
5. Alte generierte Artefakte löschen: Plate, Anchor, Frames, Preclips, Tracking, Face-Map, Pass-Videos und generierte Voiceover-Dateien/-Zeilen.
6. Alle abgeleiteten Zustände entfernen: alte URLs, Prediction-ID, `twoshot_stage`, Lip-Sync-Status, Dialog-Shots, abgeleitete Audio-Plan- und Scene-Asset-Daten.
7. Erst nach erfolgreicher Bereinigung den neuen Lauf auf `generating` setzen und dispatchen.

Die vom Nutzer erstellten Eingaben bleiben erhalten: Skript, Sprecher, Stimmen, Cast-Auswahl, Prompt und Szeneneinstellungen. Entfernt wird nur das Ergebnis und der technische Zustand des alten Laufs.

**Fail-closed:** Kann der alte Lauf nicht sicher invalidiert werden, startet kein neuer kostenpflichtiger Render. Ein Resetfehler darf nicht mehr ignoriert und anschließend trotzdem dispatched werden.

### 2. Alte Callbacks dürfen den neuen Lauf nie überschreiben
Alle Provider- und Poller-Rückmeldungen werden an `scene_id + plate_generation + active_run_id` gebunden.

- Rückmeldungen einer älteren Generation werden verworfen.
- ModelArk-Poller und übrige Clip-Webhooks schreiben nur auf den aktuell aktiven Lauf.
- Der Seedance-Fehlerpfad räumt beim terminalen Fehler ebenfalls `twoshot_stage`, Prediction-ID und alle aktiven Nebenstatus auf.
- Es gibt pro Szene höchstens einen offenen Run/Attempt.

So können zwei Läufe weder in der Datenbank noch in der Fortschrittsanzeige miteinander verschmelzen.

### 3. Fortschrittsleiste an die neue Run-ID binden
Die globale Leiste wird nicht nur durch ein allgemeines `clips:start`, sondern durch den neuen Szenenlauf identifiziert:

- neue `active_run_id` = neuer Fortschrittslauf,
- alter Session-Snapshot, Run-Floor, Phasen-Floors, Timer, ETA und Stall-Baseline werden sofort verworfen,
- erster sichtbarer Zustand ist exakt **0 %**,
- nur Zustände des aktuellen Runs dürfen den Balken erhöhen,
- `failed` oder `canceled` hat Vorrang vor alten Prediction-, Anchor-, Dialog- oder Lip-Sync-Markern und beendet die Leiste sofort.

### 4. Keine Briefing-Features mehr durch Quick/Direct/Studio verstecken
Die Modi dürfen künftig die Arbeitsweise und Dichte beeinflussen, aber **keine Funktion entfernen**.

Im Briefing sind für jeden eingeloggten Account und in jedem Modus sichtbar und erreichbar:

- Ton und Sprache
- Qualität, Dauer und Format
- Video-Modus
- **Cast & World Library**
- Sprecher-Zuordnung
- Regie-Notiz
- visueller Stil
- Marken-Kit und weitere vorhandene Briefing-Werkzeuge

Die bisherigen `showDirect`-/`showStudio`-Feature-Gates werden aus dem Briefing entfernt. Quick darf Bereiche kompakter oder eingeklappt darstellen, aber nie vollständig aus dem DOM entfernen.

### 5. Modusschalter zusätzlich direkt im Briefing
Der Quick/Direct/Studio-Schalter bleibt in der Director Bar, wird aber zusätzlich am Anfang des Briefings als dauerhaft sichtbarer, responsiver Modusschalter angeboten.

- Er zeigt eindeutig den aktiven Modus.
- Er ist auch erreichbar, wenn die globale Leiste außerhalb des Viewports oder durch die Seitenhülle verdeckt ist.
- Account-Wechsel synchronisieren die Preferences nach geladener Auth-Identität neu; ein initialer `anon`-Wert darf nicht im Zustand des neu eingeloggten Accounts hängen bleiben.
- Bestehende manuelle Moduswahl bleibt pro Account gespeichert, beeinflusst aber nicht mehr die Feature-Verfügbarkeit.

### 6. Seedance-Ankervertrag im Live-Backend sicherstellen
Der bereits vorgesehene geschützte Seedance-Pfad wird zusammen mit dem Run-Fix live verifiziert:

- Lip-Sync mit Cast sendet ausschließlich den komponierten Szenen-Anker als `first_frame`.
- Einzelne Cast-Porträts werden in diesem Fall nicht als ModelArk-Referenzen versendet.
- Ein Guard bricht vor dem Versand ab, falls geschützter Anker und mehrere Rohporträts trotzdem gemeinsam im Request landen würden.

## Technische Änderungen

- Den aktiven Teilreset in `compose-video-clips` durch den bestehenden atomaren Run-Start plus vollständigen `hardResetScene(..., generationOverride)` ersetzen; kein direkter Dispatch darf ihn umgehen.
- Startadapter und alle UI-Aufrufer wieder auf denselben Single-Run-Vertrag führen.
- ModelArk-/Webhook-Schreibpfade um Run-/Generationsprüfung ergänzen bzw. vorhandene Prüfung konsequent verwenden.
- `usePipelineProgress` nach aktueller Run-ID isolieren und terminale Clip-Zustände vor allen Nebenmarkern auswerten.
- `BriefingTab` von Feature-Gates entkoppeln und einen lokalen Modusschalter erhalten.
- `useStudioPreferences` bei Auth-/Account-Wechsel erneut aus dem benutzerbezogenen Schlüssel hydrieren.

Die Lip-Sync-Verarbeitung selbst wird nicht fachlich umgebaut; geändert werden nur Startisolation, Zustandsbereinigung und Schreibschutz zwischen Generationen.

## Verifikation

1. Re-Render einer laufenden Szene: alter Run wird invalidiert/abgebrochen, Artefakte und technische Zustände sind entfernt, genau ein neuer Run bleibt offen.
2. Verspäteter Callback des alten Runs: wird abgewiesen und verändert weder URL noch Status des neuen Runs.
3. Re-Render nach 99 % oder Fehler: Leiste zeigt zuerst 0 % und steigt ausschließlich mit dem neuen Run.
4. Terminaler Seedance-Fehler mit altem Anchor-Marker: Leiste stoppt sofort und zeigt Fehler.
5. Seedance 2.5 + vier Cast-Mitglieder + Lip-Sync: Log zeigt `inputMode=first-frame`, `refs=0`.
6. Neuer und bestehender Zweitaccount: Cast & World, Sprecher-Mapping und alle übrigen Briefing-Panels sind in Quick, Direct und Studio erreichbar.
7. Modusschalter ist im Briefing auf Desktop und Mobil sichtbar und bleibt pro Account getrennt.
