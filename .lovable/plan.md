Plan:

1. **Prompt beim Entfernen bereinigen**
   - Wenn ein Charakter aus dem Cast gelöscht wird, entferne ich seine Nennung direkt aus `aiPrompt`.
   - Das gilt sowohl für den freien Prompt als auch für `promptSlots.subject` im strukturierten Prompt.
   - Danach wird `applyCastToPrompt(...)` mit dem neuen Cast erneut angewendet, damit nur die verbleibenden Charaktere im Cast-Marker stehen.

2. **Dialog-Marker als zweite Rückkehr-Quelle verhindern**
   - Falls der entfernte Charakter im automatisch eingefügten `[Dialog] ... [/Dialog]`-Block steht, wird der Dialog-Marker ebenfalls bereinigt bzw. ohne diesen Sprecher neu aufgebaut.
   - Dadurch kann `applyDialogToPrompt(...)` den gelöschten Charakter nicht Sekunden später wieder in den Prompt schreiben.

3. **Entfernt-Liste robuster machen**
   - Die bestehende `dismissedCharacterIds`-Logik bleibt als Sicherheitsnetz erhalten.
   - Zusätzlich wird sie in den vorhandenen Szenen-Persistenzpfaden mitgeführt, damit ein Reload oder DB-Refresh den entfernten Charakter nicht wieder freigibt.

Technische Umsetzung:
- Neue kleine Helper-Funktion, z. B. `removeCharacterFromPrompt(prompt, removedCharacters)`, mit vorsichtigem Regex für Vollname und Vorname.
- Anpassung im `onCastChange` von `SceneCard.tsx`: erst entfernte IDs ermitteln, dann Prompt/Slots/Dialog bereinigen, dann Cast aktualisieren.
- Persistenz ergänzen in `useComposerPersistence.ts` und den Szenen-Hydration-Mappings in `VideoComposerDashboard.tsx` über ein vorhandenes JSON/Array-Feld, ohne neue UI oder Backend-Logik außerhalb dieser Szenendaten.