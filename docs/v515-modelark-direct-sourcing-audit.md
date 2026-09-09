# v515 — ByteDance / ModelArk Direct-Sourcing-Audit

Stand: 09.09.2026 · **Read-only.** Keine Route, kein Preis, keine Modellverfügbarkeit geändert.
Quellen: (a) unser Code (`_shared/modelark.ts`, `generate-seedance*-video`, `videoPricingCatalog.ts`, `videoModelSpecs.ts`), (b) `ai_video_generations` (letzte 120 Tage), (c) BytePlus-Abrechnung September (v514-Reconciliation), (d) Live-Abruf der Replicate-Modellseiten am 09.09.2026 (Preis-Matrizen als JSON aus der Seite extrahiert), (e) BytePlus-Doku (SPA, nur teilweise maschinell lesbar — entsprechend markiert).

---

## 0. Kernbefunde in drei Sätzen

1. **Replicate verkauft Seedance zum ByteDance-Listenpreis weiter.** Replicate 2.5 720p = **$0.2312/s**, unsere real gemessene ModelArk-Rate = **$0.2318/s**. Der Direktbezug bringt heute **keine Kostenersparnis** — der Hebel liegt ausschließlich im BytePlus-Volumenrabatt.
2. **Seedance 1 Lite ist direkt sogar teurer** als über Replicate ($0.0389/s vs. $0.036/s @720p, Rechnung unten) — hier ist Replicate die bessere Route.
3. **Neuer, bisher nicht bepreister Risikofaktor (P0):** Seedance 2.x kostet mit **Video-Input** rund das **4,2-fache** (2.5 720p: $0.9676/s statt $0.2312/s). Unsere Composer-Kette schickt bei nahtlosen Übergängen Referenzvideos an Seedance 2.5, bepreist wird aber unverändert mit €0.3333/s → in dieser Konstellation entsteht ein **Verlustgeschäft**.

---

## 1. Seedance 2.5 bleibt unverändert

Bestätigt und eingehalten: Kundenpreis (720p €0.3333/s, 480p €0.1932/s), ModelArk-Direktroute (`dreamina-seedance-2-5-260628`, ap-southeast/Johor) und die zuletzt vorgeschlagene Preisanpassung bleiben **unangetastet**, bis die BytePlus-Sales-Antwort zum 10–15%-Rabatt vorliegt.

---

## 2. Was heute nachweisbar über ModelArk läuft / verfügbar ist

Unsere Produktionsroute (Code-Fakt):

| Feld | Wert |
| --- | --- |
| Endpoint | `POST https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks` (Polling: `GET …/tasks/{id}`) |
| Region | BytePlus ap-southeast (Johor) |
| Modell-ID | `dreamina-seedance-2-5-260628` (überschreibbar via `MODELARK_SEEDANCE_25_MODEL_ID`, Endpoint-ID `ep-…` via `MODELARK_RESOURCE_ID`) |
| Modi | T2V, I2V (first frame), first+last frame, Multi-Reference (Bilder), Referenz-Video (Edit/Extend), Referenz-Audio |
| Caps im Client | 30 Bilder / 10 Videos / 10 Audios; Modi gegenseitig exklusiv |
| Auflösungen | 480p, 720p (1080p/4K werden vom Provider abgelehnt) |
| Dauer | 4–30 s, `-1` = Smart Duration (bei Edit-Tasks erzwungen) |
| Ratios | 16:9, 4:3, 1:1, 3:4, 9:16, 21:9, adaptive (bei Frame-/Video-Input auf `adaptive` gesperrt) |
| Audio | nativ (`generate_audio`) |
| Weitere Controls | `seed`, `watermark` |

**Katalog laut BytePlus-Doku (Modell-Liste, Stand Sept. 2026 — Modell-IDs verbatim, Spezifikationstabellen nicht vollständig maschinell lesbar):**
`seedance-1-0-pro-250528`, `seedance-1-0-pro-fast-251015`, `seedance-1-5-pro-251215`, `dreamina-seedance-2-0-260128`, `dreamina-seedance-2-0-fast-260128`, `dreamina-seedance-2-0-mini-260615`, `dreamina-seedance-2-5-260628`; `seedance-1-0-lite` existiert nur noch als eigene (Legacy-)Doku-Seite. Bild-Modelle (kein Video): `seedream-4-0/4-5/5-0`, `dola-seedream-5-0-pro`.

**Offen (nur mit Konsole/Account zu schließen, nicht aus der Doku):**
- Freischaltung dieser Modell-IDs **in unserem Account und in ap-southeast** (die Doku beschreibt den globalen Katalog, nicht unsere Berechtigungen).
- Account-spezifische Preise / aktive Resource-Packages.
- Ob Nicht-ByteDance-Modelle (Wan, Vidu, Doubao/Seaweed) über ModelArk beziehbar sind — im Katalog nicht auffindbar; Stand heute: **nein**.

---

## 3. Preis-Realität: Replicate ist ein Pass-Through

Token-Formel (aus unserer eigenen September-Abrechnung rekonstruiert und bestätigt): `Tokens/s = Breite × Höhe × fps / 1024`
→ 720p (1280×720×24) = **21.600 Tokens/s**, 480p (854×480×24) = **9.610 Tokens/s**. Gemessen: 21,66K bzw. 9,71K Tokens/s.

Seedance 2.5 SKU aus unserer Rechnung: `Dreamina-Seedance-2.5-inference-non-video-in-480p-720p`, **$0,0107/K Tokens**.

**Replicate-Preismatrix, live ausgelesen am 09.09.2026** (Preise pro Sekunde Output, Unterscheidung `non_video_in` / `video_in`):

| Modell | 480p ohne / mit Video-In | 720p ohne / mit Video-In | 1080p ohne / mit | 4K ohne / mit |
| --- | --- | --- | --- | --- |
| `bytedance/seedance-2.5` | $0.1028 / $0.4304 | $0.2312 / $0.9676 | – | – |
| `bytedance/seedance-2.0` | $0.08 / $0.10 | $0.18 / $0.22 | $0.45 / $0.55 | $1.00 / $1.25 |
| `bytedance/seedance-2.0-fast` | $0.07 / $0.08 | $0.15 / $0.17 | – | – |
| `bytedance/seedance-1-pro` | $0.03 | $0.06 | $0.15 | – |
| `bytedance/seedance-1-lite` | $0.018 | $0.036 | $0.072 | – |

**Direktvergleich Seedance 2.5 (das einzige Modell mit echten Rechnungsdaten auf beiden Seiten):**

| Konfiguration | ModelArk real (unsere Rechnung) | Replicate Liste | Differenz |
| --- | --- | --- | --- |
| 720p, kein Video-Input | **$0.2318/s** (€0.2016) | $0.2312/s | ModelArk **+0,3 % teurer** |
| 480p, kein Video-Input | **$0.1039/s** (€0.0903) | $0.1028/s | ModelArk **+1,1 % teurer** |

Seedance 1 Lite direkt: BytePlus-Doku nennt **$1,80/M Tokens** → 720p = 21.600 × 1,8/1e6 = **$0.0389/s** gegenüber **$0.036/s** bei Replicate → **Replicate ist hier günstiger** (‑7,5 %).

Für Seedance 2.0 / 2.0 Fast / 2.0 Mini liegt uns **kein Account-Preis** vor. Rückgerechnet entsprächen die Replicate-Preise $0.00833/K (2.0) bzw. $0.00694/K (2.0 Fast) — angesichts der 1:1-Parität bei 2.5 die plausibelste Annahme, aber **unbestätigt**; erst per Konsole/Sales verifizieren.

---

## 4. Unsere Replicate-Routen mit ByteDance-Bezug

| AdTool-Modell | Route heute | ModelArk-Äquivalent | Feature-Parität | Kosten heute (Katalog) | ModelArk-Kosten | Ersparnis | Einstufung |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Seedance 2.5 (`seedance-2-5`, `…-480p`) | ModelArk direkt | – | – | €0.217 / €0.1085 hinterlegt, real €0.2016 / €0.0903 | – | – | **Already optimal** |
| Seedance 2.0 (`seedance-pro`) | `replicate:bytedance/seedance-2.0` | `dreamina-seedance-2-0-260128` | wahrscheinlich gleich (direkt zusätzlich Referenz-Assets, native Audio, Smart-Duration — bei uns ohnehin nicht freigeschaltet) | €0.18/s @720p | unbekannt, erwartet ≈ gleich | ≈ 0 % (ohne Rabatt) | **Consider migration** |
| Seedance 2.0 Fast (`seedance-standard`) | `replicate:bytedance/seedance-2.0-fast` | `dreamina-seedance-2-0-fast-260128` | wie oben | €0.15/s @720p | unbekannt, erwartet ≈ gleich | ≈ 0 % | **Consider migration** |
| Seedance 1 Lite (`seedance-mini`, `…-1080p`) | `replicate:bytedance/seedance-1-lite` | `seedance-1-0-lite` (Legacy) | gleich | €0.02 / €0.045 | $0.0389/s @720p rechnerisch | **negativ (‑7,5 %)** | **Keep on Replicate** |
| ByteDance vCube Upscaler (`bytedance-vcube`) | `replicate:bytedance/video-upscaler` | im ModelArk-Videokatalog nicht gefunden | – | verifizierte Matrix, 09.09.2026 | n/v | – | **Not available direct** |
| Seedream 4 (Picture „fast") | `replicate:bytedance/seedream-4` | `seedream-4-0/4-5/5-0` auf ModelArk vorhanden | Bild-Rail, eigener Preisvertrag | €0.03/Bild | unbekannt | unbekannt | **Consider (separate Rail)** |

Alle übrigen Familien (Kling, Veo, Wan, Hailuo, Luma, LTX, Vidu, Grok, Runway, Pika, HappyHorse) sind **nicht** über ModelArk beziehbar → `NOT AVAILABLE DIRECT`, Replicate bleibt.

---

## 5. Produktionsökonomie aus echten Daten (letzte 120 Tage)

| Modell | Route | Fertige Jobs | Sekunden | Umsatz brutto |
| --- | --- | --- | --- | --- |
| Seedance 2.5 720p | ModelArk | 95 | 1.641 | €739,94 |
| Seedance 2.0 (`seedance-pro`) | Replicate | 38 | 403 | €200,37 |
| Kling 3 Pro | Replicate | 34 | 498 | €99,60 |
| Veo 3.1 Fast/Pro | Replicate | 12 | 92 | €205,80 |
| alle übrigen | Replicate | < 5 je Modell | – | – |

**Seedance 2.5 stellt ~70 % unseres Video-Provider-Volumens.** Für Seedance 2.0 (403 s über Replicate) reicht die Historie nicht für eine eigene Effektivkostenmessung; es gilt die Listenrate.

Reale Rate Seedance 2.5 (v514, unverändert übernommen): **720p €0.2016/s, 480p €0.0903/s**.

---

## 6. Feature-Vergleich Replicate ↔ ModelArk (Seedance)

| Kriterium | Replicate | ModelArk direkt |
| --- | --- | --- |
| Auflösungen | 2.5: 480p/720p · 2.0: bis 4K | 2.5: 480p/720p (identisch); 2.0 laut Doku bis 4K, unbestätigt |
| Dauer | 2.5 laut Schema bis 30 s · 1-lite 4–12 s | 2.5: 4–30 s + Smart Duration (`-1`) |
| Referenzbilder | 2.0: max. 9 · 1-lite: 1–4 (nicht mit 1080p/Frames kombinierbar) | 2.5: bis 30 Bilder / 10 Videos / 10 Audios |
| First/Last Frame | ja | ja |
| Video-Input / Editing | ja, **eigener 4,2×-Tarif** | ja, eigene SKU (Preis unbestätigt) |
| Natives Audio | 2.0/2.5 ja | ja (`generate_audio`) |
| Abrechnung | pro Output-Sekunde, Staffel nach Auflösung + Video-In | pro Token, gleiche Größenordnung |
| Fehl-/Abbruchkosten | keine Belastung bei `failed` | keine Belastung: 50 Fehl-Jobs im September, **keiner** in der Rechnung |
| Queue/Webhook | Webhooks nativ (wir nutzen sie) | **nur Polling** — wir betreiben dafür `modelark-poll` |
| Moderation | Replicate-Layer + ByteDance | direkt ByteDance (im September 26 Abbrüche durch Copyright-/Audio-Filter) |
| Latenz/Concurrency | Replicate-Warteschlange | direkt, region-nah (Johor) — bei uns bisher unauffällig |
| Verhandlung | keine (Wiederverkauf) | **Volumenrabatt möglich** — der eigentliche strategische Hebel |

---

## 7. Seedance-Tabelle mit Empfehlung

| Seedance-Modell | Route heute | Direkt verfügbar? | Auflösung | Dauer | Audio | Input-Modi | Kosten real/Liste | AdTool-Retail | Empfehlung |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2.5 | **ModelArk** | ja (aktiv) | 480p/720p | 4–30 s | ja | T2V, I2V, F/L, Multi-Ref, Video, Audio | $0.2318 / $0.1039 real | €0.3333 / €0.1932 | **Bleibt direkt; Preis bis Sales-Antwort einfrieren** |
| 2.0 | Replicate | vermutlich (`dreamina-seedance-2-0-260128`) | 720p aktiv (1080p/4K gesperrt) | 3–15 s | bei uns aus | T2V, I2V | $0.18/s @720p | €0.385/s | **Consider migration** — erst Account-Preis prüfen |
| 2.0 Fast | Replicate | vermutlich | 720p | 3–15 s | bei uns aus | T2V, I2V | $0.15/s @720p | €0.32/s | **Consider migration** |
| 2.0 Mini | nicht angeboten | ja (`…-mini-260615`) | unbekannt | unbekannt | unbekannt | unbekannt | unbekannt | – | Prüfen als günstigere Draft-Stufe |
| 1.5 Pro | nicht angeboten | ja (`seedance-1-5-pro-251215`) | unbekannt | unbekannt | unbekannt | unbekannt | unbekannt | – | Nur bei Bedarf evaluieren |
| 1 Lite | Replicate | ja (Legacy) | 480p/720p/1080p | 5–10 s | nein | T2V, I2V, F/L, 1–4 Refs | $0.036/s @720p | €0.045/s | **Keep on Replicate** (direkt ~7,5 % teurer) |
| 1 Pro | nicht angeboten | ja | bis 1080p | – | nein | T2V, I2V | $0.06/s @720p | – | Von 2.x überholt, kein Handlungsbedarf |

---

## 8. Historische Jobs (Vorgabe bestätigt)

Bei einer späteren Migration gilt: bestehende Datensätze behalten `parity_api_route` / `parity_provider_model_slug` / `artlist_job_id` unverändert; Replicate-Prediction-IDs bleiben gültig; Retries alter Jobs behalten die ursprüngliche Route (die Job-ID trägt bereits das Präfix `modelark:` bzw. keines — die Unterscheidung existiert). Nur neue Jobs nach Cutover nutzen die neue Route. **Heute nur geplant, nicht umgesetzt.**

---

## 9. Preiswirkung bei unveränderten Kundenpreisen

Ohne BytePlus-Rabatt (Listenparität) ist die Wirkung ≈ 0:

| Modell | Kosten heute | ModelArk-Kosten | Retail | Faktor heute | Faktor direkt | Ersparnis/Sek. |
| --- | --- | --- | --- | --- | --- | --- |
| Seedance 2.0 720p | $0.18 | ≈ $0.18 (unbestätigt) | €0.385 | ~1,93× brutto | unverändert | ~0 |
| Seedance 2.0 Fast 720p | $0.15 | ≈ $0.15 (unbestätigt) | €0.32 | ~1,92× brutto | unverändert | ~0 |
| Seedance 1 Lite 720p | $0.036 | $0.0389 | €0.045 | 1,25× | 1,16× | **‑$0.0029 (schlechter)** |

Der wirtschaftliche Fall entsteht **erst** mit dem Volumenrabatt — und der gilt nur für direkt bezogene Modelle.

---

## 10. BytePlus-Rabattszenarien (Planung, kein Anspruch)

Basis Seedance 2.5, real €0.2016/s (720p) und €0.0903/s (480p); Marge nach 19 % MwSt. und 10 % Zahlungsgebühren (`netto = brutto ÷ 1,19 × 0,90`), Retail 720p €0.3333/s, 480p €0.1932/s:

| Rabatt | 720p Kosten | Faktor Standard | Faktor Founder (‑10 %) | 480p Kosten | Faktor Standard | Faktor Founder |
| --- | --- | --- | --- | --- | --- | --- |
| 0 % | €0.2016 | 1,25× | 1,13× | €0.0903 | 1,62× | 1,46× |
| 5 % | €0.1915 | 1,32× | 1,19× | €0.0858 | 1,70× | 1,53× |
| 10 % | €0.1814 | 1,39× | 1,25× | €0.0813 | 1,80× | 1,62× |
| 15 % | €0.1714 | 1,47× | 1,32× | €0.0768 | 1,90× | 1,71× |
| 20 % | €0.1613 | 1,56× | 1,41× | €0.0722 | 2,02× | 1,82× |

Selbst 20 % Rabatt bringen 720p **nicht** auf die 1,75×-Policy — die Preisfrage bei 2.5 720p bleibt also unabhängig vom Rabatt bestehen (wie in v514 beschrieben), der Rabatt entschärft sie nur.

Für Seedance 2.0/2.0 Fast würde ein Rabatt bei Migration ~$0.18→$0.162 (10 %) bzw. $0.15→$0.135 bedeuten: ca. **€7 Ersparnis pro 400 Produktionssekunden** — beim heutigen Volumen marginal, aber es zahlt auf die Verhandlungsbasis ein.

---

## 11. Endempfehlung

**Migrate to ModelArk** — derzeit keiner. Kein Modell erfüllt „gleich gut **und** wirtschaftlich klar besser" ohne bestätigten Account-Preis.

**Consider migration**
- `seedance-pro` (Seedance 2.0): Replicate → `dreamina-seedance-2-0-260128`. Kostendelta erwartet 0, Rabattpotenzial + Bündelung des Volumens bei einem Anbieter; zusätzlich direkt: Referenz-Assets, native Audio, Smart Duration. Aufwand mittel (Client existiert, `generate-seedance-video` bräuchte einen ModelArk-Zweig + Poller-Anbindung). Risiko: mittel — Webhook entfällt, Polling nötig.
- `seedance-standard` (Seedance 2.0 Fast) — identische Argumentation, gemeinsam umsetzen.
- Seedream (Bild-Rail) separat prüfen.

**Keep on Replicate**
- Seedance 1 Lite (direkt teurer), ByteDance vCube Upscaler (direkt nicht verfügbar), alle Nicht-ByteDance-Familien.

**Already optimal**
- Seedance 2.5 auf ModelArk.

**Vorrangig, unabhängig von jeder Migration (P0):** Video-Input-Tarif prüfen. Bei Replicate kostet Seedance 2.5 mit Video-Input $0.9676/s statt $0.2312/s. Unser Composer schickt bei nahtlosen Übergängen Referenzvideos an Seedance 2.5 (`generate-seedance25-video` → `referenceVideoUrls`), bepreist wird aber immer €0.3333/s. Die September-Rechnung enthält ausschließlich die `non-video-in`-SKU — entweder wurde in dem Zeitraum kein Video-Input abgerechnet, oder ModelArk bepreist es anders. Das ist über die Rechnung des laufenden Monats zu klären, bevor die Funktion breiter genutzt wird.

---

## 12. Bezahlte Tests — Freigabe angefragt, nichts gestartet

Zur Schließung der offenen Punkte wären folgende kostenpflichtigen Läufe nötig (**noch nicht ausgeführt**):

| # | Zweck | Modell / Provider | Konfiguration | Calls | Geschätzte Kosten |
| --- | --- | --- | --- | --- | --- |
| 1 | Ist `dreamina-seedance-2-0-260128` in unserem Account/Region freigeschaltet und was kostet er? | Seedance 2.0 · ModelArk | T2V, 480p, 4 s, kein Audio | 1 | ≈ $0.32 |
| 2 | dito für Fast | Seedance 2.0 Fast · ModelArk | T2V, 480p, 4 s | 1 | ≈ $0.28 |
| 3 | Preis-SKU für Video-Input verifizieren (P0) | Seedance 2.5 · ModelArk | 480p, 4 s, ein kurzes Referenzvideo | 1 | ≈ $0.42–1.72 (je nach SKU) |
| 4 | Mini-Stufe evaluieren | Seedance 2.0 Mini · ModelArk | T2V, 480p, 4 s | 1 | ≈ $0.20 (unbekannt) |

Gesamt: **4 Calls, ca. $1,20–2,60.** Test 3 hat die höchste Priorität, weil er ein laufendes Margenrisiko misst.
