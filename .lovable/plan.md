# Provider Duration Audit — vereinheitlichen

Nach Durchsicht von `PROVIDER_CAPS` (UI), `snapDuration()` (Backend `compose-video-clips`) und den `*VideoCredits.ts`-Configs gibt es mehrere Inkonsistenzen, die dieselbe Klasse Bug wie bei Kling produzieren (UI warnt anders als das, was der Backend tatsächlich rendert).

## Gefundene Mismatches

| Provider | UI-Caps (`PROVIDER_CAPS`) | Backend real | Config `allowedDurations` | Problem |
|---|---|---|---|---|
| Kling | `[5, 10]` | Clamp `3..15`, keine Buckets | fehlt | UI sagt „nur 5/10", 15s rendert aber problemlos → falsche Warnung |
| Seedance | `[3,4,5,6,7,8,9,10,11,12]` | snap auf `[5, 10]` | fehlt | UI erlaubt 7s/8s/…, Backend zwingt still auf 5s/10s |
| Veo | `[5, 8]` | Bucket `4 / 6 / 8` | `[4, 6, 8]` | 3 unterschiedliche Wahrheiten |
| Grok | **fehlt** komplett | – | `[6, 12]` | Kein Eintrag → Lip-Sync/Composer weiß nix davon |
| Hailuo | `[6, 10]` | fix `6 / 10` | `[6, 10]` | ✅ konsistent |
| Wan | `[5, 10]` | snap `[5, 10]` | `[5, 10]` | ✅ |
| Luma | `[5, 9]` | snap `[5, 9]` | `[5, 9]` | ✅ |
| Pika | `[5, 10]` | snap `[5, 10]` | – | ✅ |
| HappyHorse | `[3..15]` | delegiert an `generate-happyhorse-video` | – | ✅ (Provider unterstützt Range) |
| Vidu | `[5]` | – | – | Zu prüfen (nur 5s wirklich?) |
| Sora | `[4, 8, 12]` | – | – | Zu prüfen |

## Fix (Ziel: 1 Wahrheit pro Provider)

Wir richten alles an dem aus, was der jeweilige Replicate-/Provider-Endpoint tatsächlich akzeptiert, und ziehen dann UI-Caps und Backend-Snap darauf.

1. **`src/lib/video-composer/providerCapabilities.ts`**
   - `ai-kling`: `[5, 10]` → **`[5, 10]`** beibehalten, aber gleichzeitig Backend-Snap ergänzen (siehe #2). Fixe API-Buckets sind bei Kling 3 Omni real 5 und 10 — 15s klappt derzeit nur "zufällig" ohne Snap.
   - `ai-seedance`: `[3..12]` → **`[5, 10]`** (an tatsächliches Backend-Snap-Verhalten anpassen; Toolkit-Card darf weiterhin 3–12 für Direktaufrufe an `generate-seedance-video` behalten, aber der Composer schränkt korrekt ein).
   - `ai-veo`: `[5, 8]` → **`[4, 6, 8]`** (alignt mit Config + Backend-Bucket-Logik).
   - `ai-grok`: **neuen Eintrag** ergänzen: `{ durations: [6, 12], lipsync: false, multiSpeaker: false, label: 'Grok' }`.
   - `ai-vidu` / `ai-sora`: unverändert lassen — nur mit Config gegenchecken.

2. **`supabase/functions/compose-video-clips/index.ts`**
   - Kling-Branch (Zeile 2538): statt `Math.min(15, Math.max(3, round))` → `snapDuration(scene.durationSeconds, [5, 10])` verwenden, damit Composer-Kling-Szenen deterministisch in einen echten API-Bucket fallen.
   - Veo-Branch (Zeile 2833): Ternary durch `snapDuration(..., [4, 6, 8])` ersetzen (semantisch identisch, aber einheitliches Log-Format „requested Xs → snapped to Ys" wie bei Wan/Luma).
   - Seedance/Wan/Luma/Pika unverändert (bereits konsistent).

3. **`src/config/klingVideoCredits.ts`**
   - `allowedDurations: [5, 10] as const` ergänzen, damit ToolKit + validators denselben Weg gehen.
   - `minDuration: 5, maxDuration: 10` (statt 3/15) — wenn der direkte Kling-Studio-Aufruf trotzdem 3–15 unterstützen soll, das im UI klar als „Toolkit-Only"-Range markieren; für den Composer/Cinematic-Sync-Pfad ist 5/10 die Wahrheit.

4. **`src/lib/video-composer/validateSceneForCinematicSync.ts`**
   - Nichts zu ändern — greift automatisch, sobald `PROVIDER_CAPS` korrekt ist (die Banner-Meldung, die im Screenshot sichtbar ist, kommt genau von hier).

5. **Kein DB-Migration nötig**, kein v169-Pipeline-Code angefasst, keine Refund-Logik betroffen — reine Config-Harmonisierung.

## Verifikation

- `tsgo` läuft grün (Typechecks sind auto).
- Manuell nachziehen: eine Kling-Szene auf 15s stellen → UI zeigt Banner „wird auf 10s angepasst", Backend-Log zeigt `snapped to 10s`.
- Eine Seedance-Szene auf 7s stellen → Backend-Log zeigt `requested 7s → snapped to 5s`; UI-Picker bietet nur noch 5/10 an.
- Eine Veo-Szene auf 7s stellen → snapped to 6.
- Grok-Szene im Composer wählbar mit 6/12 Buckets, kein „unknown provider"-Fallback mehr.

## Was NICHT angefasst wird

- Kling-**Toolkit** (separater Studio-Aufruf) bleibt auf 3–15, weil die native Replicate-API das erlaubt und User dort direkt (nicht via Composer/Sync-Pipeline) rendern.
- Keine v183/v184 Face-Map- oder Anchor-Logik.
- Keine Preisänderung — Cost-per-Second bleibt identisch, nur die zulässigen Buckets werden geradegezogen.
