# Neue Videopreise: Seedance 2.5 Zweistufig + 35 % Senkung aller anderen Modelle

## Ziel
- Seedance 2.5 bekommt zwei Qualitätsstufen: **720p = 11,95 €/30 s**, **480p = 6,95 €/30 s**.
- Alle übrigen Videomodelle werden **um 35 % günstiger**, auf glatte Preispunkte gerundet.
- Neue Margen-Untergrenze: **1,75× Providerkosten** für jedes Modell (Schutz gegen Verlustgeschäft, auch mit 40 % Creator-Rabatt).
- Nicht betroffen: Lip-Sync, Audio/ElevenLabs, Musik-Studio, Bild-Studio.

## Seedance 2.5
- Standard-Stufe = 480p → 0,2317 €/s (= 6,95 € für 30 s)
- Pro-Stufe = 720p → 0,3983 €/s (= 11,95 € für 30 s)
- Bisher zeigten beide Stufen denselben 720p-Preis (0,663 €/s). Künftig steuert die vorhandene Standard/Pro-Umschaltung im Composer echte Auflösung **und** Preis.
- Die Generierungsfunktion unterstützt bereits `resolution: "480p" | "720p"`; die gewählte Stufe wird künftig an sie durchgereicht.

## Neue Preise der übrigen Modelle (€ pro Sekunde, vorher → nachher)
| Modell | vorher | nachher |
| --- | --- | --- |
| Hailuo 2.3 Std / Pro | 0,14 / 0,23 | 0,09 / 0,15 |
| HappyHorse 720p / Pro | 0,42 / 0,84 | 0,27 / 0,55 |
| Seedance 1 Lite / Lite 1080p | 0,06 / 0,135 | 0,04 / 0,09 |
| Seedance 2.0 Fast / 2.0 | 0,45 / 0,54 | 0,29 / 0,35 |
| Kling 3.0 / 2.5 Turbo / 2.6 / Omni | 0,18 / 0,09 / 0,12 / 0,60 | 0,12 / 0,06 / 0,08 / 0,39 |
| Wan 2.5 Std / Pro | 0,12 / 0,21 | 0,08 / 0,14 |
| Wan 2.6 Std / Pro | 0,12 / 0,21 | 0,08 / 0,14 |
| Wan 2.7 720p / Pro | 0,30 / 0,45 | 0,20 / 0,29 |
| Luma Ray 2 Std / Pro | 0,21 / 0,36 | 0,14 / 0,23 |
| Luma Ray 3.2 5s / 10s | 0,18 / 0,27 | 0,12 / 0,18 |
| LTX 2.3 Fast / Pro | 0,18 / 0,24 | 0,12 / 0,16 |
| Vidu Q3 Pro (Ref/I2V) / Turbo T2V | 0,375 / 0,195 | 0,24 / 0,13 |
| Pika 2.2 Std / Pro | 0,12 / 0,27 | 0,08 / 0,18 |
| Runway Gen-4 Aleph | 0,24 | 0,16 |
| Veo 3.1 Lite 720p / 1080p | 0,45 / 0,66 | 0,29 / 0,43 |
| Veo 3.1 Fast / Pro | 1,20 / 3,30 | 0,78 / 2,15 |
| Sora 2 Std / Pro | 0,30 / 1,50 | 0,20 / 0,98 |
| Grok Imagine | 0,15 | 0,10 |

Alle Werte liegen bei ca. 1,95× Providerkosten und damit über der neuen 1,75×-Grenze. USD-Preise spiegeln wie bisher 1:1 die EUR-Preise.

## Technische Umsetzung
1. **Kanonischer Katalog** `supabase/functions/_shared/videoPricingCatalog.ts` und sein Client-Spiegel `src/lib/cost/videoPricingCatalog.ts`: alle `sellEUR`/`sellUSD` gemäß Tabelle; neuer Eintrag `seedance-2-5-480p` (Kosten-Annahme 0,1085 €/s, ca. halbe 720p-Providerkosten — vor Livegang gegen die reale ModelArk-480p-Rate gegenprüfen). Kommentar zur Margen-Policy aktualisieren, `CATALOG_VERSION` hochziehen.
2. **Composer-Mapping** (`composerSourceToCatalog.ts`, Client + `_shared`): `ai-seedance25` → `standard: 'seedance-2-5-480p'`, `pro: 'seedance-2-5'`. Damit rechnen Kostenvorschau, Reservierung und Abrechnung automatisch mit der richtigen Stufe.
3. **Auflösungs-Durchreichung**: Composer/Studio-Aufrufe von `generate-seedance25-video` senden `resolution` passend zur Qualitätsstufe (Standard → 480p, Pro → 720p). Keine Änderung an der FA-4/Motion-Studio-Logik.
4. **Client-Modellkonfigurationen** (`src/config/*VideoCredits.ts`, u. a. Seedance, Kling, Veo, Wan, Luma, LTX, Vidu, Pika, Hailuo, HappyHorse, Grok, `aiVideoCredits.ts`): `costPerSecond` und die in Beschreibungen/Badges genannten Beispielpreise auf die neuen Werte bringen (DE/EN/ES konsistent).
5. **Labels**: `QUALITY_LABELS['ai-seedance25']` auf „Seedance 2.5 480p" / „Seedance 2.5 720p".
6. **Margen-Guards**: `MARGIN_FLOOR` in `src/lib/cost/videoProviderMargins.ts` auf 1,75× (≈ 43 % Marge) umstellen; Paritäts-/Margentest `src/lib/cost/__tests__/pricingCatalogParity.test.ts` von „3,00×-Fenster" auf „≥ 1,75×" umstellen und den neuen 480p-Eintrag in die Paritätsprüfung aufnehmen.
7. **Tests**: Pricing-Parität, Composer-Credit-Contract und betroffene Modell-Capability-Tests lokal ausführen; `tsgo` prüfen.

## Nicht Teil dieses Schritts
Kein Deploy, keine Veröffentlichung, keine DB-/Config-Änderung, keine Provider-Aufrufe. Edge-Function-Dateien werden nur im Code angepasst.
