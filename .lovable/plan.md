## Problem
`SpeechDurationHint` zählt jedes Wort im Briefing-Textfeld — also auch Szenen-Marker (`SZENE 1`, `**2,5–5,0 Sek.**`), Regie-Anweisungen (`Sprecher 2, modernes Büro, leichter Walk-in:`), Format-Hinweise, Meta-Text und Markdown. Ergebnis im Screenshot: 2420 Wörter → „~968s Sprech-Dauer" bei einem 15s-Skript. Der Hinweis ist dadurch nutzlos und alarmiert fälschlich rot.

## Ziel
Nur den tatsächlich **gesprochenen** Anteil zählen — genauso, wie `detectScriptTimingMode` / `briefing-deep-parse` das Skript segmentieren.

## Änderung
Datei: `src/components/video-composer/briefing/SpeechDurationHint.tsx`

Neue `extractSpokenText(raw)`-Helper-Funktion, die zeilenweise filtert. Eine Zeile zählt **nicht** als Sprache, wenn sie:

1. leer ist oder nur Whitespace enthält
2. mit einem Szenen-/Shot-Marker beginnt: `^SZENE\b`, `^SCENE\b`, `^SHOT\b`, `^SC[\s_-]?\d`, `^\d+[A-Z]?[\).:-]` (z. B. `1A)`, `2.`, `3:`)
3. eine Dauer-/Timing-Zeile ist: enthält `Sek.`/`Sek `/`Sekunden`/`s]`/matcht `\*?\*?\d[.,]?\d*\s*[–-]\s*\d[.,]?\d*\s*Sek`
4. eine reine Key-Value-Meta-Zeile ist: matcht `^[A-ZÄÖÜ][A-Za-zÄÖÜäöüß /&-]{2,40}:\s*.*$` **ohne** dass ein Anführungszeichen (`"`, `„`, `"`, `«`) in der Zeile vorkommt (Regie/Setting/Kamera/Format/Ziel/Kernbotschaft/Tonalität/etc.)
5. eine Markdown-/Bullet-Struktur ist: `^[-*•]\s`, `^#{1,6}\s`, oder nur aus `*`/`_`/`-`/`=` besteht
6. eine reine Klammer-Regieanweisung ist: die ganze Zeile matcht `^[\(\[].*[\)\]]$`

Bei Zeilen die als Sprache zählen: Klammer-Inline-Regieanweisungen (`(schmunzelt)`, `[pause]`) und führende Sprecher-Labels (`SAMUEL:`, `Sprecher 2 —`, `> `, `„`/`"`-Zitat-Wrapper) werden vor dem Wortzählen entfernt, damit „SAMUEL: Hallo Welt" als 2 Wörter zählt.

Danach normale Wort-Zählung + bestehende Tone-Logik. Fallback: wenn nach Filterung 0 Wörter aber Rohtext > 20 Wörter → Komponente rendert nichts (statt Fehl-Alarm).

## Verifikation
- Bestehende Tests laufen weiter.
- Manuell: Briefing aus dem Screenshot einfügen → Anzeige sollte grob den 4 kurzen Dialogzeilen entsprechen (~10–20 Wörter, ~4–8s), nicht 2420/968s.
- Kein Backend-Change, kein Timing-Pipeline-Change.
