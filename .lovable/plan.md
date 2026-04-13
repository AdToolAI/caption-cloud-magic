
## Plan: Ticker langsamer, mehr James Bond 2028 Stil, Ein/Aus-Toggle

### Änderungen

1. **Animation langsamer machen**
   - `animate-[marquee_60s_...]` → `animate-[marquee_120s_...]` (doppelt so langsam)

2. **Mehr James Bond 2028 Stil**
   - Glow-Linien intensiver: `via-primary/60` statt `via-primary/40`, zusätzlicher `shadow`-Glow
   - LIVE TIPS Badge: stärkerer Glow-Effekt, `font-display` (Playfair Display)
   - Subtiler Gold-Schimmer-Gradient im Hintergrund
   - Text mit leichtem `drop-shadow` für Premium-Feeling
   - Separator ◆ in gedämpfterem Gold für elegantere Trennung

3. **Ein/Aus-Toggle hinzufügen**
   - Rechts im Ticker ein kleiner Toggle-Switch (Power-Icon oder X-Button)
   - Zustand in `localStorage` persistieren (`newsticker-visible`)
   - Wenn ausgeschaltet: Ticker verschwindet mit `AnimatePresence` Slide-Up-Animation
   - Wenn ausgeschaltet: kleiner minimaler "TIPS"-Button am oberen Rand zum Wiedereinschalten
   - Toggle-State als `useState` + `localStorage` in der Komponente selbst

### Betroffene Dateien
- `src/components/dashboard/NewsTicker.tsx` — Styling, Speed, Toggle-Logik
- `src/pages/Home.tsx` — minimal anpassen falls nötig für den minimierten Zustand

### Ergebnis
- Langsamerer, eleganterer Scroll
- Intensivere Gold-Glow-Akzente im Bond-Stil
- User kann Ticker ein-/ausschalten, Präferenz bleibt gespeichert
