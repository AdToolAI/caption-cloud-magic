# Den "In echte Szene einbauen"-Button sichtbar machen

## Was schiefgelaufen ist

Der Button existiert im Code (`SceneCard.tsx` Zeile 566–579), aber er rendert als **winziger inline-Pill direkt neben dem Engine-Badge** in der Meta-Zeile der Szene. Auf deinem Screenshot ist diese Zeile schmal und vollgepackt mit Badges (`Hook · 3.7s · €0.30 · Fertig · HeyGen Lip-Sync · Mit Referenzbild`). Die Action-Spalte rechts mit den drei großen Buttons (`Neu generieren`, `In Mediathek`, `Continuity ✓`) ist die einzige Stelle, an der man wirklich hinschaut.

Außerdem: SceneCard wird im **Storyboard-Tab** verwendet, du bist aber im **Clips-Tab** (siehe Sidebar `03 Clips`). Der Clips-Tab hat seine eigene Render-Komponente (`ClipsTab.tsx`) und zeigt SceneCard gar nicht an. Mein Button war daher im Clips-Tab nie sichtbar.

## Plan

### 1. Den Button in die rechte Action-Spalte des Clips-Tabs verlegen

In `src/components/video-composer/ClipsTab.tsx` direkt nach dem `Neu generieren`-Button (Zeile 968–985) einen neuen prominenten Button einfügen:

```text
┌─────────────────────────────────────┐
│ ↻ Neu generieren €0.30              │  ← bestehend
│ 🎬 In echte Szene einbauen €0.95   │  ← NEU (grün, emerald-Akzent)
│ 💾 In Mediathek                     │  ← bestehend
│ 🔗 Continuity ✓                     │  ← bestehend
└─────────────────────────────────────┘
```

Sichtbarkeitsregel:
- `scene.clipStatus === 'ready'`
- `engineRec.engine === 'heygen-talking-head'` (nur auf HeyGen-Szenen — bei B-Roll macht Cinematic-Sync keinen Sinn)
- Single-Speaker (Multi-Speaker bleibt bei HeyGen Shot-Reverse-Shot)

Klick-Verhalten:
1. `onUpdateScenes` mit `engineOverride: 'cinematic-sync'` und `clipSource: 'ai-hailuo'` (falls noch HeyGen-only gesetzt) für die Szene.
2. Direkt danach `handleGenerateSingle(scene)` triggern → re-rendert via Hailuo i2v + auto-Lip-Sync (Pipeline ist schon implementiert).
3. Toast: "Wechsel zu Cinematic-Sync — Hailuo rendert die Szene neu, Lip-Sync läuft danach automatisch (~2 Min)."

### 2. Bestätigungs-Dialog vor dem Re-Roll

Da der bestehende Clip dabei verworfen wird, vor dem Trigger einen kleinen `AlertDialog` zeigen (Pattern: `setRerollTarget` existiert schon Zeile 976). Inhalte:
- Vorher/Nachher-Erklärung in einem Satz
- Kostendelta sichtbar (`+€0.65 vs. aktueller HeyGen-Render`)
- Buttons: "Abbrechen" / "🎬 Cinematic-Sync starten €0.95"

### 3. Inline-Pill in SceneCard.tsx aufräumen

Die kleine inline-Variante in `SceneCard.tsx` (Zeile 566–579) entfernen — sie wird durch den prominenten Action-Button im Clips-Tab ersetzt. Der Engine-Override-Select bleibt, aber als reiner Dropdown ohne Doppel-Button. Das hält das Storyboard-Layout aufgeräumt.

### 4. Hint-Banner über der ersten HeyGen-Szene

Wenn ≥1 Szene auf HeyGen läuft, einmal pro Projekt einen dezenten Hinweis im Clips-Tab oben anzeigen (dismissible per `localStorage`):

> 💡 **Tipp:** Deine HeyGen-Szenen zeigen den Avatar vor neutralem Hintergrund. Klicke auf einer fertigen HeyGen-Szene auf **🎬 In echte Szene einbauen**, um die Person stattdessen in deine Wunsch-Szene mit Hailuo zu rendern (Artlist-Style). +€0.65/Szene.

So findet jeder User die Funktion — auch ohne dass ich sie im Chat erkläre.

## Was sich für dich ändert

- Auf Szene 1 & 2 erscheint rechts unter "Neu generieren" ein neuer grüner Button **🎬 In echte Szene einbauen €0.95**.
- Ein Klick zeigt einen Confirm-Dialog, wechselt die Engine auf `cinematic-sync` und rendert die Szene neu — diesmal mit Hailuo i2v (Charakter in echter Storyboard-Szene) + automatischem Sync.so-Lip-Sync.
- Pipeline-Logik (Auto-Trigger, Cut-off-Sync-Mode, Refund) ist bereits aus dem letzten Schritt deployed — es fehlt nur die sichtbare UI-Stelle.

## Technische Details

- Datei: `src/components/video-composer/ClipsTab.tsx` — neuer Button-Block zwischen Zeile 985 und 987.
- Datei: `src/components/video-composer/SceneCard.tsx` — Inline-Pill (Zeilen 566–579) entfernen.
- Neuer State: `cinematicSwitchTarget` analog zu `rerollTarget` für den Confirm-Dialog.
- Icon: `Clapperboard` aus lucide-react (passt thematisch).
- Keine DB-Migration, keine Edge-Function-Änderung — alle Backend-Teile sind schon live.
