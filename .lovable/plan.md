# Block K — Polishing-Plan

Block K (Structured Prompt Composer) ist funktional komplett. Dieser Plan macht das Tool für Power-User **deutlich schneller** und liefert kleine, aber spürbare UX-Wins.

## K-P1 — Tastatur-Shortcut für Free ↔ Structured Toggle
**Problem:** Aktuell muss der User scrollen + klicken, um zwischen Modi zu wechseln.

**Lösung:** Globaler Shortcut `⌘/Ctrl + Shift + S` schaltet den Modus der **aktuell fokussierten Szene** um. Visuelles Feedback über kurzes Highlight am Toggle-Button.

**Dateien:**
- `src/components/video-composer/SceneCard.tsx` — `useEffect` mit `keydown`-Listener, nur aktiv wenn die Karte den DOM-Fokus hat (`cardRef.current?.contains(document.activeElement)`)
- Toggle-Button bekommt `title`-Tooltip mit Shortcut-Hinweis (DE/EN/ES)

**Acceptance:**
- Shortcut funktioniert nur, wenn Cursor in der Szene ist (kein globales Hijacking)
- Wechsel respektiert die bestehende Free→Struct / Struct→Free Logik (kein Datenverlust)
- Tooltip zeigt `⌘⇧S` auf Mac, `Ctrl+Shift+S` auf Win/Linux (via `navigator.platform`)

---

## K-P2 — Drag-Reorder der 6 Slots
**Problem:** Manche Stories brauchen "Setting first" (Establishing Shot) statt "Subject first". Aktuell ist die Reihenfolge fix.

**Lösung:** Slots werden mit `@dnd-kit/sortable` (bereits im Projekt für Storyboard) per Drag-Handle umsortiert. Reihenfolge wird **pro Szene** in einem neuen Feld `promptSlotOrder?: (keyof PromptSlots)[]` gespeichert; fehlt sie, gilt die Default-Reihenfolge aus `SLOT_KEYS`.

**Stitching:** `stitchSlots()` in `src/lib/motion-studio/structuredPromptStitcher.ts` bekommt einen optionalen 2. Parameter `order?: (keyof PromptSlots)[]` und iteriert in dieser Reihenfolge statt hart-codierter Subject→Action→… Sequenz.

**Dateien:**
- `src/types/video-composer.ts` — neues optionales Feld `promptSlotOrder`
- `src/lib/motion-studio/structuredPromptStitcher.ts` — `stitchSlots(slots, order?)` Signatur erweitern (rückwärts-kompatibel)
- `src/components/motion-studio/StructuredPromptBuilder.tsx` — `SortableContext` + Drag-Handle (`GripVertical`-Icon) links neben jedem Slot
- `src/components/video-composer/SceneCard.tsx` — `order`-Prop durchreichen + bei `onUpdate` mit speichern

**Acceptance:**
- Drag funktioniert nur am Handle, Textareas bleiben editierbar
- Reihenfolge persistiert über Auto-Save (bestehender Flow in Composer)
- Multi-Engine-Preview respektiert Reihenfolge (passiert automatisch via stitchSlots)
- Negative-Slot kann nirgendwo hin gezogen werden, **bleibt immer am Ende** (Negative-Tag muss am Schluss stehen, sonst ignorieren manche Modelle ihn)

---

## K-P3 — Slot-History (Undo pro Slot)
**Problem:** Wenn die KI-Suggestion einen guten Slot überschreibt, ist der alte Wert weg.

**Lösung:** Pro Slot ein kleiner `↶`-Button rechts neben dem ✨-AI-Button, der die letzten **3 Werte** zurückbringt. History lebt **nur in React-State** (kein DB-Schreiben — Werte sind kurzfristige Working-Memory).

**Dateien:**
- `src/components/motion-studio/StructuredPromptBuilder.tsx`:
  - Neuer State `const [history, setHistory] = useState<Record<keyof PromptSlots, string[]>>({...})`
  - In `updateSlot()`: alten Wert in History pushen (max 3, ältester fliegt raus)
  - Kleiner Popover mit den 3 letzten Werten beim Klick auf `↶`

**Acceptance:**
- History-Button erscheint nur wenn `history[key].length > 0`
- Click auf einen alten Wert → Slot wird zurückgesetzt + neuer aktueller Wert kommt in History
- Geht nach Mount/Unmount verloren (bewusst — sonst zu viel State)

---

## K-P4 — "Tab-zum-nächsten-Slot" Navigation
**Problem:** Im Structured Mode ist Tab das Standard-Browser-Verhalten — springt aber durch Buttons (KI/Undo) bevor es zum nächsten Textfeld kommt.

**Lösung:** `tabIndex={-1}` auf alle Slot-Buttons (KI, Undo). Tab/Shift+Tab springt damit nur zwischen den 6 Textfeldern.

**Dateien:**
- `src/components/motion-studio/StructuredPromptBuilder.tsx` — 1-Zeilen-Fix pro Button

**Acceptance:**
- Tab-Reihenfolge: subject → action → setting → timeWeather → style → negative
- Buttons sind weiterhin per Maus klickbar
- Screen-Reader bekommen Buttons immer noch via `aria-label`

---

## Reihenfolge & Aufwand

1. **K-P4** (5 min) — Schnellster Win, sofort spürbar
2. **K-P1** (15 min) — Shortcut + Tooltip-Lokalisierung
3. **K-P3** (25 min) — Reine Frontend-Logik, kein DB-Touch
4. **K-P2** (45 min) — DB-Feld + Stitcher-Signatur + Drag-UI

**Gesamt:** ~90 min, **0 Migrationen** (`promptSlotOrder` ist client-only solange wir es nicht persistieren — falls gewünscht, später als JSON-Spalte zu `composer_scenes` hinzufügen)

---

## Was bewusst NICHT enthalten ist

- **Slot-Templates pro Genre** — gehört in den `StylePresetPicker` (Block K-4), nicht in den Builder
- **Live-Translation Vorschau** — würde pro Tastendruck eine Edge-Function aufrufen (zu teuer)
- **Voice-Input für Slots** — anderer Block, eigene Permissions

## Offene Frage

Soll **K-P2 (Drag-Reorder)** die Reihenfolge in der DB persistieren (→ kleine Migration für `composer_scenes.prompt_slot_order TEXT[]`) oder reicht es, die Reihenfolge im bestehenden `prompt_slots JSONB` als Object-Key-Order zu speichern (kein Schema-Change, aber JS-Object-Key-Order ist nicht 100% garantiert)?

**Default-Empfehlung:** Migration mit `prompt_slot_order TEXT[]` — 1 zusätzliche Spalte, sauber und explizit.