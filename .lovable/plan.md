# Provider-Abgleich: Pika 2.2, Sora 2/Pro, Vidu Q3, HappyHorse

Ziel: Für die vier verbleibenden Modellfamilien dasselbe Verfahren wie zuvor bei Kling, Wan, Veo, Luma, LTX, Grok, Seedance und Runway — offizielle Provider-Spezifikation recherchieren, Registry und Edge Function daran angleichen, Preise auf 1:3 halten, Tests erweitern.

Stand heute: Marge ist überall exakt 3,00x (9 Paritätstests grün), und die bereits überarbeiteten Modelle sind durch 65 Capability-Tests abgesichert. Die vier hier genannten Modelle sind intern konsistent, aber ohne Doku-Abgleich.

## Vorgehen pro Modell

1. Recherche der offiziellen Doku (Provider bzw. Replicate-Schema): erlaubte Dauern, Auflösungen, Seitenverhältnisse, Referenzbilder/-videos, Start-/Endframe, Audio, negative Prompts, Seeds, Preise.
2. `src/config/aiVideoModelRegistry.ts`: Capabilities exakt auf das Provider-Schema setzen (keine Optionen anbieten, die der Provider ablehnt; keine unterschlagen, die er kann).
3. Edge Function (`generate-pika-video`, Sora-Route, `generate-vidu-video`, `generate-happyhorse-video`): Request-Body an das Schema angleichen, ungueltige Kombinationen serverseitig abweisen statt 400 vom Provider.
4. `src/lib/cost/videoPricingCatalog.ts` und `supabase/functions/_shared/videoPricingCatalog.ts`: reale Provider-Kosten eintragen, Verkaufspreis = exakt 3,00x, Min/Max-Dauern synchron zur Registry.
5. Tests in `pricingCatalogParity.test.ts` und `aiVideoModelCapabilities.test.ts` um die vier Modelle erweitern.

## Modell-spezifische Punkte

- **Pika 2.2** — aktuell in der UI als "temporär offline" markiert. Klaeren, ob der Provider wieder erreichbar ist; Pikaframes (Start+Endframe zusammen verpflichtend) und die Auflösungs-/Dauerliste gegen die Doku pruefen. Bleibt die API instabil, bleibt der Offline-Status, aber die Capabilities werden trotzdem korrekt hinterlegt.
- **Sora 2 / Sora 2 Pro** — EOL-Datum 24.09.2026 ist bereits im Katalog vermerkt. Abgleich der zulaessigen Dauern und Formate, Access-Gate `requiresAccess: 'sora2'` bleibt.
- **Vidu Q3** — die IDs heissen intern noch `vidu-q2-*`, laufen aber auf Q3. Reference2V / I2V / T2V getrennt pruefen: Anzahl Referenzbilder, feste 5s-Cliplaenge vs. laengere Optionen, Auflösungen.
- **HappyHorse** — Standard vs. Pro (720p/1080p), Dauerbereich und Referenz-Support gegen die Provider-Doku pruefen.

## Ergebnis

Nach Abschluss gilt fuer alle Modelle: Was die UI anbietet, akzeptiert der Provider auch — und jeder Verkaufspreis liegt exakt beim Dreifachen der Einkaufskosten, testabgesichert.
