
## Zwei Themen

### 1. Edge-Function-Fehler bei `generate-music-track` (Vocal-Tier / MiniMax)

**Beobachtung aus den Logs (`2026-07-14T23:46:19Z`):**
Replicate antwortet mit `422 Unprocessable Entity`, Detail: `input: prompt is required`.
Auf Disk ist `prompt: styleDesc` gesetzt (Zeile 293), also *sollte* das Feld ankommen. Das offizielle Schema (`replicate.com/minimax/music-1.5`) verlangt:
- `lyrics` (10–600 Zeichen, Pflicht)
- `prompt` (10–300 Zeichen, Pflicht)

Wahrscheinlichste Ursachen:
1. Der letzte Fix wurde nicht (sauber) neu deployed – der Runtime-Boot um 23:46:17 kann die alte `song_description`-Version geladen haben.
2. `styleDesc` oder `lyrics` unterschreiten die 10-Zeichen-Untergrenze in Edge-Cases (leerer Prompt / kurze Lyrics).
3. Der Model-Slug `minimax/music-1.5` ist auf Replicate zu `minimax/music-15-internal` weitergezogen – Redirect kann Payload-Validierung verhärten.

**Fix-Plan `supabase/functions/generate-music-track/index.ts`:**
- Pre-Flight-Validierung: `prompt` und `lyrics` beide auf `≥ 10` / `≤ 300` bzw. `≤ 600` Zeichen prüfen. Wenn `styleDesc` kürzer wäre, mit stabilem Filler (`"Cinematic studio production, mastered mix"`) auffüllen.
- `console.log` das exakte `input`-Objekt (ohne Auth) direkt vor `replicate.run`, damit wir bei erneutem Auftreten sicher sehen, welches Payload rausgeht.
- Fehlermeldung an den Client präzisieren: Replicate-`detail` durchreichen (`code: "MINIMAX_VALIDATION"`, `stage: "replicate-input"`), damit die Toast-Nachricht die echte Ursache zeigt statt „non-2xx status code".
- Sicherstellen, dass die Funktion nach dem Edit explizit redeployed wird.

Sonstige Studios (Cast & World, Motion, AI Video, Picture) werden **nicht** angefasst.

### 2. Audit: „Sind unsere Musik-Modelle am 15.07.2026 wirklich State-of-the-Art?"

Aktuelle Verdrahtung:

| Tier | Engine | Stand |
|---|---|---|
| quick | Meta MusicGen | Ende 2023, veraltet |
| adaptive | Stable Audio 2.5 | Anfang 2025, solide für Loops |
| standard | ElevenLabs Music v1 | 2025, gut |
| vocal | MiniMax Music 1.5 | 2025, ok, max 60 s |
| pro | ElevenLabs Music (long) | 2025 |

Zum 15.07.2026 klar überlegen sind u. a. **Suno v5**, **Udio v2** (beide mit stabilem Vocal-Following & 4-min-Tracks), sowie **Stable Audio Open 2** und **ElevenLabs Music v2** falls verfügbar.

**Umsetzung dieses Audit-Punkts:**
- Ich recherchiere in einem separaten Turn per `web_search` / Replicate-Model-Listing den *tatsächlichen* Verfügbarkeitsstand von Suno v5, Udio v2, MusicGen-Melody 2, ElevenLabs Music v2 auf offiziellen APIs bzw. Replicate.
- Ergebnis liefere ich als Kurz-Report (Preis, Latenz, Lang-Format, Vocals, DE-Support) — noch **ohne** Code-Änderung, damit du entscheidest, welche Engines wir zusätzlich verdrahten.

### Reihenfolge

1. Vocal-Fix + Redeploy (`generate-music-track`).
2. Live-Retest mit „song about cocaine" / DE-Lyrics.
3. Danach: Modell-Report 2026, dann in einem Folge-Plan optional neue Engines integrieren.

### Technische Details

- Nur eine Datei berührt: `supabase/functions/generate-music-track/index.ts`.
- Keine DB-Migrations, keine UI-Änderungen im Music Studio in diesem Schritt.
- `useMusicGeneration.ts` bleibt unverändert — es kann die neuen Codes (`MINIMAX_VALIDATION`) bereits über den bestehenden Fallback-Pfad anzeigen.
