
# v183 — Provider-Allowlist erweitern (Pipeline unangetastet)

**Ziel:** Nur die Allowlist öffnen. **Kein Pipeline-Touch**, kein Modell-Wechsel (`lipsync-2-pro` bleibt), keine neuen Prompt-Injections, keine neue Fallback-Logik.

## Was Sync.so fordert (Zitat aus offizieller Doku)

- Menschenähnliches Gesicht (keine Tiere/Cartoons/Stilisierung)
- Sichtbare, natürliche Sprechbewegung im Input-Video
- Kein reines Profil, Gesicht ausreichend groß, keine dauerhafte Occlusion
- Keine harten Scene-Cuts innerhalb 30–40s (bei uns unkritisch, weil Clips ≤10s)

## Bewertung pro Provider gegen diese Kriterien

| Provider | Output-Charakter | Lipsync-tauglich? |
|---|---|---|
| **Hailuo 2.3** | Realistisch, gute Mundbewegung | ✅ validated (Status quo) |
| **HappyHorse 1.0** | Realistisch, natürliche Sprechmotion | ✅ validated (Status quo) |
| **Kling 3 Pro** | Photorealistisch, gute Lippen-Motorik | ✅ **NEU zulassen** |
| **Seedance 1** | Realistisch, ByteDance-Qualität | ✅ **NEU zulassen** |
| **Wan 2.5** | Realistisch, chinesische Foundation | ✅ **NEU zulassen** |
| **Sora 2** | Photorealistisch | ⚠️ nicht zulassen — keine i2v-Reference-Konsistenz für Face-Gate |
| **Runway Gen-4** | Photorealistisch, aber teuer + oft „closed mouth" | ❌ nicht zulassen |
| **Veo** | Realistisch, aber restriktive Content-Policy filtert oft Gesichter | ❌ nicht zulassen |
| **Luma Ray 2** | Realistisch, aber Kamera-Motion stört Face-Tracking | ❌ nicht zulassen |
| **Vidu Q2** | Semi-stilisiert, Multi-Reference fokus | ❌ nicht zulassen |
| **Pika 2.2** | Zu stilisiert | ❌ nicht zulassen |

**Neue Allowlist: Hailuo, HappyHorse, Kling, Seedance, Wan.**

## Änderungen (minimal)

### 1. `src/lib/video-composer/providerCapabilities.ts`
Für 3 Provider `lipsync: false → true` setzen:
- `ai-kling` (Kling 3 Pro)
- `ai-seedance`
- `ai-wan`

Alle anderen bleiben `false`.

### 2. `src/lib/video-composer/validateSceneForCinematicSync.ts` Zeile 97
Allowlist-Konstante erweitern:
```
const LIPSYNC_ALLOWED = ['ai-hailuo', 'ai-happyhorse', 'ai-kling', 'ai-seedance', 'ai-wan'];
```

### 3. UI-Badge im Motion Studio Provider-Picker
Neben den 5 zulässigen Providern kleines „Lip-Sync ready"-Badge. Bei den restlichen bleibt der bestehende Warn-Hinweis („Auto-Fallback auf Hailuo für Cinematic-Sync") — keine neue Logik, nur sichtbar machen was schon existiert.

## Was NICHT geändert wird

- ❌ Sync.so-Modell (`lipsync-2-pro` bleibt, kein sync-3-Switch)
- ❌ `compose-scene-anchor`, `compose-dialog-scene`, `compose-twoshot-lipsync`
- ❌ Sync.so-Webhook, ASD-Strategie, Face-Gate, Preflight
- ❌ Prompt-Layer, Shot-Director, Scene-Anchor-Composition
- ❌ Credit-Refund-Logik, v176 No-Silent-Migration, v181 Depicted-Face-Lock, v182 Hard-Stop

## Risiko

Wenn Kling/Seedance/Wan im Face-Gate durchfallen, greift automatisch die **bestehende** Preflight-Rejection + Refund-Logik. Kein neuer Code-Pfad, kein neues Fehler-Verhalten. Falls sich zeigt, dass ein Provider real <80% Pass-Rate liefert, nehmen wir ihn manuell wieder raus — Ein-Zeilen-Änderung in der Allowlist.

