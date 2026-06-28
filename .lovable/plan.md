## Antwort auf deine Frage

**Nein — das Storyboard zeigt aktuell den Local-Fallback, nicht dein Briefing.** DB-Beweis aus dem aktiven Projekt:

| Szene | `dialog_script` | `ai_prompt` | voice | mentions |
|---|---|---|---|---|
| 0 | `"Samuel Dusatko: Ich melde mich gleich morgen an!"` | `"[SceneAction] Establishing shot: A relevant setting…"` | `null` | `[]` |
| 1 | *(leer)* | `"Reveal beat for the brand: cinematic establishing shot…"` | `null` | `[]` |
| 2 | *(leer)* | `"CTA beat for the brand: cinematic establishing shot…"` | `null` | `[]` |

Das sind 1:1 die Fallback-Strings. Dein „3 Uhr nachts"-Briefing ist nirgends im Storyboard angekommen. Das Sheet zeigt dir die echte Analyse (siehe Screenshot rechts), aber **angewendet wurde der Fallback**.

## Warum

Edge-Log von vor wenigen Minuten:

```
ERROR [briefing-deep-parse] persist returned error:
  22P02 invalid input syntax for type uuid: ""
```

`composer_production_plans` hat seit 23.06. **keine** neue Zeile — Pass A/B laufen sauber, aber der Insert scheitert weil `project_id` als leerer String statt `null` reinkommt. Folge-Effekte:

1. **Kein Late-Arrival-Replace.** Der echte Plan ist nicht in der DB → die Fallback-Szenen werden nie überschrieben wenn der Parse spät landet.
2. **Voice + Mentions leer.** Apply lief gegen einen Fallback-Plan ohne resolved cast/location → `mentioned_*` bleiben `{}`, `character_voice_id` bleibt `null`.
3. **5 offene Punkte im Sheet** (Duration-Mismatch + 2 Locations) — der Plan im Sheet ist echt, aber er wurde nie ins Storyboard geschrieben, weil du auf Fallback-Szenen schaust.

## Fix (3 Edits, keinen Lipsync-Code anfassen)

### 1. `supabase/functions/briefing-deep-parse/index.ts` — Persist reparieren
- Vor dem Insert: `const safeProjectId = projectId && projectId.trim() ? projectId : null;` und denselben Wert auch beim Vorgänger-Version-Lookup verwenden.
- Insert-Payload nutzt `safeProjectId`. Damit landen ab sofort alle Pläne in `composer_production_plans` → Audit-Trail + Late-Arrival-Voraussetzung erfüllt.

### 2. `src/hooks/useStoryboardTransition.ts` — Late-Arrival aktiv schalten
- Nach erfolgreichem späten Parse: prüfen ob aktuell angewendete Szenen **Fallback-Signatur** tragen (`ai_prompt` matcht `/cinematic establishing shot in a relevant setting/i` oder `dialog_script === 'Ich melde mich gleich morgen an!'`) **und** die bestehenden Schutzfilter erfüllt sind (`clip_status='pending'`, `clip_url IS NULL`, `lipSyncStatus IS NULL`, `dialogLockedAt IS NULL`).
- Wenn ja: `useApplyProductionPlan` erneut mit dem echten Plan aufrufen → Fallback-Szenen werden still durch echte ersetzt. Eine Toast-Nachricht „Briefing nachträglich übernommen — 3 Szenen aktualisiert".

### 3. Sichtbare Diagnose im War-Room / ProductionPlanSheet
- Banner oben im Sheet wenn der gerade gezeigte Plan **nicht** der ist, der angewendet wurde (Vergleich Plan-Version im Sheet vs. letzter Apply): „⚠️ Dieser Plan ist neuer als deine Storyboard-Szenen. [Erneut anwenden]"-Button → ruft Apply manuell auf.
- Im `Plan anwenden`-Button ein kleines Mapping-Badge nach Apply: „Skript ✅ · Performance ✅ · Voice ⚠️ (kein default)" pro Szene, gelesen direkt aus `composer_scenes` 2s nach Apply. Macht den Drift sofort sichtbar ohne DB-Check.

## Was bewusst NICHT angefasst wird
Lipsync-Pipeline, Sync.so, `dialog_shots`, HappyHorse Green-Net, Hailuo-Duration-Lock, Pass-A/B-Tool-Schema, Prompts.

## Erwartetes Ergebnis nach Fix
- Beim nächsten Briefing landet der Plan **in der DB** (Persist-Fehler weg).
- Wenn du „Plan anwenden" drückst bevor Pass B fertig ist: Fallback wird sofort durch echten Plan ersetzt, sobald er ankommt.
- Im Sheet siehst du pro Szene was wirklich im Storyboard steht — Drift wird in einer Zeile sichtbar statt dass du mich fragen musst.
- Die 5 offenen Punkte (Duration 5s vs. Voice 3s, Locations fehlen) sind echte Plan-Lücken — die löst du mit dem bestehenden **Auto-Resolve**-Button im Sheet bzw. durch Anlegen der zwei Locations in der Library.

Freigabe zum Umsetzen?