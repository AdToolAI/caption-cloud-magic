# AI Video Studio — Provider Parity Audit (Stand 08.09.2026)

Read-only Bestandsaufnahme. **Kein Code geändert.** Quellen: Provider-Dokumentation (Replicate-Modellseiten/llms.txt, dev.runwayml.com, ai.google.dev, Alibaba Model Studio, MiniMax, docs.x.ai, BytePlus/ModelArk, platform.vidu.com) plus Code-Read von `supabase/functions/_shared/videoModelSpecs.ts`, `_shared/videoPricingCatalog.ts`, den `generate-*-video`-Funktionen, `src/config/aiVideoModelRegistry.ts`, `src/lib/videoCapabilities/studioCapabilities.ts`.

Klassifikation: **VC** = Verified current · **UR** = Upgrade required · **RM** = Remove · **RL** = Route limitation · **NS** = Needs smoke test

Smoke-Test-Status ist überall `not run` — echte Provider-Läufe kosten Geld und sind noch nicht freigegeben.

---

## 1. Runway

| Model | Provider/Route | AdTool heute | Provider heute | Res | Dauer | Modi | Audio | Refs | Pricing | Required change | Quelle | Klasse |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| runway-gen4-aleph | Runway direct `/video_to_video`, Slug `gen4_aleph` | Spec `removed`/`available:false`, ABER Katalogzeile aktiv (0,18 €/s) und `generate-runway-video` ruft die Route weiter auf (`index.ts:29,306`) | Direct-API: laut Changelog **abgeschaltet**. Replicate `runwayml/gen4-aleph` steht noch — Widerspruch | 720p | 5 s | v2v | nein | Video 1 + Bild 0–1 | Katalog 0,18/0,08 | Route + Katalogzeile stilllegen, UI nicht startbar | docs.dev.runwayml.com/api-details/api_changelog/ vs replicate.com/runwayml/gen4-aleph | **RM** (+ DOCS_CONFLICT) |
| Gen-4.5 | Runway `gen4.5` / `runwayml/gen-4.5` | **existiert bei uns nicht** | Aktuelles Flaggschiff t2v/i2v; Academy: 12 Credits/s ≈ 0,12 $/s | unbestätigt | unbestätigt | t2v/i2v | unbestätigt | unbestätigt | keine | Route-Audit + Neuaufnahme | replicate.com/runwayml/gen-4.5, academy.runwayml.com/models-pricing | **UR / NS** |
| Gen-4 Turbo | `runwayml/gen4-turbo` | existiert bei uns nicht | i2v, günstige Stufe | unbestätigt | unbestätigt | i2v | unbestätigt | unbestätigt | keine | Route-Audit + Neuaufnahme | replicate.com/runwayml/gen4-turbo | **UR / NS** |
| Aleph 2.0 | `runwayml/aleph-2` | nur Kandidat `runway-aleph-2`, `ROUTE_AUDIT_REQUIRED` | Nachfolger von Gen-4 Aleph, bis 30 s Eingangsvideo, Multi-Shot-Edit | unbestätigt | unbestätigt | v2v/edit | unbestätigt | unbestätigt | keine | Vollständiges Schema holen, dann als Ersatz für Aleph 1 | replicate.com/runwayml/aleph-2, runway.com/product/aleph-2 | **UR / NS** |

## 2. Google Veo

| Model | Route | AdTool heute | Provider heute | Res | Dauer | Modi | Audio | Refs | Pricing | Required change | Quelle | Klasse |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| veo-3.1-lite-720p | `google/veo-3.1-fast` **mit resolution-Override** | 720p, 4/6/8 s | Replicate führt `google/veo-3.1-lite` als **eigenes Modell** | 720p | 8 s (Google: „8-second videos") | t2v/i2v/lastFrame/reference | ja | 1–3, nur 16:9 + 8 s | 0,32/0,15 | **Klärungsfall**: eigener Lite-Slug statt Fast-Umweg; Einkaufspreis prüfen | replicate.com/google/veo-3.1-lite | **UR** (Discrepancy) |
| veo-3.1-fast | `google/veo-3.1-fast` | 1080p, 8 s | deckungsgleich | 1080p | 8 s | wie oben | ja | 1–3 | 0,86/0,40 | keine | replicate.com/google/veo-3.1-fast | **VC** |
| veo-3.1-pro | `google/veo-3.1` | 1080p, 8 s; 4K nur als Kommentar, **keine Tier-Zeile** | Gemini-Doku: 720p/1080p/**4K**, 8 s | +4K fehlt | 8 s | wie oben | ja | 1–3 | 2,365/1,10 | 4K-Tier als gesperrte Stufe anlegen, Preis + Smoke-Test | ai.google.dev/gemini-api/docs/veo | **UR / NS** |
| veo-3.1-lite-1080p (nur Preiszeile) | — | Katalogzeile ohne kanonische Stufe | existiert so nicht bei uns | — | — | — | — | — | 0,475/0,22 | Preiszeile entfernen oder Stufe anlegen | Code-Audit | **RM** |
| MODEL_PRICING-Fallback in `generate-veo-video` | — | alte Preise 0,45/0,66/1,20/3,30, USD 1:1 | — | — | — | — | — | — | tot, aber greift bei Katalog-Miss | entfernen | `generate-veo-video/index.ts:29-34` | **RM** |

## 3. Wan

| Model | Route | AdTool heute | Provider heute | Res | Dauer | Modi | Audio | Refs | Pricing | Required change | Quelle | Klasse |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| wan-standard (2.5) | `wan-video/wan-2.5-t2v` | 720p, 5/10 s, kein Audio | Doku nennt 480p/720p/1080p, Audio-Input auf i2v-fast | evtl. mehr | ≤10 s unbestätigt | t2v/i2v | Provider ja (Audio-Input) | — | 0,09/0,04 | Schema-Read, ggf. Stufen ergänzen oder Modell auslaufen lassen | replicate.com/wan-video/wan-2.5-t2v | **UR / NS** |
| wan-2-6-std/pro | `wan-video/wan-2.6-*` | 720p/1080p, 5/10/15 s, kein Audio | Readme: 1080p, **lip-synced**, Referenzclips | ok | ok | t2v/i2v | Provider: ja → bei uns nein | Referenzclips fehlen | 0,09 / 0,155 | Audio + Referenz prüfen und nachziehen | replicate.com/wan-video/wan-2.6-t2v | **UR** |
| wan-2-7-std/pro | `wan-video/wan-2.7-t2v` / `-i2v` | 720p/1080p, 5/10/15 s, Audio ja | deckungsgleich; zusätzlich `-r2v` und `-videoedit` als eigene Slugs | ok | ok | t2v/i2v | ja | first+last vorhanden | 0,22 / 0,32 | optional r2v/videoedit aufnehmen | replicate.com/wan-video/wan-2.7-t2v | **VC** |
| Wan 3.0 | Alibaba Model Studio (Preview) / Replicate-Kollektion | nur Kandidat | bis **30 s**, 30 fps, natives Audio, bis 20 Referenz-Assets, T2V/I2V/first-last/Reference | 480p–1080p | bis 30 s | alle | ja | bis 20 | keine | Route-Audit; erst nach Slug-Bestätigung aufnehmen | alibabacloud.com/help/en/model-studio/wan3-video-generation-api-reference | **UR / NS** |

## 4. MiniMax / Hailuo

| Model | Route | AdTool heute | Provider heute | Res | Dauer | Modi | Audio | Refs | Pricing | Required change | Quelle | Klasse |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| hailuo-standard/pro | `minimax/hailuo-2.3` | 768p/1080p, 6/10 s (10 s nur 768p), nur 16:9, kein Audio | schema-identisch | ok | ok | t2v/i2v | nein | — | 0,10 / 0,165 | keine | replicate.com/minimax/hailuo-2.3 …/api | **VC** |
| hailuo-h3 (Hailuo 3.0) | `minimax/h3` | gesperrt, 768p/1080p, 6/10 s, **audio:false** | MiniMax: **native Stereo-Tonspur, bis 2K, bis 15 s** | 2K vs 1080p | 15 s vs 10 s | +Omni-Reference | ja vs nein | offen | keine Zeile | **Widerspruch — vor Freischaltung klären** (Replicate-Route vs MiniMax-Direktplattform) | minimax.io/blog/minimax-h3 | **UR / Discrepancy / NS** |
| „H3 Max" | — | — | **kein Beleg gefunden**, vermutlich kein eigenes Produkt | — | — | — | — | — | — | nicht aufnehmen | Recherche ergebnislos | **RL** |
| animate-scene-hailuo (Bypass) | `minimax/hailuo-2.3` hardcodiert | keine Dauer-/AR-Validierung | — | — | — | — | — | — | — | auf kanonisches Gate umstellen | `animate-scene-hailuo/index.ts:43,86-89` | **UR** |

## 5. Grok

| Model | Route | AdTool heute | Provider heute | Res | Dauer | Modi | Audio | Pricing | Required change | Quelle | Klasse |
|---|---|---|---|---|---|---|---|---|---|---|---|
| grok-imagine | `xai/grok-imagine-video` (Replicate) | 480p/720p, 5/6/10/12/15 s, Audio ja | Route selbst max. 720p | ok für diese Route | ok | t2v/i2v | ja | 0,11/0,05 | keine für diese Route | Code-Note + docs.x.ai | **VC / RL** |
| Grok Imagine Video 1.5 | xAI direkt `POST /v1/videos/generations` | nicht angebunden | **natives 1080p** t2v + i2v, Dauer 1–15 s, 7 Seitenverhältnisse | 1080p | 1–15 s | t2v/i2v | ja | keine | eigener Routen-Audit (xAI-Direktschlüssel nötig) | docs.x.ai/developers/model-capabilities/video/generation | **UR / NS** |

## 6. Seedance

| Model | Route | AdTool heute | Provider heute | Res | Dauer | Modi | Audio | Refs | Pricing | Required change | Quelle | Klasse |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| seedance-2-5 | ModelArk `/api/v3/contents/generations/tasks` | 480p/720p, 4–30 s, t2v/i2v/firstLast/reference/v2v/edit, Audio, 30 Bilder/10 Videos/10 Audios | deckungsgleich; **kein 1080p, kein 4K auf dieser Route** | ok | ok | ok | ja | ok | 0,3333 / 0,1932 | Preis-Anzeige-Bug (unten) | apimodels.app/docs/seedance-2-5, apiframe.ai | **VC** (Preis: UR) |
| seedance-standard (2.0 Fast) | `bytedance/seedance-2.0-fast` | 720p | 720p; Verweis auf 2.0 für 1080p/4K **nicht wörtlich belegt** | ok | ok | t2v/i2v | nein | — | 0,32/0,15 | Verifikationsnotiz entschärfen | replicate.com/bytedance/seedance-2.0-fast | **NS** |
| seedance-pro (2.0) | `bytedance/seedance-2.0` | 720p aktiv, 1080p/4K gesperrt | Audio + multimodale Referenzen dokumentiert | 1080p/4K real | ok | t2v/i2v | Provider ja → bei uns nein | Referenzen fehlen | 0,385/0,18 | Audio/Referenzen + höhere Stufen freischalten nach Smoke-Test | replicate.com/bytedance/seedance-2.0/llms.txt | **UR / NS** |
| seedance-mini (1 Lite) | `bytedance/seedance-1-lite` | 480p/720p, 5/10 s, +firstLast | 480p/720p, 5/10 s bestätigt; firstLast unbestätigt | ok | ok | prüfen | nein | — | 0,045/0,02 | firstLast gegen Schema prüfen | replicate.com/bytedance/seedance-1-lite/llms.txt | **NS** |
| seedance-mini-1080p | — | nur Preiszeile, keine Stufe | — | — | — | — | — | — | 0,10/0,045 | entfernen | Code-Audit | **RM** |
| Seedance 2.0 Mini | — | Kandidat | existiert | — | — | — | — | — | — | Route-Audit | Kandidatennotiz | **NS** |

## 7. Kling

| Model | Route | AdTool heute | Provider heute | Änderung | Quelle | Klasse |
|---|---|---|---|---|---|---|
| kling-2.5-turbo | `kwaivgi/kling-v2.5-turbo-pro` | t2v/i2v, 1080p, 5/10 s, kein Audio | zusätzlich **`end_image`** (Endbild) | firstLast-Modus ergänzen | replicate …/llms.txt | **UR** |
| kling-2.6 | `kwaivgi/kling-v2.6` | 1080p, 5/10 s, Audio | deckungsgleich | keine | replicate.com/kwaivgi/kling-v2.6 | **VC** |
| kling-3 | `kwaivgi/kling-v3-video` | 1080p aktiv, 4K gesperrt, 3–15 s, Audio | 4K existiert als eigene SKU, Pixeltabelle unbelegt | 4K erst nach Doku+Preis+Smoke-Test | replicate llms.txt, runware 3.0-4k | **NS / DOCS_CONFLICT** |
| kling-omni | `kwaivgi/kling-v3-omni-video` | t2v/i2v/reference/v2v, 1080p, 4K gesperrt und nicht für v2v | Modi bestätigt; **Preisstufen deutlich höher als unsere Einkaufsannahme 0,20 €/s** (nur Reseller-Beleg) | Einkaufspreis gegen Replicate-Preisseite verifizieren, bevor irgendwas verkauft wird | replicate readme; Reseller core.today | **UR / Discrepancy** |

## 8. Luma / LTX / Vidu / HappyHorse / Pika / Sora

| Model | Route | AdTool heute | Provider heute | Änderung | Quelle | Klasse |
|---|---|---|---|---|---|---|
| luma-ray32-5s / -10s | `luma/ray-3.2` | 540p/720p/1080p, 5 bzw. 10 s, kein Audio | deckungsgleich; HDR/EXR/Reframe nur über Luma-Direktroute | keine | replicate.com/luma/ray-3.2/readme | **VC / RL** |
| luma-standard / -pro (Ray 2) | `luma/ray-2-*` | deprecated, abgelöst | Ray 3.2 ist aktuell | auslaufen lassen | — | **RM** (geplant) |
| ltx-standard (2.3 Fast) | `lightricks/ltx-2.3-fast` | fps nur 24/25 | Readme: **24, 25, 48, 50 fps** | 48/50 fps ergänzen | replicate …/readme | **UR** |
| ltx-pro (2.3 Pro) | `lightricks/ltx-2.3-pro` | 1080p, 6/8/10 s, 24/25 fps | **bis 4K bei 50 fps**, zusätzlich audio-to-video, extend, retake | großer Nachzug nötig | replicate …/llms.txt | **UR / NS** |
| vidu-q2-reference / -i2v / -t2v | `vidu/q3-pro`, `vidu/q3-turbo` | Q3-Routen unter Q2-IDs, 540p/720p/1080p, 4–16 s, Audio | bis 16 s / 1080p mit Ton bestätigt; **kein Multi-Reference**, nur start/end image — passt zu uns; 540p/720p-Enum unbestätigt | ID-Drift dokumentieren oder migrieren; Auflösungs-Enum prüfen; Preisbasis ist Replicate, nicht Vidu-Credits | replicate.com/vidu/q3-pro | **NS** |
| happyhorse-standard/pro | `alibaba/happyhorse-1.0` | 720p/1080p, 3–15 s, kein Audio | in dieser Runde nicht recherchiert | Nachaudit | — | **NS** |
| pika-2-2-standard/pro | fal.ai | `available:false`, Wartung | offen | Entscheidung: reaktivieren oder entfernen | — | **RM / NS** |
| sora-2 | entfernt | Spec `removed`, keine Route; Legacy-Route `/sora-video-studio` → `sora-2-standard` | EOL | Legacy-Route + Preiszeilen entfernen | Code-Audit | **RM** |

---

## Systembefunde (unabhängig vom Modell)

1. **Anzeige ≠ Abbuchung, Seedance 2.5 480p.** Die Vorschau rechnet immer mit `model.id = seedance-2-5` (`ToolkitGenerator.tsx:700,712`), abgebucht wird `seedance-2-5-480p` (`generate-seedance25-video/index.ts:210-212`). Angezeigt 0,3333 €/s, belastet 0,1932 €/s — 72 % zu hoch angezeigt. Kein Rundungsfehler, sondern falsche Preis-ID.
2. **Verfügbarkeit greift nicht im Picker.** `ModelSelector.tsx:144-155` sperrt nur nach handgepflegtem `status`; kanonisches `available:false` wird nie gelesen. Blockade passiert erst beim Klick auf Generieren.
3. **Neun Umgehungspfade ohne Gate**: `compose-video-clips` (9 hardcodierte Slugs, u. a. das tote `runway-gen4-aleph`, außerdem überall festes 16:9), `autopilot-generate-video` (Dauer-Clamp 4–12 s, AR-Fallback 9:16, eigene Slug-Tabelle), `animate-scene-hailuo`, `generate-fast-preview` (feste 73 Frames), `compose-scene-variants`, `render-universal-video` (Frame-Clamp), zwei Director's-Cut-Funktionen, `compose-clip-webhook`.
4. **Preis-Leichen:** `seedance-mini-1080p`, `veo-3.1-lite-1080p` (keine kanonische Stufe); `sora-2-standard`/`sora-2-pro`/`wan-pro` lösen über Aliase auf und sind kein Fehler.
5. **Alte Provider-Preisdateien leben:** `src/config/*VideoCredits.ts` sind aktiver Fallback in `ModelSelector.tsx:86` und `ToolkitGenerator.tsx:704`; kein Test schützt diese Dateien einzeln vor Drift.
6. **Testlücken:** Server↔Client-Katalog prüft `sellEUR`/`costEUR`, aber **nicht** `minDuration`/`maxDuration`; kein Test prüft, dass die UI die auflösungsspezifische Preis-ID benutzt; kein Test prüft die Umgehungspfade oder die Picker-Sperre.

## Offene Klärungspunkte (Doku vs. Implementierung — bewusst nicht entschieden)

- **Runway Aleph 1:** Direct-API-Changelog sagt abgeschaltet, Replicate-Seite steht noch. Zwei sich widersprechende Provider-Quellen.
- **Hailuo H3:** MiniMax nennt Stereo-Ton und 2K, unsere Replicate-Route-Notiz nennt kein Audio und max. 1080p.
- **Veo Lite:** eigener Provider-Slug vs. unser Fast-Umweg mit `resolution`-Parameter.
- **Kling Omni Einkaufspreis:** unsere 0,20 €/s stehen gegen deutlich höhere Reseller-Angaben; keine belastbare Replicate-Preisseite gelesen.
- **Einkaufspreise generell** (Seedance 2.5 bei BytePlus, Vidu über Replicate, Wan-Stufen): nicht durch eine offizielle Preisseite belegt.

## Nächster Schritt

Umsetzung erst nach Freigabe. Blockierend: Entscheidung zu Smoke-Test-Budget und zu den fünf Klärungspunkten oben.
