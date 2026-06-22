# Analyse Storyboarding (AdTool vs. Artlist & Co.) + Vorschlag für Performance Layer

Erst die Diagnose, dann ein konkreter Bauplan. **Lip-Sync-Pipeline bleibt unangetastet** — alle Änderungen sind reine Prompt-Komposition (Client) oder neue, optionale Felder.

---

## 1. Wo wir heute stehen — ehrlicher Vergleich

**Was wir besser machen als Artlist / Runway / Sora-Wrapper:**
- **Strukturierter 8-Layer-Prompt** (`composeFinalPrompt.ts`) mit gelabelten Blöcken `[1 SUBJECT] [2 ACTION] [3 SHOT] [5 DIALOG] [6 DIALOG SHOTS] [8 NEGATIVE]` — das macht weder Artlist noch Runway, die schicken Free-Text.
- **Axis-aware Dedup** (`composePromptLayers.ts`) — Kamera/Licht/Mood werden zwischen Shot Director, Cinematic Preset und Director Modifiers konfliktfrei aufgelöst. Artlist hat das nicht, dort kollidieren Style-Picks ungefiltert.
- **Negative-Sanitizer** trennt "no logos / no text" automatisch in `negative_prompt`. Konkurrenz schickt das im Positive-Prompt und wundert sich, dass es nicht greift.
- **Per-Speaker Lip-Sync (Sync.so sync-3 + Hailuo Plates)** + Anchor-Identity-Bridge — niemand sonst hat 4-Personen-Dialog mit dezidierten Cuts.
- **Audio Plan als deterministischer DIALOG-Block** mit Timestamps im Artlist-Stil + Multi-Speaker-Safeguard ("don't make one character mouth all lines").

**Wo wir hinter Konkurrenz liegen oder Risiken haben:**
- **Performance-Direction fehlt komplett.** Mimik, Gestik, Blick, Energy, Beat-Synchronisation — alles, was Artlist "Performance Notes" und Runway "Acting" nennt. Aktuell schreibt der User das händisch in die freie Action.
- **Briefing-Widerspruch ist real.** `[SceneAction]` sagt "share the scene together", `[CastActions]` sagt 4× "is gesturing naturally, visible to camera" (Auto-Fill). Beides landet zusätzlich zum freien Prompt im Final-Prompt. Hailuo/Kling sehen drei teils redundante Anweisungen und mitteln. Screenshot 1 zeigt es: Scene-Action + 4 CastActions + freie Sätze + Cast-Header — der Prompt wird ~600–900 Zeichen, davon ~40% wiederholen sich semantisch.
- **`is gesturing naturally, visible to camera`** ist ein Auto-Placeholder, der zu oft drinbleibt und die echte spezifische Aktion verwässert.

---

## 2. Antwort auf deine drei Fragen

### a) Wird der Prompt zu lang?
Heute typisch **400–900 Zeichen** (ohne Dialog-Block) — das ist noch im sweet-spot für Hailuo (~512 tokens effektiv) und Vidu Q2, aber **mit Dialog-Block + 4 Cast-Actions kratzen wir an 1500 Zeichen**. Ab da ignorieren i2v-Modelle die hinteren Layer.
**Echtes Problem:** nicht die Länge, sondern die **semantische Redundanz** zwischen `[SceneAction]`, `[CastActions]` und freier Action. Lösung = Konsolidierung, nicht Streichung.

### b) Werden Cast-Actions korrekt umgesetzt / widersprechen sie sich?
Ja, oft. Drei Ursachen:
1. **Auto-Placeholder-Verschmutzung** — `"is gesturing naturally, visible to camera"` wird für jeden Cast-Member auto-gefüllt und übersteuert die Szenen-Action.
2. **Reihenfolgen-Konflikt** — `applyActionsToPrompt` prependet `[SceneAction]` + `[CastActions]` **vor** den Rest, aber `composeFinalPrompt` baut **danach** wieder einen `[2 ACTION]`-Layer aus exakt diesem String. Resultat: der User sieht 2× dieselbe Info im Final-Prompt.
3. **Kein Konflikt-Check** — wenn `[SceneAction]` sagt "sitting at a desk" und eine `[CastActions]`-Zeile sagt "walks across the room", schicken wir beides. Das Modell entscheidet zufällig.

### c) Sollen wir Mimik/Gestik-Felder dazubauen?
**Ja — aber pro Charakter, kompakt, optional, und mit Token-Budget.** Sonst Überladung.

---

## 3. Plan — Phase 1: Hygiene (klein, no-risk, große Wirkung)

**Ziel:** Redundanz raus, Konflikte sichtbar, ohne neue UI.

1. **Auto-Placeholder eliminieren** (`SceneActionField.tsx` / `CharacterCastPicker.tsx`)
   - `"is gesturing naturally, visible to camera"` wird **nicht mehr in den Prompt geschrieben**, nur als greyed-out UI-Placeholder im Textfeld angezeigt.
   - Beim Submit: leere Cast-Action → Eintrag wird in `applyActionsToPrompt` weggelassen (Filter existiert schon Z. 50–52, wird aber durch Auto-Fill umgangen).

2. **Dedup zwischen `[SceneAction]` und `[2 ACTION]`** in `composeFinalPrompt.ts`
   - Wenn `actionBody` mit `[SceneAction]…[/SceneAction]` beginnt, Block raus-strippen bevor wir den `[2 ACTION]`-Layer emittieren.
   - Erspart 100–200 Zeichen pro Szene.

3. **Konflikt-Warner im Director-Score** (bestehendes 66/Feinschliff-Banner)
   - Neuer Check: Jaccard-Overlap zwischen `[SceneAction]` und jeder `[CastActions]`-Zeile ≥0.5 → Warnung "Cast-Action wiederholt Scene-Action".

4. **Token-Counter** unter dem Prompt-Editor (klein, dezent): `"~620 chars · safe"` / `"~1400 chars · Hailuo trimmt evtl."`

## 4. Plan — Phase 2: Performance Layer (echter USP vs. Artlist)

**Ziel:** Mimik/Gestik/Blick/Energy pro Charakter — **als 4. Reiter neben Story/Cast/Audio/Look**, nicht im Haupt-Prompt-Feld.

**Datenmodell** (clientseitig, pro Cast-Eintrag in der Szene):
```
performance: {
  expression?: 'neutral' | 'warm-smile' | 'curious' | 'concerned' | 'confident' | 'surprised'  // 6 presets
  gesture?: 'still' | 'hand-on-chin' | 'open-palms' | 'point' | 'cross-arms' | 'lean-in'       // 6 presets
  gaze?: 'to-camera' | 'to-speaker' | 'away' | 'down-thinking'                                  // 4 presets
  energy?: 1 | 2 | 3 | 4 | 5  // Slider „subtle → big"
}
```

**Prompt-Injection** (neue Datei `src/lib/motion-studio/buildPerformanceBlock.ts`):
- Wird **nur** emittiert, wenn mind. ein Feld gesetzt ist.
- Eigener Block `[4 PERFORMANCE]` (zwischen SHOT und DIALOG — Modelle gewichten frühe Blöcke stärker).
- Format kompakt, 1 Zeile pro Sprecher:
  `- Sarah: warm smile, open palms, looks at Matthew, energy 2/5`
- Auto-Übersetzung Preset-ID → englischer Satz (wie heute bei Shot Director).
- **Hard cap: 12 Worte pro Charakter**, sonst trimmen. Hält den Block unter ~250 Zeichen auch bei 4 Cast.

**UI** (`PerformanceTab.tsx`, neuer Reiter in `SceneCard`):
- Pro Cast-Member eine kompakte Zeile mit 4 Mini-Dropdowns + Energy-Slider.
- Default „—" = nicht gesetzt = nichts im Prompt. Kein Auto-Fill, kein Default-Wert.
- Mobile-stack: vertikal.

**Konsistenz mit Lip-Sync:**
- Performance-Block wird **vor** `[5 DIALOG]` injiziert → Sync.so sieht nur DIALOG, ignoriert PERFORMANCE.
- `compose-dialog-segments` / `compose-dialog-scene` Edge Functions bleiben unverändert — sie lesen `audioPlan`, nicht `aiPrompt`.
- Dialog-Shots-Pipeline (per-Speaker Hailuo Plate + sync-3 Lipsync) wird **nicht angefasst**.

## 5. Plan — Phase 3 (optional, später): Performance-Presets pro Brand-Character
- Im Avatar/Character-Profil ein „Default Performance Style" speichern (`avatar_performance_defaults`).
- Auto-Fill in neue Szenen, überschreibbar pro Szene.

---

## 6. Was wir NICHT anfassen (Lip-Sync-Schutzzone)
- `compose-dialog-segments/*`, `compose-dialog-scene`, `sync-so-webhook`, `poll-dialog-shots`, `lipsync-watchdog`
- `formatAudioPlan` und `[5 DIALOG]`-Block-Format
- `audioPlan`-Datenstruktur und `MIN_VO_DURATION 0.4s`-Regel
- `update_dialog_shot_pass` RPC, advisory locks, sync-3 ASD-Config
- `LIPSYNC_MODEL`-Konstante und alle `syncso_inflight_jobs`-Logik

Alle Phase-1- und Phase-2-Änderungen sind **client-side Prompt-Komposition** + neue optionale UI-Felder. Webhook-Verträge und Edge-Function-Payloads bleiben byte-identisch.

---

## 7. Empfohlene Reihenfolge

1. **Phase 1 zuerst (1–2 Std Arbeit, sofort spürbar)** — räumt Auto-Placeholder, Dedup, Token-Counter.
2. **Phase 2 danach (halber Tag)** — Performance-Tab als USP gegen Artlist.
3. Phase 3 nach User-Feedback.

Soll ich mit Phase 1 starten, oder direkt Phase 1+2 zusammen einbauen?
