# Universal Director's Cut — Verifizierungs-Ergebnis & Cleanup-Plan

## TL;DR

Alle Welle-1–4-Fixes sind sauber verdrahtet. **Keine Critical- oder High-Bugs.** Das System ist voll funktionsfähig und kann in Produktion.

Der Audit hat aber 2 Medium- und 3 Low-Findings gefunden, die keine akuten Bugs sind, aber Ballast und latente Footguns darstellen. Ich empfehle einen kleinen "Welle 5 — Housekeeping"-Sweep, der in ~10 Minuten durch ist.

---

## Ergebnis der 8 Prüf-Bereiche

| # | Bereich | Status |
|---|---|---|
| 1 | `useTransitionRenderer` (Single-RAF, isPlayingRef, Z-Index-Handoff) | ✅ PASS |
| 2 | `SceneTrimInspector` (onValueCommit, kontrollierte Inputs, Draft-Sync) | ✅ PASS |
| 3 | `CapCutEditor` (Idempotenz, Split-Mapping, Undo-Commits, Audio-Threshold) | ✅ PASS |
| 4 | `DirectorsCutPreviewPlayer` (RAF-Slot-Watcher, Ended-Gate, Head-Trim) | ✅ PASS (2 Medium) |
| 5 | `DirectorsCut.tsx` (Dep-Arrays) | ✅ PASS |
| 6 | `useEditorHistory` (cheapEquals, Debounce, Sync-Flush) | ✅ PASS (1 Low) |
| 7 | Transition-Resolver (Preview ↔ Remotion-Render Parität) | ✅ PASS |
| 8 | `timelineAnchors` (Wachstum bei Append) | ✅ PASS |

---

## Welle 5 — Housekeeping (optional, empfohlen)

### Medium 1: Toter Code im Preview-Player entfernen
- **Datei:** `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx:937–959`
- **Was:** Ein zweiter `findActiveTransition`-Zweig in der Tick-Loop, der niemals erreicht wird — der erste Zweig bei Zeile 701–722 fängt alle nicht-eingefrorenen Transitions ab und `return`t.
- **Warum entfernen:** Wenn irgendwann jemand oberhalb eine `visualTimeRef`-Mutation einbaut, aktiviert sich der tote Code lautlos wieder und produziert Doppel-Handoffs.
- **Aktion:** Zweig ersatzlos löschen, kurzer Kommentar warum.

### Medium 2: Slot-Watcher-RAF gaten
- **Datei:** `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx:1630–1637`
- **Was:** Der RAF-Slot-Watcher läuft permanent, auch wenn pausiert und keine Transition aktiv ist.
- **Aktion:** RAF nur starten, wenn `isPlayingRef.current === true` **oder** eine Transition im Fenster liegt. Sonst per Event (`visibilitychange` + Slot-Flip) neu anstoßen. Spart CPU/Akku bei Hintergrund-Tabs.

### Low 1: `cheapEquals` Fast-Path für Szenen
- **Datei:** `src/hooks/useEditorHistory.ts:59–62`
- **Was:** Bei Referenz-Diff pro Array-Item wird volles `JSON.stringify` gemacht. Bei 30+ Szenen mit Thumbnails ist das immer noch teuer.
- **Aktion:** Vor dem Stringify-Fallback ein Field-Whitelist-Check der performance-kritischen Keys (`id`, `start_time`, `end_time`, `original_start_time`, `original_end_time`, `duration`, `muted`, `volume`). Wenn diese identisch sind, als gleich behandeln.

### Low 2 & 3 (info, kein Fix nötig)
- `reset()`-Closure über stale `state` in `useEditorHistory` — nur latenter Footgun, kein aktueller Aufrufer trifft es. **Keine Änderung nötig**, aber im Kommentar dokumentieren.
- `handleTrimScene`-Guard bei 0.001s (spec sagte ~0.01s) — funktioniert korrekt, Slider liefert nie < 1ms Deltas. **Keine Änderung**.
- Redundanter Dep `resolvedTransitions` + `transitions` in `useTransitionRenderer:440` — harmlos, aber sauberer wäre nur `transitions`. **Optional 1-Zeilen-Fix**.

---

## Empfehlung

Freigabe für **Welle 5 Housekeeping** (Medium 1 + Medium 2 + Low 1 + der 1-Zeilen-Dep-Cleanup). Danach ist der Director's Cut auf allen 8 Achsen sauber und produktionsreif — keine offenen Findings mehr.

Alternativ: Alles so lassen, denn nichts davon ist ein User-facing Bug. In dem Fall gebe ich dir grünes Licht zum Launchen.

Was möchtest du?