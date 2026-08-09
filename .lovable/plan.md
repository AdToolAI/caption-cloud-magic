# Finale Sprachprüfung der englischen UI

Der letzte Durchlauf hat den Großteil der deutschen Texte lokalisiert. Der aktuelle Scan meldet noch 23 Dateien mit 46 Treffern — die Stichprobe zeigt, dass die meisten davon Fehlalarme sind (deutsche Sprachvarianten in bereits dreisprachigen Blöcken, Stoppwortlisten, Konsolen-Logs). Um belastbar sagen zu können "die englische UI ist sauber", braucht es einen strengeren Prüflauf, der auch die Fälle findet, die der bisherige Scanner nicht sieht.

## Was geprüft wird

1. **Verbleibende 23 Dateien** einzeln durchgehen und die echten Fundstellen lokalisieren; Fehlalarme dokumentieren, damit sie nicht erneut auftauchen.
2. **Falsch übersetzte Stellen** (nicht nur fehlende): Prüfen, ob in `en`-Feldern versehentlich deutscher Text steht, ob `de`/`en` vertauscht sind und ob lokale `t(language, ...)`-Helfer überall dieselbe Argumentreihenfolge nutzen.
3. **Bisher nicht abgedeckte Textquellen**:
   - Attribute: `placeholder`, `aria-label`, `title`, `alt`
   - Toasts und Fehlermeldungen (`toast.*`, `throw new Error`), soweit sie im UI landen
   - Auswahl-/Optionslisten und Konstanten-Arrays (wie zuletzt die Prompt-Helper-Chips)
   - Leerzustände, Ladehinweise, Validierungstexte
   - E-Mail-Templates und Edge-Function-Antworten, die dem Nutzer angezeigt werden
   - `index.html` (Title/Meta) und Rechtstexte unter `src/pages/legal/*`
4. **Sichtprüfung im Browser**: Die wichtigsten Oberflächen mit erzwungener Sprache `en` aufrufen und per Screenshot gegenprüfen (Landing, Dashboard, Video Composer, AI Video Studio, Picture/Motion/Audio Studio, Content Studio, Account/Billing, Admin, Auth, Rechtstexte).

## Vorgehen

- Erweiterter Scanner, der Attribute, Toasts, String-Arrays und vertauschte Sprachfelder erfasst; Ergebnis als Inventar (Datei, Zeile, Text, Grund).
- Abarbeitung in parallelen Paketen; jede Fundstelle bekommt DE/EN/ES über den bestehenden `tx`-Helfer bzw. das vorhandene `t(language, …)`-Muster.
- Visuelle Prüfung der Hauptrouten in `en`, Korrektur der dabei gefundenen Reste.
- Abschluss: erneuter Scan (Ziel: nur noch belegte Fehlalarme), `bunx tsgo --noEmit` und Build.

## Technische Details

- Zentraler Helfer bleibt `src/lib/i18nText.ts` (`tx` / `useTx`, JSX-fähig über Generics).
- Konsistenzprüfung `scripts/check-i18n-consistency.mjs` wird um die neuen Muster (Attribute, vertauschte Sprachfelder) erweitert, damit künftige Regressionen im Check auffallen.
- Prompts an KI-Modelle bleiben bewusst englisch — sie werden vom Scan ausgenommen.
- Reine Konsolen-Logs und interne Debug-Strings werden nicht übersetzt.
