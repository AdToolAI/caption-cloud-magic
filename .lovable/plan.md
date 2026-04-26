# 🎬 Director Mode — UX Re-Skin (no new logic)

Wir benennen die bestehenden technischen Hybrid-Funktionen (`Forward / Backward / Bridge / Style-Ref` + AI-Engine-IDs wie `ai-kling`) in eine **narrative Regie-Story** um. Code, Edge-Functions, Pricing und Datenmodell bleiben **1:1 unverändert** — nur Copy, Icons, Reihenfolge, Farben und Mikro-Animationen werden angepasst.

## 🎯 Das Story-Framing

| Heute (technisch) | Morgen (Director Mode) | Mentales Modell |
|---|---|---|
| AI-Engine wählen (ai-kling, ai-luma…) | **🎭 CAST** — „Wähle deinen Hauptdarsteller" | Engine = Schauspieler-Ensemble |
| Forward / Backward / Bridge / Style-Ref Tabs | **🔭 SCOUT** — „Wähle deinen Drehort & Blickwinkel" | Modus = Kamera-Position zur Szene |
| Prompt + Quality + Duration + Generate | **🎬 DIRECT** — „Ruf 'Action!'" | Letzter Schritt = Regie-Anweisung |

**Tagline (Header):** „Du bist der Regisseur. Wir sind die Crew."

---

## 📁 Betroffene Dateien (alle nur Copy/Style, keine Logik)

### 1. `src/components/video-composer/HybridExtendDialog.tsx` *(Hauptarbeit)*
- Dialog-Titel: **„Hybrid Production"** → **„🎬 Director Mode — Szene #N regieren"**
- Description: → *„In drei Schritten: Cast deine Engine, scoute den Blickwinkel, gib die Regie-Anweisung."*
- **3-Step-Indicator** oben (1 Cast → 2 Scout → 3 Direct) mit James-Bond-2028 Gold-Linien (statt 4 gleichberechtigte Tabs)
- **Tab-Umbenennung** (Reihenfolge + Icons + Copy):
  - `forward` → **„🎬 Sequel"** *(„Wie geht die Szene weiter?")*
  - `backward` → **„⏮ Prequel"** *(„Was passierte davor?")*
  - `bridge` → **„🌉 Crossfade"** *(„Morphe in eine andere Szene")*
  - `style-ref` → **„🎨 Style-Echo"** *(„Neue Szene, gleiche Bildsprache")*
- **Engine-Selector** wird zum **🎭 Cast-Picker** mit Schauspieler-Metaphern:
  - `ai-kling` → „Kling — *der Charakterdarsteller* (i2v + Bridge-fähig)"
  - `ai-luma` → „Luma — *die Kamerafrau* (Sanfte Übergänge)"
  - `ai-hailuo` → „Hailuo — *der Realist* (Natürliche Bewegung)"
  - `ai-wan` → „Wan — *der Allrounder* (Schnell & flexibel)"
  - `ai-seedance` → „Seedance — *der Performer* (Tanz & Action)"
  - Disabled-State (n/a) wird zu „💤 Im Off" mit Tooltip *„Dieser Darsteller spielt in dieser Szene-Art nicht mit"*
- **Prompt-Label**: „Prompt" → **„🎬 Regie-Anweisung"**, Placeholder → *„Action! In dieser Szene…"*
- **Generate-Button**: „Generieren" → **„🎬 Action! — Szene drehen"** (mit `<Clapperboard>` Icon statt `<Sparkles>`)
- **Cost-Box**: „Geschätzte Kosten" → **„💰 Drehbudget"** (mit dezentem „inkl. ≥70% Loft-Marge"-Tooltip — optional)
- HintBoxes („Nur Kling & Luma…") werden zu **Crew-Hinweisen** im Stil: *„🎭 Für Crossfades brauchen wir Kling oder Luma — sie können Anfang **und** Ende interpretieren."*

### 2. `src/components/video-composer/SceneCard.tsx` *(Action-Bar in jeder Szene-Karte)*
- Label-Zeile „Hybrid / Híbrido / Hybrid" → **„🎬 Director Mode"** (Gold-Akzent #F5C76A, Playfair Display)
- 4 Buttons werden umgelabelt + Icons synchronisiert mit Dialog:
  - `Backward` → **„⏮ Prequel"**
  - `Forward` → **„🎬 Sequel"**
  - `Bridge` → **„🌉 Crossfade"**
  - `Style-Ref` → **„🎨 Style-Echo"**
- Tooltips komplett neu in Regie-Sprache (DE/EN/ES)
- Hybrid-Mode-Badge auf der Karte (Zeilen 310-326): selbe neue Wording

### 3. `src/components/video-composer/StoryboardTab.tsx`
- Section-Header rund um Director-Buttons bekommt einen kleinen **„🎬 Director Mode aktiv"** Hinweis-Chip, sobald mindestens eine fertige Szene existiert
- Toast-Erfolgsmeldung im `useHybridExtend.ts` Hook (Zeilen 70-80) wird angepasst:
  - „Szene wird verlängert ✨" → **„🎬 Sequel wird gedreht…"**
  - „Vorszene wird generiert ✨" → **„⏮ Prequel wird gedreht…"**
  - „Bridge-Szene wird generiert 🌉" → **„🌉 Crossfade wird gefilmt…"**
  - „Style-Reference wird generiert 🎨" → **„🎨 Style-Echo wird komponiert…"**

### 4. `src/hooks/useHybridExtend.ts`
- Nur die 4 toast-Strings ändern (siehe oben). Keine Type-Änderungen — bestehende `HybridMode`-IDs (`forward|backward|bridge|style-ref`) bleiben **technisch identisch**, damit Datenbank, Edge-Function `hybrid-extend-scene` und der `clip_source`-Discriminator unverändert bleiben.

### 5. `src/lib/translations.ts`
- Neuer Namespace `directorMode.*` mit ~25 Keys × 3 Sprachen (DE/EN/ES):
  - `directorMode.title`, `directorMode.subtitle`, `directorMode.step1Cast`, `directorMode.step2Scout`, `directorMode.step3Direct`, `directorMode.cast.kling`, `directorMode.cast.luma`, `directorMode.cast.hailuo`, `directorMode.cast.wan`, `directorMode.cast.seedance`, `directorMode.scout.sequel`, `directorMode.scout.prequel`, `directorMode.scout.crossfade`, `directorMode.scout.styleEcho`, `directorMode.direct.action`, `directorMode.direct.budget`, `directorMode.toast.sequel`, `directorMode.toast.prequel`, `directorMode.toast.crossfade`, `directorMode.toast.styleEcho`, `directorMode.crewHint.crossfade`, `directorMode.crewHint.prequel`, `directorMode.castOff`, `directorMode.tagline`, `directorMode.placeholder`
- Der Inline-`T`-Block in `HybridExtendDialog.tsx` wird durch `useTranslation()` mit `directorMode.*` ersetzt → bessere Wartbarkeit, gleiche Sprache wie Rest der App.

### 6. Optionale Mikro-Polish (im Stil-Budget)
- **3-Step-Indicator** oben im Dialog: kleine Pills `① Cast` `② Scout` `③ Direct` — die aktuell aktive Stufe glüht in Gold (#F5C76A), erledigte Stufen mit Häkchen. Pure CSS, keine Logik.
- **Clapperboard-Animation** beim Generieren (motion.div „klappt zu" 1× wenn `isExtending` startet) — 200ms, framer-motion ist bereits im Projekt.
- **Engine-Cards mit Avatar-Initialen** (statt Plain Select) — `K`/`L`/`H`/`W`/`S` in Gold-Kreisen mit Schauspieler-Untertitel. Falls Scope zu groß, behalten wir den `<Select>` und ändern nur die Item-Labels.

---

## 🚫 Was NICHT angefasst wird (bewusst)

- ❌ Edge Function `hybrid-extend-scene/index.ts` (bleibt funktional 1:1)
- ❌ `useHybridExtend` Hook-API (`HybridMode`, `HybridEngine`, `extendScene()` Signatur)
- ❌ `compose-video-clips` und alle Engine-Routings
- ❌ Pricing in `video-composer.ts` (Loft-Marge ≥70% bleibt)
- ❌ Datenbank: `scenes.hybrid_mode`, `scenes.clip_source` Werte
- ❌ Realtime/Refetch-Logik im Dashboard

→ **Alles ist purer UX/Copy-Reskin.** Bestehende Renderings, Webhooks und Storyboards funktionieren ohne Migration weiter.

---

## ✅ Akzeptanz-Kriterien

1. Dialog öffnet, zeigt 3-Step-Indicator (Cast → Scout → Direct) und Tab-Labels „Sequel / Prequel / Crossfade / Style-Echo"
2. Engine-Auswahl zeigt Schauspieler-Beschreibungen, disabled-Items zeigen „💤 Im Off"
3. Generate-Button heißt „🎬 Action! — Szene drehen"
4. Toasts erscheinen in neuer Regie-Sprache
5. SceneCard-Action-Bar zeigt 4 Director-Buttons mit neuen Labels + neuen Tooltips (DE/EN/ES)
6. Datenbank-Felder (`hybrid_mode`) speichern weiterhin `forward|backward|bridge|style-ref` — bestehende Szenen rendern korrekt
7. Alle 3 Sprachen vollständig (kein Fallback auf inline-DE-Strings)
8. Keine Regression: existierender Workflow (Storyboard → Hybrid-Button → Dialog → Generate → Refetch) funktioniert identisch

**Geschätzter Umfang:** 5 Dateien, ~25 i18n-Keys × 3 Sprachen, keine DB-/Backend-Änderungen, keine neuen Dependencies.