## Ziel

Die Regie-/Briefing-Zeilen dürfen nicht mehr als gesprochenes Skript erscheinen — weder im Production-Plan noch nach dem Anwenden im Storyboard/Scene Script Editor. Outfit-Dropdowns sollen außerdem nicht mehr irreführend „Look 1“ / „Look 2“ anzeigen, wenn die echte Outfit-Bezeichnung noch lädt oder vorhanden ist.

## Diagnose

1. Der bisherige Filter greift nur in einem Anzeige-Block im Production Plan.
2. Beim Anwenden wird `dialogScript` weiterhin aus den rohen `dialogTurns` gebaut und gespeichert.
3. Der Scene Script Editor liest genau dieses gespeicherte `dialogScript`; deshalb tauchen `AUTO-DIRECTOR`, `15 Sekunden`, `Cinematic, realistisch`, `1 Hauptfigur` usw. weiter als Sprecherzeilen auf.
4. Die Outfit-IDs sind grundsätzlich korrekt verdrahtet; „Look 1/2“ ist ein UI-Fallback, der sichtbar wird, wenn die Namens-Query noch nicht fertig ist oder ein Name als Platzhalter verworfen wird.

## Umsetzung

### 1. Zentralen Skript-Sanitizer erweitern

Datei: `src/lib/motion-studio/planDisplayFilter.ts`

- `isDirectiveTurn()` bleibt zentrale Erkennung.
- Erkennung erweitern um typische Regie-/Briefing-Sätze:
  - `AUTO-DIRECTOR`, `synthesize full screenplay`, `full screenplay from briefing`
  - Timing: `15 Sekunden`, `0 bis 15 Sekunden`, `3-15 seconds`
  - Struktur: `1 Hauptfigur`, `1 durchgehende Szene`, `4 Sprecher`
  - Style-Ketten: `Cinematic, realistisch`, `Düster, intensiv, realistisch, hochwertig`
  - Negative-/Action-Fragmente wie `oder Game-Look`, `und Trümmergeräusche`, `Kein unnötiger Gore...`
- Neue Funktion `sanitizeDialogScript(script)` hinzufügen, die Zeilen im Format `SPEAKER: text` prüft und nur echte gesprochene Zeilen zurückgibt.

### 2. Apply-Pfad bereinigen, bevor gespeichert wird

Datei: `src/hooks/useApplyProductionPlan.ts`

- Beim Erzeugen von `dialogScript` aus `rawTurns` zuerst alle `isDirectiveTurn(t.text)`-Einträge herausfiltern.
- `hasDialogTurns`, Sprecher-Voice-Ermittlung und `dialogScript` sollen mit den bereinigten Turns arbeiten, damit Regiezeilen nicht als Sprecher gelten.
- Falls keine echten Dialogzeilen übrig bleiben, kein Fake-Dialog speichern; dann bleibt nur Szene/Action/Prompt erhalten.

### 3. Alte bereits gespeicherte Skripte im Editor automatisch sauber anzeigen

Datei: `src/components/video-composer/SceneDialogStudio.tsx`

- Beim Initialisieren und beim Szenenwechsel `scene.dialogScript` durch `sanitizeDialogScript()` laufen lassen.
- Wenn ein bestehendes gespeichertes Skript bereinigt wurde, einmalig per `onUpdate({ dialogScript: cleaned })` zurückschreiben, damit alte verschmutzte Szenen repariert werden.
- Manuelles Tippen des Nutzers bleibt unverändert; nur geladene vorhandene Skripte werden bereinigt.

### 4. Outfit-Label-Fallback korrigieren

Datei: `src/components/video-composer/briefing/ProductionPlanSheet.tsx`

- Den finalen sichtbaren Fallback `Look ${idx + 1}` entfernen.
- Wenn ein echter Name noch nicht geladen ist, stattdessen neutral `Outfit lädt…` oder `Outfit` anzeigen, nicht `Look 1/2`.
- DB-Namen aus `avatar_outfit_looks.name` weiterhin priorisieren.
- `Standard-Look` nicht pauschal als ungültig behandeln, wenn es aus der Datenbank kommt; nur offensichtliche leere/unnamed Platzhalter aus der Mention-Library verwerfen.

## Verifikation

- Letzte betroffene Szene mit gespeichertem `dialog_script` enthält aktuell nachweislich Regiezeilen wie `AUTO-DIRECTOR`, `15 Sekunden`, `1 Hauptfigur`.
- Nach dem Fix soll der Scene Script Editor diese Zeilen nicht mehr anzeigen und beim Laden bereinigt speichern.
- Neue Production-Plan-Anwendung darf nur echte Sprecherzeilen in `dialogScript` übernehmen.
- Outfit-Dropdown darf bei noch ladenden Namen nicht mehr „Look 1/2“ zeigen.