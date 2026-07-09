## Woher kommt die 50s?

`detectCanonicalBriefingTiming` in `src/hooks/useStoryboardTransition.ts` hat zwei kaputte Stufen:

1. **`Länge: ca. 15 Sekunden` wird nicht erkannt.** Pattern 1 verlangt "Gesamtdauer/Laufzeit/Filmdauer/…", nicht bloß "Länge:". Pattern 4 (`\b(?:film|video|spot)\b …`) matcht "Werbevideo" nicht, weil zwischen "Werbe" und "video" keine Wortgrenze ist.
2. **Zeitfenster-Regex greift auf Alters-Ranges zu.** `windowRe` matcht jeden Zahlen­bereich ohne verpflichtende Zeit-Einheit. Im Briefing stehen:
   - `Alter: 30–45 Jahre` → 45
   - `Alter: 25–40 Jahre` (2×) → 40
   - `Alter: 30–50 Jahre` → **50** ← Maximum

Deshalb kommt der Detector auf `durationSec = 50`. Dann verteilt `applyCanonicalTimingToPlan` das gleichmäßig auf 3 Szenen → 16,67s, gerundet/verschoben zu 12,5/12,5/25 (o. ä.), und `finalizePlanCanonical` meldet "konsistent", weil Projekt-Total und Szenensumme beide 50 sind.

## Warum der manuelle Toggle nicht hält

Der Toggle-Sync im Sheet (`useEffect`) ruft bei jedem Briefing-/Plan-Update erneut `detectCanonicalBriefingTiming` auf und schreibt das Ergebnis zurück ins Projekt-Feld. Solange der Detector 50s liefert, überschreibt er den manuellen Wert bei der nächsten Renderrunde. → Man muss die Wurzel fixen, nicht den Toggle.

## Änderung

Datei: `src/hooks/useStoryboardTransition.ts`, Funktion `detectCanonicalBriefingTiming`.

**Fix A — `Länge:` als Explicit-Total erkennen** (neues Pattern vor die Windows-Stufe):

```
/(?:^|\n)\s*(?:länge|laenge|film[- ]?länge|film[- ]?laenge|video[- ]?länge|video[- ]?laenge|spot[- ]?länge|spot[- ]?laenge)\s*[:=\-–—]\s*(?:ca\.?\s*)?(\d+(?:[,.]\d+)?)\s*(?:sekunden|sek\.?|seconds|secs?|s)\b/i
```

**Fix B — Werbevideo/Werbespot/Werbefilm matchen** in Pattern 4:
`\b(?:film|video|spot|werbe(?:video|film|spot)|werbespot|werbevideo|werbefilm|imagefilm|ad)\b`.

**Fix C — Alters-Ranges aus `windowRe` ausschließen.** Windows-Loop erweitern:
- Fenster verwerfen, wenn im Text unmittelbar nach `end` (nächste ~15 Zeichen) `Jahre|Jahren|years?|yrs?|y\.o\.?|jährig|jaehrig` steht.
- Zusätzlich: Fenster nur akzeptieren, wenn **entweder** die Einheit-Gruppe (`s|sek|sekunden|seconds|sec`) tatsächlich mit-konsumiert wurde **oder** in derselben Zeile ein Timing-Anker (`Zeit:`, `Timing`, `Sek`, `–` vor Sekundenzahl, Timeline-Bullet `0[.,]?\d*[–-]`) auftaucht. Reine "30–50"-Bereiche ohne Kontext fallen raus.

## Verifikation

- Bestehende Tests grün: `src/hooks/__tests__/useStoryboardTransitionTiming.test.ts`, `src/lib/video-composer/briefing/__tests__/finalizePlanCanonical.test.ts`.
- Neue Testfälle in `useStoryboardTransitionTiming.test.ts`:
  - AdTool-Briefing (aus dieser Frage) → `{ durationSec: 15, sceneCount: 3, source: 'explicit-total' }`.
  - Standalone `"Alter: 30–50 Jahre"` → `null`.
  - `"Länge: ca. 15 Sekunden"` allein → `15`, source `explicit-total`.
- Manuell: gleiche Briefing-Eingabe → Sheet zeigt "15s · 3 Szenen · Konsistent", S01 5s, S02 5s, S03 5s. Manueller Toggle auf 15s bleibt stabil, weil der Detector jetzt selbst 15s liefert.

Kein Backend-Change, keine Änderung an Lip-Sync / compose-* / render-Pfad.