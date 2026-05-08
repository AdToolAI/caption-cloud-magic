## Ziel

Aus dem Composer wirklich **filmreife Werbespots** machen — Charaktere müssen so sprechen, als wären sie echt gefilmt. Aktuell:

1. **Kein echter Lip-Sync.** Hailuo/Seedance animieren das Bild, aber der Mund passt nicht zum gesprochenen Text.
2. **Doppel-Stimmen-Bug** in Szene 1 ("Welcome to droneOcular"): zwei VOs spielen gleichzeitig.

Wir lösen das mit einem **zweistufigen Ansatz**, der die existierende HeyGen- und Sync.so-Infrastruktur nutzt — nicht durch ein neues Modell.

---

## Stufe 1 — Bug-Fix: Nur noch EINE VO-Quelle pro Szene

### Ursache
Im Composer können aktuell **zwei** VO-Tracks gleichzeitig existieren:
- `assemblyConfig.voiceover.audioUrl` (globaler Voiceover, generiert in *Voiceover & Untertitel*)
- `scene_audio_clips` mit `kind='voiceover'` (per-Szene VO, generiert über *Storyboard → SceneDialogStudio*)

Wenn man im Storyboard einen Dialog generiert und danach im Voiceover-Tab nochmal einen Multi-Speaker-Skript generiert, **mischt** die Vorschau (`ComposerSequencePreview`) beide.

### Fix
- Eine **Single-Source-of-Truth-Regel** einführen: pro Szene gilt **entweder** der per-Szene-Clip **oder** der globale VO, niemals beides.
- Beim Generieren eines globalen Multi-Speaker-VO werden vorhandene `scene_audio_clips` mit `kind='voiceover'` für dieses Projekt gelöscht (mit Bestätigungs-Dialog "Per-Szene-Dialoge ersetzen?").
- Umgekehrt: Beim Generieren per-Szene-Dialog im SceneDialogStudio wird `assemblyConfig.voiceover.audioUrl` für die betroffene Szene maskiert (neuer Per-Scene-Mute-Flag) bzw. der globale VO gewarnt.
- Sichtbarer Status-Badge "Audio-Quelle: Global / Per-Szene" pro SceneCard, damit Anwender sehen, was läuft.

---

## Stufe 2 — Echter Lip-Sync mit zwei Engines

Es gibt **keine** Single-Model-Lösung, die für **alle** Szenen filmreif ist. Stattdessen wählen wir pro Szene die richtige Engine:

### A. Talking-Head-Szenen → HeyGen Photo Avatar (frame-genau)
- Wenn eine Szene als "Person spricht in die Kamera / im Bild" markiert ist (oder automatisch erkannt: Briefing-Cast vorhanden + Dialog-Text vorhanden), wird die Szene **nicht** mehr mit Hailuo animiert, sondern direkt über die existierende `generate-talking-head` Edge-Function (HeyGen Photo Avatar) gerendert.
- HeyGen liefert nativen, perfekten Lip-Sync — das ist das Gleiche, was Werbeagenturen für realistische Sprecher-Inserts nutzen.
- Pro Sprecher wird das hinterlegte Brand-Character-Portrait verwendet (`mentioned_character_ids` der Szene).
- Bei Mehr-Sprecher-Szenen (Dialog) erzeugen wir **pro Sprecher einen Cut** und schneiden sie in der Szene hintereinander (existierende Talking-Head-Dialog-Pipeline aus dem `TalkingHeadDialog`).

### B. B-Roll / Action-Szenen → Hailuo + Sync.so Polish (existierend)
- Wenn die Szene **kein** Talking-Head ist (Drohne, Produkt-Shot, Landschaft, Kamerafahrt), bleiben wir bei Hailuo/Seedance.
- Falls in dieser Szene trotzdem VO läuft, läuft sie als **Off-Screen-Narration** (kein Lip-Sync nötig).
- Für seltene Fälle "Hailuo-Clip mit sichtbarem Sprechermund" wird wie heute `compose-lipsync-scene` (sync.so/lipsync-2) als optionaler Polish-Schritt angeboten — aber **nicht** automatisch, weil die Qualität auf generierten Gesichtern unzuverlässig ist.

### Auto-Routing-Logik (neu)
Beim Klick auf "Generieren" (Clips-Tab) entscheidet eine kleine Heuristik pro Szene:

```text
if scene.dialog_text && scene.cast.length > 0:
    engine = "heygen-talking-head"   # echter Lip-Sync
elif scene.global_vo_overlaps && scene.shotType in ["close-up", "portrait"]:
    engine = "hailuo + sync.so polish"   # nur wenn nötig
else:
    engine = "hailuo"                  # B-Roll, VO als Off-Screen
```

Die Szene zeigt das Engine-Badge ("🎙️ HeyGen Lip-Sync" / "🎬 Hailuo B-Roll" / "✨ Hailuo + Sync Polish") in der SceneCard, sodass die Wahl nachvollziehbar ist und manuell geändert werden kann.

---

## Stufe 3 — Mehr-Sprecher pro Szene (für die Welcome-Scene)

Damit "Welcome to droneOcular" mit zwei verschiedenen Sprechern korrekt funktioniert:

- Im **Storyboard → SceneDialogStudio** (Tab "Dialog") wird pro Szene ein Dialog-Skript mit Speaker-Tags erfasst:
  ```
  [SARA] Welcome to droneOcular.
  [TOM] The new generation of agricultural drones.
  ```
- Pro Sprecher wird ein eigener HeyGen-Talking-Head-Cut generiert (existierende Logik im `TalkingHeadDialog`-Dialog-Modus, jetzt direkt aus dem Composer aufrufbar).
- Die Cuts werden hintereinander in derselben Szene gerendert (Sara-Cut → Tom-Cut), Übergang per harten Schnitt oder kurzem 100-ms-Crossfade.
- Globale VO-Generierung wird in dieser Szene **deaktiviert** (Stufe 1), sodass keine zweite Stimme darüber liegt.

---

## UI-Änderungen (klein gehalten)

- **SceneCard:** neues Badge "🎙️ HeyGen Lip-Sync" / "🎬 B-Roll" + ein Toggle "Sprecher in dieser Szene" (Auto/An/Aus).
- **VoiceSubtitlesTab:** Warn-Banner wenn Per-Szene-Dialoge existieren ("Diese Szenen nutzen bereits eigene Stimmen — globaler VO wird dort übersprungen").
- **Clips-Tab:** "Generieren"-Button respektiert das Engine-Routing; bei HeyGen-Szenen Cost-Hinweis (~0,30 €/Szene).
- **SceneDialogStudio:** neuer Button "Mehr-Sprecher-Dialog" der die Speaker-Tags ([SARA] [TOM]) komfortabel einfügt.

---

## Technische Details (für später)

**Geänderte Dateien:**
- `src/components/video-composer/SceneCard.tsx` — Engine-Badge + Toggle
- `src/components/video-composer/ClipsTab.tsx` — Auto-Routing zu `generate-talking-head` statt `animate-scene-hailuo` für Talking-Head-Szenen
- `src/components/video-composer/VoiceSubtitlesTab.tsx` — Conflict-Detection + Bestätigungs-Dialog vor globalem VO
- `src/components/video-composer/SceneDialogStudio.tsx` — Mehr-Sprecher-Dialog-Helper, sequentielle HeyGen-Generierung pro Sprecher
- `src/components/video-composer/ComposerSequencePreview.tsx` — Filtert globalen VO in Szenen mit per-Szene Audio
- `src/lib/video-composer/sceneEngineRouter.ts` (neu) — kleine Pure-Function für die Routing-Entscheidung

**Edge-Functions:** keine neuen — wiederverwendet werden `generate-talking-head` (HeyGen), `generate-multi-speaker-vo`, `compose-lipsync-scene` (sync.so, nur als manueller Polish).

**DB:** keine Schema-Änderungen nötig. Wir nutzen die bestehenden Felder `composer_scenes.dialog_text`, `composer_scenes.mentioned_character_ids`, `scene_audio_clips`.

**Kosten:** HeyGen ~0,30 € pro Talking-Head-Szene + ~0,05 € TTS — pro 10-Szenen-Spot also ca. 1–3 € extra für die echten Lip-Sync-Szenen.

---

## Was wir explizit NICHT tun

- Kein neues Lip-Sync-Modell (Wav2Lip, MuseTalk, etc.) integrieren — die Qualität auf generierten KI-Gesichtern ist zu unzuverlässig für Werbe-Niveau.
- Keine pauschale Zwangs-Anwendung von sync.so/lipsync-2 auf jede Szene — Risiko von „Mund-Glitches" auf Drohnen-/Produkt-Shots.
- Kein Umbau der Storyboard-Struktur — wir bauen auf die existierende Cast/Speaker-Logik auf.