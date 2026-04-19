

## Plan: Wochenleiste als „Glowing Platform Rings"-Timeline + smarter Ring-Dialog

### Befund
- Aktuelle `WeekStrategyTimeline` zeigt Tageskarten mit Verbindungslinie + kleinen Punkten — der Streifen wirkt deplatziert.
- Wir hatten bereits in `WeekTimelineDay.tsx` eine viel coolere Variante mit leuchtenden Plattform-Ringen — wird aktuell im Strategy-Mode aber nicht genutzt.
- Plattformfarben sind dort schon definiert, aber: Facebook=blau ✅, Instagram=lila ✅, LinkedIn=grün ✅, YouTube=rot ✅, X=violett (soll → Schwarzlicht/UV-Purple), TikTok=weiß (bleibt).

### Zielbild

```text
   So       Mo       Di       Mi       Do       Fr       Sa
   12       13       14       15       16       17       18
   ──●──────●──────●──────●──────●──────●──────●──   ← dünne goldene Linie
            ◉                ○              ◉
         (IG lila          (FB blau       (YT rot
          glüht)            wartet)        glüht)
```

- **Eine** dünne goldene Timeline-Linie quer durch die Woche (subtil, statt aktuellem klobigen Streifen).
- Pro Tag: vertikal gestapelte Plattform-Ringe in Markenfarben.
- **Status-Visualisierung pro Ring**:
  - `pending` (Zukunft) → gedimmter Ring (`ring-{color}/30`), kein Glow
  - `pending` (heute, in Kürze) → langsam pulsierend in Plattformfarbe
  - `completed/published` → **voller Glow** in Plattformfarbe (z. B. IG = lila Glow)
  - `missed` → **roter Glow + langsames Blinken** (`animate-pulse` mit ~2s Dauer, deutlich langsamer als YouTube-Static-Glow → klar unterscheidbar)
  - `dismissed` → fast unsichtbar, durchgestrichen
- Klick auf Ring → öffnet **`PlatformRingDialog`** (neu).

### Plattformfarben (final)
| Plattform | Ring | Glow |
|---|---|---|
| Instagram | `ring-purple-500` | `shadow-[0_0_18px_rgba(168,85,247,0.85)]` |
| Facebook | `ring-blue-500` | `shadow-[0_0_18px_rgba(59,130,246,0.85)]` |
| LinkedIn | `ring-green-500` | `shadow-[0_0_18px_rgba(34,197,94,0.85)]` |
| YouTube | `ring-red-500` | `shadow-[0_0_18px_rgba(239,68,68,0.85)]` (statisch) |
| X | `ring-violet-700` | `shadow-[0_0_18px_rgba(109,40,217,0.95)]` (Schwarzlicht/UV) |
| TikTok | `ring-white` | `shadow-[0_0_14px_rgba(255,255,255,0.7)]` |
| **Missed** | `ring-red-500` | `shadow-[0_0_18px_rgba(239,68,68,0.7)]` + `animate-pulse` (2s) |

### Neue Komponente: `WeekStrategyRingTimeline.tsx`
Ersetzt visuell die aktuelle `WeekStrategyTimeline`. Nutzt die bestehende `WeekTimelineDay`-Logik als Basis, erweitert um:
- Strategy-Posts statt Calendar-Posts.
- Status-Mapping `pending|completed|missed|dismissed` → visuelles Verhalten.
- Eine **horizontale Goldlinie** hinter den Day-Numbers (dünn, `h-px`, Gradient).

### Neuer Dialog: `PlatformRingDialog.tsx`
Klick auf Ring → Dialog mit allen Aktionen in einem Fenster:

**Header**: Plattform-Icon in Farbe + Datum/Uhrzeit + Status-Badge

**Inhalt (Tabs oder Accordion)**:
1. **Vorschau & Bearbeiten**
   - Caption-Editor (Textarea, AI-Entwurf vorausgefüllt)
   - Hashtags
   - Hook (optional)
   - Reasoning (warum dieser Vorschlag)
2. **Medien**
   - Drag & Drop Upload-Zone (Bild/Video)
   - Auswahl aus Mediathek (`media_library`)
   - „Mit KI generieren" Button → ruft Picture Studio bzw. AI Video Studio auf
3. **Zeitplan**
   - Date- & Time-Picker (vorausgefüllt mit `scheduled_at`)
   - Plattform-Switcher (falls anderer Account)

**Footer-Actions**:
- 🗑️ **Verwerfen** (status='dismissed')
- ✏️ **Speichern** (Update strategy_post)
- 📅 **In Kalender übernehmen & auto-publishen** → erstellt `calendar_events` Eintrag mit `auto_publish=true`, verknüpft `completed_event_id`

### Auto-Publish-Flow
Sobald ein Strategy-Post „in Kalender übernommen" wird:
1. Insert in `calendar_events` mit `status='scheduled'`, `auto_publish=true`, Caption, Medien, Plattform, `scheduled_at`.
2. Der bestehende `tick-strategy-posts` (oder ein neuer `tick-publish-scheduled`) Cron-Job prüft jede Minute auf fällige Posts und triggert die jeweilige Publish-Edge-Function (Instagram/Facebook/X/LinkedIn/YouTube).
3. Bei Erfolg: `strategy_posts.status='completed'` → Ring leuchtet in Plattformfarbe.
4. Bei Fehler: `status='failed'` → roter Glow + Toast.

> Hinweis: Da `tick-strategy-posts` bereits stündlich läuft, wird er erweitert um die Publish-Logik. Für minutengenaue Posts wäre ein zusätzlicher Cron `*/1 * * * *` nötig.

### Medien-Upload
- Reuse vom bestehenden `media-assets` Bucket
- Pfad: `{user_id}/strategy/{post_id}/{filename}` (RLS-konform)
- Neue Spalte `strategy_posts.media_urls TEXT[]` (Migration)

### Datenmodell-Erweiterung
```sql
ALTER TABLE strategy_posts ADD COLUMN media_urls TEXT[] DEFAULT '{}';
ALTER TABLE strategy_posts ADD COLUMN auto_publish BOOLEAN DEFAULT false;
```

### Betroffene Dateien
- *(neu)* `src/components/dashboard/WeekStrategyRingTimeline.tsx` — neue Visualisierung
- *(neu)* `src/components/dashboard/PlatformRingDialog.tsx` — Edit-Dialog mit Upload + KI
- `src/components/dashboard/WeekStrategyTimeline.tsx` — wird ersetzt/zur Wrapper
- `src/hooks/useStrategyMode.ts` — Mutation `updateStrategyPost(id, {media_urls, caption_draft, scheduled_at, ...})`, `submitToCalendar`
- `supabase/functions/tick-strategy-posts/index.ts` — erweitert um Auto-Publish
- *(Migration)* `strategy_posts.media_urls`, `auto_publish` Spalten
- `src/pages/Home.tsx` — ggf. Komponenten-Tausch

### Erwartetes Ergebnis
- Klare, elegante Wochenleiste mit dünner Goldlinie und leuchtenden Plattform-Ringen pro Tag.
- Ringe leuchten erst wenn Post veröffentlicht wurde — sonst dezent gedimmt.
- Verpasste Posts leuchten **rot pulsierend** (klar von YouTube-Statik-Rot unterscheidbar).
- Klick auf Ring → ein einziger smarter Dialog mit Caption-Editor, Medien-Upload, KI-Generator, Zeitplan und Lösch-/Auto-Publish-Aktion.
- Nach dem Posten leuchtet der Ring automatisch in Plattformfarbe — visuelles Belohnungs-Feedback für den Creator.

