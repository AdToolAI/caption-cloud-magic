# Seedance 2.5 direkt über ModelArk anbinden

Seedance 2.5 kommt als **neues, eigenständiges Modell** dazu. Seedance 1 Lite / 2.0 Fast / 2.0 bleiben unverändert über Replicate laufen.

## Links (bitte dort den Key holen)

- ModelArk Konsole (China/Volcengine): https://console.volcengine.com/ark
- ModelArk Video-Generation Doku: https://www.volcengine.com/docs/82379
- International (BytePlus ModelArk, EU/SEA-Zugang, meist die praktikablere Variante): https://docs.byteplus.com/en/docs/ModelArk/ — Konsole: https://console.byteplus.com/ark

Aus der Konsole brauchen wir zwei Dinge: den **API-Key** und die exakte **Model-ID / Endpoint-ID** für Seedance 2.5 (bei ModelArk ist die ID pro Account/Endpoint sichtbar, deshalb kann ich sie nicht raten).

## Was gebaut wird

1. **Secrets**: `MODELARK_API_KEY` und `MODELARK_BASE_URL` (Region-abhängig), plus `MODELARK_SEEDANCE_25_MODEL_ID`. So bleibt die Model-ID ohne Deploy änderbar.
2. **Neue Edge Function `generate-seedance25-video`** nach dem Muster der bestehenden `generate-seedance-video`:
   - Auth-Check, Kostenberechnung, Wallet-Abzug **vor** dem Call, automatischer Refund bei Provider-Fehler (Pflicht laut Credit-Reliability-Regel).
   - ModelArk arbeitet asynchron: `POST /contents/generations/tasks` → Task-ID → Polling `GET /contents/generations/tasks/{id}` bis `succeeded/failed`. Kein Replicate-Webhook, deshalb eigener Poll-Loop + Watchdog-Eintrag.
   - Text-to-Video und Image-to-Video (erstes Frame) werden unterstützt.
3. **Katalog-Einträge**:
   - `src/config/seedanceVideoCredits.ts`: neuer Tier `seedance-2-5`.
   - `supabase/functions/_shared/videoPricingCatalog.ts`: Einkaufspreis + Verkaufspreis mit der bestehenden **3,00×-Marge**.
   - `src/config/aiVideoModelRegistry.ts`: neues Modell mit `edgeFunction: 'generate-seedance25-video'`, Badge „Neu".
   - Consistency-Ranking, Prompt-Token-Limit und Provider-Capabilities analog zu Seedance 2.0 ergänzen.
4. **Composer/Motion Studio**: `seedance-2-5` als eigene ClipSource-Variante nur dort freischalten, wo Seedance 2.0 heute schon erlaubt ist. Die Lip-Sync-Kette bleibt unangetastet (Feature Freeze v400) — Seedance 2.5 gilt wie 2.0 als Plate/B-Roll, nicht als Dialog-Master.
5. **Preis-Anzeige**: Kostenvorschau vor der Generierung wie bei allen anderen Modellen.

## Offene Punkte vor dem Bau

- Der exakte ModelArk-Preis pro Sekunde/Auflösung muss aus deiner Konsole (Abrechnungsseite) kommen — daraus leiten wir den Verkaufspreis mit 3,00× ab. Ohne die Zahl setze ich vorläufig den 2.0-Pro-Preis und markiere ihn als „zu bestätigen".
- Falls ModelArk aus der EU nicht erreichbar ist, nutzen wir den BytePlus-Endpoint (`ark.ap-southeast.volces.com`); das ändert nur `MODELARK_BASE_URL`.

## Technische Details

- Auth: `Authorization: Bearer <MODELARK_API_KEY>`, JSON-Body, OpenAI-ähnliches Schema.
- Der Poll-Loop läuft innerhalb der Edge Function mit erhöhtem Timeout (300 s) und schreibt Zwischenstände in die bestehende Job-Tabelle, damit die UI den Fortschritt zeigt.
- Fehlerklassen (Content-Filter, Quota, Timeout) werden auf die vorhandenen Refund-Pfade gemappt.
