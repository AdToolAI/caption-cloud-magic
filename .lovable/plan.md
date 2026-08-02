# v387 — Stabilisierung statt Umbau

Ziel: keine neuen Features, keine weitere Architekturwelle. Wir schließen genau zwei bestätigte Brüche, verifizieren einen dritten, und frieren die Pipeline danach ein.

## Status: was gesichert ist und was nicht

**Bestätigt (aus den Function-Logs des letzten Laufs):**
`compose-video-clips` setzt bei aktiviertem Dialog/Lip-Sync den Zustand direkt auf `audio_prep`/`audio_ready` und ruft die Audio-Function auf, **bevor** die Plate fertig ist. Diese Updates umgehen `composer_scene_transition()`. Das ist die Ursache für „Lip-Sync startet, obwohl die Szene noch gebaut wird".

**Noch nicht bestätigt:**
Der aktuelle Fehler `lipsync_identity_collision` („Zwei Sprecher wurden demselben Charakter zugeordnet"). Erster Schritt ist deshalb eine Datenprüfung, kein Codefix — dazu unten Schritt 1.

## Schritt 1 — Sprecher-Kollision forensisch klären (vor jedem Fix)

Für die betroffene Szene auslesen:

- `dialog_turns` — welche Sprecher-UUIDs stehen dort wirklich
- `assignment_lock` — auf welchen Face-Slot zeigt jede UUID
- Cast-Liste der Szene — die UI zeigt vier Sprecher, sichtbar sind drei Chips
- die Rekognition-FaceIds des aktuellen Plate-Attempts

Damit wird eindeutig, welcher der drei möglichen Fälle vorliegt:

1. zwei Dialog-Turns tragen dieselbe Charakter-UUID (Fehler entsteht schon im Briefing/Skript)
2. zwei unterschiedliche UUIDs zeigen auf denselben Face-Slot (Fehler im Assignment-Lock)
3. die Plate enthält tatsächlich nur drei unterscheidbare Gesichter für vier Sprecher (Fehler im Plate-Prompt/Cast-Block)

Erst danach wird gefixt — und nur der Fall, der tatsächlich vorliegt.

## Schritt 2 — Den bestätigten Zustandsbruch schließen

- Den kompletten Audio-/Lip-Sync-Vorgriff aus `compose-video-clips` entfernen. Diese Function darf ausschließlich `plate_queued → plate_rendering` steuern und nichts nachgelagertes aufrufen.
- Audio-Prep wird nur noch nach bestätigtem `plate_ready` ausgelöst, also durch den Provider-Callback mit passendem Run und passender Generation.
- Verbleibende direkte Enum-Schreibstellen für `audio_prep`, `audio_ready`, `lipsync_*` und `complete` in Webhooks, Mux und Dialog-Dispatch auf die Transition-Funktion umstellen.

Verbindliche Reihenfolge, ohne Abkürzung:

```text
plate_rendering → plate_ready → audio_prep → audio_ready → lipsync_dispatched → lipsync_running → lipsync_muxing → complete
```

## Schritt 3 — Kollision abhängig vom Befund beheben

Je nach Ergebnis aus Schritt 1 genau eine Korrektur:

- **Fall 1:** Dedup der Sprecher-UUIDs beim Erzeugen der Dialog-Turns; doppelte Zuweisung wird beim Speichern abgelehnt, nicht erst kurz vor Sync.so.
- **Fall 2:** Der Assignment-Lock vergibt jeden Face-Slot exakt einmal; ein zweiter Anspruch auf denselben Slot führt zu einer klaren, frühen Fehlermeldung mit Nennung der betroffenen Namen.
- **Fall 3:** Der Cast-Block der Plate erzwingt so viele klar getrennte Gesichter wie Sprecher; passt das Ergebnis nicht, schlägt die Szene **vor** dem Lip-Sync fehl und die Credits werden erstattet.

In allen Fällen gilt: die Meldung nennt die konkreten Sprechernamen und den nächsten Schritt, nicht nur einen internen Fehlercode.

## Schritt 4 — Kein stiller Geldverbrauch

- Jeder Abbruch vor dem ersten Provider-Aufruf erstattet automatisch und idempotent.
- Ein Abbruch wegen Kollision oder fehlender Plate darf nie als „fertig" enden und nie Lip-Sync anzeigen.

## Schritt 5 — Freeze und Regressionsnetz

Nach diesen Korrekturen wird der Lip-Sync-Pfad eingefroren. Es kommen nur noch Tests dazu:

1. Dialog-Run bleibt während des Provider-Renders ausschließlich in `plate_rendering`.
2. Vor `plate_ready` gibt es keinen Audio- und keinen Sync.so-Aufruf.
3. Vier Sprecher ergeben vier verschiedene Face-Slots; doppelte Zuordnung wird früh abgelehnt.
4. Verspätete Callbacks eines alten Runs bleiben wirkungslos.
5. Provider-Fehler ist terminal, mit Erstattung, ohne Folge-Function.

Änderungen an dieser Kette danach nur noch mit vorheriger Absprache.

## Verifikation am echten Lauf

Ein 4-Sprecher-Testlauf, protokolliert nach Zeit:

- zuerst sichtbare Plate mit vier getrennten Gesichtern
- danach genau ein Audio-Claim
- danach genau ein Lip-Sync-Dispatch
- Ergebnis visuell prüfen: alle vier Sprecher bewegen die Lippen zu ihrem eigenen Text

Schlägt einer dieser Punkte fehl, wird nicht weitergebaut, sondern der Punkt einzeln geklärt.