## 1. Step 4 — Track-Liste aufräumen

**Datei:** `src/components/universal-creator/AudioAssetSelector.tsx`

- Karten-Render der Bibliothek (Zeilen 463-503) reduzieren auf: **Thumbnail (oder Music-Icon-Fallback) + Titel + Play + Auswählen + Löschen**. Genre-/Mood-Badges und die `…s`-Sekundenanzeige entfernen.
- Titel visuell säubern: trailing `, NN seconds` / `, NNs` per regex aus dem angezeigten String strippen (DB unverändert).
- Duplikate zusammenfassen: neuer `dedupedMusicTracks`-Memo, Key = `url || title`.
- Gleiche Cleanup-Anzeige auch in der „Selected Track"-Card (Zeile 391-407).

## 2. Step-Persistenz Bug

**Datei:** `src/pages/UniversalCreator/UniversalCreator.tsx`

- `useEffect`-Deps in Zeile 273 um `currentStep` erweitern, damit ein Step-Wechsel sofort in `localStorage` gespeichert wird und nach Tab-Wechsel der korrekte Step wiederhergestellt wird.

## Scope
Reine Frontend-Änderungen. Keine DB, keine Edge Functions, kein neues Datenmodell.