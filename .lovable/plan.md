
# Verifikation Briefing → Storyboard

## Was die DB sagt (Read-only Check, kein Spin)

**Edge-Function läuft sauber:**
- Letzter Deep-Parse 18:56 UTC: Pass A Flash 8.0s ✅, Pass B Flash 3.7s ✅, 3 Szenen, engine=`cinematic-sync`. Reliability-Umbau (Flash-first) wirkt — Pro wird nicht mehr getriggert.

**Vorheriger Apply (Projekt `aed04374…`, 18:23 UTC) hat real geliefert:**
- `ai_prompt`: echte szenische Beschreibung („extreme close-up on a man's tired face… dark bedroom… laptop screen…")
- `dialog_script`: „SAMUEL DUSATKO: Es ist 3 Uhr nachts. Und ich bearbeite… schon wieder… ein Reel."
- `shot_director` / `action_beat` / `transition_type` / `realism_preset` korrekt gesetzt.

**Aktuelles Projekt im Screenshot (`f39042bd…`, 18:27/18:28 UTC) ist Fallback-Placeholder:**
- `ai_prompt`: „CTA beat for the brand: cinematic establishing shot in a relevant setting." (generisch)
- `dialog_script`: „Ich melde mich gleich morgen an!" (Local-Fallback-String, nicht aus deinem Briefing)
- Apply lief um 18:27 — der echte Deep-Parse kam erst um 18:56. Du siehst im Sheet die echte Analyse, aber das Storyboard wurde **vor** dem erfolgreichen Parse mit dem Fallback gefüllt und nicht überschrieben.

## 3 echte Lücken (in **jedem** Projekt, auch bei erfolgreichem Parse)

1. **`composer_production_plans` wird nicht geschrieben.** Letzte Zeile: 23.06. Edge-Function persistiert den Plan nicht → keine Audit-Spur, Late-Arrival-Swap kann auch nichts überschreiben.
2. **`character_voice_id` bleibt leer** (alle 3 Szenen, beide Projekte). Im Sheet steht „voice.voiceName nicht in Library" → Voice-Resolver matcht den Charakter nicht gegen `brand_characters.default_voice_id`. Deshalb auch der `twoshot_audio_prep_failed: missing_voice` von vorhin.
3. **`mentioned_character_ids` / `mentioned_location_ids` bleiben `{}`** obwohl Cast+Location resolved sind. Folge: `@-Mention`-basierte Library-Helfer (Anchor-Compose, Continuity, Scene-Director) sehen den Charakter in der Szene nicht.

## Plan (klein, präzise, kein Lipsync-Anfassen)

### 1. Persistenz in `composer_production_plans` einbauen
- `briefing-deep-parse/index.ts`: nach erfolgreichem Pass B (vor return) ein `insert` mit `{user_id, project_id, version=next, source_text, manifest=plan, unresolved, parser_meta}`. Beste-Mühe, Fehler nur loggen — Response nicht blocken.
- Client (`useStoryboardTransition` / War-Room) übergibt `project_id` im Body.

### 2. Voice-Resolver in Apply fixen
- `useApplyProductionPlan.ts`: beim Schreiben jeder Szene den Cast-Charakter über `id` in `brand_characters` nachschlagen und `default_voice_id` → `character_voice_id` setzen (nur falls Szene noch leer). Optional `dialog_voices[castId] = default_voice_id` mitsetzen.
- Fallback: wenn `voice.voiceName` im Plan steht und in der Library nicht matchbar → trotzdem Charakter-Default verwenden statt leer zu lassen, und unresolved-Eintrag auf „warn" statt „block" runterstufen.

### 3. Mentions beim Apply auffüllen
- `useApplyProductionPlan.ts`: `mentioned_character_ids = scene.cast.map(c => c.id)`, `mentioned_location_ids = scene.location ? [location.id] : []`. Nur wenn Felder leer sind (nicht überschreiben).

### 4. Late-Arrival-Replace härten
- `useStoryboardTransition`: wenn Apply mit Fallback-Plan lief und der echte Deep-Parse danach eintrifft, automatisch erneut Apply auf die Szenen anwenden **die noch nicht gerendert/locked sind** (genau gleiche Schutz-Bedingungen wie bisher: `clip_status='pending'` && `clip_url IS NULL` && `lipSyncStatus IS NULL` && `dialogLockedAt IS NULL`).

### 5. Sichtbares Mapping-Badge im War-Room (klein)
- Eine Zeile pro Szene: „Skript ✅ · Performance ✅ · Action ✅ · Shot ✅ · Voice ⚠️" — liest direkt aus `composer_scenes` nach Apply. Kein neuer Endpoint, keine neue Tabelle. Macht zukünftig sofort sichtbar, was du jetzt mich fragen musstest.

## Was NICHT angefasst wird
Lipsync-Pipeline, Sync.so, `dialog_shots`, HappyHorse Green-Net, Hailuo-Duration-Lock, Tool-Schema des Parsers, Prompts.

## Erwartetes Ergebnis
- Beim nächsten Briefing landen Skript, Performance, Action, Shot, Transition, Overlay, Realism **und** Voice + Mentions 1:1 im Storyboard.
- Wenn der Parse mal langsamer ist als der User-Klick, ersetzt der späte Plan still die Fallback-Szenen, solange sie unangetastet sind.
- Du siehst pro Szene in einer Zeile, was angekommen ist — ohne mich fragen zu müssen.

Freigabe zum Umsetzen?
