# Cast-&-World-Sprecherzuordnung zuverlässig reparieren

## Befund

Der Screenshot entspricht dem aktuellen Codepfad:

- Die Auswahl im Briefing speichert Cast-&-World-Figuren als `ComposerCharacter.id`.
- Der Text für die Analyse schreibt die Library-ID derzeit nur aus `brandCharacterId` in den Cast-Block.
- Die nachgelagerte Auto-Besetzung im Analyse-Dashboard prüft `brandCharacterId` und `characterId`, aber nicht `id`.
- Dadurch bleibt die geordnete Liste der vier vorausgewählten Figuren leer und die 11 Dialogzeilen werden nicht gebunden.
- Zusätzlich belegt die Auto-Logik nur bereits vorhandene Cast-Slots. Wenn der Analyseplan wie im Screenshot nur drei Slots liefert, wird der vierte Sprecher nicht ergänzt.

## Umsetzung

1. **Eine kanonische Cast-&-World-ID verwenden**
   - Für Briefing-Figuren die ID einheitlich in der Reihenfolge `brandCharacterId → gültige id` auflösen.
   - Diesen Resolver sowohl beim Erstellen des Analyse-Briefings als auch im Production-Plan-Dashboard verwenden.
   - Die vier ausgewählten Figuren dadurch mit UUID und in ihrer tatsächlichen Auswahlreihenfolge an die Analyse übergeben.

2. **Fehlende Sprecher-Slots vor der Zuordnung ergänzen**
   - Echte, unterschiedliche `@speaker` aus den Dialogzeilen in Reihenfolge ihres ersten Auftretens sammeln.
   - Für Sprecher, die noch keinen Cast-Slot besitzen, einen offenen Slot ergänzen (maximal vier).
   - Strukturbezeichnungen wie `ORT`, `CAST`, `AKTION`, `KAMERA` oder `DIALOG` niemals als Sprecher-Slot übernehmen.

3. **Deterministisch automatisch zuordnen**
   - Erste Sprecher-Mention → erste ausgewählte Figur, zweite → zweite Figur usw.
   - Dieselbe Mention erhält in allen Szenen dieselbe Figur.
   - Bereits eindeutige, manuell gesetzte Zuordnungen bleiben erhalten.
   - Keine Figur wird doppelt vergeben, solange noch unbenutzte ausgewählte Figuren vorhanden sind.

4. **Dialoge direkt an die Zuordnung binden**
   - Alle Dialog-Turns mit derselben Mention erhalten sofort dieselbe `speakerCharacterId`.
   - Die Bindung darf nicht mehr davon abhängen, dass Anzahl Cast-Slots und Anzahl Dialogzeilen identisch sind.
   - Das Warnfeld „Sprecher-Zuordnung offen“ verschwindet, sobald alle echten Sprecher gebunden sind.

5. **Dashboard-Anpassung und Tauschlogik absichern**
   - Pro Cast-Slot bleibt die Figur auswählbar.
   - Beim Wechsel auf eine bereits verwendete Figur werden die beiden Zuordnungen getauscht statt dupliziert.
   - Dialog-Turns folgen dem Tausch über ihre Mention automatisch.

6. **Regressionstest mit dem Continuity-Stress-Test**
   - Fixture: vier ausgewählte Figuren, zwei Szenen à 30 Sekunden, 6 + 9 Dialogzeilen.
   - Erwartung: vier Cast-Slots, Reihenfolge Samuel → Matthew → Sarah → Kailee gemäß Briefing-Auswahl, keine offenen echten Dialog-Turns.
   - Zusätzlich testen: nur drei serverseitig gelieferte Slots werden auf vier ergänzt; Label-Zeilen erzeugen keine Sprecher; manueller Tausch bleibt bis ins Storyboard erhalten.

## Technische Bereiche

- `src/hooks/useStoryboardTransition.ts` — kanonische UUID im Analyse-Cast-Block
- `src/components/video-composer/briefing/ProductionPlanSheet.tsx` — Slot-Ergänzung, Auto-Besetzung, Mention-Bindung und Tausch
- gemeinsame Cast-ID-Hilfe statt weiterer abweichender ID-Fallbacks
- gezielte Tests für Analyseplan → Dashboard → Storyboard

Die Lip-Sync-Pipeline, bestehende gerenderte/gesperrte Szenen und deren Schutzregeln bleiben unverändert.
