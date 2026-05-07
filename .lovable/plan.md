## Zwei Themen

### 1. Sound-Übergänge zwischen Szenen sind zu abrupt

**Aktuelles Verhalten** (`ComposerSequencePreview.tsx`, Zeilen 686-711):
Beim SFX-Sync wird ein Clip exakt am Szenenrand mit `a.play()` gestartet und am Ende hart mit `a.pause()` gestoppt — dadurch hört man einen hörbaren Schnitt, besonders wenn ambiente Layer (Wind, Stadtgeräusch, Field-Tone) zwischen Szene 1 und Szene 2 wechseln.

**Plan — Fade-In/Out + Cross-Bleed**

a) **Per-Clip-Fades** in der Sync-Schleife (`ComposerSequencePreview.tsx`):
   - Neue Konstante `SFX_FADE_SEC = 0.4` (300–500 ms fühlen sich am natürlichsten an).
   - Statt `a.volume = safeVol` eine kleine Hilfsfunktion:
     - Wenn `globalTime < start + FADE` → Volume linear von 0 → safeVol rampen.
     - Wenn `globalTime > end - FADE` → Volume linear von safeVol → 0 rampen.
     - Sonst: volle Lautstärke.
   - Beim Verlassen des Bereichs (`!inRange`) **nicht sofort `pause()`**, sondern erst wenn Volume auf 0 ist; das verhindert Click-Artefakte.

b) **Optional: Pre-Roll am Szenenrand** — Damit Ambiente bereits *vor* dem Szenenwechsel leise einsetzt, das Tracking-Fenster pro Clip um `FADE` nach vorne ziehen:
   - `startWindow = start - SFX_FADE_SEC` (geclamped auf 0)
   - Rampe beginnt dann bei `startWindow`, erreicht volle Lautstärke bei `start`.
   - Genauso am Ende: `endWindow = end + SFX_FADE_SEC`.
   - Effekt: ambient track der nächsten Szene blendet sich über den 400-ms-Crossfade des Videos (Konstante `CROSSFADE_MS = 400` existiert bereits) sauber ein.

c) **Render-Parität** — Damit Vorschau und finaler Mux übereinstimmen, in `supabase/functions/mux-audio-to-video/index.ts` (bzw. `compose-video-assemble`) die `afade=in:0:d=0.4` / `afade=out:start_time=…:d=0.4` Filter pro Clip ergänzen, falls dort noch nicht vorhanden. (Wenn schon vorhanden, nur Wert auf 0.4 vereinheitlichen.) → Wird in der Plan-Umsetzung geprüft und nur bei Bedarf geändert.

**Touched files (Phase 1 — UI):**
- `src/components/video-composer/ComposerSequencePreview.tsx` — Fade-Funktion + Pre-Roll-Fenster

**Touched files (Phase 2 — nur falls Render abrupt klingt):**
- `supabase/functions/mux-audio-to-video/index.ts` — afade-Filter pro Clip

---

### 2. Lip-Sync im Sound-Mix?

**Kurze Antwort: Nein.** Sound-Mix (ambient/sfx/foley) ist reines **Audio-Mixing** — er bewegt keine Lippen.

**Lip-Sync entsteht ausschließlich im Talking-Head-Flow:**
- Dialog "Talking-Head erstellen" (zweiter Screenshot) → lädt Foto + Skript + Stimme → ruft `generate-talking-head` (HeyGen Photo-Avatar) auf → liefert ein **fertig lip-synctes Video** zurück, das als Szenen-Clip eingesetzt wird.
- Alternativ kann `lip-sync-video` (sync-labs/lipsync-2) ein bestehendes Video nachträglich auf eine Audio-Spur synchronisieren — das wird aber **nicht** automatisch vom Sound-Designer aufgerufen, sondern müsste explizit pro Szene getriggert werden.

**Empfehlung in der UI:**
Im Sound-Design-Panel einen kleinen Hinweis ergänzen: *"Lip-Sync für sprechende Charaktere bitte im Talking-Head-Dialog erstellen — der Sound-Mix mischt nur Atmo/SFX/Musik."* (1 Zeile, kein Logikwechsel).

**Touched file (Phase 3 — Hinweis):**
- `src/components/video-composer/SoundDesignPanel.tsx` — kurzer Helper-Text

---

### Out of scope
- Keine Änderungen an `lip-sync-video`-Edge-Function.
- Keine neuen Provider, keine DB-Migration.
- Talking-Head-Dialog selbst wird nicht angefasst.

### Verifikation
- Vorschau abspielen → bei Szenenübergang darf kein hörbarer Schnitt mehr auftreten; Ambient-Layer schmelzen ineinander.
- Console: `[Preview] sceneAudioClips loaded: N` weiterhin vorhanden, keine neuen Warnings.
- Hinweis-Text sichtbar im Sound-Design-Panel.
