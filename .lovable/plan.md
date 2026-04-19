

## Plan: News-Ticker unter die AdTool-Leiste schieben (kein Versatz mehr)

### Was der User will (Mockup im WhatsApp-Screenshot)
Der News-Ticker soll **unter der AdTool-Leiste** beginnen — also unter `AppHeader` statt darüber. Dadurch verschwindet der optische Versatz: Ticker und Hauptcontent starten an derselben x/y-Achse.

### Aktuelle Reihenfolge (`src/App.tsx` Z. 134–138)
```
<div flex>
  <AppSidebar />                          ← klebt oben (sticky)
  <div flex-col>
    <NewsTicker />     ← ganz oben
    <AppHeader />      ← darunter
    <main>...</main>
  </div>
</div>
```

Das erzeugt: Ticker oben → AppHeader (mit AdTool-Logo) darunter → Logo sitzt visuell tiefer als das Sidebar-Logo links → Versatz.

### Geplante Reihenfolge
```
<div flex>
  <AppSidebar />
  <div flex-col>
    <AppHeader />      ← AdTool-Leiste oben
    <NewsTicker />     ← Ticker direkt darunter
    <main>...</main>
  </div>
</div>
```

Dann sitzt das AdTool-Logo im Header **auf gleicher Höhe** wie das Sparkles-Icon in der Sidebar (beide ganz oben). Der Ticker liegt sauber darunter, ohne Versatz.

### Änderungen — minimal

**1. `src/App.tsx` (Z. 137–138)**
- Reihenfolge tauschen: `AppHeader` zuerst, danach `NewsTicker`
- `AppHeader` hat aktuell `sticky top-0 z-50` → bleibt beim Scrollen oben kleben
- `NewsTicker` muss dann **nicht** sticky sein (scrollt mit weg) — passt, da der User den Ticker nur anfangs sehen will

**2. `src/components/layout/AppHeader.tsx` — kein Change nötig**
- `sticky top-0 z-50` bleibt → AdTool-Leiste klebt oben
- Optional: Wenn User den Ticker auch beim Scrollen sehen möchte, könnten wir ihn ebenfalls sticky machen (`sticky top-14 z-40`, da Header h-14 ist). **Default: nicht sticky** — wir machen das nur, wenn der User es ausdrücklich nachfordert.

**3. `src/components/AppSidebar.tsx` — bereits korrekt**
- `sticky top-0 h-screen self-start` mit `pt-2 pb-3` für Brand-Container → Sparkles-Icon sitzt oben links auf gleicher Höhe wie der AppHeader

### Was NICHT geändert wird
- Ticker-Inhalt, Animation, Switch, News-Quelle bleiben
- Sidebar-Inhalte und -Verhalten bleiben
- Routing/Pages bleiben
- Kein DB/Bundle-Redeploy nötig (reines Frontend-Layout)

### Risiken
- Minimal — eine Zeilen-Vertauschung in `App.tsx`
- Falls der User danach sagt "Ticker soll auch beim Scrollen sichtbar bleiben" → `sticky top-14` als Mini-Folge-Iteration

