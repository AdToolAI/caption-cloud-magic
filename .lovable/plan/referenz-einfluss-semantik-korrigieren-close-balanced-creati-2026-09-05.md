# Referenz-Einfluss: Semantik korrigieren (Close / Balanced / Creative)

## Problem

Bei Modellen ohne echten Stärke-Regler wird die gewünschte Änderungsstärke als Satz im Prompt formuliert. Der Satz für die Stufe "Fast gleich" lautet heute absolut:

"Keep the reference image exactly as it is in composition, subject placement, framing and lighting. Apply only the changes described above."

Das kann den eigentlichen Änderungswunsch unterdrücken und wieder eine Fast-Kopie der Vorlage erzeugen.

## Neue Bedeutung der drei Stufen

- **Fast gleich (Close)**: Komposition, Identität und alle nicht betroffenen Details stark bewahren — die ausdrücklich gewünschten Änderungen aber vollständig ausführen.
- **Ausgewogen (Balanced)**: Wichtige Motive und Bildstruktur bewahren, die gewünschten Änderungen dabei natürlich zulassen.
- **Kreativ (Creative)**: Die Vorlage als visuelle Orientierung nutzen, weitergehende gewünschte Änderungen sind erlaubt.

Reihenfolge bleibt eindeutig: Der Änderungswunsch wird immer ausgeführt; der Referenz-Einfluss regelt nur, wie viel vom nicht betroffenen Rest erhalten bleibt.

## Umsetzung

1. Die drei Satzbausteine in `supabase/functions/_shared/picturePromptBuilder.ts` (`INTENT_CLAUSES`) neu formulieren:
   - close: "Stay very close to the reference image's composition, subject identity and unaffected details, while fully applying the changes described above."
   - balanced: "Preserve the main subjects and the overall visual structure of the reference image while applying the changes described above naturally."
   - free: "Use the reference image as visual guidance while allowing the broader changes described above."
2. Keine Änderung an Reihenfolge, IDs (`intent:close` usw.), Hinweistexten, Formatlogik, Preisen oder nativen Stärke-Parametern.
3. Regressionstest in `src/test/pictureIntentMatrix.test.ts`: für jede prompt-geführte Stufe prüfen, dass
   - kein absoluter Wortlaut vorkommt (verbotene Muster u. a. "exactly as it is", "unchanged", "do not change", "identical", "only the changes"),
   - der Satz das vollständige Ausführen der gewünschten Änderung ausdrücklich benennt ("fully applying" / "applying the changes" / "changes described above"),
   - der Nutzertext weiterhin als erstes Segment steht und nie umgeschrieben wird,
   - ein konkretes Beispiel ("make the trunk much smaller and darker") bei Stufe Close im Prompt erhalten bleibt und der Referenzsatz ihm nicht widerspricht.

## Abschluss

Danach exakte Ergebnisse nennen: Testlauf (bestanden/gesamt), Typprüfung, Build.
