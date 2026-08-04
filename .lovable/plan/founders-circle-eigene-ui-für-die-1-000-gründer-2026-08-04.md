# Founders Circle: Eigene UI für die 1.000 Gründer

Eingeloggte Gründer bekommen eine sichtbar andere, edlere Oberfläche als normale User — ohne dass irgendwo erkennbar wird, welcher der 1.000 Plätze ihnen gehört.

## Was der Gründer sieht

**Ein durchgehender Gold-Layer statt nur eines Badges.**
Sobald ein aktiver Gründer eingeloggt ist, schaltet die App in den "Founders Circle"-Modus: wärmerer Gold-Rand an Header und Karten, ein feiner Gold-Schimmer auf den Primär-Buttons, dunklerer Hintergrundverlauf. Kein zweites Design-System — dieselbe Bond-Ästhetik, nur eine Stufe exklusiver.

**Header-Signatur.**
Neben dem Logo ein kleines Wappen "Founders Circle", der Avatar im Nutzermenü bekommt einen Goldring. Für normale User ändert sich nichts.

**Eine persönliche Gründerkarte.**
Auf dem Dashboard und der Willkommensseite eine Karte, die den Status greifbar macht:
- "Du gehörst zum Founders Circle."
- 20 % auf jeden Credit-Kauf, Restlaufzeit als Zeitraum ("noch 23 Monate", aus dem hinterlegten Ablaufdatum)
- Priority-Rendering bei Systemlast
- Kein Platz, keine Nummer, keine Reihenfolge

**Kleine, konsistente Marker.**
Der bestehende gold­ene Priority-Chip an Render-Buttons wird optisch an denselben Stil angeglichen, damit alles wie eine Sprache wirkt.

## Anonymität der Platznummer

Die Datenlage ist bereits sauber: Es wird nirgends eine Platznummer gespeichert, und ein Gründer kann per Datenzugriff ausschließlich seinen eigenen Eintrag lesen — keine Liste, keine Reihenfolge.

Zwei Dinge fehlen trotzdem:
- Der öffentliche Zähler "noch X von 1.000 frei" bleibt auf der Preisseite (Verknappung wirkt dort), wird aber innerhalb der eingeloggten App für Gründer nicht mehr angezeigt. Sonst ließe sich aus Zählerstand und eigenem Beitrittszeitpunkt die ungefähre Position ableiten.
- Die Gründerkarte zeigt bewusst keinen Beitrittszeitpunkt, sondern nur die Restlaufzeit des Vorteils.

Als feste Projektregel festgehalten: In der Gründer-UI wird nie eine Position, Nummer, Rangfolge oder ein exaktes Beitrittsdatum dargestellt.

## Technisch

- `useFounderStatus` bleibt die einzige Quelle; ein neuer `FounderExperienceProvider` setzt `data-founder="true"` auf dem App-Shell.
- Gold-Layer als semantische Tokens in `index.css`, gescoped auf `[data-founder="true"]` — keine Hardcodes in Komponenten.
- Neue Komponenten: `src/components/founders/FounderCrest.tsx` (Header), `src/components/founders/FounderStatusCard.tsx` (Dashboard + `Welcome.tsx`).
- Anpassungen: `AppHeader.tsx`, `UserMenu.tsx`, `FounderPriorityChip.tsx` (Stil-Angleich), In-App-Verwendungen von `FoundersSlotBadge` für Gründer ausblenden.
- Restlaufzeit wird aus `expiresAt` gerechnet; `claimedAt` wird in der UI nicht gerendert.
- Reines Frontend — keine Datenbank-, Stripe- oder Edge-Function-Änderungen.
