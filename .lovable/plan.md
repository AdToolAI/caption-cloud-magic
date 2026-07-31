## Ergebnis der Analyse

Vollständiger Abgleich: interner Modell-Katalog gegen den tatsächlich aufgerufenen Provider-Slug gegen die aktuell verfügbare Version (Stand 31.07.2026).

### A — Kritisch: Wir liefern etwas anderes als draufsteht

| Was der Kunde sieht | Was wir wirklich aufrufen | Problem |
|---|---|---|
| „Seedance 2.0 Standard / Pro" | `bytedance/seedance-1-lite` | Wir verkaufen 2.0, rufen Generation 1 Lite. `bytedance/seedance-2.0` ist auf Replicate verfügbar. |
| „Vidu Q2 Reference / I2V / T2V" | `vidu/q3-pro` bzw. `vidu/q3-turbo` | Umgekehrter Fall: Label ist eine Generation zu alt, Slugs sind schon Q3. |
| „Pika 2.2 Std / Pro" | `pika-labs/pika-text-to-video`, im Wartungsstatus, HTTP-410-Kill-Switch aktiv | Das Modell ist faktisch tot, steht aber im Katalog. |

### B — Harter Abschalt-Termin

**Sora 2 API: 24. September 2026.** Wir führen `sora-2-standard` und `sora-2-pro` mit fest verdrahteten Version-Hashes. Ab dem Datum bricht jede Sora-Szene. Sora Web/App ist bereits seit 26.04.2026 tot.

### C — Neue Version verfügbar, teils erheblicher Sprung

| Bereich | Aktuell bei uns | Verfügbar | Gewinn |
|---|---|---|---|
| **Lip-Sync** | `sync/lipsync-2-pro` | **`sync-3`** (Sync.so-Default, 4K/60fps, Spatial Reasoning, eingebaute Verdeckungs-Erkennung, seitliche Gesichter) | Größter Hebel überhaupt — genau unsere Dauerbaustelle mit Mehrfach-Sprechern und Profilansichten |
| **Luma** | `luma/ray-2-720p` | **`luma/ray-3.2`** (1080p, HDR/EXR, Video-to-Video) | Wir hängen zwei Generationen zurück und sind auf 720p festgenagelt |
| **Runway** | `gen4_aleph` (Runway-API) | **`runwayml/gen-4.5`** auf Replicate | Aleph bleibt fürs Editing, Gen-4.5 fürs Generieren |
| **Wan** | 2.5 + 2.6 | **`wan-video/wan-2.7-t2v / -i2v / -r2v`** (1080p, nativer Ton, 15s, Referenz-zu-Video) | r2v ist ein echter Identitäts-Pfad |
| **Grok** | `x-ai/grok-imagine` | **Grok Imagine Video 1.5** (GA seit 16.06.2026) | Besserer Motion + Audio |
| **Bild (Picture Studio „ultra")** | `google/nano-banana` (v1) | **`nano-banana-2`** / **`nano-banana-pro`** | v1 ist zwei Generationen alt |
| **Bild (Picture Studio „fast", Anchor-Seedream)** | `bytedance/seedream-4` | **`seedream-5-pro`** / **`seedream-5-lite`** | Bessere Text- und Referenztreue — relevant für unsere Anchor-Identität |
| **Voice** | `eleven_turbo_v2_5` / `eleven_multilingual_v2` | **`eleven_v3`** (70+ Sprachen, Flaggschiff) | Achtung: unser deutscher Hard-Lock hängt an turbo_v2_5, siehe Risiko unten |
| **Musik** | `minimax/music-1.5` | `minimax/music-2.6` bzw. `music-2.8` | Nebenschauplatz |
| **LLM (Massen-Pfad)** | `google/gemini-2.5-flash` in ~40 Analyse-Functions | `google/gemini-3.6-flash` | Schneller und günstiger bei gleicher Aufgabe |
| **STT** | `whisper-1` | Neuere Transkriptionsmodelle | Nebenschauplatz |

### D — Bereits aktuell, kein Handlungsbedarf

Kling 3.0 + Kling 3.0 Omni ✅ · Veo 3.1 ✅ · Hailuo 2.3 (MiniMax H3 gibt es auf Replicate **nicht**) ✅ · ElevenLabs Music v2 ✅ · Lyria 3 Pro ✅ · Stable Audio 2.5 ✅ · Gemini 3.1 Pro / GPT-5.5 Pro im Text Studio ✅

### E — Nicht verfügbar, trotz Ankündigung

**Seedance 2.5**: auf Replicate steht „coming soon", noch kein Endpunkt. **Topaz Astra / Starlight / Hyperion**: nicht auf Replicate, dort gibt es nur `topazlabs/image-upscale` und `topazlabs/video-upscale`. **MiniMax H3**: nicht auf Replicate.

---

## Umsetzungsplan

### Stufe 1 — Ehrlichkeit und Ausfallschutz (zuerst)
1. **Seedance-Korrektur**: `seedance-standard`/`seedance-pro` auf `bytedance/seedance-2.0` umstellen, Preis gegen den echten Provider-Cost × 3.00 neu setzen. Wenn der Preissprung zu groß ist: alternativ Label auf „Seedance 1 Lite" zurückstufen. Erstere Variante bevorzugt.
2. **Vidu-Labels** auf Q3 korrigieren (Slugs stimmen bereits).
3. **Pika deaktivieren**: aus dem wählbaren Katalog nehmen, Bestandsszenen auf Hailuo umleiten (Fallback existiert bereits im Composer).
4. **Sora-2-Exit**: als `deprecated` markieren, nicht mehr wählbar, Auto-Fallback beim Rendern auf Seedance 2.0 bzw. Veo 3.1 Fast für Audio-Szenen, Hinweistext im Studio.

### Stufe 2 — Lip-Sync auf sync-3 (größter Qualitätshebel)
- `lip-sync-video` und die Autopilot-Sync-Strecke von `sync/lipsync-2-pro` auf `sync-3` umstellen.
- Feature-Flag mit Rückschalter, weil unsere gesamte Face-Gate-/Rekognition-Vorstufe auf das alte Verhalten kalibriert ist.
- A/B-Testlauf mit einer bekannten 4-Sprecher-Szene, bevor der Default umgestellt wird. Wenn sync-3 die Verdeckungen selbst löst, können wir Teile der Landmark-Vorstufe entlasten.

### Stufe 3 — Modell-Upgrades
- **Ray 3.2** als neuer Luma-Eintrag inkl. Video-to-Video-Pfad; Ray 2 bleibt vorerst als günstige Stufe.
- **Gen-4.5** ergänzen, Aleph bleibt fürs Editing.
- **Wan 2.7** (t2v/i2v/r2v) ergänzen; r2v in das Consistency-Ranking aufnehmen.
- **Grok Imagine 1.5** Slug aktualisieren.
- **Nano Banana 2 / Pro** und **Seedream 5** in Picture Studio und Anchor-Generierung; Anchor-Umstellung nur mit Vergleichslauf, weil die Identitätstreue daran hängt.

### Stufe 4 — Voice und LLM (vorsichtig)
- **eleven_v3** nur nach Test: unser deutscher Hard-Lock erzwingt heute `eleven_turbo_v2_5`, weil `eleven_multilingual_v2` `language_code` ignoriert und ins Englische driftet. Vor jeder Umstellung muss belegt sein, dass v3 `language_code` respektiert. Sonst bleibt turbo_v2_5.
- **gemini-2.5-flash → gemini-3.6-flash** im Massen-Analyse-Pfad, schrittweise mit Stichproben pro Function-Gruppe.

### Stufe 5 — Optional
Topaz `video-upscale` als Opt-in-Finishing-Schritt im Director's Cut, nach Lipsync und Schnitt, nie im Universal Content Creator (Raw-Media-Invariant). Seedance 2.5 als vorbereiteter, deaktivierter Katalogeintrag.

## Technische Details

- Zentrale Dateien: `supabase/functions/_shared/videoPricingCatalog.ts` (Preise), `src/config/aiVideoModelRegistry.ts` (Frontend-Katalog), die einzelnen `generate-*-video/index.ts` (echte Slugs), `lip-sync-video/index.ts` + `_shared/autopilotLipSync.ts`, `compose-scene-anchor/index.ts`, `generate-image-replicate/index.ts`, `_shared/tts-language.ts`.
- Achtung Doppelpflege: Slug, Preis und Frontend-Label liegen heute in drei getrennten Dateien — genau daher stammen die Seedance-/Vidu-Abweichungen. Ich ergänze eine Konsistenzprüfung, die im Build meldet, wenn eine Katalog-ID keinen zugehörigen Slug hat.
- Jeder neue Modelleintrag: Provider-Cost recherchieren, × 3.00, Katalogeintrag, Registry, `providerCapabilities`, `sceneEngineRouter`, `modelConsistencyRanking`, Lipsync-Kompatibilitätsmatrix.
- Verifikation je Stufe: ein echter Testrender pro neu verdrahtetem Modell, plus Abgleich von angezeigtem und abgebuchtem Preis.
