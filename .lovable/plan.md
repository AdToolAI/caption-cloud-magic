# Video Enhance – offene Abnahmepunkte schließen

Keine neue Architektur. Nur die vier offenen Punkte plus Abschlusstests.

## Bereits belegt (Punkt 3 der letzten Rückfrage): Topaz True-up

Lauf `344ccc6c-e5a2-4bb8-b3db-6b8587b87637` (bestofproducts4u@gmail.com):

| Feld | Wert |
| --- | --- |
| eingefrorener FX-Kurs USD→EUR | 0,92 |
| echte Providerkosten | 0,24 USD (3 Einheiten) = 0,2208 EUR |
| ursprüngliche Belastung | 1,01 € |
| True-up-Gutschrift | 0,35 € |
| finale Belastung | 0,66 € |
| verifizierter Faktor | 2,9891× |
| Ledger | genau ein `true_up_refund` 0,35 €, daneben ein `reserve` und ein `capture` |

`pricing_gate = review_required` (Grund `actual_cost_drift`) ist reiner Admin-Status.

## 1. Nicht-Allowlist-Nachweis

- Parser der Allowlist härten: leerer oder reiner Leerzeichen-Wert ergibt garantiert eine leere Liste (Trim, Leereinträge verwerfen). Test, der `""`, `" "` und `" , "` als leere Liste prüft.
- `VIDEO_ENHANCE_TEST_USER_IDS` auf leer setzen; die Mechanik bleibt für gezielte Fail-once-Tests erhalten, privilegiert aber niemanden.
- Nachweis, dass `yaxac88729@watchyio.com` nicht in der Liste steht.
- Danach je ein minimaler Topaz- und ByteDance-Lauf mit diesem Konto über den kompletten Pfad: sichtbar → Preisanzeige → Start → Provider → Guthaben → fertig → eigener Speicher → Mediathek → Download.

## 2. Mediathek-Einstieg „Video verbessern"

- Aktion in der Video-Lightbox der Mediathek, die den bestehenden `EnhanceVideoPanel`-Dialog öffnet (`useEnhanceVideo` → `video-enhance`). Keine eigene Enhance-Logik.
- Das gewählte Video wird direkt als Quelle übernommen, kein Download/Reupload.
- Nach Erfolg: neues Video-Asset mit Herkunftsverweis auf das Original, Mediathek lädt neu, Original bleibt bestehen.

## 3. Director's Cut migrieren

- `AIVideoUpscaling.tsx` ruft künftig `useEnhanceVideo` → `video-enhance`; dieselbe Modell-Registry, Kombinationsprüfung, Preis-Engine, Guthaben- und Speicherlogik wie im AI Video Studio.
- Vereinfachte Auswahl bleibt: Original / Empfohlen / Hohe Qualität / Eigene Einstellung. „Empfohlen" und „Hohe Qualität" sind nur Voreinstellungen auf die zentrale Konfiguration – keine eigene Preislogik.
- Der alte Pfad `director-cut-upscale` bleibt als Rückfallebene bestehen, wird vom neuen UI aber nicht mehr aufgerufen.
- Danach Codebase-Suche und Liste aller verbleibenden aktiven Aufrufer von `director-cut-upscale`.

## 4. ByteDance Späte Kostenzahl

Ist-Stand: Der Abgleichdienst liest nur offene Läufe, ein abgeschlossener Lauf wird nie erneut bewertet. Eine später eintreffende echte Kostenzahl löst heute keinen True-up aus.

Ergänzung:
- Zweite Schleife im Abgleichdienst: abgeschlossene Läufe der letzten 30 Tage ohne echte Kostenzahl erneut beim Provider abfragen. Kommt eine autoritative Zahl, läuft derselbe 3×-Check; bei Überschreitung genau eine idempotente Gutschrift (gleicher Ledger-Schlüssel; Webhook, Abgleich und Wiederholung erzeugen zusammen nie mehr als eine).
- Ohne Zahl bleibt der Lauf `completed`, `verified_effective_multiplier` bleibt leer, es wird nichts geschätzt oder erfunden.
- `cost_unverified` bleibt reiner Admin-/Kalibrierstatus und blockiert keinen neuen Lauf; per Test abgesichert.

## 5. Abschlusstests und Bericht

Topaz- und ByteDance-Smoke ohne Allowlist, alle drei Einstiegspunkte, später eintreffende Kostenzahl, Typecheck, Video-Enhance-Tests, Produktions-Build. Danach ein Abschlussbericht mit „Topaz Video Upscale — GLOBAL LIVE" und „ByteDance vCube — GLOBAL LIVE" samt konkretem Codepfad je Einstiegspunkt.

## Technische Details

Betroffen: `supabase/functions/_shared/video-enhance-models.ts` (Allowlist-Parser), `supabase/functions/video-enhance-reconcile/index.ts` (Nachzieh-Schleife), `supabase/functions/_shared/video-enhance-finalize.ts` (True-up als wiederverwendbare idempotente Funktion), `src/pages/MediaLibrary.tsx` bzw. deren Lightbox, `src/components/directors-cut/features/AIVideoUpscaling.tsx`, `src/components/ai-video/EnhanceVideoPanel.tsx` (Dialog-Variante mit Quelle), Übersetzungen EN/DE/ES. Keine Änderungen an Wallet-, Lip-Sync- oder Renderlogik darüber hinaus.
