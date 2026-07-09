## Problem

Der Speaker-Mapper zeigt Müll-Labels wie "Die Botschaft des Vide", "Medium Close", "Halbnaher Tracking", "Empfohlen", "Studio", "On", "Text" usw. Diese sind keine Sprecher, sondern Bullet-/Sektionsüberschriften aus dem Briefing. Ursache: die Regex `speakerRe` in `detectBriefingFidelity` (`src/hooks/useStoryboardTransition.ts:333`) matcht jeden großgeschriebenen Zeilenanfang gefolgt von `:` oder `-`. Damit rutscht praktisch jede Aufzählung durch.

## Fix — 2 kleine, chirurgische Änderungen

### 1) Detector härten — `src/hooks/useStoryboardTransition.ts` (Zeile 322–346)

Neue Akzeptanz-Regel für ein Label ("was ist ein Sprecher?"):

- **Screenplay-Konvention**: ALL-CAPS Ein- oder Zwei-Wort-Label direkt vor Doppelpunkt / Gedankenstrich (`SAMUEL:`, `SPRECHER 1 —`, `MATTHEW DUSATKO:`). 1–3 Tokens, keine Kleinbuchstaben.  
  ODER
- **Cast-Match**: Label matcht (case-insensitiv, normalisiert) einen bereits gebrieften `characters[].name` oder dessen erstes Wort.

Alles andere wird verworfen. Zusätzlich:
- Bindestrich `-` als Trenner NUR akzeptieren, wenn er von Whitespace umgeben ist (`SAMUEL — Text`), damit "Medium Close-up" nicht mehr matcht.
- Zeichenlimit von 40 auf 32 reduzieren.
- Deny-List erweitern um: `setting`, `location`, `endcard`, `hook`, `cta`, `optional`, `empfohlen`, `nicht`, `text`, `on`, `off`, `studio`, `helles`, `medium`, `close`, `wide`, `pan`, `tracking`, `push`, `cinematic`, `perfekter`, `realistische`, `split`, `creator`, `nach`, `da`, `sondern`, `create`.

Damit fällt LITERAL-Modus für Briefings, die gar kein echtes Skript enthalten, sauber auf 0 Labels zurück — und die Mapper-Karte verschwindet automatisch (`ScriptSpeakerMapper` bricht schon jetzt bei `speakerLabels.length === 0` ab).

### 2) Mapper defensiv — `src/components/video-composer/briefing/ScriptSpeakerMapper.tsx`

Aktuell wird für jedes Label per `autoMatch` fuzzy geraten und die Dropdowns zeigen "Auto → Roger" o.ä. Der User will: **wenn kein sicherer Match, dann leer lassen**.

- `autoMatch` verschärfen: nur Match, wenn normalisierter Charakter-Name **gleich** oder **exakter Präfix/Suffix** des Labels ist (keine `includes`-Substrings mehr). Zwei-Wort-Labels wie "MATTHEW DUSATKO" matchen weiter, "Studio" ↔ irgendwas nicht.
- Wenn `autoMatch` `null` liefert, bleibt der Select auf `AUTO` mit Anzeige "(kein Match)" — Kunde wählt selbst. (Verhalten ist bereits so; die Regex-Verschärfung räumt nur die Auto-Fehlmatches ab.)
- Wenn nach dem Filter **kein einziges Label** einen Charakter matcht UND weniger als 2 Labels übrig sind, ganze Karte ausblenden.

## Technische Details

```text
Label-Akzeptanz-Filter (Pseudo):
  token1..N = split(rawLabel, /\s+/)
  if N > 3 → reject
  if any token contains lowercase letters:
     → accept only if fuzzyEqualsCharacter(rawLabel)
  else (all-caps):
     → accept unless in denyList
```

Keine Änderungen an Backend, Parser, Apply-Hook oder anderen Konsumenten von `detectBriefingFidelity` (nur `hasSpeakerLines`/`speakerLabels` werden strenger — LITERAL-Modus bleibt für echte Skripte aktiv).

## Verifikation
- User-Screenshot-Briefing → 0 Fake-Labels, Mapper-Karte verschwindet.
- Echtes Skript mit `MATTHEW:` / `SAMUEL:` → Labels erkannt, LITERAL bleibt an.
- Typecheck grün.