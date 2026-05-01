## Problem

`generate-vidu-video` ruft `vidu/q2-reference`, `vidu/q2-i2v` und `vidu/q2-t2v` auf Replicate auf. Diese Slugs existieren nicht und liefern **HTTP 404** ("The requested resource could not be found.") → Live Sweep zeigt Vidu Q2 als `failed`.

Der frühere Rollback von `q3-pro` → `q2-*` ging davon aus, dass die q2-Modelle unter ihren Original-Slugs auf Replicate verfügbar sind. Das ist nicht der Fall: Replicate hostet derzeit nur `vidu/q3-pro` und `vidu/q3-turbo`. Damit ist q3 die einzige verfügbare Vidu-Familie auf Replicate.

Das frühere 429-Throttle-Problem mit q3-pro ist mit dem aufgefüllten Replicate-Credit-Konto irrelevant geworden.

## Lösung

### 1. `generate-vidu-video/index.ts` umstellen

- **Modell-Mapping**:
  - `vidu-q2-reference` → `vidu/q3-pro` (höchste Qualität, unterstützt Reference)
  - `vidu-q2-i2v` → `vidu/q3-pro` (Image-to-Video)
  - `vidu-q2-t2v` → `vidu/q3-turbo` (schneller, günstiger, Text-only)

- **Reference-Handling für q3-pro**: q3-pro nimmt `reference_images` nicht nativ als 1–7-Array. Stattdessen nutzt es `start_image` + Prompt-basierte Referenz-Augmentation. Daher:
  - Erstes Reference-Bild → `start_image`
  - Restliche Referenzen → bleiben über `buildReferenceSuffix()` im Prompt (bereits implementiert, einfach beibehalten)
  - Wir loggen einen Hinweis, wenn `>1` Reference übergeben wird

- **Input-Schema** an q3 anpassen:
  - `prompt`, `seed`, `aspect_ratio`, `duration` (bleiben gleich)
  - `start_image` statt `reference_images`
  - `negative_prompt` falls vorhanden

### 2. Pricing-Hinweis (optional, nicht blockierend)

Die `FLAT_PRICE_EUR`-Werte (0.40–0.45 €) entsprechen ungefähr q3-turbo. q3-pro ist auf Replicate teurer (~0.95 USD pro 5s). Für den Live Sweep ist das egal (kostet einmal pro Run), aber ich erhöhe `vidu-q2-reference` und `vidu-q2-i2v` auf **0.95 €**, damit die Wallet-Deduction realistisch ist und kein versteckter Verlust entsteht.

### 3. Live Sweep validieren

Nach Deploy:
- `Run Live Sweep` klicken
- Erwartung: Vidu wird `succeeded` (statt `failed`)
- Hedra Talking Head war im letzten Run `pending` → ggf. Folge-Issue, aber separat

## Geänderte Dateien

- `supabase/functions/generate-vidu-video/index.ts` — Replicate-Slugs auf `vidu/q3-pro` / `vidu/q3-turbo`, Input-Schema (`start_image`), Preise angepasst
- Deploy via `supabase--deploy_edge_functions(["generate-vidu-video"])`

## Erwartetes Ergebnis

- Vidu Q2 (Ref2V) im Live Sweep grün
- Sweep-Score: 11/12 grün (Pika bleibt `expected`), Hedra ggf. separat zu prüfen

Soll ich loslegen?