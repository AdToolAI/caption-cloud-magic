# UDC Status — Wave 4 Abschluss & Restarbeiten

## Wo wir stehen

**Ziel:** Universal Directors Cut als erste "Consistency-First" AI-native NLE positionieren.

### Fertig (Waves 1–4)

**Wave 1 — Trust Fixes (Export/Preview)**
- C1 Multi-Track-Audio-Export ✓
- C3/C4 Resource Leaks (RAF/Loops) ✓
- H1 Music Volume Preview↔Render Parity ✓
- H6 Blackscreen/Media-Scene Logic ✓

**Wave 2 — Stability**
- C2 Voiceover-Duration ✓
- H2 Subtitle Styling ✓
- H3 Transition Easing Parity ✓
- H4 Undo/Redo Race ✓
- H5 Poll-Restart ✓
- M5 Orphan-Transitions Prune ✓
- M6 SubtitleSafeZone ✓

**Wave 3 — UX**
- M2 Shortcut Overlay ✓
- M3 Autosave-Indikator ✓
- M4 Waveform-Cache + In-Flight-Dedup ✓
- M9 Enhanced Snap-Feedback ✓
- M10 Action-Log Toasts ✓

**Wave 4 — Consistency-Moat (Alleinstellungsmerkmal)**
- W4.1 Global Voice-Lock ✓ (`AIVoiceOver.tsx` + `localStorage`)
- W4.2 CI-Preflight ✓ (`ciPreflight.ts` + `CIPreflightDialog.tsx` → blockt Export bei fail)
- W4.3 Anchor-Refresh ✓ (`anchorRefresh.ts` + `AnchorRefreshDialog.tsx` → Toolbar-Anchor mit Live-Drift-Badge)
- W4.4 Auto Cut-Down ✓ (`autoCutDown.ts` + `AutoCutDownDialog.tsx` → Toolbar-Scissors, 15s/6s Presets)

### Verdrahtung — geprüft

Alle 4 Wave-4-Module hängen in `CapCutEditor.tsx`:
- Toolbar-Buttons: Anchor (Drift-Badge), Scissors (Cut-Down), Keyboard (Shortcuts)
- Dialog-Mounts am File-Ende (`AnchorRefreshDialog`, `AutoCutDownDialog`, `CIPreflightDialog`, `ShortcutOverlay`)
- Alle Aktionen laufen durch `commitHistory()` → Undo-fähig
- `handleExportVideo` ruft `runCIPreflight` vor Lambda-Call
- Voice-Lock hydratisiert automatisch beim Öffnen von `AIVoiceOver`
- Auto Cut-Down erzeugt neue Scene-IDs (`__cd15`/`__cd6`), Anchor-Preservierung via `original_start_time`

Typecheck ist grün.

## Was noch offen ist

### Wave 4 Ergänzungen (optional, aber wirkungsvoll)
- **W4.5 Cut-Down als separater Export** — aktuell _ersetzt_ Auto-Cut-Down die Timeline. Alternative: als neues Projekt/Snapshot speichern, damit der Master erhalten bleibt.
- **W4.6 CI-Preflight erweitern** — aktuell prüfen wir Duration, Voice-Lock, Subtitle-Contrast. Zusätzlich sinnvoll: Aspect-Ratio-Konsistenz, fehlende Endcard/Logo, Loudness-LUFS-Check.
- **W4.7 Anchor-Refresh Batch-Preview** — Thumbnails der "gedriftteten" Frames vs. "Anchor"-Frame nebeneinander zeigen, bevor gesnappt wird.

### Wave 5 — Skalierung & Polish (bislang nicht angefasst)
- **M7 Thumbnail-Cache** (transitioned, aber nicht implementiert)
- **M8 Keyboard-Shortcut-Erweiterungen** (J/K/L Playback, I/O Marker)
- **L1 Multi-Selection auf Timeline** (Shift-Click, Ripple-Move für Gruppen)
- **L2 Nested Sequences** (Szenen-Gruppen als eine Einheit behandeln)
- **L3 Proxy-Rendering** (niedrig aufgelöste Preview-Proxys für lange Timelines)

### Offene technische Schulden (aus dem 23-Findings-Audit)
- Keine kritischen (C-) oder Highs (H-) mehr offen.
- Restliche Mediums (M1, M8) und Lows (L*) sind Politur, kein Blocker für zahlende Kunden.

## Meine Empfehlung

**UDC ist launch-ready für zahlende Kunden.** Die Consistency-Moat-Features (Voice-Lock + CI-Preflight + Anchor-Refresh + Auto-Cut-Down) sind das Alleinstellungsmerkmal, das kein CapCut/Descript-Klon hat.

Nächster sinnvoller Schritt — bitte eine Option wählen:

1. **W4.5 (Cut-Down als Snapshot)** — verhindert dass User versehentlich ihren Master überschreiben. ~30 Min.
2. **W4.6 (Preflight-Erweiterung)** — mehr Trust-Signale vor teurem Lambda-Render. ~1h.
3. **W4.7 (Anchor-Refresh Preview-UI)** — Sicht-vor-Snap für kritischere User. ~1h.
4. **UDC abschließen** und weiter mit Onboarding/Pricing/Conversion für erste Kunden.

Sag mir welche Option (oder gib eine andere Richtung an), dann setze ich um.
