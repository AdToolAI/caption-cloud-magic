# Fidelity-Fix — Briefing 1:1 statt Neuinterpretation

## Diagnose

Drei Ursachen dafür, dass Dialog/Sprecher „zufällig" wirken obwohl im Briefing alles steht:

1. **`buildBriefingText` (`src/hooks/useStoryboardTransition.ts`, Z. 323)** setzt hart `Mode: AUTO-DIRECTOR` — auch bei komplettem Skript. Pass A springt in den Synthese-Modus.
2. **Pass-A-Prompt (`briefing-deep-parse/index.ts`)** darf im AUTO-Modus VO/Dialog aus USPs neu schreiben. Sprecher werden nach Beat verteilt statt nach vorhandener `NAME:`-Zuweisung.
3. Kein **Fidelity-Check**: nichts vergleicht, ob Dialog-Zeilen wörtlich und beim richtigen `@mention` landen.
4. Wenn Sprecher-Labels im Skript keinem Cast-Slot zugeordnet sind (nur „Anna: …" ohne dass Anna ausgewählter Character ist), erfindet Pass B `characterId=null`-Slots, die später auf einen bestehenden Character fallbacken → Duplikate.

## Lösung — 4 Pakete

### Paket A — LITERAL-Mode wird erzwungen sobald Skript erkannt wird

**Client — `src/hooks/useStoryboardTransition.ts`**
- Neuer Helper `detectBriefingFidelity(briefing)` scannt `productDescription`:
  - `/(Szene|Scene|Shot)\s*\d+/i` **oder**
  - `/^\s*[A-ZÄÖÜ][A-ZÄÖÜ\-\s]{1,30}:\s+\S/m` (Sprecher-Zeile) **oder**
  - nummerierte Liste ≥ 2 mit Doppelpunkt-Sprechern
  → liefert `{ mode: 'LITERAL' | 'AUTO_DIRECTOR', speakerLabels: string[], briefingLines: [{id, speakerLabel, text}] }`
- `buildBriefingText` schreibt bei LITERAL:
  `Mode: LITERAL (PRESERVE briefing verbatim — do NOT rewrite scripts, do NOT redistribute speakers, do NOT invent scenes)`
- Zusätzlicher Block `## Verbatim Script (authoritative)` mit `[L01] @mention → text` — das Truth-Signal für Pass A und den Fidelity-Check.

**Server-Prompt — `briefing-deep-parse/index.ts`**
Neuer Absatz oben im `SYSTEM_PASS_A`:
> **STRICT LITERAL RULE — highest priority.** When the briefing carries `Mode: LITERAL` OR a `## Verbatim Script (authoritative)` block:
> - copy every `[Lxx]` line's text verbatim into `dialogTurns[].text`
> - keep exact `@mention` → speaker mapping
> - never merge/split lines, never invent speakers not in `## Cast`
> - preserve line ordering
> - only Meta (`shotDirector`, `performance`, `musicCue`, `transition`, `anchorPromptEN`, `brollHints`) is yours to invent

### Paket B — Speaker-Mapping-UI im Briefing-Dashboard (NEU)

Aktuell erfindet die Pipeline Sprecher wenn im Skript „Anna:" steht, Anna aber nicht in `briefing.characters` ausgewählt ist. Skalierbare Lösung: das Mapping **vor** der Analyse einfordern.

**Neue Komponente — `src/components/video-composer/briefing/ScriptSpeakerMapper.tsx`**
- Wird gerendert wenn `detectBriefingFidelity` Sprecher-Labels findet UND mindestens ein Label keinem ausgewählten Character zuordenbar ist (Name-Substring-Match gegen `briefing.characters`).
- Zeigt maximal 4 Slots (Hard-Cap wg. Nano Banana 2 / Vidu Q2 Cast-Limit):
  ```
  Erkannte Sprecher aus deinem Skript:
    [ ANNA ]    → [ Character auswählen ▼ ] [ + neu anlegen ]
    [ BEN  ]    → [ Character auswählen ▼ ] [ + neu anlegen ]
    [ CHRIS]    → [ Character auswählen ▼ ] [ + neu anlegen ]
    [ DANA ]    → [ Character auswählen ▼ ] [ + neu anlegen ]
  ```
- Wenn Skript **KEINE** Sprecher-Labels enthält (reines Konzept-Briefing): zeigt statt der erkannten Labels 4 leere Slots („Sprecher 1", „Sprecher 2", …) — User kann 1-4 aus der Library picken oder leerlassen.
- Auswahl schreibt `briefing.characters[]` **und** eine neue Map `briefing.speakerAliases: Record<label, characterId>` (Label-String → Character-ID) für den Server.
- „+ neu anlegen" öffnet den bestehenden Character-Quick-Create.
- Analyse-Button ist disabled solange ≥1 erkanntes Label unresolved ist (mit klarer Fehlermeldung, kein stummes Failing).

**Client-Änderungen**
- `buildBriefingText` mapt Sprecher-Labels im Verbatim-Block via `speakerAliases` auf `@mentions`. Unresolved Labels bleiben `@unknown-N` und werden von Pass A/B garantiert **nicht** einem existierenden Character zugeordnet (der Fidelity-Check droppt sie).
- `ComposerBriefing` bekommt `speakerAliases?: Record<string, string>` (label → characterId).

**Skalier-Vorteil**
- Keine Fuzzy-Namens-Heuristik mehr, kein LLM-Guessing bei Speaker-Zuordnung
- Für großformatige Skripte (10+ „Anna:"-Zeilen) reicht **ein** Mapping-Klick
- Deterministisch, keine Halluzinationen mehr möglich

### Paket C — Fidelity-Check mit Auto-Reparatur (Server)

Neu in `briefing-deep-parse/index.ts`, nach `enforceStrictCast`:

```
enforceBriefingFidelity(plan, briefingLines, requiredCast) → { plan, stats }
```

Für jede `briefingLine`:
- **Text-Match ≥90% + korrekter Sprecher** → ok
- **Falscher Sprecher** → überschreibe `speakerMentionKey` + `characterId` + `voiceId` (`reassigned++`)
- **Text abweicht** → `dialogTurns[i].text := briefing text` (`textRestored++`)
- **Zeile fehlt** → in nächstliegende Szene einfügen (`injected++`)

Danach:
- **Ghost-Turns** (nicht im Briefing, Sprecher nicht in Cast) → droppen (`droppedGhostTurns++`)
- `dedupePlanScenesCast` erneut
- Telemetrie in `parser_meta.fidelity = { total, matched, reassigned, textRestored, injected, droppedGhostTurns }`

Sicherheitsnetze:
- Läuft NUR bei `briefingLines.length ≥ 1`
- Fehler → still Fallback auf pre-fidelity-Plan, `parser_meta.fidelity.error` gesetzt
- Berührt niemals `shotDirector`, `anchorPromptEN`, `performance`, `musicCue`

### Paket D — Fidelity-Chip im Plan-Sheet

`ProductionPlanSheet.tsx` Footer:
```
✓ 12/12 Zeilen 1:1 · 0 Sprecher korrigiert · 0 fehlend
```
bzw.
```
⚠ 12/12 · 2 Sprecher korrigiert · 1 eingefügt   [Details]
```
Datenquelle: `plan.parserMeta.fidelity`. Rein UI.

## Betroffene Dateien

- `src/types/video-composer.ts` — `speakerAliases?` in `ComposerBriefing`
- `src/hooks/useStoryboardTransition.ts` — `detectBriefingFidelity`, `buildBriefingText` (LITERAL-Zweig + Verbatim-Block)
- `src/components/video-composer/briefing/ScriptSpeakerMapper.tsx` — neu
- `src/components/video-composer/BriefingTab.tsx` — Einbindung des Mappers, Analyse-Button-Gate
- `supabase/functions/briefing-deep-parse/index.ts` — `STRICT LITERAL RULE`, `extractVerbatimScript`, `enforceBriefingFidelity`
- `src/lib/video-composer/briefing/productionPlan.ts` — `fidelity`-Feld im `parser_meta`-Schema (nur lesend)
- `src/components/video-composer/briefing/ProductionPlanSheet.tsx` — Fidelity-Chip

## Unverändert

`useApplyProductionPlan.ts`, `planCastDedup.ts`, `ensurePlanEnsemble.ts`, `ensureProductionPlanEnsembleServer`, Lip-Sync-Pipeline, Render-Pipeline. AUTO-DIRECTOR bei leerem Briefing: bleibt.

## Deploy

`briefing-deep-parse` neu deployen. Keine Migration, kein Breaking Change.

## Verifikation

1. **Skript-Briefing (Paket B in Aktion)**: Briefing mit 4 „NAME:"-Sprechern, keiner in Library → Mapper zeigt 4 Slots, User picked/erstellt Character → Analyse startet erst wenn alle 4 gemappt → `parser_meta.fidelity.matched = total`, `droppedGhostTurns = 0`, keine Duplikate.
2. **Konzept-Briefing (kein Skript)**: nur USPs → Mapper zeigt 4 optionale Slots („Sprecher 1-4"), User pickt 0-4 → AUTO-DIRECTOR läuft wie bisher, `parser_meta.fidelity` fehlt.
3. **Legacy-Briefing**: Skript vorhanden UND alle Sprecher bereits in `briefing.characters` → Mapper wird nicht angezeigt, LITERAL + Fidelity-Check laufen direkt.
