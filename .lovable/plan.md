## Autopilot Stage 5 — Lip-Sync härten (Deutsch, 3–4 Sprecher)

### Vorab: Engine- und Sprachfrage geklärt

Im Code geprüft:
- `autopilot-orchestrate` nutzt `minimax/hailuo-2.3` für Motion und ruft für den Lip-Sync `lip-sync-video` auf, dort läuft `sync/lipsync-2-pro`.
- **Kling Omni ist im Autopilot nicht verdrahtet** — und soll es auch nicht werden. Omni erzeugt die Stimme selbst und kann kein Deutsch.
- Sync.so ist audiogetrieben: deutsches ElevenLabs-Audio rein, Mundbewegung wird darauf retimet. **Sprachunabhängig** — der Pfad ist für Deutsch korrekt, auch bei 3–4 Sprechern.

Der Plan härtet also den bestehenden deutschen Pfad, er wechselt die Engine nicht. Motion Studio wird nicht benötigt; die Mehrsprecher-Strecke des Composers wird wiederverwendet.

### Ausgangslage (im Code geprüft)

- `speakAndSync` (Zeile 450 ff.) ruft `lip-sync-video` direkt mit `video_url` + `audio_url` auf. **Kein Preflight, kein Face-Gate, kein Retry.** Fehlschlag = stumme Szene mit einer Warnzeile.
- Die gehärteten Bausteine liegen in `supabase/functions/_shared/`: `syncso-preflight.ts` (Codec-Probe, WAV-Normalisierung, Voiced-Range, Circuit-Breaker, `validateFrameFace`), `syncso-face-gate.ts`, `plateFaceSlotRouter.ts`, `pass-face-preclip.ts`, `normalize-master-clip`. **Keiner wird vom Autopilot importiert.**
- `autopilot_production_scenes.dialogue` kennt nur *einen* Sprecher. Mehrere Sprecher pro Szene sind im Autopilot-Datenmodell derzeit nicht abbildbar.
- `lipsync-watchdog` kennt die Autopilot-Tabellen nicht.

---

### Block 1 — Preflight vor jedem Dispatch

1. Vor dem Sync `probeVideoStreamCached(videoUrl)`. Bei H.265/4K/VFR wird `normalize-master-clip` aufgerufen und die normalisierte URL verwendet — wie in `poll-dialog-shots`, statt hart zu scheitern.
2. Audio durch `normalizeWav` + `isAudioTooQuiet` + `detectVoicedRange`. Stiller oder zu leiser VO wird gar nicht dispatcht.
3. `evaluateCircuit` respektieren: offener Sync.so-Circuit → sofort stummer Fallback, keine verbrannten Credits.

### Block 2 — Face-Gate vor dem Sync

4. Frame aus dem Motion-Clip (`face-frame-extract`), Bewertung über `validateFrameFace`. Zwei-Pass-Scan wie in Stage G: erst `faceScore ≥ 0.6`, dann relaxed `≥ 0.4` an anderen Offsets.
5. Kein brauchbares Gesicht → **Motion-Retry statt Sync-Versuch**: die Szene wird einmal mit gesichtsbetontem Motion-Prompt (näherer Shot, frontale Blickrichtung) neu erzeugt. Das ist die häufigste reale Ausfallursache — Hailuo liefert oft Profil oder zu kleine Person.
6. `anchor-min-face-size` bereits **im Anchor-Gate** anwenden, wenn die Szene Dialog hat: schlechter Anchor fliegt raus, bevor Motion-Kosten anfallen.

### Block 3 — Mehrere Sprecher pro Szene (Deutsch)

7. `dialogue` wird auf ein Turn-Array erweitert (`turns: [{ id, speaker_character_id, text, voice_id, language }]`), analog zu den `dialog_turns` des Composers — kanonische ID als Server-Wahrheit, kein Name-Matching. `language` wird pro Turn mitgeführt und an ElevenLabs durchgereicht (deutscher Hard-Lock bleibt).
8. Bei ≥2 Turns übernimmt `plateFaceSlotRouter` die eindeutige Zuordnung Sprecher→Gesicht (Rekognition-Landmarks, Hungarian Assignment). Pro Sprecher ein Pre-Clip (`pass-face-preclip`), einzeln gesynct, danach Rückmontage — die erprobte Composer-Strecke, kein zweiter Pfad.
9. `autopilot-treatment` schreibt Turns statt eines Einzelsprechers; der Regietisch zeigt sie unter der Szene an.

### Block 4 — Kein stiller Ausfall mehr

10. Retry mit `computeBackoffMs` bei transienten Fehlern (`isTransientSyncError`), maximal 2 Versuche.
11. Definitiver Fehlschlag → Refund über `refundStage` (heute wird nur der VO-Anteil sauber erstattet) und Klartext-Zeile im Regie-Log über `explainSyncErrorCode`.
12. `lipsync-watchdog` bekommt die Autopilot-Tabellen dazu: hängende Jobs nach 6 Minuten aufräumen und erstatten.

---

### Was das bringt

Die drei realen Ausfallursachen — kein/zu kleines Gesicht, unbrauchbares Audio, falsch zugeordneter Sprecher — werden abgefangen, **bevor** Sync.so angesprochen wird. Bei 1–2 Sprechern nahe der Composer-Trefferquote, bei 3–4 Sprechern deutlich stabiler als heute.

### Kosten

Preflight und Face-Gate < 1 Cent/Szene. Der Motion-Retry kostet im Fehlerfall einmal Motion — greift nur, wenn der Sync sonst sicher danebengeht, also günstiger als verbrannter Sync-Lauf plus stumme Szene.

### Migration

Ein Feld: `dialogue.turns` als JSONB-Struktur in der bestehenden Spalte — keine neue Tabelle, keine Änderung an bestehenden Zeilen.
