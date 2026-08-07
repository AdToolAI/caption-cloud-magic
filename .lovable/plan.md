# Seedance 2.5 über BytePlus ModelArk anbinden

Bestätigt aus deinen Screenshots:

- Endpoint: `POST https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks`
- Auth: `Authorization: Bearer $ARK_API_KEY`
- Model-ID: `dreamina-seedance-2-5-260628`
- Region in deiner Konsole: **Asia Pacific (Johor) / ap-southeast-1** — passt zum Endpoint.
- Seedance 2.5 kommt als **neues Modell neben** 1 Lite / 2.0 Fast / 2.0 dazu.

## Deine nächsten Schritte in der ModelArk-Konsole

1. **Resource Pack/Coding Plan erwerben (aktueller Blocker)**
   Deine Kreditkarte ist bereits hinterlegt. Die Fehlermeldung lautet jedoch `No available resource packs. Please purchase a resource pack first` — ModelArk verlangt für die Vorabprüfung zusätzlich einen aktiven Resource Pack in **Asia Pacific (Johor)**.
   - Im Fehler rechts zuerst **„I acknowledge"** anklicken und den Aktivierungsdialog schließen.
   - Oben auf **„Subscription"** oder **„Coding Plan"** gehen.
   - Einen für **Media / Video Generation / Dreamina-Seedance** gültigen Resource Pack auswählen; kein reines LLM-/Token-Paket kaufen.
   - Beim Kauf kontrollieren, dass die Region **Asia Pacific (Johor / ap-southeast-1)** ist.
   - Pack bezahlen/aktivieren und warten, bis er unter Subscription als **Active** erscheint.
   - Falls dort kein Video-Pack angeboten wird: **Contact Sales** öffnen und ausdrücklich „Dreamina Seedance 2.5 API resource pack for ap-southeast-1 (Johor)" anfordern. Das ist dann eine Freischaltung durch BytePlus und kein Fehler in unserer Plattform.

2. **Seedance 2.5 erneut freischalten**
   Linke Navigation → **„Model activation"** → nach *Dreamina Seedance 2.5* suchen → **Activate / Enable**.
   Wichtig: Region muss dabei auf **Asia Pacific (Johor)** stehen. Aktivierung gilt pro Region.
   Im Dialog nur Seedance 2.5 markieren; **„Enable Free Credits Only Mode" ausgeschaltet lassen**, weil das Modell einen bezahlten Resource Pack verlangt. Dann Bedingungen bestätigen und **„Confirm activation and authorization"** anklicken.
   Kontrolle: unter **„Model Square"** sollte Seedance 2.5 danach als aktiviert erscheinen.

3. **API-Key erstellen**
   Linke Navigation → **„API keys"** → Button **„+ Create API Key"** → Namen z. B. `adtool-prod` → erstellen und Key kopieren.
   Achtung: Der Key gehört zum aktuell gewählten Projekt. Bleib im **default project**, sonst passt der Key nicht zur Modell-Aktivierung.

4. **Preis ablesen**
   Linke Navigation → **„Usage"** bzw. Model-Square-Detailseite von Seedance 2.5 → Preis pro Sekunde je Auflösung (480p / 720p / 1080p) notieren und mir hier nennen. Daraus rechne ich unseren Verkaufspreis mit der festen **3,00×-Marge**.

5. **Optional: Funktionstest im Playground**
   Linke Navigation → „Playground" → Seedance 2.5 → kurzen Prompt absetzen. Wenn dort ein Video herauskommt, sind Aktivierung und Abrechnung sicher in Ordnung.

6. **Key an mich übergeben**
   Sag mir Bescheid, sobald Key + Preis bereitliegen — ich öffne dann das sichere Formular für `MODELARK_API_KEY`.
   **Bitte den Key nicht in den Chat schreiben.**

Danach baue ich die Integration (unten) und wir testen einen echten 5-Sekunden-Clip in der Plattform.

## Was ich danach baue

1. **Secrets**: `MODELARK_API_KEY`, dazu `MODELARK_BASE_URL` (`https://ark.ap-southeast.bytepluses.com/api/v3`) und `MODELARK_SEEDANCE_25_MODEL_ID` (`dreamina-seedance-2-5-260628`), damit ein Modell-Update später ohne Deploy möglich ist.
2. **Neue Edge Function `generate-seedance25-video`** nach dem Muster von `generate-seedance-video`:
   - Auth-Check, Kostenvorschau, Wallet-Abzug vor dem Call, automatischer Refund bei Provider-Fehler (Pflicht laut Credit-Reliability-Regel).
   - Asynchroner Ablauf: `POST /contents/generations/tasks` → Task-ID → Polling `GET /contents/generations/tasks/{id}` bis `succeeded`/`failed`, mit Watchdog gegen hängende Tasks.
   - Task-Typen laut Doku: Text-to-Video, Multimodal-Reference (Bildreferenzen), Edit Video, Extend Video — wir starten mit Text-to-Video und Referenzbild; Edit/Extend als zweiter Schritt.
3. **Katalog-Einträge**: neuer Tier in `seedanceVideoCredits.ts`, `videoPricingCatalog.ts` (Einkauf + 3,00×-Verkauf), `aiVideoModelRegistry.ts` (`edgeFunction: 'generate-seedance25-video'`, Badge „Neu"), plus Consistency-Ranking und Prompt-Limits.
4. **Composer/Motion Studio**: Seedance 2.5 dort freischalten, wo 2.0 heute erlaubt ist. Die Lip-Sync-Kette bleibt unangetastet (Feature Freeze v400) — 2.5 gilt wie 2.0 als Plate/B-Roll, nicht als Dialog-Master.
5. **Kostenvorschau** vor der Generierung wie bei allen anderen Modellen.

## Technische Details

- Auth: `Authorization: Bearer <MODELARK_API_KEY>`, JSON-Body mit `model` + `content[]` (Text-Part und optionale `image_url`-Parts); Auflösung/Dauer werden laut Doku als Direktiven bzw. Felder übergeben — ich richte mich beim Bau exakt nach der „Must-read before use"-Seite.
- Poll-Loop in der Edge Function mit 300 s Timeout, Zwischenstände in die bestehende Job-Tabelle, damit die UI Fortschritt zeigt.
- Fehlerklassen (Content-Filter, Quota, Timeout) werden auf die vorhandenen Refund-Pfade gemappt.
