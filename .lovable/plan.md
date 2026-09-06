# Video-Modelle: Vollausbau der Provider-Fähigkeiten (Flagship-First)

Ziel: Jedes Modell im AI Video Studio bietet genau das, was der Provider wirklich kann — mit der höchsten nativ verfügbaren Auflösung pro Modus, klar getrennt von nachträglichem KI-Upscaling. Die Auswahl wird nach echter Spezifikation sortiert (Flaggschiff oben), nicht nach Preis.

## Befund: warum es immer wieder driftet

Das Audit hat fünf strukturelle Ursachen gezeigt, nicht nur veraltete Werte:

1. **Vier parallele Wahrheiten pro Modell.** `src/config/aiVideoModelRegistry.ts` (UI-Fähigkeiten), `src/config/*VideoCredits.ts` (Dauern/Auflösungen/Preise je Familie), `src/lib/cost/videoPricingCatalog.ts` + `supabase/functions/_shared/videoPricingCatalog.ts` (Abrechnung, doppelt) und die Model-Tabellen **in** den Edge Functions (z. B. `generate-kling-video/index.ts:20-40`). Keine dieser Quellen wird aus einer anderen abgeleitet.
2. **Die Edge Function ist die faktische Wahrheit, wird aber nicht gelesen.** Kling 2.5 Turbo rendert laut Function 1080p, die UI schreibt 720p. LTX erzwingt ab 10 s still 1080p und macht 2k/4k unerreichbar — ohne dass die Registry das weiß.
3. **`resolution` ist ein Anzeige-String, kein Vertrag.** Nur wo jemand zusätzlich `resolutions[]` gepflegt hat, gibt es überhaupt eine Auswahl. Hailuo hat `allowedResolutions: ['768p','1080p']` in der Credits-Datei — die UI zeigt trotzdem keine Wahl.
4. **Fähigkeiten sind Flags ohne Modus-Bezug.** `i2v: true` sagt nichts darüber, dass ein Modell im i2v-Modus andere Dauern, Ratios oder Auflösungen erlaubt als im t2v-Modus (Veo: Referenzbilder nur bei 16:9/8 s; Luma Ray 3.2: Start/Endbild nur bei 5 s; Hailuo Pro: 1080p nur bei 6 s).
5. **Nichts erzwingt Vollständigkeit.** Ein neues Modell kann mit halb gepflegten Feldern live gehen; der einzige Test (`src/config/__tests__/aiVideoModelCapabilities.test.ts`) überspringt Modelle, die im Katalog fehlen (`if (!entry) continue;`).

Ohne 1–5 zu beheben, veraltet jede Aktualisierung innerhalb weniger Provider-Releases wieder.

## 1. Neues Capability-Schema

Eine einzige Quelle: `supabase/functions/_shared/videoModelSpecs.ts`, re-exportiert von `src/config/videoModelSpecs.ts` (dasselbe Muster wie `pictureModelCapabilities.ts`, das im Picture Studio bereits funktioniert). Kernidee: **Fähigkeiten hängen am Modus, nicht am Modell.**

```text
VideoModelSpec
  id, displayName, generation, family, providerRoute, providerModelSlug, apiVersion
  status: live | beta | deprecated | maintenance | removed
  supersededBy?: id
  modes: {
    t2v | i2v | firstLast | reference | v2v | edit | extend | reframe : ModeSpec
  }

ModeSpec
  resolutions: [{ label, width?, height?, longEdge?, native: true|false, pricingId }]
  durations: number[] | { min, max, step } | 'smart'
  aspectRatios: string[]
  fps?: number[]           hdr?: boolean
  audio: 'none' | 'optional' | 'always'
  controls: { seed?, negativePrompt?, cameraPresets?, motionStrength?, promptEnhance? }
  inputs:  { images: {min,max}, video: {min,max}, audio: {min,max} }
  constraints: Rule[]      // z. B. "1080p nur bei duration<=10"
```

Wichtig für die Kundenanfrage: `native: true` heißt „der Provider rendert diese Pixelgröße". Alles darüber ist **kein** Modell-Feature, sondern der bestehende Video-Enhance-Pfad (Topaz/ByteDance) — die UI zeigt das getrennt als „Nativ bis X · KI-Upscaling bis Y".

`constraints` ersetzt das heutige `refRequires` und macht die stillen Backend-Clamps sichtbar statt überraschend.

## 2. Provider-Routing und Versionierung

- `providerRoute` (Edge Function) und `providerModelSlug` (z. B. `kwaivgi/kling-v3-video`) werden Teil der Spec. Die Edge Function liest den Slug aus der Spec, statt eine eigene Tabelle zu führen — die Tabellen in `generate-kling-video`, `generate-veo-video`, `generate-wan-video` usw. entfallen.
- `apiVersion` pro Modell; ein Provider-Upgrade ist dann ein Spec-Eintrag plus ein neuer Slug, nicht eine Code-Änderung an fünf Stellen.
- **Aliase** werden ein eigenes, explizites Feld `aliasOf`: `kling-3-standard`/`kling-3-pro` → `kling-3`; `vidu-q2-*` bleibt als ID (persistierte Läufe), Anzeigename wird korrekt „Vidu Q3". Unbekannte IDs fallen nicht mehr still auf ein anderes Modell zurück, sondern werfen einen klaren Fehler.
- Sora-2-Reste (`src/config/aiVideoCredits.ts:152-175`, beide Preiskataloge, `LEGACY_ROUTE_TO_MODEL`) und die nie erreichbare SKU `wan-pro` werden als `status: 'removed'` geführt und aus der Auswahl entfernt.

## 3. Fähigkeiten je Familie (Recherche → Spec → Function → UI)

Pro Familie derselbe Vierschritt, je Familie ein abgeschlossener Block: Provider-Doku lesen → Spec schreiben → Edge Function auf die Spec heben → Test. Was heute schon als Lücke bekannt ist:

| Familie | Bekannte Lücken heute |
|---|---|
| Seedance 2.5 (ModelArk) | Default 720p, obwohl höhere Stufe verfügbar; 480p-SKU nur intern gemappt |
| Seedance 1/2.0 (Replicate) | Keine Referenz-Flags, keine `resolutions[]`, 1080p-SKU existiert nur im Katalog |
| Kling | 2.5 Turbo real 1080p, UI sagt 720p; Seed + Negativ-Prompt serverseitig unterstützt, kein UI-Feld; Kamerasteuerung ungenutzt |
| Veo 3.1 | Seed + Negativ-Prompt serverseitig, kein UI-Feld; Lite/Fast teilen denselben Slug bei zwei Preisstufen |
| Grok | 480p/720p vorhanden, keine höhere Stufe geprüft |
| LTX | 2k/4k gelistet, ab 10 s still auf 1080p geklemmt |
| Wan | 2.5 veraltet neben 2.6/2.7; Seed + Negativ-Prompt ohne UI |
| Hailuo | `allowedResolutions` 768p/1080p vorhanden, keine Auswahl in der UI; Pro künstlich auf 6 s |
| Luma | 11 Kamera-Presets (`lumaVideoCredits.ts:81-93`) nirgends importiert; Ray 2 neben Ray 3.2 ohne Kennzeichnung |
| Runway Aleph | Reiner V2V, 5 s Deckel — Edit/Reframe-Fähigkeiten des Providers nicht geprüft |
| Pika | Beide Varianten dauerhaft in Wartung — Reaktivierung oder Entfernung entscheiden |
| Vidu | Läuft real auf Q3, heißt Q2; Seed ohne UI |
| HappyHorse | Keine Auflösungswahl, keine Regler |

**Neue UI-Bausteine** (alle nur sichtbar, wenn die Spec sie für den aktiven Modus meldet):
Auflösungs-Selector mit nativem Maximum · Modus-Umschalter (t2v/i2v/First-Last/Referenz/V2V/Edit/Extend/Reframe) · Dauer inkl. Auto-Dauer · Seitenverhältnis · Audio-Schalter · **Block „Erweiterte Steuerung"** mit Seed, Negativ-Prompt, Kamerapreset, Motion-Strength · Upload-Slots für Start-/Endbild, Referenzbilder (mit echter Maximalzahl), Referenzvideo/-audio · FPS/HDR nur dort, wo der Provider sie führt.

## 4. Preise und Margensicherheit

- Jede Auflösungsstufe wird eine eigene Katalogzeile mit `pricingId` — keine impliziten Umbiegungen mehr wie `pricingModelId = resolution === '480p' ? …` in `generate-seedance25-video/index.ts:190`.
- Freischaltung nur mit geprüftem Einkaufspreis; Margenuntergrenze bleibt 1,75× (`src/test/pricing-net-margin.test.ts`). Ohne geprüften Preis bleibt die Stufe dokumentiert gesperrt statt offen.
- Bestehende Drift wird geschlossen: `kling-2.6` maxDuration 15 (Client) vs. 10 (Server) vs. [5,10] (Registry); `seedance-mini` minDuration 3 vs. 5.
- Preisanzeige bleibt „pro Sekunde" und folgt weiterhin der Wallet-Währung.

## 5. Rückwärtskompatibilität

- Alle heutigen Modell-IDs bleiben gültig; persistierte Läufe, `video_creations`, Composer-Szenen und Autopilot-Presets brechen nicht.
- Entfernte Modelle (Sora 2, ggf. Pika) werden in bestehenden Datensätzen weiterhin korrekt benannt, sind aber nicht mehr wählbar.
- Wo ein Default sich ändert (z. B. Seedance 2.5 auf die höchste native Stufe), gilt das nur für neue Läufe; laufende Jobs und gespeicherte Szenen behalten ihre Werte.
- Eine Migration schreibt nichts in der Datenbank um; die Zuordnung alter IDs passiert über `aliasOf` im Code.

## 6. Automatisierte Paritätstests

Ein Testblock, der ein unvollständiges Modell blockiert:
- Jede Spec-ID hat eine Katalogzeile pro `pricingId` und umgekehrt (keine Waisen, kein `continue`-Schlupfloch mehr).
- Client-Katalog ↔ Server-Katalog Feld für Feld identisch.
- Jede in der Spec angebotene Dauer/Ratio/Auflösung liegt im dokumentierten Provider-Enum der zugehörigen Edge Function.
- Jede `constraint` ist im Backend tatsächlich implementiert (Clamp-Test pro Regel).
- Jedes Modell hat mindestens einen Modus, jeder Modus mindestens eine Auflösung und eine Dauer.
- Kein Modell ohne `status`; `deprecated` erfordert `supersededBy`.

## 7. Nachmessen statt behaupten

Der vorhandene Messpfad aus dem Video-Enhance-Umbau (`probeRemoteVideo`) wird auf alle Generierungen ausgeweitet: nach Fertigstellung werden Breite, Höhe, Codec, Bitrate und Dateigröße gemessen, gespeichert und am Ergebnis angezeigt („versprochen 1920×1080 · geliefert 1920×1080, H.264, 12 Mbit/s"). Weicht das Ergebnis von der Zusage ab, wird der Lauf markiert und die Abweichung protokolliert, damit Provider-Regressionen sofort auffallen statt erst beim Kunden.

## 8. UI-Gruppierung

Neue Reihenfolge in `ModelSelector.tsx` (heute `recommended → audio → fast → premium`, also Draft zuerst):

```text
Flaggschiff (nativ 1080p+)  →  Native Audio & Dialog  →  Spezialisten (V2V, Referenz, Edit)  →  Entwurf & Günstig
```

Innerhalb der Gruppe nach nativer Auflösung, dann Generation. Jede Zeile zeigt native Auflösung, Modi-Kürzel und Preis; Vorgänger-Generationen tragen „Vorgänger von X". Nichts wird versteckt, nur richtig einsortiert.

## 9. Rollout-Reihenfolge (Kundenwirkung ↔ Risiko)

1. **Sofortwirkung, kein Risiko:** Gruppen-Reihenfolge, Flaggschiff-Sortierung, korrekte Auflösungs-Labels (Kling 2.5 Turbo), Vorgänger-Kennzeichnung, Sora-/`wan-pro`-Bereinigung.
2. **Hoher Nutzen, klein:** Block „Erweiterte Steuerung" mit Seed und Negativ-Prompt für Kling, Veo, Wan, Vidu; Luma-Kamerapresets.
3. **Auflösungen freischalten:** Hailuo 1080p-Wahl, Seedance-2.5-Default, LTX-Constraint sichtbar, Seedance 1/2.0 `resolutions[]` — je mit geprüfter Preiszeile.
4. **Schema-Migration:** `videoModelSpecs.ts` einführen, Registry als Adapter, Edge-Function-Tabellen abbauen, Paritätstests scharf schalten.
5. **Familienweiser Vollausbau:** Kling → Wan/Hailuo → Veo/Luma → Seedance/Vidu → Runway/Pika/HappyHorse/LTX/Grok, je Familie ein Block inkl. neuer Modi (Edit/Extend/Reframe) wo der Provider sie führt.
6. **Nachmessung** aller Generierungen plus Abweichungs-Alarm.

## Technische Details

Betroffen: `src/config/aiVideoModelRegistry.ts`, alle `src/config/*VideoCredits.ts`, neu `supabase/functions/_shared/videoModelSpecs.ts` + `src/config/videoModelSpecs.ts`, `src/components/ai-video/ModelSelector.tsx` und `ToolkitGenerator.tsx`, alle `supabase/functions/generate-*-video/index.ts`, `src/lib/cost/videoPricingCatalog.ts` + `supabase/functions/_shared/videoPricingCatalog.ts`, `src/lib/composer/providerMatrix.ts` (Composer liest künftig aus der Spec), `src/lib/video-composer/providerCapabilities.ts` (bleibt Adapter), Tests unter `src/config/__tests__/` und `src/test/`, neue Doku `docs/ai-video-capability-matrix.md`.

Nicht angefasst: Lip-Sync-Kette und deren Zertifizierungsvertrag, Wallet-/Abrechnungslogik (außer neuen Preiszeilen), Director's Cut, Render-Pipeline, Video-Enhance-Preisdeckel. Alle Texte EN/DE/ES; Prompts an die Modelle bleiben englisch.
