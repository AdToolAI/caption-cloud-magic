Ziel: Mehrsprecher-Dialoge sollen pro Sprecher exakt den richtigen Talking-Head-Clip, die richtige Stimme und die richtige Dauer erhalten – ohne alte, doppelte oder falsch zugeordnete Dialog-Szenen.

1. Dialog-Split-Flow auf echte Audio-First-Pipeline umstellen
- Im Shot-Reverse-Shot-Flow zuerst für jeden Block das Voiceover erzeugen.
- Die echte Audio-Dauer aus der TTS-Antwort verwenden.
- Diese Audio-URL immer an den Talking-Head-Render übergeben, statt HeyGen bei ElevenLabs selbst erneut TTS erzeugen zu lassen.
- Die neu erzeugte Sub-Szene direkt mit der echten Dauer des Audio-Blocks anlegen.

2. Sprecher- und Stimmenzuordnung hart absichern
- Für jeden Dialogblock die Zuordnung `Block -> Cast-Character -> VoiceConfig -> AudioUrl -> TalkingHead` deterministisch halten.
- Keine impliziten Fallbacks mehr, die eine andere Stimme unter gleichem Character-Render erzeugen könnten.
- Wenn eine Stimme fehlschlägt oder ungültig ist, klar abbrechen statt still mit vertauschter Zuordnung weiterzulaufen.

3. Alte automatisch erzeugte Dialog-Sub-Szenen vor Neugenerierung bereinigen
- Vor erneutem Generieren bereits erzeugte Shot-Reverse-Shot-Szenen dieser Ausgangsszene identifizieren und entfernen/ersetzen.
- So verhindern wir, dass alte Matthew-/Sarah-Clips im Storyboard stehen bleiben und danach wie „zufällige“ oder doppelte Sprecher wirken.

4. Dauer und Reihenfolge im Storyboard stabilisieren
- Sub-Szenen in exakter Skript-Reihenfolge anlegen.
- Jede Sub-Szene bekommt die Audio-Dauer des jeweiligen Sprecherblocks statt einer Textlängen-Heuristik.
- Falls nötig die Ursprungs-/Wrapper-Szene klar unangetastet lassen, aber die generierten Sprecher-Szenen konsistent neu aufbauen.

5. Ehrliche Fehlerfälle im UI
- Wenn Portrait, Stimme oder Audio für einen Sprecher fehlt, den gesamten Mehrsprecher-Render mit klarer Meldung stoppen.
- Keine halbfertigen Mischzustände mehr, bei denen nur ein Sprecher echten Lip-Sync bekommt.

Technische Details
- Datei: `src/components/video-composer/SceneDialogStudio.tsx`
  - SRS-Generierung auf „TTS zuerst, Talking-Head danach“ umbauen
  - echte Dauer statt `text.length / 18`
  - Regeneration alter Sub-Szenen bereinigen
- Möglicherweise ergänzend prüfen:
  - `src/components/video-composer/VideoComposerDashboard.tsx` für geordnete Szenenerstellung
  - `supabase/functions/generate-voiceover/index.ts` falls Fallback-Verhalten zu intransparent ist
- Keine neuen Datenbanktabellen nötig, nur Nutzung der bestehenden Szenen-/Audio-Felder.

Erwartetes Ergebnis
- Sarah redet nur während Sarahs Clip.
- Matthew redet nur während Matthews Clip.
- Stimme und Mundbewegung gehören immer zum selben Sprecherblock.
- Eine Neugenerierung ersetzt den alten Dialog-Output sauber statt zusätzlichen Chaos-Output zu erzeugen.