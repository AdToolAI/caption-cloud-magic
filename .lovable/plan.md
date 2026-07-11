## Korrektur der Richtung

Du hast recht: **die Verdrahtung darf nicht über Namen laufen**. Namen dürfen nur Anzeige-Labels sein. Die technische Zuordnung muss durchgehend über Character-IDs laufen, weil genau dafür Cast & World integriert wurde.

## Ziel

Wenn die Briefing-Analyse Sprecher zuordnet, soll im Storyboard gelten:

```text
Dialog-Turn 1 -> characterId A
Dialog-Turn 2 -> characterId B
Dialog-Turn 3 -> characterId C
Dialog-Turn 4 -> characterId D
```

Der sichtbare Text im Editor darf weiterhin `Samuel Dusatko: ...` anzeigen, aber die eigentliche Sprecher-Erkennung, Blockzählung und spätere Lip-Sync-/Voice-Zuordnung darf nicht davon abhängen, ob der Name exakt matcht.

## Umsetzung

1. **Plan-Apply schreibt ID-basierte Dialog-Metadaten in die Szene**
   - Beim Anwenden des Production Plans werden die `dialogTurns` mit `speakerCharacterId` als technische Quelle übernommen.
   - Für jede Szene wird eine stabile, geordnete Dialog-Struktur gespeichert, z. B. sinngemäß:
     ```text
     [{ speakerId: UUID, displayName: "Samuel Dusatko", text: "..." }]
     ```
   - `displayName` ist nur UI; `speakerId` ist verbindlich.

2. **`dialogScript` bleibt nur die sichtbare Editor-Fassung**
   - Das Textfeld zeigt weiterhin menschenlesbar:
     ```text
     Samuel Dusatko: Hi!
     Matthew Dusatko: Hi Samuel!
     ```
   - Diese Darstellung wird nicht mehr als alleinige technische Wahrheit verwendet.

3. **SceneDialogStudio liest zuerst die ID-Struktur**
   - Für Blockzählung, Sprecherzählung, Voice-Slots und spätere Voiceover-Erzeugung nutzt das Studio zuerst die gespeicherten `speakerId`s.
   - Der bestehende Textparser wird nur noch als manueller Fallback genutzt, wenn der Nutzer komplett frei Text eingibt und keine ID-Struktur vorhanden ist.

4. **Cast-Auflösung bleibt UUID-basiert**
   - `characterShots[].characterId`, `speakerCharacterId`, `requiredDialogSpeakerIds` und Voice-Maps werden auf dieselbe UUID normalisiert.
   - Kein Fuzzy-Matching, kein First-Name-Matching, kein Name-Substring-Matching für automatische Briefing-Pläne.

5. **Manuelle Bearbeitung bleibt möglich**
   - Wenn der Nutzer im Storyboard Text ändert, bleiben die vorhandenen Zeilen weiter an ihre IDs gebunden, solange die Zeilenstruktur erhalten bleibt.
   - Wenn der Nutzer neue Sprecherzeilen manuell hinzufügt, kann der bestehende Parser als UI-Fallback greifen und der Nutzer ordnet diese manuell zu.

6. **Validierung**
   - Testfall: 4 zugeordnete Sprecher im Production Plan müssen im Storyboard sofort als 4 Dialog-Blöcke / 4 Sprecher erscheinen.
   - Stimmen bleiben leer und werden manuell ausgewählt.
   - Anzeige-Namen dürfen fehlen oder anders geschrieben sein, solange die IDs vorhanden sind.

## Ergebnis

Die Pipeline wird damit wieder sauber: **Briefing-Analyse setzt Sprecher per ID, Storyboard übernimmt Skript per ID, Voice bleibt manuell. Namen sind nur Labels, nicht die Verdrahtung.**