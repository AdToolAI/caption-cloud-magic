## Befund (an echten Daten verifiziert)

Es gibt heute tatsächlich **zwei Charakterquellen** parallel:

1. **Cast & World** (`brand_characters`) — echte UUID, z. B. `483f9cdc-…` = Samuel Dusatko.
2. **Projekt-Briefing** (`composer_projects.briefing.characters`) — eigene lokale ID, im betroffenen Projekt:

```text
id: "samuel-dusatko"
brandCharacterId: "483f9cdc-…"
name: "Samuel Dusatko"
```

Genau daraus entsteht die Dublette. Die Szene `6253b1af…` enthält beide Formen derselben Person:

```text
[ { characterId: "483f9cdc-…", characterName: "Samuel Dusatko" },
  { characterId: "samuel-dusatko" } ]
```

Der Prompt-Sync vergleicht nur gegen die Briefing-ID (`samuel-dusatko`), findet die vorhandene UUID nicht — und hängt Samuel ein zweites Mal an. Der bisherige v319-Fix löst Slugs, Namen und `outfit:`-Präfixe auf, kennt aber `brandCharacterId` nicht als kanonische Identität. Deshalb blieb das Problem bestehen.

**Outfits in der Briefing-Analyse:** Die Briefing-Charaktere tragen kein Outfit-Feld — im gespeicherten Briefing stehen nur `appearance`, `identityCardPrompt`, `referenceImageUrl`, `signatureItems`. Der Look liegt aber in `avatar_outfit_looks` am Cast-&-World-Avatar (Samuel hat dort „Brunch", „Casual", „Greek Hoplite"). Weil die Briefing-Analyse mit der Briefing-ID statt der Avatar-UUID arbeitet, findet sie die Looks nie — daher werden Outfits dort nicht angezeigt. Das ist derselbe Defekt, nicht ein zweiter.

## Lösung: Cast & World wird die einzige Charakterquelle

### 1. Eine einzige Identität pro Person
- Kanonische Cast-ID ist ausschließlich die `brand_characters`-UUID.
- Überall dort, wo Charakter-Pools gebildet werden, gilt: hat ein Briefing-Eintrag ein `brandCharacterId`, ist **das** seine Identität — der lokale Slug ist nur noch ein Alias fürs Auflösen, nie ein Wert zum Schreiben.
- Slug, Name, `lib:`-, `outfit:`- und `catalog:`-Referenz lösen alle auf dieselbe UUID auf.

### 2. Zweite Quelle abschalten
- Briefing-Charaktere ohne Cast-&-World-Verknüpfung können nicht mehr neu entstehen: Beim Hinzufügen wird immer der Avatar aus Cast & World übernommen (inklusive UUID, Portrait, Identity Card, Standardstimme).
- Auswahl-Oberflächen (Cast-Picker, Asset-Picker, Dialog Studio) zeigen nur noch Cast-&-World-Avatare als wählbare Personen; freie/verwaiste Briefing-Einträge werden beim Laden auf ihren Avatar gemappt statt separat angeboten.
- Bereits vorhandene Briefing-Einträge mit `brandCharacterId` werden beim Öffnen des Projekts still auf die UUID normalisiert.

### 3. Prompt-Sync härten
- Der automatische Abgleich „Name im Prompt → Cast" prüft vorhandene Slots gegen Slug **und** UUID und fügt neu erkannte Personen nur mit ihrer UUID ein.
- Damit hängt sich beim manuellen Hinzufügen eines anderen Charakters kein zweiter Samuel mehr an.

### 4. Outfits in der Briefing-Analyse sichtbar machen
- Die Analyse löst jeden Charakter zuerst auf die Avatar-UUID auf und lädt dann dessen Looks aus `avatar_outfit_looks`.
- Erkennt der Text ein Outfit („Casual", „Brunch", …), wird der passende Look-Eintrag gesetzt und im Chip angezeigt („Samuel Dusatko — Casual").
- Ohne Treffer bleibt der Standard-Look, wird aber ebenfalls als wählbar angezeigt, statt das Feld leer zu lassen.
- Der Look überlebt jedes Zusammenführen doppelter Slots (spezifischerer Shot-Type gewinnt, Outfit wird nie verworfen).

### 5. Server-Parität
- Die serverseitige Cast-Auflösung erhält dieselbe Alias-Logik, damit Portrait-Komposition und Lip-Sync-Pässe exakt so viele Slots bauen, wie Chips sichtbar sind.

### 6. Bestandsdaten bereinigen
- Einmalige Bereinigung der gespeicherten Szenen: Slug-Slots, die zu einem Avatar derselben Person gehören, werden mit dem UUID-Slot zusammengeführt.
- Projekt-Briefings werden auf die Avatar-UUID umgestellt, wo ein `brandCharacterId` hinterlegt ist.

## Verifikation
- Szene `6253b1af…` enthält danach genau **einen** Samuel-Slot mit UUID.
- Keine gespeicherte Szene enthält noch beide Identitätsformen derselben Person.
- Manuelles Hinzufügen eines Charakters hängt keinen weiteren an.
- Briefing-Analyse zeigt für jeden Charakter ein Outfit-Feld mit den echten Cast-&-World-Looks.
- Render-Log: Portrait-Slots und Lip-Sync-Pässe entsprechen exakt der Chip-Anzahl.