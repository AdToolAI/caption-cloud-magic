# Seedance 2.5: kein Rückbau, sondern sauberer Fallback

## Empfehlung

Nicht zurückrudern. Die Seedance-Integration ist technisch korrekt — blockiert wird sie nur vom Personenschutz von ModelArk, sobald reale Personen im Anker sind. Alles andere (lange Szenen bis 30 s, Text-to-Video, Bild-Anker ohne reale Personen) funktioniert.

Hailuo und Happy Horse bleiben unberührt: sie laufen über eigene Dispatch-Zweige und den bestehenden Lip-Sync-Pfad. Der Fehler betraf ausschließlich den ModelArk-Zweig.

Statt Rückbau: Seedance dort einsetzen, wo es erlaubt ist, und bei realen Personen automatisch auf einen zulässigen Provider ausweichen — mit klarer Meldung an den Kunden.

## Was gebaut wird

1. **Personen-Vorprüfung vor dem ModelArk-Call**
   Wenn die Szene einen Anker mit realen Cast-Personen enthält, wird gar nicht erst an ModelArk gesendet.

2. **Automatischer Provider-Fallback**
   In diesem Fall übernimmt der bisherige Provider (Hailuo bzw. Happy Horse) die Szene. Szenen über deren Längenlimit werden dabei sauber in zulässige Segmente geplant, statt zu scheitern.

3. **Ehrliche Meldung statt Fehler**
   Der Kunde sieht: "Diese Szene enthält reale Personen — Seedance 2.5 ist dafür gesperrt, es wurde automatisch auf <Provider> gewechselt." Kein roter Abbruch, kein hängender Ladebalken.

4. **Seedance bleibt voll nutzbar** für Szenen ohne reale Personen (Produkt, Umgebung, illustrierte/stilisierte Charaktere, reines Text-to-Video) mit den vollen 4–30 s.

5. **Optionaler Freischalt-Pfad**
   Sobald BytePlus die Advanced Creation Rights für verifizierte Real-Personen freigibt, wird die Vorprüfung über ein Flag deaktiviert — ohne weiteren Umbau.

## Technische Details

- Vorprüfung im Seedance-Dispatch von `supabase/functions/compose-video-clips/index.ts`, gespeist aus dem Anker-Vertrag in `_shared/visual-inputs.ts` (Anker mit Cast-Porträt-Herkunft = real person).
- Fallback-Auswahl über die bestehende Single-Source `composer-ai-sources.ts` / `pickClipSourceForDuration.ts`, damit UI-Auswahl und Backend identisch entscheiden.
- Fallback-Grund wird als Szenen-Metadatum persistiert und im Studio angezeigt; Pipeline-Status endet terminal korrekt.
- Freischaltung später über System-Flag `composer.feature.seedance25_real_persons`.
