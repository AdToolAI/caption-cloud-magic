# AI Video Capability Matrix

Quelle der Wahrheit: `supabase/functions/_shared/videoModelSpecs.ts`.
Client-Spiegel: `src/config/videoModelSpecs.ts` — **generiert**, nie von Hand ändern:

```bash
node scripts/generate-video-model-specs.mjs
```

Der Test `src/config/__tests__/videoModelSpecsParity.test.ts` bricht CI ab, sobald
Spiegel und Quelle auseinanderlaufen.

## Grundregeln

1. **Fähigkeiten gelten pro Modus**, nie pro Modell. Ein Modell kann in T2V mehr
   können als in I2V.
2. **Jede Auflösung trägt exakte Pixelmaße** (`landscape` / `portrait`). Ein bloßes
   Label wie „4K" ist verboten — genau daran ist Topaz gescheitert (`long-edge`
   statt `orientation-aware`).
3. **Native Generierung und Upscaling sind getrennt.** `resolutions[].native = true`
   heißt: der Provider rendert diese Pixel. Upscale-Stufen stehen ausschließlich in
   `enhanceUpscaleTiers` und laufen über Video Enhance.
4. **Keine stillen Clamps.** Eine unzulässige Kombination wird mit
   `INVALID_MODEL_CAPABILITY` abgelehnt, niemals umgeschrieben.
5. **Wahrheit ist die Route, nicht der Modellname.** Parität gilt je Kombination
   Modell × API-Route × Region × Modus.

## Verifikationsstufen (`parityStatus`)

| Status | Bedeutung |
| --- | --- |
| `UNVERIFIED` | Aus der Alt-Registry übernommen, Routen-Audit steht aus. |
| `VERIFY` | War verifiziert, wurde durch Regression oder Ablauf zurückgestuft. |
| `FULL_PARITY` | Routen-Audit + Preiszeile + Smoke-Test + gemessene Ausgabe. |

`FULL_PARITY` verlangt einen `smokeTest` mit Run-ID, gemessenen Pixeln **und**
Wirtschaftlichkeitsdaten (`estimatedProviderCost`, `actualProviderCost`,
`chargedCredits`, `effectiveMargin`). Der Test erzwingt das.

`grandfathered: true` markiert Modelle, die vor dem Upgrade bereits ausgeliefert
wurden: sie dürfen ohne Smoke-Test `available` bleiben. **Jede neue Auflösungsstufe
braucht einen bestandenen Smoke-Test, bevor sie eingeschaltet wird.**

## Automatische Rückstufung

Liefert eine Auflösungsstufe drei Läufe in Folge weniger Pixel als angefordert,
wird `parityStatus` von `FULL_PARITY` auf `VERIFY` gesetzt und im Health-Report
gelb gemeldet.

## Bekannte Provider-Fallen (in den Specs kodiert)

| Modell | Falle | Kodierung |
| --- | --- | --- |
| Topaz (Video Enhance) | „4K" zählt Zeilen auf der langen Seite → Hochkant nur 1216×2160 | `orientationBehavior: 'long-edge'` |
| LTX 2.3 Fast | über 8 s stiller Clamp auf 1080p | `constraints` an 2K/4K |
| Hailuo 2.3 Pro | 1080p nur bei 6 s | `constraints` an 1080p |
| Veo 3.1 | 1080p nur bei 8 s; `reference_images` nur 16:9/8 s | `constraints` |
| Kling 2.5 Turbo | UI zeigte 720p, Route rendert 1080p | Spec führt 1080p |
| Kling 2.6 | Katalog erlaubte 15 s, Provider-Enum ist [5, 10] | `durations` |
| Seedance 2.5 | ein einziger Input-Slot; max. 720p auf der ModelArk-Route | `constraints`, `resolutions` |
| Vidu Q3 | 2K/4K/8K existieren nur als Upscale | `enhanceUpscaleTiers` |

## UI-Gruppierung

`UI_GROUP_ORDER`: `flagship` → `professional` → `audio` → `fast` → `economy` → `legacy`.
Innerhalb einer Gruppe sortiert die höchste native Auflösung nach oben. Labels in
DE/EN/ES stehen in `SPEC_GROUP_LABELS` (`src/config/aiVideoModelRegistry.ts`).

## Aliase

`VIDEO_MODEL_ALIASES` hält persistierte Alt-IDs am Leben (`kling-3-standard`,
`kling-3-pro`, `sora-2-standard`, `sora-2-pro`, `wan-pro`). **Nie einen Eintrag
löschen** — sonst brechen gespeicherte Läufe.

## Neues Modell aufnehmen

1. Provider-Doku **für unsere konkrete Route** lesen, `verificationSourceUrl`,
   `providerDocsVersion`, `verificationNotes`, `verifiedBy` setzen.
2. Spec anlegen: Modi, exakte Pixel je Auflösung, `constraints`, Preis-ID je Stufe.
3. Preiszeile im Katalog ergänzen (`videoPricingCatalog.ts`, Server + Client).
4. Spiegel generieren, Tests laufen lassen.
5. Smoke-Test fahren, Ausgabe mit `probeRemoteVideo` messen, `smokeTest` eintragen.
6. Erst danach `available: true` und `parityStatus: 'FULL_PARITY'`.
