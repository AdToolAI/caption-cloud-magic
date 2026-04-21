

## Bugfix: Leerzeichen in „Protagonist" und „Konflikt" werden geschluckt

### Das Problem

In `BriefingTab.tsx` werden beide Felder gemeinsam in `briefing.targetAudience` gespeichert (Format: `"Protagonist: ... | Conflict: ..."`). Beim Re-Render wird der Wert per Regex zurückgelesen — und dabei steht ein `.trim()` am Ende:

```ts
const protagonist = raw.match(/Protagonist:\s*([^|]*)/)?.[1]?.trim() || '';
const conflict    = raw.match(/Conflict:\s*([^|]*)/)?.[1]?.trim() || '';
```

Da das `<Input>` controlled ist (`value={storyMeta.protagonist}`), passiert bei jedem Tastendruck:

1. User tippt `"Maya "` (mit Space am Ende)
2. State wird auf `"Protagonist: Maya  | Conflict: ..."` gesetzt
3. Re-Render → Regex liest aus → `.trim()` macht daraus `"Maya"`
4. Input zeigt wieder `"Maya"` — der Space ist weg

→ **Es ist unmöglich, irgendwo ein Leerzeichen am Ende eines Wortes zu setzen**, was beim Tippen jedes mehr-Wort-Satzes nervt.

### Der Fix

`.trim()` aus dem Lese-Pfad entfernen — der Regex `[^|]*` schließt das `|`-Trennzeichen bereits sauber aus, also ist Trimming hier unnötig. Stattdessen wird beim Speichern in `targetAudience` gepuffert (mit Leerzeichen-Padding um `|` für saubere Persistenz).

**Geänderte Datei:** `src/components/video-composer/BriefingTab.tsx` (Zeilen 232-245)

Konkrete Änderung:
- Lese-Regex behält Leerzeichen bei (kein `.trim()` mehr beim Lesen)
- Schreib-Funktion bleibt wie sie ist (Format `"Protagonist: X | Conflict: Y"` ist stabil)
- Falls beim finalen Submit (Storyboard-Generierung) trailing Spaces unschön wären, kann die Konsumenten-Seite trimmen — der Editor selbst darf nicht trimmen, solange der User tippt.

### Risiko & Rollback

- **Risiko: Sehr niedrig.** Reine UX-Korrektur, keine DB-/API-Änderung.
- **Rollback:** Git-Revert der einen Datei.

### Aufwand

~2 Minuten Implementierung, sofort testbar im Briefing-Tab unter Kategorie „Storytelling".

