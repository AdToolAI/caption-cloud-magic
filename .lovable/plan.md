# Wie wir auf Artlist-Niveau kommen

## Was du gerade siehst (und warum es nicht "wie Artlist" aussieht)

Szene 1 & 2 sind aktuell auf **HeyGen Photo Avatar** geroutet (siehe Badge `HeyGen Lip-Sync (manuell)`). HeyGen rendert ausschließlich das **Avatar-Porträt vor neutralem Hintergrund** — die ursprünglich gewünschte Szenen-Komposition (Hook-Storyboard, Umgebung, Kameraführung) wird komplett ignoriert. Deshalb wirkt es wie ein Talking-Head-Stempel und nicht wie eine echte Werbeszene.

Artlist macht das anders:
1. Sie rendern **zuerst die eigentliche Szene** (Charakter im Setting, mit Kamerawinkel, Licht, B-Roll-Elementen)
2. Sie legen **danach einen Lip-Sync-Pass** über das gerenderte Video, der die Mundbewegung zum Voiceover passend macht

Genau diese Pipeline existiert bei uns schon als `sync-polish`-Engine (compose-lipsync-scene + Sync.so/lipsync-2), wird aber vom Auto-Router nicht für deine Szenen vorgeschlagen.

## Plan

### 1. Neuer Engine-Preset: "Cinematic Scene + Lip-Sync" (Artlist-Modus)

In `src/lib/video-composer/sceneEngineRouter.ts`:
- Neuen Override-Wert `cinematic-sync` hinzufügen (zusätzlich zu `heygen` / `broll` / `sync-polish`).
- `cinematic-sync` ist semantisch identisch zu `sync-polish`, aber UI-seitig als **empfohlener Default** für Szenen mit `hasDialog && hasCast` markiert (statt HeyGen).
- Auto-Routing-Reihenfolge anpassen:
  - Wenn `hasDialog && hasCast && scene hat einen B-Roll-Prompt / Visual-Style` → **`cinematic-sync`** (Artlist-Pfad).
  - Wenn `hasDialog && hasCast && kein Visual-Prompt` → HeyGen (Fallback, wie heute).
  - Multi-Speaker (≥2) bleibt zwingend HeyGen Shot-Reverse-Shot.

### 2. Szenen-Render-Pipeline für `cinematic-sync` schärfen

In `compose-scene-anchor` + `animate-scene-hailuo` (bereits vorhanden):
- Sicherstellen, dass für `cinematic-sync`-Szenen der **Scene-Aware Character Anchor** (Nano Banana 2) zwingend verwendet wird — Charakter wird in die Szene komponiert statt nur als Porträt-First-Frame zu dienen.
- Voreinstellung: Hailuo 2.3 (10 s, realistic motion) + `face-lock` an + Shot-Director-Defaults aus dem Style-Preset.
- B-Roll-Prompt ist Pflicht; falls leer, wird er aus Hook/Problem/Lösung-Beat + Brand-Tonality automatisch befüllt (LLM-Pre-Fill, eigener kleiner Helper `prefillCinematicPrompt`).

### 3. One-Click-Wechsel im UI auf bestehenden HeyGen-Szenen

In `src/components/video-composer/SceneCard.tsx`:
- Auf Szenen mit Engine-Badge `HeyGen Lip-Sync` einen sekundären Button **"🎬 In echte Szene einbauen (Artlist-Style)"** zeigen.
- Klick:
  - Setzt `engineOverride = 'cinematic-sync'`.
  - Push in `useComposerHistory` (rückgängig machbar).
  - Triggert sofort Re-Render via bestehender Clips-Pipeline (Anchor → Hailuo → Sync.so).
- Kosten-Hinweis im Button: `~€0.95 (€0.75 B-Roll + €0.20 Lip-Sync)` statt aktuell €0.30 (HeyGen).

### 4. Sync.so-Polish-Pass robuster machen

In `compose-lipsync-scene/index.ts`:
- Aktuell: läuft nur, wenn User manuell `lip_sync_with_voiceover` togglet.
- Neu: Bei `engine === 'cinematic-sync'` automatisch nach erfolgreichem Hailuo-Render anhängen (Auto-Trigger im `ClipsTab`-Polling, Pattern existiert schon Zeile 343–354).
- Zusätzlich `sync_mode` von `loop` auf `cut_off` umstellen, wenn VO länger als Video ist (verhindert Audio-Loop-Artefakte).
- Refund-Pfad bleibt idempotent (deterministische UUID aus scene_id, siehe Memory).

### 5. UI-Klarheit

- Engine-Badge erweitern: statt `HeyGen Lip-Sync (manuell)` zeigt jede Szene jetzt eine der drei klaren Optionen mit Icons + Tooltip:
  - 🎬 **Cinematic + Lip-Sync** (Artlist-Style, empfohlen)
  - 🎙️ **Talking-Head** (HeyGen, schnell aber Avatar-Look)
  - 📺 **B-Roll** (Off-Screen-Voiceover)
- In Szene-Card kleine Vorher-/Nachher-Vorschau-Hint: "So sieht es derzeit aus → so wird es danach aussehen" (nutzt `lip_sync_source_clip_url` als Vorher).

## Was sich für dich konkret ändert

- Szene 1 & 2: 1 Klick auf "In echte Szene einbauen" → System nimmt deinen Hook-Beat + den Brand-Charakter Matthew/Sarah, rendert die Szene mit Hailuo (Setting, Kamera, Licht), legt Sync.so über → Endergebnis: Person steht/agiert in der gewünschten Umgebung und spricht mit korrekt synchronisierten Lippen.
- Szene 3 & 4 (B-Roll ohne Dialog): bleiben wie sie sind — kein Lip-Sync nötig.
- Credit-Refund läuft automatisch, wenn Sync.so failt (HeyGen-Top-Up-Story von vorhin nicht mehr nötig für diesen Pfad, weil wir auf Replicate laufen).

## Technische Details (zum Drüberlesen)

- Engine-Routing: `sceneEngineRouter.ts` — neuer Type-Member, neue Auto-Branch.
- Auto-Trigger für Sync.so-Polish: bestehender Polling-Loop in `ClipsTab.tsx` (Zeile 231–355), nur Bedingung erweitern: `engine === 'cinematic-sync' && clip_status === 'ready' && !lip_sync_applied_at`.
- Kosten-Karte (`useAIVideoWallet`) bekommt `cinematic-sync` als kombinierten Preis (Hailuo 10s 768p ≈ €0.75 + Sync €0.20 = €0.95).
- Keine DB-Migration nötig (alle Felder existieren: `engine_override`, `lip_sync_*`, `clip_url`, `lip_sync_source_clip_url`).
- HeyGen bleibt verfügbar als Fallback, falls Hailuo das Anchor-Bild nicht überzeugend animiert (man kann jederzeit zurückwechseln, Engine-Wechsel ist nicht-destruktiv).
