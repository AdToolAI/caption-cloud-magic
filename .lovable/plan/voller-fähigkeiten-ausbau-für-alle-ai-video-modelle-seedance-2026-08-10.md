# Voller Fähigkeiten-Ausbau für alle AI-Video-Modelle (Seedance-2.5-Standard)

Bei Seedance 2.5 haben wir gerade den kompletten Weg gemacht: Provider-Doku lesen → Registry, Edge Function und UI auf den echten Funktionsumfang heben (30 Bilder, 10 Videos, 10 Audios, natives Audio, alle Ratios, Auto-Dauer). Dasselbe fehlt für die übrigen 32 Modelle. Diese Runde zieht sie nach.

## Umfang

Alle Familien der Registry, je mit eigener Edge Function:

Kling (2.5 Turbo, 2.6, 3, Omni) · Veo 3.1 (lite/fast/pro) · Grok Imagine · LTX 2.3 (Fast/Pro) · Wan (2.5, 2.6 Std/Pro, 2.7 Std/Pro) · Hailuo 2.3 (Std/Pro) · Luma (Ray 2 Std/Pro, Ray 3.2 5s/10s) · Seedance 1 Lite / 2.0 Fast / 2.0 · Runway Gen-4 Aleph · Pika 2.2 (Std/Pro) · Vidu Q2 (Reference/i2v/t2v) · HappyHorse (Std/Pro)

## Pro Modell derselbe Vier-Schritt

1. **Doku-Read** (Replicate-Input-Schema bzw. Provider-API): erlaubte `duration`-Werte, `aspect_ratio`-Enum, `resolution`-Enum, First/Last-Frame, Referenzbilder inkl. Maximalzahl, Video-Input, Audio-Input, natives Audio, Prompt-Limits, Seed, Sonderflags.
2. **Registry korrigieren** (`aiVideoModelRegistry.ts`): Fähigkeit fehlt → ergänzen; Fähigkeit versprochen, aber Provider kann sie nicht → entfernen; `resolutions[]` überall dort, wo mehrere Auflösungen existieren.
3. **Edge Function nachziehen**: Parameter, die die Registry jetzt anbietet, müssen auch wirklich an den Provider gehen (strukturierte Body-Felder statt Prompt-Suffixe, Clamps auf die dokumentierten Enums, saubere 400-Fehlermeldung statt stillem Ignorieren).
4. **UI**: `ToolkitGenerator` ist capability-getrieben — neue Schalter erscheinen automatisch. Nur wo eine echte neue Eingabeart dazukommt (Referenzvideo, Referenzaudio, Auto-Dauer, Auflösungswahl), braucht es einen Upload-/Auswahlblock analog zu Seedance 2.5.

## Preis-Leitplanke

Jede neu freigeschaltete Auflösung, Dauer oder Modalität bekommt vorher einen geprüften Sekundenpreis im Katalog mit der 3,0×-Marge. Wo der Provider-Preis unklar ist, bleibt die Option dokumentiert gesperrt statt margenzerstörend angeboten.

## Dokumentation und Drift-Schutz

- `docs/ai-video-capability-matrix.md`: eine Zeile pro Modell mit „Provider sagt" / „Registry sagt" / „Edge Function sendet" plus Quelle.
- Tests in `src/config/__tests__/aiVideoModelCapabilities.test.ts` erweitern: Registry-Ratios müssen im dokumentierten Provider-Enum liegen, Dauern Teilmenge der dokumentierten Werte, `maxReferences` == Server-Cap, jede `resolutions[]`-Stufe hat einen Preis-Pfad.

## Reihenfolge

Familienweise, je Familie ein abgeschlossener Block (Doku → Registry → Function → Test), damit nichts halbfertig live geht:

1. Kling (4 Modelle, größte Fähigkeitsdichte)
2. Wan + Hailuo
3. Veo + Luma
4. Seedance 1/2.0 + Vidu
5. Runway + Pika + HappyHorse + LTX + Grok

## Technische Details

Betroffen: `src/config/aiVideoModelRegistry.ts`, die jeweilige `src/config/*VideoCredits.ts`, `supabase/functions/generate-*-video/index.ts`, `supabase/functions/_shared/videoPricingCatalog.ts`, `src/lib/video-composer/providerCapabilities.ts`, `src/types/video-composer.ts`, Tests und die Matrix-Doku.

Nicht angefasst: Lip-Sync-Kette, Wallet-/Credit-Logik (außer neuen Preiszeilen), Render-Pipeline. Recherche läuft über parallele Sub-Agents pro Familie.
