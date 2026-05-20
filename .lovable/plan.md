
## Ziel

Den Composer-Flow von **5 sichtbaren Schritten** auf **4** reduzieren, indem der „Clips generieren"-Tab komplett entfällt und seine Funktionen ins **Storyboard** wandern. Gleichzeitig bekommt der Nutzer ab dem ersten Klick auf einen Generieren-Button **immer** sichtbares Feedback (realistischer Progress über die gesamten ~7–8 min). Voiceover-Button wird kontextuell umbenannt.

**Wichtig:** Reine UI-/Orchestrierungs-Änderungen. Edge-Functions (`compose-video-clips`, `generate-voiceover`, `compose-twoshot-lipsync`, `poll-twoshot-lipsync`, `render-directors-cut`) bleiben unangetastet — die gerade frisch funktionierende Pipeline wird **nicht** verändert.

---

## 1. Schritt „Clips generieren" entfernen

### 1.1 Stepper & Tabs
`src/components/video-composer/VideoComposerDashboard.tsx`
- `TabId`-Union: `'clips'` bleibt intern als Route-Fallback (für Deep-Links `?tab=clips`), wird aber aus `TAB_ORDER`, `TABS` und damit aus `STEPS` (Top-Stepper) entfernt.
- Auto-Navigation `setActiveTab('clips')` (Zeile 535, 1452) wird auf `'storyboard'` umgeleitet.
- `onGoToClips` in `StoryboardTab` wird nicht mehr gebraucht → entfällt aus Props.
- Deep-Link `?tab=clips` redirected automatisch auf `storyboard` (Backward-Compat).

### 1.2 Storyboard-Header: neuer Master-Button
`src/components/video-composer/StoryboardTab.tsx` (Zeile 415–422)
- Aktuellen „Clips generieren →"-Button ersetzen durch **„Alle Clips generieren (N • €X.XX)"** mit derselben Logik wie aktuell in `ClipsTab.handleGenerateAll`:
  - Filtert `pendingScenes` (Status ≠ `ready` und Source startet mit `ai-`).
  - Ruft `compose-video-clips` **gebündelt** für alle Pending-Szenen auf (genau wie bisher in ClipsTab — Code dorthin extrahieren in einen kleinen Hook `useGenerateAllClips`).
  - Disabled-States, Kosten-Anzeige und „Alle Clips bereit"-State werden 1:1 übernommen.
- Daneben kompakter Status-Chip: „K/N Clips fertig · M wird generiert…" (gleiche Werte wie bisher in ClipsTab).
- Per-Szene-Generieren-Button im `SceneInlinePlayer` bleibt unverändert (Nutzer kann weiterhin einzelne Szenen neu rollen).

### 1.3 ClipsTab erhalten, aber versteckt
- `ClipsTab.tsx` wird **nicht gelöscht** — Power-User-Features (Frame-Anchor, Snapshot-History, Cinematic-Sync) bleiben über Deep-Link `?tab=clips&advanced=1` erreichbar.
- Im normalen Tab-Wechsel ist er aber nicht mehr sichtbar (kein Eintrag in `STEPS`).

---

## 2. Realistischer Progress über die gesamte Pipeline

Heutiger Zustand: Beim Klick auf „Voiceover generieren" passiert ~30–90 s lang sichtbar **nichts** (Spinner nur am Button). Bei „Alle Clips generieren" sieht man pro Szene einen Status, aber keine **globale** Pipeline-Sicht.

### 2.1 Neue Komponente `PipelineProgressBar`
`src/components/video-composer/PipelineProgressBar.tsx` (neu)
- Sticky direkt unter dem Top-Stepper (über dem Content, unter `MotionStudioTopStepper`).
- Erscheint **nur** wenn mindestens eine Phase aktiv ist; verschwindet 3 s nach Abschluss.
- Zeigt:
  - Phasen-Pills: **Briefing → Clips → Voiceover → Lipsync → Musik → Export** (Lipsync nur falls Dialog-Szenen vorhanden).
  - Aktive Phase pulst (gold), abgeschlossene Phasen sind grün gecheckt.
  - Darunter ein dünner Progressbalken mit **gewichtetem Gesamtfortschritt** (siehe 2.3).
  - Rechts: laufende Zeit „⏱ 02:14 / ~07:30" — verbleibende Zeit aus rolling-average der laufenden Phase, **nie rückwärts**.
- Komplett Frontend — keine DB-Calls.

### 2.2 Zentraler Hook `usePipelineProgress`
`src/hooks/usePipelineProgress.ts` (neu)
- Konsumiert vorhandene State-Quellen (keine neuen Tabellen):
  - `project.scenes[].clipStatus` für die Clip-Phase (M/N ready).
  - `assemblyConfig.voiceover.audioUrl` + lokales `generatingVo`-Flag aus `VoiceSubtitlesTab` (über Context lifted).
  - `lipSyncStatus` aus Realtime-Subscription (existiert bereits via `useComposerScenesRealtime`).
  - `render-directors-cut`-Polling (bereits in `RenderPipelinePanel`).
- Liefert: `{ phases: Phase[], activePhase, overallPercent, etaSeconds, startedAt }`.

### 2.3 Gewichtung (für realistische ETA, basierend auf den vom Nutzer genannten 7–8 min)
| Phase     | Anteil | Begründung                          |
|-----------|--------|-------------------------------------|
| Clips     | 55 %   | längster Block (~4 min für 5 Szenen)|
| Voiceover | 10 %   | ~45 s                                |
| Lipsync   | 20 %   | ~90 s pro Two-Shot-Szene             |
| Musik     | 5 %    | Auswahl/Match                        |
| Export    | 10 %   | Remotion-Lambda                      |

Innerhalb jeder Phase: linearer Fortschritt aus den echten Sub-Zählern (z. B. Clip-Phase = `readyCount / totalAiScenes`), kombiniert mit einem **monoton wachsenden Soft-Floor** (langsame künstliche Bewegung +0.3 %/s solange `inProgress`), damit der Balken auch bei „stillem" Server-Polling weiter wandert. Floor wird gecapped bei 95 %, sodass der echte Abschluss-Tick auf 100 % springt.

### 2.4 Sofortiges Feedback beim Klick
`VoiceSubtitlesTab.handleGenerateVoiceover` (Zeile 270 ff.)
- Direkt nach Klick: `setGeneratingVo(true)` (bereits da) **plus** Emit eines `pipeline:voiceover-start` Events → `usePipelineProgress` aktiviert die Voiceover-Phase mit Floor-Animation, noch bevor die erste Server-Antwort kommt.
- Gleiches Pattern beim Master-„Alle Clips generieren"-Button.

---

## 3. Voiceover-Button kontextuell umbenennen

`src/components/video-composer/VoiceSubtitlesTab.tsx` (Zeile 783–786)

Label-Logik:
- Skript vorhanden + nicht leer → **„Clip generieren mit Voiceover"**
- Skript leer → Button bleibt disabled wie heute, Hinweistext: „Ohne Skript wird das Video ohne Voiceover gebaut."
- Multi-Speaker-Skript → **„Clip generieren mit Voiceover · Multi-Speaker"**

Lokalisierung: neue Keys `videoComposer.generateClipWithVo` / `…WithVoMulti` in `src/i18n` (EN/DE/ES), wie in den Memory-Regeln vorgegeben.

Funktional ändert sich am Voiceover-Call **nichts** — nur das Label.

---

## 4. „Komprimieren ohne Pipeline zu beschädigen" — Sicherheits-Constraints

- Edge-Functions: **keine** Änderungen.
- DB-Schema: **keine** Änderungen.
- `ClipsTab.tsx`: bleibt im Repo, nur aus dem normalen Tab-Order entfernt.
- Realtime-Hooks (`useComposerScenesRealtime`, Lipsync-Polling): unangetastet.
- Backward-Compat: alte `?tab=clips`-Links redirected weich auf Storyboard.
- Keine neuen Globals; Pipeline-State wird über bereits existierende React-Query-Caches & Context gelesen.

---

## Technische Zusammenfassung (für die Implementierung)

```text
NEU:
  src/components/video-composer/PipelineProgressBar.tsx
  src/hooks/usePipelineProgress.ts
  src/hooks/useGenerateAllClips.ts        (extrahiert aus ClipsTab.handleGenerateAll)

GEÄNDERT:
  src/components/video-composer/VideoComposerDashboard.tsx
    - TAB_ORDER / TABS / STEPS: 'clips' entfernt
    - <PipelineProgressBar /> unter dem Stepper rendern
    - setActiveTab('clips') -> 'storyboard'
    - ?tab=clips -> Redirect auf 'storyboard' (außer ?advanced=1)
  src/components/video-composer/StoryboardTab.tsx
    - "Clips generieren →" Button ersetzt durch "Alle Clips generieren (N • €X)"
    - Status-Chip "K/N fertig"
    - onGoToClips Prop entfernt
  src/components/video-composer/VoiceSubtitlesTab.tsx
    - Button-Label dynamisch ("Clip generieren mit Voiceover")
    - Phase-Start-Event emittieren
  src/i18n/{en,de,es}.ts
    - Neue Keys: generateClipWithVo, generateClipWithVoMulti,
      pipelinePhase.*, pipelineEta

UNVERÄNDERT (kritisch):
  supabase/functions/**  (gesamte Pipeline)
  src/components/video-composer/ClipsTab.tsx (nur versteckt)
  Realtime / Polling / DB-Schema
```

Nach Approval baue ich das in dieser Reihenfolge: (a) `usePipelineProgress` + `PipelineProgressBar`, (b) Storyboard-Master-Button + `useGenerateAllClips`-Extraktion, (c) Tab/Stepper-Entfernung + Redirect, (d) VO-Button-Label, (e) i18n.
