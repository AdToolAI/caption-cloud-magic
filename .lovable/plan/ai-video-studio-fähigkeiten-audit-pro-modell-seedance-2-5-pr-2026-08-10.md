# AI Video Studio: Fähigkeiten-Audit pro Modell + Seedance 2.5 Preis

## Ziel

1. Für **jedes** Modell im AI Video Studio zeigt die UI exakt die Optionen, die das Modell wirklich kann — nicht mehr (keine Optionen, die beim Generieren scheitern) und nicht weniger (keine verschwiegenen Fähigkeiten).
2. Seedance 2.5 wird neu bepreist: Verkauf **19,90 € pro 30 s** (bei 6,50 € Einkauf).

## Ausgangslage

Die Studio-UI (`ToolkitGenerator`) ist bereits vollständig capability-getrieben: Dauer, Format, Audio-Schalter, Startbild, End-Frame, Anchor, Multi-Reference und V2V werden alle aus `capabilities` / `durations` / `aspectRatios` der Registry gerendert. Das Problem liegt also nicht in der UI-Logik, sondern in den **Daten** der Registry:

- Viele Modelle nutzen pauschal `sharedAspect` (16:9, 9:16, 1:1), obwohl Provider abweichen (z. B. Veo nur 16:9/9:16, Seedance zusätzlich 21:9 / 4:3 / 3:4).
- `resolution` ist ein reiner Anzeige-String — Modelle mit mehreren Auflösungen (z. B. 720p/1080p) bieten in der UI keine Wahl an.
- Fähigkeiten wie `v2v`, `endFrame`, `anchorOnly`, `multiRef`, `maxReferences` sind nur bei einem Teil der Einträge gepflegt (Seedance 1/2.0 haben z. B. gar keine Reference-Flags).
- Dieselben Fakten stehen dreifach: `aiVideoModelRegistry.ts`, `providerCapabilities.ts` (Composer) und `videoPricingCatalog.ts` (Server) — sie driften auseinander (Seedance 2.5: Registry min 5 s, Katalog min 4 s).

## Vorgehen

### 1. Ground-Truth-Audit (pro Modell)

Für jedes Modell der Registry wird abgeglichen, was die zugehörige Edge Function tatsächlich an den Provider sendet und akzeptiert (Dauer-Clamps, erlaubte Ratios, Auflösung, Bild-/Video-Inputs, Audio-Flag, Referenzbilder). Die Edge Function + Provider-Doku sind die Wahrheit, die Registry wird darauf korrigiert:

- Fähigkeit vorhanden, aber in Registry `false`/fehlend → nachtragen (UI schaltet die Option automatisch frei).
- Fähigkeit in Registry gesetzt, aber Backend kann es nicht → entfernen (Option verschwindet aus der UI).
- Dauer-Listen und Aspect-Ratio-Listen pro Modell exakt setzen, statt `sharedAspect` zu recyceln.

Ergebnis wird als kurze Matrix in `docs/ai-video-capability-matrix.md` festgehalten (Modell × t2v/i2v/v2v/Audio/MultiRef/EndFrame/Anchor/Dauern/Ratios/Auflösung), damit künftige Modelle daran gemessen werden.

### 2. Auflösung wird wählbar, wo das Modell mehrere kann

`ToolkitModel` bekommt ein optionales `resolutions: string[]`. Die UI ersetzt das statische Qualitäts-Feld durch einen Selector, sobald mehr als eine Auflösung existiert; sonst bleibt der Badge wie heute. Freigeschaltet wird eine höhere Auflösung nur dort, wo ein geprüfter Preis pro Sekunde vorliegt — bei unklarem Provider-Preis bleibt das Modell auf der aktuellen Auflösung gesperrt, statt eine Option anzubieten, die die Marge zerstört.

### 3. Drift-Schutz

Ein Vitest-Test prüft bei jedem Lauf:
- Jede Modell-ID der Registry existiert im Server-Preiskatalog und umgekehrt.
- Dauern/Min-Max in Registry, `providerCapabilities` und Preiskatalog stimmen überein.
- Jedes Modell hat mindestens eine Dauer, eine Ratio und entweder `t2v` oder `i2v`.

Damit kann ein neues Modell nicht mehr mit halb gepflegten Fähigkeiten live gehen.

### 4. Seedance 2.5 Preis

Einkauf 6,50 € / 30 s = 0,2167 €/s. Verkauf 19,90 € / 30 s = **0,6633 €/s** (Marge ≈ 3,06× — passt zur bestehenden 3,0×-Politik). Angepasst wird an allen vier Stellen, damit Anzeige und Abbuchung identisch sind:

- `src/config/seedanceVideoCredits.ts`: `costPerSecond` 0,54 → 0,663 (EUR/USD) + Beschreibungstexte (DE/EN/ES) auf „ab 3,32 € pro 5 Sekunden / 19,90 € für 30 Sekunden“.
- `supabase/functions/_shared/videoPricingCatalog.ts`: `sellEUR`/`sellUSD` 0,54 → 0,663, `costEUR` 0,18 → 0,217, `minDuration` auf denselben Wert wie die Registry.
- `src/types/video-composer.ts`: `ai-seedance25` Clip-Kosten 0,54 → 0,663.
- Registry-Dauern und Katalog-Min/Max angleichen (5–30 s).

## Technische Details

- Betroffene Dateien: `src/config/aiVideoModelRegistry.ts`, `src/config/seedanceVideoCredits.ts` (und die übrigen `*VideoCredits.ts`, falls Ratios/Dauern dort korrigiert werden), `src/components/ai-video/ToolkitGenerator.tsx` (nur Auflösungs-Selector), `src/lib/video-composer/providerCapabilities.ts`, `src/types/video-composer.ts`, `supabase/functions/_shared/videoPricingCatalog.ts`, neuer Test unter `src/lib/__tests__/`.
- Keine Änderung an der Generierungs-Pipeline oder an bestehenden Lip-Sync-Pfaden.
- Bereits laufende Jobs sind nicht betroffen; der neue Preis gilt ab dem nächsten Start.
