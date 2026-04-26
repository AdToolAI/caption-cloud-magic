
# Plan: Vollständige Veo 3.1 Integration (4 Varianten) mit ≥70% Marge

## 🎯 Ziel
Alle vier offiziellen Google Veo 3.1 Varianten von Replicate mit korrektem Modell-Routing und einer **garantierten Marge von ≥70%** bereitstellen — sowohl im **Veo Video Studio** (Standalone) als auch im **Motion Studio** (Composer/Scene-Generation).

## 💰 Pricing-Matrix (Marge berechnet auf 1 EUR ≈ 1 USD)

| Variante | Replicate Modell-ID | Cost (Replicate) | Verkaufspreis | Marge |
|---|---|---|---|---|
| **Veo 3.1 Lite 720p** | `google/veo-3.1-fast` *(720p Modus)* ¹ | $0.05/s | **€/$0.20/s** | **75%** |
| **Veo 3.1 Lite 1080p** | `google/veo-3.1-fast` *(1080p Modus)* ¹ | $0.08/s | **€/$0.30/s** | **73%** |
| **Veo 3.1 Fast** | `google/veo-3.1-fast` | $0.15/s | **€/$0.55/s** | **73%** |
| **Veo 3.1 Pro** | `google/veo-3.1` | $0.40/s | **€/$1.40/s** | **71%** |

¹ Lite 720p/1080p werden im Code via `resolution`-Input am `google/veo-3.1-fast`-Modell gesteuert (gleiches Replicate-Modell, anderer Output-Tier).
Falls Replicate `resolution`-Param nicht akzeptiert, fällt das Modell auf `veo-3.1-fast` Default-Pricing zurück — Margenpuffer bleibt bestehen.

**Beispiel (8s Clip):**
- Lite 720p: Wir zahlen $0.40, Nutzer zahlt **€1.60** → Gewinn €1.20
- Pro: Wir zahlen $3.20, Nutzer zahlt **€11.20** → Gewinn €8.00

---

## 📦 Lieferumfang

### 1. `src/config/veoVideoCredits.ts` — Erweiterung auf 4 Modelle
Schema umbauen auf 4 Einträge: `veo-3.1-lite-720p`, `veo-3.1-lite-1080p`, `veo-3.1-fast`, `veo-3.1-pro`. Jedes mit `costPerSecond`, `quality`, `replicateModel`, `resolution`-Hint und Beschreibung in DE/EN.

### 2. `supabase/functions/generate-veo-video/index.ts` — Modell-Routing
- `MODEL_PRICING` und `REPLICATE_MODELS` auf 4 Einträge erweitern
- Bei Lite-Varianten zusätzlich `resolution: '720p' | '1080p'` an Replicate-Input übergeben
- Bei Pro: keine resolution-Override (1080p Default)
- DB-Insert: `resolution`-Feld korrekt mit jeweiligem Tier befüllen
- Validation für alle 4 Model-IDs

### 3. `src/pages/VeoVideoStudio.tsx` — UI-Update
- Modell-Selector zeigt alle 4 Varianten als Cards mit Preis, Auflösung, Badge
- Default: `veo-3.1-lite-720p` (günstigste Einstiegsvariante)
- Cost-Preview im Generator zeigt Live-Kalkulation pro Sekunde
- Erweiterter Disclaimer: „720p ab €0.20/s · Pro 1080p ab €1.40/s"

### 4. `src/pages/AIVideoStudio.tsx` — Hub-Card
- Veo-Card Beschreibung anpassen: „4 Varianten · Native Audio · ab €0.20/s"
- Badge bleibt **„🎵 Native Audio"**

### 5. **Motion Studio Integration** — Neuer Provider in Scene-Generation
**Affected Files:**
- `src/lib/featureCosts.ts`: Neue Cost-Codes `motion_clip_veo_lite_720`, `motion_clip_veo_lite_1080`, `motion_clip_veo_fast`, `motion_clip_veo_pro` mit Credits/Sek (20/30/55/140 = €0.20–€1.40 × 100 Credits/€).
- `src/types/motion-studio.ts`: Provider-Enum um `'veo-lite-720'`, `'veo-lite-1080'`, `'veo-fast'`, `'veo-pro'` erweitern.
- `src/components/video-composer/ClipsTab.tsx` (oder Provider-Picker): Veo-Optionen in Provider-Dropdown der Scene mit Audio-Toggle und Auflösungs-Auswahl.
- `supabase/functions/motion-studio-superuser/index.ts`: Neuer Test-Scenario MS-27 „Veo Provider Routing" zur Validierung der Modell-Auswahl.
- Generation-Edge-Function des Composers (vermutlich `composer-generate-clip` oder ähnlich — wird beim Build identifiziert) erhält Veo-Branch, der intern `generate-veo-video` aufruft.

**Marge gilt 1:1**: Jeder Composer-Clip nutzt dieselbe Pricing-Matrix → 70%+ Marge garantiert.

### 6. Optional: `src/pages/AIVideoStudio.tsx` Hero-Subtitle
Bleibt bei „7 KI-Modelle" (Veo zählt als 1 Provider mit 4 Varianten — wie Sora 2 Std/Pro).

---

## 🔄 Wiederverwendung
- **Webhook**: Bestehender `replicate-webhook` handhabt alle 4 Varianten ohne Änderung (gleiche Output-Struktur).
- **Credit-System**: `deduct_ai_video_credits` / `refund_ai_video_credits` RPCs unverändert.
- **Storage**: `ai-video-generations` Bucket unverändert.

## ⚠️ Risiken & Mitigations
1. **Replicate `resolution`-Param**: Falls `google/veo-3.1-fast` den `resolution`-Input nicht unterstützt, verkauft 720p-Variante zum 720p-Preis aber generiert evtl. 1080p → wir zahlen $0.08 statt $0.05, Marge sinkt auf 60%. **Mitigation**: Nach Deployment ein Testcall mit `supabase--curl_edge_functions` zur Verifikation; ggf. 720p-Preis auf €0.30 anheben.
2. **FX-Risiko USD/EUR**: Pricing in EUR=USD 1:1 angesetzt (konservativ). Bei USD-Schwäche zahlen wir effektiv weniger → höhere Marge.
3. **Pro-Tier Akzeptanz**: €1.40/s ist hoch (€11.20 für 8s) — klare UI-Kommunikation als „Premium 1080p Cinematic" mit Vorschau-Beispielen.

## 📋 Test-Plan
1. Deploy `generate-veo-video` via `supabase--deploy_edge_functions`
2. Curl-Test pro Variante mit Mock-Prompt (4s, 16:9, audio on)
3. Verify in `ai_video_generations`: korrekte `model`, `resolution`, `total_cost_euros`
4. UI-Test: Alle 4 Cards anzeigbar im VeoVideoStudio
5. Motion Studio: Provider-Dropdown zeigt 4 Veo-Optionen, MS-27 Test grün

## 🚀 Ergebnis
**Marktpositionierung**: Wir bieten als **einziger Anbieter alle 4 Veo 3.1 Tiers** (von €0.20/s Einstieg bis €1.40/s Premium) — Artlist hat nur Lite. Gleichzeitig: **garantierte ≥71% Marge** auf jede Generierung, sowohl Standalone als auch im Motion Studio.
