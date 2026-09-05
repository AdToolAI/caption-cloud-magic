# Video Enhance – Abschluss der vier Abnahmepunkte

Geprüft wurde der Ist-Zustand. Zwei Punkte sind belegt, zwei sind offen und brauchen Arbeit.

## Punkt 3 – Topaz True-up: BELEGT

Lauf `344ccc6c-e5a2-4bb8-b3db-6b8587b87637` (Konto bestofproducts4u@gmail.com):

| Feld | Wert |
| --- | --- |
| eingefrorener FX-Kurs (USD→EUR) | 0,92 |
| echte Providerkosten | 0,24 USD (3 Einheiten) → 0,2208 EUR |
| ursprüngliche Belastung | 1,01 € |
| True-up-Gutschrift | 0,35 € |
| finale Belastung | 0,66 € |
| verifizierter Faktor | 2,9891× |
| Ledger | genau ein Eintrag `true_up_refund` 0,35 € („pricing cap true-up (3x verified cost)"), daneben je ein `reserve` und ein `capture` |

Hinweis: `pricing_gate = review_required` mit Grund `actual_cost_drift` – reiner Admin-Status, kein Nutzungsblocker.

## Punkt 1 – Allowlist: NICHT BEWEISBAR, offen

Das Secret `VIDEO_ENHANCE_TEST_USER_IDS` existiert weiterhin; sein Wert ist nicht lesbar. Damit lässt sich nicht beweisen, dass die Testkonto-Privilegierung bei den Abnahmeläufen inaktiv war.

Vorgehen:
1. Secret `VIDEO_ENHANCE_TEST_USER_IDS` auf leer setzen (Allowlist damit projektweit ohne Wirkung), Funktionen neu ausrollen.
2. Ein minimaler, kurzer Topaz-Lauf und ein minimaler ByteDance-Lauf mit dem klar nicht gelisteten Konto `yaxac88729@watchyio.com` – Sichtbarkeit, Schätzung, Start, Provider, Speicher, Mediathek, Download.
3. Ergebnis im Bericht als sauberer Nicht-Allowlist-Nachweis.

## Punkt 2 – Einstiegspunkte: NUR EINER LIVE

Ist-Stand im Code:
- AI Video Studio → Tab „Enhance": nutzt `EnhanceVideoPanel` → `useEnhanceVideo` → `video-enhance`. Live.
- Mediathek/Video-Lightbox: kein Enhance-Einstieg vorhanden. Fehlt.
- Director's Cut: `AIVideoUpscaling.tsx` ruft weiterhin die alte Funktion `director-cut-upscale`. Nicht umgestellt.

Umsetzung:
- In der Mediathek-Lightbox für Videos eine Aktion „Video verbessern" ergänzen, die `EnhanceVideoPanel` mit der Quelle des Videos öffnet.
- `AIVideoUpscaling.tsx` auf `useEnhanceVideo` umstellen und dieselbe Auswahl (Modell, Auflösung, FPS, Modus) nutzen; der alte Aufruf `director-cut-upscale` entfällt in der neuen Oberfläche.
- Beide Einstiege danach je einmal durchspielen.

## Punkt 4 – Späte ByteDance-Kostenzahl: HEUTE NICHT MÖGLICH

Der Abgleichdienst liest ausschließlich offene Läufe; ein bereits abgeschlossener Lauf wird nie erneut bewertet. Eine später eintreffende echte Kostenzahl löst also derzeit keinen True-up aus.

Umsetzung:
- Zweiter Durchlauf im Abgleichdienst: abgeschlossene Läufe der letzten 30 Tage ohne echte Kostenzahl erneut beim Provider abfragen; kommt eine autoritative Zahl, denselben 3×-Check laufen lassen und bei Überschreitung idempotent gutschreiben (gleicher Ledger-Schlüssel, nie doppelt, nie Nachbelastung).
- `cost_unverified` bleibt reiner Admin-/Kalibrierstatus und blockiert keinen Lauf – das ist im Startpfad bereits so und wird durch einen Test abgesichert.

## Technische Details

- Betroffen: `supabase/functions/video-enhance-reconcile/index.ts` (neue Nachzieh-Schleife), `supabase/functions/_shared/video-enhance-finalize.ts` (True-up als wiederverwendbare, idempotente Funktion), `src/components/directors-cut/features/AIVideoUpscaling.tsx`, Mediathek-Lightbox in `src/pages/MediaLibrary.tsx`, Übersetzungen EN/DE/ES.
- Keine Preis-, Wallet- oder Lip-Sync-Logik darüber hinaus.
- Tests: Nachzieh-True-up idempotent, `cost_unverified` blockiert nicht, alle drei Einstiege rufen `video-enhance`.

## Abschluss

Nach diesen Schritten ein einziger Abschlussbericht mit allen vier Punkten und der Kennzeichnung Topaz GLOBAL LIVE / ByteDance GLOBAL LIVE.
