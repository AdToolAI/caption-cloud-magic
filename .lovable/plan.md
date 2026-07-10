# Plan: HappyHorse Green-Net-Reject beheben + Progress-Bar entkoppeln

Ziel: Prompt-Profil wieder auf den Stand der bewiesenen Success-Szene (`7d45c852…`) bringen, damit HappyHorse nicht mehr durch Alibaba Green Net blockiert wird. Zusätzlich Sanitizer als Sicherheitsnetz und Progress-Bar-Bug fixen.

## Fix A′ — Wurzelfix in Storyboard-Emission (Primär)

Datei: `supabase/functions/compose-video-storyboard/index.ts` (bzw. der Prompt-Builder, der den `ai_prompt` zusammensetzt)

- Bei Multi-Speaker-Szenen (`dialog_turns.length >= 2` oder `continuousSceneLock`):
  - **Kein** `"<Name> is speaking"`-Suffix mehr in den Bild-Prompt schreiben. Sprecher-Zuordnung läuft ausschließlich über `dialog_turns` / `speakerCharacterId`.
  - **Kein** `"Four speakers, …"`-Prefix / keinen Zähler-Satz emittieren.
  - Volle Namen (First + Last) im Bild-Prompt max. **einmal pro Charakter** verwenden; danach nur noch Vorname oder Rolle.
- Solo-Szenen bleiben unverändert.
- Version-Bump: `compose-video-storyboard` → `v223-multi-speaker-prompt-slim`.

## Fix A — Sanitizer als Netz (Sekundär)

Datei: `supabase/functions/_shared/happyhorse-green-net.ts`

- Neue Pass-Regel: Full-Name-Repetition pro Prompt auf **max. 2** cappen (danach Vorname).
- Regex-Strip: `/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+is speaking\b/gi` → entfernen.
- Regex-Strip: `/\b(Two|Three|Four|Five)\s+speakers?[^.]*\./gi` → entfernen.
- Wird als letzter Sanitizer-Schritt VOR HappyHorse-Call aufgerufen (in `compose-dialog-segments` / `compose-video-storyboard`).

## Fix B — Progress-Bar entkoppeln

Datei: `src/hooks/usePipelineProgress.ts`

- Beim Aggregieren der Lipsync-Targets `clipStatus === 'failed'` ausschließen.
- Wenn alle Targets einer Szene `failed` → Lipsync-Progress für diese Szene = 0 %, nicht 96 %.

## Verifikation

1. Neue Szene mit identischem 4-Sprecher-Briefing generieren.
2. DB prüfen: `ai_prompt` enthält **keine** `is speaking`-Suffixe und **keinen** `Four speakers`-Prefix.
3. HappyHorse-Response ≠ `[green_net_rejected]`.
4. UI: Progress-Bar zeigt bei fehlgeschlagener Szene keinen Lipsync-Fortschritt mehr.

## Technische Details

- Kein Schema-Change, keine Migration.
- Betroffene Edge-Functions: `compose-video-storyboard`, `compose-dialog-segments` (nur Sanitizer-Aufruf).
- Client-Bump: `CLIENT_PIPELINE_VERSION` → 223.
- Rollback: Version-Flag `PROMPT_SLIM_V223` (default an) — bei Bedarf per Env deaktivierbar.
