Verstanden — die Lip-Sync-Pipeline ist sakrosankt. Der Plan baut einen **kompletten Seitenpfad**, der die bestehende Pipeline nirgends anfasst.

## Konzept: 3 Phasen, 1 Source of Truth

```text
[Briefing-Text]  ──►  [Deep-Parse]  ──►  [Production Plan]  ──►  [Storyboard]
   roh oder Form        2-Pass AI         editierbares Formular     1:1 angelegt
                        ~30-120s          = Single Source of Truth  
```

Der Plan ist das neue Herzstück. Storyboard wird nur noch aus dem Plan abgeleitet.

## Lip-Sync-Sicherheitsgarantien (nicht verhandelbar)

Diese Regeln sind in jedem Stage des Plans verankert:

1. **Keine Edits an Lip-Sync-Code.** Folgende Dateien/Functions werden NICHT angefasst:
   - `compose-dialog-scene`, `poll-dialog-shots`, `sync-so-webhook`
   - `compose-twoshot-lipsync`, `compose-lipsync-scene`
   - `compose-video-clips`, `auto-director`
   - `_shared/lipsync/*`, `useTwoShotAutoTrigger`, `propagateDialogLock`
   - `dialog_shots`, `syncso_dispatch_log`, `syncso_inflight_jobs`, `dialog_dispatch_locks`
   - Alle `mem://architecture/lipsync/*`-Regeln (sync-3 doc-strict, 8min Watchdog, ASD-Strategy, etc.) bleiben unverändert

2. **Apply schreibt nur die gleichen Felder, die der Composer-UI heute auch schreibt.** Es benutzt `useComposerPersistence.ensureProjectPersisted` (existierender Pfad). Keine neuen DB-Writes auf Lip-Sync-Tabellen, keine direkten Updates auf `dialog_shots`, `dialog_locked_at`, `lock_reference_url`, `continuity_locked`, `lockSource`, `lipSyncStatus`, `lipSyncAppliedAt`, `lipSyncSourceClipUrl`.

3. **Dialog-Mode wird nur beim INITIALEN Erstellen einer Szene gesetzt.** Wenn der User später den Plan re-applied auf eine Szene mit `lipSyncStatus != null`, `clipUrl` gesetzt, oder `dialog_locked_at != null` → diese Szene wird übersprungen und im UI als "geschützt — bereits Lip-Synced" markiert. Kein Replace, kein Clear, kein Reset.

4. **DB-Replace ist scoped.** Der "alte Szenen löschen"-Schritt löscht ausschließlich Szenen, die alle folgenden Kriterien erfüllen:
   - `clip_status = 'pending'` (nie generiert)
   - `clip_url IS NULL`
   - `lip_sync_status IS NULL`
   - `dialog_locked_at IS NULL`
   - keine Zeile in `dialog_shots` mit dieser `scene_id`
   
   Trifft auch nur eines nicht zu → Szene bleibt, Plan-Apply legt neue Szenen daneben an und warnt im UI ("3 alte Szenen geschützt, 3 neue angelegt").

5. **engineOverride/dialogMode wird respektvoll gemerged.** Der Apply setzt diese Felder nur, wenn die Zielszene neu erstellt wird. Bestehende Werte werden über die existierenden Pending-Resolver (`resolveLipSyncValue`, `resolveDialogModeValue`, `resolveEngineOverrideValue`) gelesen — wir umgehen sie nicht.

6. **Kein Bypass von `propagateDialogLock`.** Nach jedem `setScenes` läuft die existierende Lock-Propagation. Der Apply ruft `setScenes` (nicht `setScenesLocalOnly`) auf, damit der normale Persistenz- und Lock-Pfad greift.

7. **Voice-Settings im AssemblyConfig — read-only für Lip-Sync.** Die `assemblyConfig.voiceover`-Felder (Voice-ID, Stability, Style, etc.) werden überschrieben, aber die Lip-Sync-Pipeline liest aus `dialogVoices`/`dialog_takes` pro Szene, nicht aus `assemblyConfig`. Trennung ist bereits da; wir bestätigen sie per Type-Cast-Tests.

8. **Negative Prompt nur in `aiPrompt`-Suffix.** Wird als Klartext-Anhang gespeichert, nicht als neues DB-Feld. Lip-Sync-Renderer (`render-directors-cut`, Sync.so) ignorieren `aiPrompt` ohnehin.

9. **Plan-Tabelle ist isoliert.** `composer_production_plans` ist eine neue Read-/Write-Insel. Keine Foreign Keys zu `dialog_shots`, `syncso_*`, `composer_scenes.dialog_*`. Lip-Sync-Edge-Functions referenzieren sie nicht.

10. **Smoke-Test vor Merge.** Bevor der Plan-Pfad live geht, lokaler Durchlauf:
    - Briefing mit Cinematic-Sync importieren → 3 neue Szenen
    - Eine davon rendern lassen (echter Hailuo + Sync.so Pass)
    - Re-Apply des gleichen Plans → die gerendete Szene bleibt unangetastet (Schutz Regel 3+4)
    - `dialog_shots`/`syncso_dispatch_log` zeigen keine Drift

## Phase 1 — Deep Parse (Backend)

Neue Edge Function `briefing-deep-parse` (300s Timeout, separater Codepfad).

Zwei aufeinanderfolgende AI-Calls (Gemini 2.5 Pro, beide):

1. **Pass A — Strukturextraktion** — Tool-Calling auf Roh-Text, deterministisches Mapping auf existierende Enums (Framing/Angle/Movement/Lighting). "Nichts erfinden"-Regel strikt.

2. **Pass B — Validierung & Anreicherung** — bekommt Manifest aus A + Library-Snapshot des Users (`brand_characters`, `brand_locations`, ElevenLabs-Voices). Resolviert `@founder-avatar`, prüft Dauer-Konsistenz, markiert offene Punkte mit konkretem Vorschlag.

Ergebnis wird in neue Tabelle `composer_production_plans` versioniert gespeichert.

## Phase 2 — Production Plan als Formular (UI)

`ProductionPlanSheet` ersetzt den dünnen Review-Dialog:

```text
┌─ Projekt: Name · Plattform · 9:16 · 30fps · 15s ──────┐
├─ Cast & Stimmen ──────────────────────────────────────┤
│ @founder-avatar → [Founder Default ▼] Voice: George   │
│   Lip-Sync: ON   Outfit: Casual                       │
├─ Locations ───────────────────────────────────────────┤
│ @home-office → [Home Office ▼]                        │
├─ Szenen ──────────────────────────────────────────────┤
│ S01 Pain · 5s · Cinematic-Sync · Lip-Sync ON          │
│   VO · Shot · Cast · Performance                      │
│   [🔒 Geschützt — bereits gerendert]  ← Regel 3       │
├─ Voice/Captions/Negative Prompt ──────────────────────┤
└────────────────────────────────────────────────────────┘
  [⚠ 2 ungelöste Punkte]  [Plan anwenden →]
```

Alle Felder inline editierbar, live-validiert, "ungelöste Punkte" mit One-Click-Fix. Geschützte Szenen klar markiert.

## Phase 3 — Apply (read-mostly, write-light)

`useApplyProductionPlan` Hook:

1. Lädt `composer_scenes` für das Projekt → filtert nach Schutz-Kriterien (Regel 4)
2. Löscht nur ungeschützte alte Szenen via existierender Composer-Delete-Logik
3. Legt neue Szenen via `ensureProjectPersisted` an — gleicher Pfad wie heute, gleiche Feld-Map
4. Setzt `assemblyConfig` via `persistAssemblyConfig` — existierender Pfad
5. Toast mit Diff: "3 neu · 0 ersetzt · 2 geschützt"
6. Tab-Wechsel ins Storyboard

## Phase 4 — Strukturierter Briefing-Input

Im Import-Dialog Mode-Switch:
- **Freitext**: wie bisher, KI parst
- **Strukturiert**: aufklappbares Formular mit gleichen Feldern → wandelt direkt in Plan um

Beide Modi enden im `ProductionPlanSheet`.

## Was sich konkret ändert (Whitelist)

**Neu (touchless für Lip-Sync):**
- `supabase/functions/briefing-deep-parse/index.ts`
- DB-Tabelle `composer_production_plans` (Versionierung, isoliert)
- `src/lib/video-composer/briefing/productionPlan.ts`
- `src/components/video-composer/briefing/ProductionPlanSheet.tsx`
- `src/components/video-composer/briefing/StructuredBriefingForm.tsx`
- `src/hooks/useApplyProductionPlan.ts` (mit Schutz-Filter)

**Angepasst:**
- `BriefingImportDialog` → Mode-Switch + Übergabe an Plan-Sheet
- `VideoComposerDashboard` → neuer Handler `replaceStoryboardFromPlan` der die Schutz-Filter respektiert

**Garantiert nicht angefasst:**
- Alle Lip-Sync-Functions, -Tables, -Hooks, -Memory-Rules (siehe Garantie 1)

## Realistisch?

Ja. Der Plan-Pfad ist additiv und sandboxed. Die Schutz-Regeln 3+4 sind das einzige nicht-triviale Stück Logik — und sie sind in genau einem Hook (`useApplyProductionPlan`) konzentriert, mit Unit-Tests gegen alle 5 Schutz-Kriterien. 2 Minuten Verarbeitung sind ok; wir zeigen während Pass A/B eine Progress-Card.

Reihenfolge — welche bevorzugst du?
- **Variante A**: Komplettpaket in einem Rutsch (Deep-Parse + Plan-Sheet + Apply + DB-Schutz + strukturierter Input)
- **Variante B**: Erst Deep-Parse + Plan-Sheet + Apply mit Schutz-Filter (löst dein 4-Szenen-Problem); strukturierter Input später