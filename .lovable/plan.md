## Exakter Stand nach DB- und Codeanalyse

Du hast recht: wir sollten jetzt nicht weiter blind „rumfixen“. Der aktuelle Stand zeigt ein strukturelles Problem im Handoff, nicht nur einen kleinen Prompt-Fehler.

### 1. Die Briefing-Analyse selbst funktioniert

In der DB liegen neue Produktionspläne:

- 28.06. 19:43:53: Plan erstellt, Parse-Zeit ca. 10 Sekunden, 3 Szenen, Samuel erkannt, Voice-ID vorhanden
- 28.06. 20:01:17: Plan erstellt, Parse-Zeit ca. 12 Sekunden, 3 Szenen, Samuel erkannt, aber Voice-ID wieder leer

Der Plan enthält echte Inhalte wie:

- Voiceover: „Es ist 3 Uhr nachts. Und ich bearbeite... schon wieder... ein Reel."
- Shot: Extreme Close-up / Laptop Glow / müder Samuel
- Cast: Samuel Dusatko mit Character-ID
- Engine: cinematic-sync

Also: **Die AI-Analyse kommt grundsätzlich durch.**

### 2. Der Analyse-Plan wird nicht sauber ans Projekt gebunden

Alle Einträge in `composer_production_plans` haben aktuell:

```text
project_id = NULL
```

Das ist ein Hauptproblem. Dadurch kann das System später nicht sicher sagen:

„Dieser analysierte Plan gehört zu genau diesem Storyboard-Projekt."

Folge:

- Re-Open / Reload / Late-Arrival kann den richtigen Plan nicht projektbezogen laden.
- Drift-Check kann nicht zuverlässig Plan gegen Storyboard vergleichen.
- Wenn das Sheet geschlossen wird, hängt alles nur noch am lokalen React-State.

### 3. Das Storyboard wurde nicht durch den echten Plan ersetzt

Für dein aktuelles Projekt `f39042bd…` stehen in `composer_scenes` weiterhin exakt die alten Fallback-Szenen:

```text
Szene 0: failed
Prompt: Establishing shot: A relevant setting...
Script: „Ich melde mich gleich morgen an!"
Voice: NULL
Mentions: []

Szene 1: canceled
Prompt: Reveal beat for the brand...
Script: NULL
Voice: NULL
Mentions: []

Szene 2: canceled
Prompt: CTA beat for the brand...
Script: NULL
Voice: NULL
Mentions: []
```

Die letzte Änderung an diesen Szenen war ca. 18:28. Deine späteren Klicks auf „Plan anwenden" um 19:43 / 20:01 sind **nicht in `composer_scenes` angekommen**.

### 4. Es entstehen doppelte Projektpaare

Die DB zeigt wiederholt dieses Muster:

```text
18:26:40 Projekt A status=storyboard, scenes=pending
18:26:42 Projekt B status=canceled, scenes=failed/canceled

17:59:49 Projekt A status=storyboard, scenes=pending
17:59:55 Projekt B status=canceled, scenes=failed/canceled

23:42:12 Projekt A status=storyboard, scenes=pending
23:42:16 Projekt B status=canceled, scenes=failed/canceled
```

Das heißt: Beim Workflow entstehen sehr wahrscheinlich zwei Projektzustände / zwei Projekt-IDs. Der Plan wird mit `projectId` leer oder falsch analysiert, während du später auf einem anderen Projekt landest oder ein anderer Projektzustand gerendert wird.

### 5. Warum der Button für dich trotzdem „funktioniert" wirken kann

Der Button-Handler macht aktuell:

```text
applyPlan(...)
toast: „Plan übernommen — X neu · Y ersetzt · Z geschützt"
Sheet schließen
Storyboard öffnen
```

Aber der Apply-Hook kann intern Insert-/Delete-Probleme nur in die Console loggen. Er gibt trotzdem ein Erfolgsergebnis zurück. Dadurch sieht es für dich aus wie:

„Ich habe Plan anwenden geklickt, alles okay."

In Wahrheit kann die DB unverändert bleiben.

## Wahrscheinliche Ursachen, priorisiert

### Ursache A — Projekt-ID fehlt beim Analyse- und Apply-Handoff

`briefing-deep-parse` bekommt offenbar häufig `projectId` leer/undefined. Deshalb schreibt es `composer_production_plans.project_id = NULL`.

Das erklärt sehr viel:

- Pläne existieren, aber hängen nicht am Projekt.
- Late-Arrival / Re-Apply kann nicht zuverlässig arbeiten.
- Nach Reload oder Sheet-Close ist kein sauberer Bezug mehr vorhanden.

### Ursache B — Apply-Hook persistiert Fehler nicht sichtbar

`useApplyProductionPlan` macht direkte Inserts, aber:

- Insert-Errors werden nur geloggt.
- Der User bekommt trotzdem „Plan übernommen".
- Es gibt keine nachgelagerte DB-Verifikation.

Deshalb merken wir Fehler erst durch manuelle DB-Abfrage.

### Ursache C — Schutzlogik und Statuslogik blockieren kaputte Szenen

In `useStoryboardTransition` gelten `failed` und `canceled` als geschützt. Dadurch wird eine echte Re-Analyse / Late-Replacement auf genau den Szenen blockiert, die eigentlich ersetzt werden müssten.

Im Apply-Hook selbst ist `failed` nicht mehr geschützt, aber der WarRoom-/LateArrival-Pfad nutzt noch die alte harte Schutzlogik.

### Ursache D — Voice-Resolution ist instabil

Der Plan von 19:43 hatte Samuel-Voice-ID:

```text
CwhRBWXzGAHq8TQ4Fs17
```

Der Plan von 20:01 hatte bei Samuel:

```text
voiceId = NULL
voiceName = lipsync-2-pro
```

Das ist falsch gemappt: `lipsync-2-pro` ist ein Modell/Engine-Hinweis, keine Sprecher-Voice-ID. Das würde später wieder `missing_voice` riskieren.

## Was aktuell NICHT stimmt

Nein, Stand jetzt wurde das Briefing **nicht sauber ins Storyboard übertragen**.

Korrekt ist:

- Analyse: ja, grundsätzlich erfolgreich.
- Plan im Sheet: ja, vermutlich sichtbar.
- Persistierter Plan: ja, aber ohne Projektbindung.
- Storyboard-DB: nein, weiterhin alter Fallback.
- Voice IDs in Szenen: nein.
- Mentions in Szenen: nein.
- Script in Szenen: nur alte Szene 0, nicht der neue Plan.

## Empfohlener Fix-Plan, ohne Lipsync-Pipeline anzufassen

### Schritt 1 — Projekt vor Analyse zwingend persistieren

Bevor `briefing-deep-parse` gestartet wird, muss `useStoryboardTransition` sicherstellen:

```text
Wenn project.id leer oder keine UUID:
  ensureProjectPersisted(project) ausführen
  neue UUID in State + Ref setzen
  erst danach briefing-deep-parse mit projectId starten
```

Ziel:

- Kein neuer Produktionsplan mehr mit `project_id = NULL`.
- Jeder Plan hängt eindeutig am Projekt.
- Keine lokalen „Floating Plans" mehr.

### Schritt 2 — Apply darf nur mit gültiger Projekt-ID laufen

In `ProductionPlanSheet.handleApply`:

```text
Wenn projectId fehlt oder keine UUID:
  blockieren mit Fehler: „Projekt wird gespeichert — bitte erneut versuchen"
```

Noch besser: Dashboard übergibt eine `ensureProjectId()` Funktion, die vor Apply persistiert.

Ziel:

- Kein Apply in leeren/local-only Zustand.
- Kein stilles „Plan übernommen", obwohl nichts gespeichert wurde.

### Schritt 3 — Apply-Hook muss DB-Erfolg verifizieren

Nach Delete/Insert:

```text
SELECT composer_scenes WHERE project_id = ... ORDER BY order_index
Prüfe:
- Anzahl neuer Szenen
- dialog_script vorhanden
- character_voice_id vorhanden oder bewusst fehlend
- mentioned_character_ids gesetzt
- ai_prompt nicht Fallback
```

Wenn nicht erfüllt:

```text
Throw Error / destructive Toast
Sheet bleibt offen
```

Ziel:

- Kein falscher Erfolgstoast mehr.
- Wir wissen sofort, ob es wirklich in der DB gelandet ist.

### Schritt 4 — Insert Defaults härten

Beim direkten Insert aus `useApplyProductionPlan` sichere Defaults setzen für NOT-NULL-Spalten:

```text
text_overlay: Default-Overlay
character_shots: [] statt null
dialog_voices: {}
shot_director: {}
engine_override: 'auto'
transition_type: 'crossfade'
transition_duration: 0.4
clip_quality: 'standard'
```

Ziel:

- Kein stiller DB-Abbruch wegen NOT NULL.

### Schritt 5 — Failed/Canceled Szenen als ersetzbar behandeln

Nur für kaputte, nicht gerenderte Szenen:

```text
failed/canceled + kein clip_url + kein lipSyncStatus + kein dialogLockedAt + kein lockReferenceUrl = ersetzbar
```

Nicht anfassen:

- fertige Renders
- aktive Lipsync-Jobs
- dialog_shots
- lockReferenceUrl
- dialog_locked_at

Ziel:

- Kaputte Fallback-Szenen können durch echten Plan ersetzt werden.
- Lipsync bleibt geschützt.

### Schritt 6 — Voice-ID Resolver korrigieren

Wenn Cast Samuel keine Voice-ID bekommt, aber Brand Character eine `default_voice_id` hat, muss diese genommen werden.

Zusätzlich blockieren:

```text
voiceName/model string wie 'lipsync-2-pro' darf nicht als Voice-Ersatz durchgehen
```

Ziel:

- Kein `missing_voice` im nächsten Render.

### Schritt 7 — Projekt-Duplikate separat analysieren

Das Muster `storyboard` + `canceled` Projektpaar muss separat geprüft werden. Vermutlich gibt es einen Workflow, der bei Render/Cancel ein neues Projekt erzeugt oder eine stale draft ID verwendet.

Dieser Punkt ist wichtig, aber ich würde ihn **nach** dem Plan→Storyboard-Fix machen, damit wir die aktuelle Blockade nicht verwässern.

## Erwartetes Ergebnis nach Umsetzung

Nach dem nächsten Versuch muss die DB so aussehen:

```text
composer_production_plans.project_id = echte Projekt-UUID
composer_scenes.order_index 0..2 = neue Plan-Szenen
composer_scenes.dialog_script = „Es ist 3 Uhr nachts..."
composer_scenes.character_voice_id = echte ElevenLabs/Voice-ID
composer_scenes.mentioned_character_ids = [Samuel-ID]
composer_scenes.ai_prompt = echter Shot aus Briefing, kein Establishing-Fallback
```

Und im UI darf der Button nur noch Erfolg melden, wenn diese DB-Verifikation grün ist.

## Wichtig

Ich würde jetzt **nicht** nochmal Briefing analysieren und Plan anwenden. Der aktuelle Flow ist nicht vertrauenswürdig, weil er Erfolg anzeigen kann, ohne dass die DB geändert wurde.

Freigabe zum Umsetzen dieses Handoff-Fixes?