## Ziele
1. **Dauer-Slider entfernen** im Music Studio – die Songlänge wird effektiv durch die Lyrics gesteuert (aktueller Track: 2:22 statt der versprochenen max. 60s).
2. **„Neues Projekt"-Button** hinzufügen, damit der komplette Studio-State (Prompt, Lyrics, Genre, Mood, letzter Track) mit einem Klick zurückgesetzt werden kann – aktuell bleibt beim erneuten Generieren gefühlt derselbe Song hängen, weil der State weiterlebt.

## Änderungen

**`src/pages/MusicStudio.tsx`**
- „Dauer"-Slider-Block (Label + Slider) entfernen.
- `duration`-State entfernt; stattdessen intern Default pro Tier senden (z. B. `MUSIC_TIER_PRICING[tier].maxDuration` als Obergrenze, Provider entscheidet real). Cost-Anzeige nutzt bereits `maxDur` als Fallback.
- Neuer Button **„Neues Projekt"** oben rechts im Studio-Header (neben Tier-Auswahl / über der Prompt-Card). Icon `RotateCcw`.
  - Reset: `prompt=""`, `lyrics=""`, `genre=default`, `mood=default`, `bpm/key=""`, `instrumental=false`, `lastTrack=null`, `language=browserDefault`.
  - Bestätigt via kurzem `confirm()` nur wenn `prompt` oder `lyrics` gefüllt sind.
- Kleiner Hinweis unter Lyrics: „Songlänge wird durch die Lyrics bestimmt (Ø 1–3 min)."

**`src/hooks/useMusicGeneration.ts`**
- `durationSeconds` bleibt optional im Payload – Studio sendet dann keinen Wert mehr, Edge-Function nutzt Provider-Default. Keine Breaking Change für `MusicGeneratorPanel` (Audio Studio) nötig.

## Nicht Teil dieses Plans
- Keine Änderungen am Edge-Function-Verhalten oder an anderen Music-Panels.
- Kein Serverside-Caching-Check – falls „gleicher Song" nach Reset weiterhin auftritt, adressieren wir das in einem Folge-Turn (z. B. Seed randomisieren im MiniMax-Payload).
