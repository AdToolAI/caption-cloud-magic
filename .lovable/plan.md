# Warum S01 trotz gekürztem Skript an `dialog_too_long_for_plate` scheitert

## Befund aus dem echten Run (in der Datenbank geprüft)

Szene `b34d1eae…` (order 0, happyhorse, 13 s):

- `dialog_script` enthält **4 Zeilen** (die gekürzte Fassung).
- `dialog_turns` enthält weiterhin **6 Turns** (die alte Fassung).
- `clip_error = twoshot_audio_prep_failed: dialog_too_long_for_plate`, `twoshot_stage = failed`.

Die Server-Funktion `compose-twoshot-audio` liest laut Code die Blöcke **aus
`dialog_turns`** (ID-Only, v200/v201) und benutzt `dialog_script` nur als
Fallback. Sie hat also die alten 6 Turns vertont: gesprochene Länge > 13 s + 5 s
Auto-Extend-Deckel → harter Abbruch.

Die neue Ausrichtung (`alignDialogTurnsToScript`) greift nur, während im Editor
getippt wird. Bei dieser Szene war das Skript **bereits vorher** gekürzt
gespeichert worden, deshalb feuert der Speicher-Effekt nie
(`script === scene.dialogScript`) und die Turns bleiben für immer schief.

Zweite Szene (`34d223fd…`, order 1, 15 s) hat 9 Turns bei leerem `dialog_script`
— dieselbe Divergenz in die andere Richtung.

## Was umgesetzt wird

1. **Reparatur beim Laden (Client, `SceneDialogStudio.tsx`)**
   Wenn eine Szene geladen wird und ein nicht leeres `dialogScript` vorliegt,
   dessen Zeilenzahl/Sprecher von `dialogTurns` abweicht, wird einmalig
   ausgerichtet und persistiert — dieselbe Funktion wie beim Tippen, dieselbe
   ID-Stabilität. Leeres Skript ändert nichts (Turns bleiben Wahrheit).

2. **Serverseitige Abgleichsstufe (`compose-twoshot-audio`)**
   Vor dem Blockbau: liegt ein nicht leeres `dialog_script` vor und weicht
   dessen Zeilenzahl von `dialog_turns` ab, werden die Turns nach denselben
   Regeln (Position hält ID, Namensprefix gewinnt) auf das Skript reduziert
   bzw. erweitert und die Szene aktualisiert. Damit kann kein veralteter Turn
   mehr vertont werden, egal über welchen Einstieg der Run startet.
   Fällt ein Sprecher nicht auf den Cast auf, bleibt das bestehende
   fail-closed-Verhalten unverändert.

3. **Preflight statt Abbruch nach 60 s**
   `SceneCard` kennt die Schätzung bereits (`estimateSpokenSeconds` /
   `dialogExceedsPlate`), rechnet sie aber gegen `dialogScript`. Die Prüfung
   wird auf die *effektive* Quelle umgestellt (ausgerichtete Turns) und der
   Generieren-Button blockiert mit klarer Meldung („Skript ~X s, Plate Y s —
   kürzen oder Szene auf Z s verlängern"), bevor Credits fliessen.

4. **Diese beiden Szenen konkret**
   Nach der Reparatur zeigt S01 4 Blöcke; S02 hat kein Skript und behält seine
   Turns. Beide sind dann neu renderbar; erst wenn die Schätzung passt, gibt
   der Preflight frei.

## Tests

- Erweiterung von `alignDialogTurnsToScript.test.ts` um den Reparaturfall
  „gespeichertes Skript kürzer als gespeicherte Turns, kein Tippen".
- Neuer Vertragstest für die Serverstufe: 6 Turns + 4 Skriptzeilen ⇒ 4 Segmente,
  Turn-IDs der ersten vier unverändert.

## Lip-Sync-Sicherheit

Keine Änderung an der eingefrorenen Lip-Sync-Kette. Turn-IDs bleiben stabil
(v201), es werden nur überzählige Turns entfernt; Anker-/Kontinuitätslogik
(v400/v426) wird nicht berührt.
