# Seedance 2.5 über BytePlus ModelArk anbinden

Bestätigt aus deinem Screenshot (docs.byteplus.com/en/docs/modelark/1520757):

- Endpoint: `POST https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks`
- Auth: `Authorization: Bearer $ARK_API_KEY`
- Model-ID: `dreamina-seedance-2-5-260628`
- Seedance 2.5 kommt als **neues Modell neben** 1 Lite / 2.0 Fast / 2.0 dazu.

## Was du Schritt für Schritt tun musst

1. **BytePlus-Konto anlegen/einloggen**
   Gehe auf https://console.byteplus.com/ark und registriere dich. Bei „Sign up" → Country/Region **Germany** und **Business account** wählen (Personal hat einen eingeschränkten Produktkatalog, und der Kontotyp lässt sich später nicht mehr ändern). Firmenname, Adresse und USt-ID bereithalten. ModelArk ist das internationale Pendant zu Volcengine Ark — genau dazu gehört der Endpoint `ark.ap-southeast.bytepluses.com`.

2. **Zahlungsmittel hinterlegen**
   In der Konsole unter „Billing" / „Payment" eine Kreditkarte hinterlegen. Ohne Guthaben liefert die API sofort einen Quota-Fehler zurück.

3. **Modellzugang für Seedance 2.5 aktivieren**
   Konsole → „Model Marketplace" bzw. „Models" → *Dreamina Seedance 2.5* suchen → „Activate" / „Enable". Manche Modelle sind erst nach dieser Freischaltung aufrufbar.

4. **API-Key erzeugen**
   Konsole → „API Key" (linke Navigation) → „Create API Key" → Key kopieren. Der Key wird nur einmal angezeigt.

5. **Preis notieren**
   Auf der Modell- oder Pricing-Seite den Preis pro Sekunde je Auflösung (480p/720p/1080p) ablesen und mir nennen. Daraus berechne ich unseren Verkaufspreis mit der festen 3,00×-Marge.

6. **Key an mich übergeben**
   Sag mir Bescheid, sobald der Key bereitliegt — ich öffne dann das sichere Formular für `MODELARK_API_KEY`. **Bitte den Key nicht in den Chat schreiben.**

7. Danach baue ich die Integration (Punkt „Was gebaut wird") und wir testen einen echten 5-Sekunden-Clip.

## Was gebaut wird

1. **Secrets**: `MODELARK_API_KEY`, dazu `MODELARK_BASE_URL` (`https://ark.ap-southeast.bytepluses.com/api/v3`) und `MODELARK_SEEDANCE_25_MODEL_ID` (`dreamina-seedance-2-5-260628`), damit ein Modell-Update später ohne Deploy möglich ist.
2. **Neue Edge Function `generate-seedance25-video`** nach dem Muster von `generate-seedance-video`:
   - Auth-Check, Kostenvorschau, Wallet-Abzug vor dem Call, automatischer Refund bei Provider-Fehler (Pflicht laut Credit-Reliability-Regel).
   - Asynchroner Ablauf: `POST /contents/generations/tasks` → Task-ID → Polling `GET /contents/generations/tasks/{id}` bis `succeeded`/`failed`, mit Watchdog gegen hängende Tasks.
   - Unterstützte Task-Typen laut Doku: Text-to-Video, Multimodal-Reference (Bildreferenzen), Edit Video, Extend Video — wir starten mit Text-to-Video und Referenzbild, Edit/Extend als zweiter Schritt.
3. **Katalog-Einträge**: neuer Tier in `seedanceVideoCredits.ts`, `videoPricingCatalog.ts` (Einkauf + 3,00×-Verkauf), `aiVideoModelRegistry.ts` (`edgeFunction: 'generate-seedance25-video'`, Badge „Neu"), plus Consistency-Ranking und Prompt-Limits.
4. **Composer/Motion Studio**: Seedance 2.5 dort freischalten, wo 2.0 heute erlaubt ist. Die Lip-Sync-Kette bleibt unangetastet (Feature Freeze v400) — 2.5 gilt wie 2.0 als Plate/B-Roll, nicht als Dialog-Master.
5. **Kostenvorschau** vor der Generierung wie bei allen anderen Modellen.

## Technische Details

- Auth: `Authorization: Bearer <MODELARK_API_KEY>`, JSON-Body mit `model` + `content[]` (Text-Part und optionale `image_url`-Parts), Parameter wie Auflösung/Dauer werden laut Doku als Text-Direktiven bzw. Feldern übergeben — ich richte mich beim Bau exakt nach der „Must-read before use"-Seite.
- Poll-Loop in der Edge Function mit 300 s Timeout, Zwischenstände in die bestehende Job-Tabelle, damit die UI Fortschritt zeigt.
- Fehlerklassen (Content-Filter, Quota, Timeout) werden auf die vorhandenen Refund-Pfade gemappt.
