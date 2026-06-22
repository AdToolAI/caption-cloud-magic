# Storyboarding-Optimierung — Status & nächste Schritte

## Phase 1 + 2 Review (verifiziert im Code)

Stichprobenartig gegen die tatsächlichen Files geprüft — alles aus dem letzten Plan ist sauber gelandet:

| Bereich | Datei | Status |
|---|---|---|
| Boilerplate-Filter (EN/DE/ES) | `src/lib/motion-studio/isBoilerplateAction.ts` | ✅ inkl. 4 EN, 2 DE, 2 ES Patterns |
| Dedup im Action-Layer | `applyActionsToPrompt.ts` | ✅ `specific`-Filter + Scene-vs-Cast-Logik |
| Kein Double-Wrap mehr | `composeFinalPrompt.ts:197` | ✅ Marker werden raw emittiert, kein `[2 ACTION] [SceneAction] …` mehr |
| `[4 PERFORMANCE]`-Block | `buildPerformanceBlock.ts` | ✅ 12-Wort-Cap, korrekt zwischen SHOT und DIALOG (`composeFinalPrompt.ts:209`) |
| Quality-Coach Warnungen | `qualityScore.ts` (3 Sprachen) | ✅ `redundancyWarn` + `boilerplateWarn` |
| UI Performance-Tab | `SceneStudioTabBar.tsx` + `ScenePerformancePanel.tsx` | ✅ Tab vorhanden, EN/DE Labels |
| Hook-Integration | `useGenerateAllClips.ts:216` | ✅ `derivePerformanceEntries` wird durchgereicht |
| Lip-Sync-Pipeline | `compose-dialog-segments/*`, `audioPlan` | ✅ unangetastet |

**Bewertung:** Phase 1+2 sind production-ready. Was bisher fehlt, sind die *Wirkungstests* (sieht der User die Verbesserungen?) und die nächste Ausbaustufe.

---

## Beobachtungen seit Phase 2

1. **Performance-Tab ist „leise"** — User wissen nicht, dass er existiert. Kein Indikator auf der SceneCard, kein Auto-Suggest pro Cast-Member.
2. **Performance-Block landet im Prompt, aber nicht in `applyActionsToPrompt`-Markern.** Heißt: wenn ein User später noch Cast-Actions tippt, kann es zu *latenter* Doppelung (Gestik in CastAction *und* in Performance) kommen. Aktuell ungewarnt.
3. **Keine Presets.** Jede Szene wird from-scratch direktiert — bei Mehr-Szenen-Storyboards ist das viel Klickarbeit, und die Tonality über Szenen hinweg driftet.
4. **Storyboard-LLM (`compose-video-storyboard`) kennt das Performance-Feld nicht.** Wenn die AI initial Szenen baut, könnte sie für jeden Sprecher gleich sinnvolle Defaults vorschlagen statt leerer Felder.

---

## Phase 3 — Performance Discoverability & Smart Defaults

Ziel: Performance-Layer wird *gesehen, genutzt, intelligent gefüllt* — ohne den Prompt aufzublähen.

### 3.1 Sichtbarkeit auf der SceneCard
- Performance-Tab bekommt ein Count-Badge (`countDirectedPerformances`), analog zum Audio-Tab.
- Neue Mini-Zeile unter dem Prompt-Editor: „🎭 0/3 cast directed" mit Klick → öffnet den Tab.
- Hover-Tooltip erklärt einmalig, was die 4 Felder bewirken (LocalStorage-Flag, kein Modal-Spam).

### 3.2 Konflikt-Warnung Cast-Action ↔ Performance
- Erweitert `qualityScore.ts` um einen dritten Tipp `performanceConflictWarn`:
  detektiert, wenn `CastActions[char]` Wörter wie *smile / nod / lean / point / gesture* enthält und gleichzeitig `performance[char].gesture` oder `.expression` gesetzt ist.
- Tipp-Text in EN/DE/ES, schlägt vor, das doppelte Wort aus der Cast-Action zu entfernen.

### 3.3 Performance-Presets pro Charakter (Brand-Char-scoped)
- Im Avatar-Profil (`/avatars/:id`) optionales Feld „Default performance" (gleiche 4 Slots).
- `derivePerformanceEntries` mergt: `scene.performance[charId]` > `character.defaultPerformance` > leer.
- Vorteil: tonalitäts-konsistente Charaktere über alle Szenen ohne pro-Szenen-Klicks.

### 3.4 LLM-seitige Vorbefüllung (best-effort, optional)
- `compose-video-storyboard` Edge Function bekommt im JSON-Schema ein optionales `performance[]`-Feld pro Charakter (gleiche 4 Enums).
- Strikt validiert; bei unbekannten Enums fallback auf leer.
- Pipeline-Vertrag bleibt rückwärtskompatibel: Feld ist optional, alte Storyboards funktionieren unverändert.
- Lip-Sync bleibt unberührt (audioPlan wird hier nicht angefasst).

---

## Phase 4 — Storyboard-weite Direction (Optional, nach 3)

Ziel: Über alle Szenen hinweg konsistente Tonalität — Artlist/Runway haben das nicht, wäre echter Differenziator.

- **Story-Bible-Box** im Composer-Header: 3 Felder *Tone* (Casual/Corporate/Cinematic), *Pacing* (Slow/Medium/Punchy), *Color story* (Warm/Cool/Neutral).
- Wird in jeder Szene als `[0 STORY]`-Layer (1 Zeile, ≤ 20 Wörter) vor `[1 SUBJECT]` injiziert.
- Quality-Coach kann Abweichungen einer Szene vom globalen Tone flaggen.
- Hat null Berührung mit dem Lip-Sync-Pfad — pure Prompt-Komposition.

---

## Was diese Runde NICHT angefasst wird (Lip-Sync-Schutzzone)

`compose-dialog-segments/*`, `compose-dialog-scene`, `sync-so-webhook`, `poll-dialog-shots`, `LIPSYNC_MODEL`, `MIN_VO_DURATION`, `update_dialog_shot_pass`, `syncso_inflight_jobs`, `lipsync-watchdog`, `formatAudioPlan`, `audioPlan`-Schema, `MAX_SHOT_RETRIES`. Alle Phase-3/4-Änderungen sind reine Client-seitige Prompt-Composition + ein optionales Feld in `compose-video-storyboard`.

---

## Empfehlung

Phase 3.1 + 3.2 zuerst (Discoverability + Konflikt-Warnung) — ca. 1–2 h, sofort sichtbarer Nutzen, null Risiko.
Danach 3.3 (Char-Presets) als eigener Schritt, weil es ein Avatar-Profil-Schema-Update braucht.
3.4 und Phase 4 sind opt-in für später.

**Frage:** Starten wir mit Phase 3.1 + 3.2 oder soll 3.3 (Char-Presets) gleich mit?
