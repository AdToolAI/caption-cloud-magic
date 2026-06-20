## v151 — Plate-Identity Swap-Hardening für N≥4 Speaker

### Was passiert ist (Forensik)
- Scene mit 4 Cast (Sarah, Mann, Frau, Matthew) wurde erfolgreich via `bbox-url-pro` lipgesynced — Pipeline + Sync.so funktionieren.
- ABER: Speaker 1 ↔ Speaker 4 (die beiden Außenpositionen) sind im Output vertauscht. Audio von Sprecher 1 läuft auf das Gesicht von Sprecher 4 und umgekehrt.
- Das ist **kein Sync.so-Bug** und **kein bbox-Bug** — der Fehler entsteht **vor dem Dispatch** in `_shared/plate-face-identity.ts`: die per-character Gemini-Probe + Hungarian-Assignment hat die Outer-Faces falsch zugeordnet. bbox-url-pro hat dann die (falsch gelabelten) Boxen perfekt befolgt.

### Warum greift v133 cross-check hier nicht?
Aktueller Gate (`plate-face-identity.ts` Z. 442):
```ts
const isAmbiguous = minConf < 0.55 || minMargin < 0.15;
```
Bei 4 Speakern reicht eine grobe Ähnlichkeit (z. B. zwei Männer mit dunklem Pulli, zwei Frauen mit Kleid) damit Hungarian eine plausible, aber falsche Zuordnung mit `conf=0.7, margin=0.2` findet → cross-check wird übersprungen → Swap bleibt unentdeckt.

### Fix (nur `supabase/functions/_shared/plate-face-identity.ts`)

**A) Cross-check für N≥4 **immer** ausführen (unabhängig von conf/margin)**
- Neuer Block in der `else`-Verzweigung nach Hungarian (Z. 421–490): wenn `N >= 4`, `isAmbiguous = true` erzwingen, damit der `crossCheckAssignment`-Pass garantiert läuft.
- Begründung: 4 Faces × 4 Charaktere = 24 Permutationen, Gemini-Cross-Check ist 1 Call und billig im Vergleich zu einem fehlgeschlagenen Lipsync-Render.

**B) Cross-check verschärfen für N≥3**
- Schwellen anheben: `minConf < 0.70 || minMargin < 0.25` (war 0.55 / 0.15).
- Greift schon bei N=3 wenn das Hungarian-Ergebnis nicht eindeutig ist.

**C) Bei `crossCheck === "rejected"` → Legacy-Multi-Call als Tie-Breaker**
- Aktuell wird bei `rejected` nichts mehr probiert; `ambiguousFinal=true` → Pipeline kippt auf Fallback-Pfade ohne Identity-Map.
- Neu: bei `rejected` + `N >= 3` → `askGeminiForPlateIdentity(...)` (Z. 271) als zweiter Versuch; nur wenn beide widersprechen, bleibt es bei `ambiguous`.

**D) Cache-Bust für diese Szene**
- `plate_face_identity_cache` (oder analoger Cache-Key) hat das alte Ergebnis. Ich erweitere den Cache-Key um eine Versionskonstante `IDENTITY_CACHE_VERSION = "v151"` damit alle alten Einträge automatisch ignoriert werden.

### Was NICHT geändert wird
- `bbox-url-pro` bleibt PRIMARY für N≥2 (v147).
- v148 NOOP-Bypass, v150 Voiced-Ratio-Gate, v149 Master-Watchdog: unverändert.
- Sync.so-Dispatch, ASD-Strategie, Refund-Logik: unverändert.
- Single-Speaker- und N=2-Pfad: unverändert.

### Memory + Plan-Doku
- Neu: `mem/architecture/lipsync/v151-identity-swap-hardening.md`
- Update: `mem/index.md` (Verweis + Core-Regel "N≥4 = always cross-check")
- Update: `.lovable/plan.md`

### Recovery für die aktuelle Szene
Da `passes` schon `done` sind und Sync.so-Kosten geflossen sind, kann ich die Szene nicht automatisch neu rendern. Du musst nach Deploy einmal **"Sauber neu starten"** auf der Szene drücken — der Cache-Bust sorgt dafür, dass v151 die Identity neu auflöst und cross-check zwingend läuft.

### Risiko
- Kosten: +1 Gemini-Vision-Call pro N≥4-Szene (~$0.002). Vernachlässigbar.
- Latenz: +1–2 s vor Dispatch. Akzeptabel.