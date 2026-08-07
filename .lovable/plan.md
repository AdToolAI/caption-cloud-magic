# Seedance 2.5: Preise verifizieren und auflösungsabhängig abrechnen

## Was die Recherche ergeben hat

Die offiziellen Preistabellen von BytePlus ModelArk und Volcengine Ark sind nicht öffentlich auslesbar (die Seiten laden ihre Inhalte erst im eingeloggten Browser). Verifizierbar war nur die offizielle Replicate-Listung des Modells `bytedance/seedance-2.5`:

| Variante | Auflösung | Preis pro Sekunde |
|---|---|---|
| ohne Video-Input | 480p | $0,1028 |
| ohne Video-Input | 720p | $0,2312 |
| mit Video-Input | 480p | $0,4304 |
| mit Video-Input | 720p | $0,9676 |

Ebenfalls bestätigt: max. **30 Sekunden** pro Clip, Seitenverhältnisse 16:9, 4:3, 1:1, 3:4, 9:16, 21:9, adaptive.

Zwei Konsequenzen daraus:

1. Unser aktueller Einkaufspreis von 0,18 $/s ist ein Mittelwert, der 480p zu teuer und 720p zu billig rechnet. Bei 720p mit Video-Referenz wären wir sogar deutlich unter Kosten.
2. **Replicate bietet für Seedance 2.5 gar kein 1080p an** — nur 480p und 720p. Unsere Konfiguration verkauft aber 1080p. Ob ModelArk 1080p unterstützt, muss geprüft werden, bevor Kunden es auswählen können.

## Schritt 1: Fakten aus deiner Konsole (dein Part, 5 Minuten)

In der ModelArk-Konsole (Region Johor):

- **Model Marketplace → Dreamina Seedance 2.5 → Pricing/Billing**: Preis pro Sekunde je Auflösung notieren (bzw. Preis pro 1.000 Tokens, falls ModelArk so abrechnet — dann bitte auch die Token-pro-Sekunde-Angabe).
- Auf derselben Seite: welche **Auflösungen** offiziell unterstützt werden (steht 1080p in der Liste?) und ob 30 s in jeder Auflösung erlaubt sind.

Wenn dort nichts steht: Schritt 2 klärt es ohnehin empirisch.

## Schritt 2: Zwei Testclips (ich, nach deiner Freigabe)

- Ein 5-Sekunden-Clip in 720p und ein 5-Sekunden-Clip in 1080p über das Studio.
- Der 1080p-Test zeigt sofort, ob ModelArk die Auflösung akzeptiert oder mit einem Fehler antwortet.
- Danach in der Konsole unter Billing → Usage die tatsächlich abgerechneten Beträge ablesen. Das ergibt den echten Sekundenpreis, unabhängig von jeder Dokumentation.

## Schritt 3: Preislogik auflösungsabhängig machen

Statt eines Pauschalpreises pro Sekunde bekommt Seedance 2.5 gestaffelte Preise — so, wie es die realen Kosten auch sind:

- Einkaufspreis je Auflösung (480p / 720p / ggf. 1080p) hinterlegen, mit den in Schritt 1–2 bestätigten Werten.
- Verkaufspreis = Einkaufspreis × 3,00 (unsere übliche Marge).
- Vorläufige Belegung bis zur Bestätigung, auf Basis der Replicate-Zahlen zzgl. Sicherheitsaufschlag: 480p 0,11 $/s, 720p 0,24 $/s. Damit ist keine Auflösung mehr unter Kosten.
- Die Kreditanzeige im Studio und im Composer zeigt den Preis der gewählten Auflösung, nicht mehr einen Einheitspreis.

## Schritt 4: 1080p absichern

- Bestätigt ModelArk 1080p: Preis analog hinterlegen, Option bleibt.
- Lehnt ModelArk 1080p ab: Auswahl auf 480p/720p reduzieren, damit niemand eine Generierung startet, die garantiert fehlschlägt. Bereits gebuchte Credits werden in dem Fall wie gewohnt automatisch erstattet.

## Technische Details

- `supabase/functions/_shared/videoPricingCatalog.ts`: Eintrag `seedance-2-5` von einem Skalarwert auf eine Auflösungs-Map umstellen (Fallback = teuerste Stufe, damit ein unbekannter Wert nie unter Kosten verkauft).
- `src/config/seedanceVideoCredits.ts` und `src/config/aiVideoModelRegistry.ts`: gestaffelte Kreditberechnung, Auflösungsliste aus einer Quelle speisen.
- `src/lib/video-composer/providerCapabilities.ts`: `ai-seedance25` erlaubt weiterhin 30 s; Auflösungsliste an das Ergebnis aus Schritt 2 angleichen.
- Der Verifikationslauf nutzt `generate-seedance25-video` und den bereits live getesteten Poller `modelark-poll`; an der Pipeline selbst ändert sich nichts.
