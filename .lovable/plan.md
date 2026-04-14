

## Plan: Storytelling Sub-Modi — "KI erfindet" vs. "Wahre Geschichte"

### Idee
Die allererste Frage im Storytelling-Modus wird eine Weichenstellung: **"Soll die KI eine Geschichte erfinden oder hast du bereits eine wahre Geschichte?"** Danach passen sich alle Folgefragen an den gewählten Sub-Modus an.

### Umsetzung

**1. Edge Function `universal-video-consultant/index.ts`**

- **Block 1 Storytelling-Fragen anpassen**: Die erste Frage wird zur Sub-Modus-Wahl:
  - DE: "Möchtest du, dass die KI eine Geschichte für dich **erfindet**, oder hast du bereits eine **wahre Geschichte** die wir aufbereiten sollen?"
  - EN/ES analog
- Die Folgefragen (Phase 2-4) werden je nach Antwort dynamisch:
  - **"KI erfindet"**: Genre, Zielgruppe, gewünschte Emotion, Setting/Welt
  - **"Wahre Geschichte"**: Erzähl mir was passiert ist, wer war beteiligt, was war der Wendepunkt, was ist die Botschaft
- Im **System-Prompt** wird der Sub-Modus erkannt (via Keyword-Matching in der Konversation: "erfinden/invent/inventar" vs. "wahr/true/real/verdadera") und die KI-Rolle entsprechend angepasst:
  - Erfinden → "Du bist ein kreativer Autor, entwickle eine fesselnde fiktive Story basierend auf den Vorgaben"
  - Wahre Geschichte → "Du bist ein einfühlsamer Interviewer, extrahiere die Kernelemente der wahren Geschichte und forme sie in eine emotionale Erzählung"

- **Block 2 Storytelling-Phasen anpassen** (`CATEGORY_SPECIFIC_PHASES`):
  - **Erfinden**: Genre, Welt/Setting, Protagonist-Details, Plot-Twist, visueller Stil, Erzählperspektive
  - **Wahre Geschichte**: Chronologie, beteiligte Personen, emotionaler Höhepunkt, authentische Details, Lektion/Moral, wie nah an der Realität

- **Quick Replies** für die erste Frage anpassen: "KI erfindet eine Story" / "Ich habe eine wahre Geschichte"

**2. Frontend `translations.ts`**
- `consultantFirstQuestion_storytelling` aktualisieren auf die Sub-Modus-Frage (DE/EN/ES)

**3. Quick Replies `CATEGORY_QUICK_REPLIES_BLOCK1`**
- Storytelling Phase 1: `["KI erfindet eine Story", "Ich habe eine wahre Geschichte"]` (DE/EN/ES)

### Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `supabase/functions/universal-video-consultant/index.ts` | Block 1 + Block 2 Storytelling-Phasen, Prompt-Logik für Sub-Modus-Erkennung, Quick Replies |
| `src/lib/translations.ts` | Erste Frage für Storytelling aktualisieren |

### Ergebnis
- Storytelling startet mit klarer Weichenstellung
- "KI erfindet" → KI fragt nach Genre, Setting, Stimmung und baut eine komplette Story
- "Wahre Geschichte" → KI interviewt einfühlsam, extrahiert Details und formt daraus ein Video-Skript
- Alle Folgefragen sind auf den Sub-Modus zugeschnitten

