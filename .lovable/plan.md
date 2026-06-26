## Ziel

Smoke-Coverage von 181 → **473/473** Edge Functions hochziehen und Kategorien mit >30 Einträgen aufsplitten, damit kein Rate-Limit mehr triggert.

## Wave B3 — Restliche ~292 Functions patchen

Bulk-Patcher (`/tmp/patch_b3.py`) läuft über alle noch ungepatchten Functions in `supabase/functions/*/index.ts` (Diff gegen aktuelles `smokeRegistry.ts`). Pro Function:

1. `isQaMockRequest` Import direkt nach den bestehenden Imports einfügen
2. Mock-Guard direkt nach dem `OPTIONS`-Handler (Block- oder Single-Line-Form) injizieren
3. Kind auto-erkennen aus dem Function-Namen (`-video` → video, `-image`/`-portrait` → image, `-audio`/`-voice`/`-tts` → audio, `-music` → music, sonst JSON)

Registry-Generator (`/tmp/gen_registry_b3.py`) hängt die neuen Einträge mit passender Kategorie an `_shared/smokeRegistry.ts` an.

## Kategorie-Split (Hard-Cap 25 pro Kategorie)

Aktuell zu groß: `audio-music-sfx` (38), `admin-cron` (35+), und nach B3 zusätzlich vermutlich `composer-render`, `social-publishing`, `ai-gateway`. Split-Regeln:

| Bisher | Neu (jeweils ≤25) |
|---|---|
| `audio-music-sfx` (38) | `audio-voice` · `audio-music` · `audio-sfx` |
| `admin-cron` (35+) | `admin-ops` · `cron-jobs` · `health-monitoring` |
| `briefing-composer` (19) | bleibt, evtl. `briefing-analysis` · `composer-scenes` falls B3 sprengt |
| `social-publishing` (20+) | `social-meta` · `social-tiktok-x` · `social-google-other` falls >25 |
| Neu groß: `video-providers` | `video-providers-premium` · `video-providers-standard` |
| Neu groß: `image-providers` | bleibt wenn ≤25, sonst Split nach Anbieter |

Hard-Cap-Regel ab jetzt im Memory: **Keine Kategorie >25 Functions** → garantiert unter Supabase Burst-Limit von 6/Sek × 4 Batches.

## Runner-Anpassung

`smoke-matrix-run` & `FunctionMatrixTab.tsx` lesen Kategorien dynamisch aus dem Registry — keine harte Liste nötig. Nach dem Split erscheinen die neuen Kategorien automatisch im Dropdown. Sequential-Sweep läuft wie gehabt Kategorie-für-Kategorie mit 400ms Stagger + 429-Retry.

## Deployment

1. Bulk-Patch der ~292 Functions
2. Registry-Update mit Kategorie-Split-Mapping  
3. Deploy aller gepatchten Functions (in 4–6 Batches à ~60 Functions wegen Deploy-Limit)
4. **Re-Deploy `smoke-matrix-run`** (bundelt neues Registry)
5. Verifikation: Dropdown im Cockpit muss alle neuen Kategorien zeigen, Gesamt = 473

## Verifikation

User testet Kategorien einzeln im Cockpit. Erwartung:
- Jede Kategorie ≤25 Functions
- Keine `Rate limit exceeded` Fehler mehr
- Gesamt-Coverage = 473/473

Fehlschläge einzelner Functions = normales Wave-B-Debugging, separat behandelt.

## Hinweis

Memory-Eintrag wird erweitert: "Jede neue Function muss kategorisiert werden, Hard-Cap 25 pro Kategorie, sonst Split."
