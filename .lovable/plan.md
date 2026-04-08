

## Plan: Sidebar-Breite korrigieren

### Problem

Die Sidebar in `CapCutSidebar.tsx` (Zeile 546) hat eine eigene Breitenklasse `w-72` (288px), die die `w-80` (320px) des übergeordneten Containers in `CapCutEditor.tsx` überschreibt. Dadurch wird der Inhalt abgeschnitten.

### Lösung

**Datei: `src/components/directors-cut/studio/CapCutSidebar.tsx`**

Zeile 546: `w-72` durch `w-full` ersetzen, damit die Sidebar die volle Breite des Eltern-Containers nutzt (der bereits `w-80` hat).

```typescript
// Vorher:
<div className="w-72 flex flex-col border-r border-[#F5C76A]/10 bg-[#0a0a1a]/90 backdrop-blur-lg h-full">

// Nachher:
<div className="w-full flex flex-col border-r border-[#F5C76A]/10 bg-[#0a0a1a]/90 backdrop-blur-lg h-full">
```

### Dateien

| Aktion | Datei | Änderung |
|--------|-------|----------|
| Edit | `CapCutSidebar.tsx` | `w-72` → `w-full` (Zeile 546) |

### Ergebnis

Sidebar-Inhalt wird vollständig angezeigt, keine abgeschnittenen Buttons mehr.

