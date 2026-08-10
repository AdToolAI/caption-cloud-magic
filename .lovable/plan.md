# Provider-Abgleich: Modell-Fähigkeiten gegen offizielle Doku prüfen

## Ziel

Die letzte Runde hat die Registry gegen unsere eigenen Edge Functions abgeglichen. Das deckt nur auf, was unser Backend heute tut — nicht, was der Provider wirklich kann oder verbietet. Dieser Schritt gleicht jedes Modell zusätzlich gegen die **offizielle Provider-Doku** ab (Replicate-Modellseite mit Input-Schema, Google Veo, ByteDance ModelArk, Vidu, Runway, Pika, Luma, MiniMax).

## Warum das nötig ist (aktueller Stand, verifiziert in der Registry)

- 20 von 29 Modellen nutzen weiterhin die Sammelliste `sharedAspect` (16:9 / 9:16 / 1:1) — Kling, Wan, Luma, LTX, Grok, Seedance 1/2.0 und Seedance 2.5. Das ist eine Annahme, keine geprüfte Provider-Angabe.
- Nur `seedance-2-5` hat ein `resolutions[]`; alle anderen Modelle mit mehreren Provider-Auflösungen bieten weiterhin keine Wahl.
- Dauer-Listen sind teils generisch (Seedance 1/2.0 mit 3/5/8/10/12/15, Kling 3 mit 3–15) und stammen aus unseren Clamps, nicht aus dem Provider-Schema.

## Vorgehen

### 1. Doku-Recherche pro Modellfamilie

Für jede Familie wird die maßgebliche Quelle gelesen und die harten Fakten extrahiert:

| Familie | Quelle |
| --- | --- |
| Kling 2.5/2.6/3/Omni | Replicate-Modellseiten (Input-Schema) + Kuaishou API-Doku |
| Veo 3.1 lite/fast/pro | Lovable AI Gateway Video-Doku + Google Veo |
| Wan 2.5/2.6/2.7 | Replicate-Schema (Alibaba Wan) |
| Hailuo 2.3 | Replicate-Schema (MiniMax) |
| Luma Ray 2 / Ray 3.2 | Luma Dream Machine API |
| Seedance 1 Lite / 2.0 / 2.0 Fast | Replicate-Schema (ByteDance) |
| Seedance 2.5 | ModelArk / BytePlus Ark Task-API |
| Runway Gen-4 Aleph | Runway API-Doku |
| Pika 2.2 | Replicate-Schema |
| Vidu Q2 | Vidu API-Doku |
| HappyHorse, LTX, Grok | Replicate-Schema |

Extrahiert wird je Modell: erlaubte `duration`-Werte, `aspect_ratio`-Enum, `resolution`-Enum, ob Bild-Input (first/last frame), Referenzbilder (max. Anzahl), Video-Input (v2v), natives Audio, Prompt-Limits.

### 2. Abgleich-Matrix und Korrektur

Die Ergebnisse gehen in `docs/ai-video-capability-matrix.md` (eine Zeile pro Modell, Spalte „Provider sagt" vs. „Registry sagt" vs. „Edge Function sendet"). Jede Abweichung wird in eine von drei Kategorien einsortiert:

- **UI verspricht zu viel** → Wert aus der Registry entfernen (z. B. Ratio, die der Provider mit 400 ablehnt).
- **UI verschweigt eine Fähigkeit** → Registry ergänzen; falls die Edge Function den Parameter noch nicht durchreicht, dort mitziehen.
- **Preisrelevant** (höhere Auflösung, längere Dauer) → nur freischalten, wenn der Sekundenpreis im Preiskatalog dazu passt; sonst dokumentiert gesperrt lassen.

Änderungen betreffen `src/config/aiVideoModelRegistry.ts`, ggf. die jeweilige `*VideoCredits.ts`, die betroffene `supabase/functions/generate-*-video/index.ts` sowie `providerCapabilities.ts` und `videoPricingCatalog.ts` für Dauern.

### 3. `sharedAspect` auflösen

Wo die Doku eine echte Enum nennt, wird `sharedAspect` durch die modellspezifische Liste ersetzt. `sharedAspect` bleibt nur dort, wo der Provider tatsächlich genau diese drei Formate kennt.

### 4. Tests erweitern

Der bestehende Vitest (`src/config/__tests__/aiVideoModelCapabilities.test.ts`) wird ergänzt um:
- kein Modell darf mehr auf die geteilte Default-Ratio-Liste zeigen, ohne in einer Allowlist zu stehen (verhindert stilles Recyceln bei neuen Modellen),
- jedes Modell mit `resolutions[]` muss für jede Auflösung einen Preis-Pfad haben,
- Dauern bleiben Teilmenge der dokumentierten Provider-Werte (aus der Matrix als Datenkonstante gepflegt).

### 5. Stichproben-Verifikation

Für die Fälle, in denen die Doku mehrdeutig ist, ein kurzer Live-Testlauf pro Zweifelsfall (kürzeste Dauer, günstigste Auflösung) und Protokoll der Provider-Antwort in der Matrix — statt zu raten.

## Technische Details

- Recherche läuft über parallele Sub-Agents pro Familie, damit die Doku-Reads nicht seriell laufen.
- Kein Eingriff in die Generierungs-Pipeline, Lip-Sync-Kette oder Credits-Logik; nur Fähigkeits-Metadaten, die Parameter-Weitergabe der betroffenen Edge Functions und Tests.
- Ergebnis ist überprüfbar: die Matrix nennt pro Zeile die Quelle, damit spätere Änderungen nicht wieder auf Annahmen basieren.
