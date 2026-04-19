

## Verstanden — Sidebar nach oben durchziehen

Der User zeigt: Der **News-Ticker** spannt sich aktuell über **die volle Fensterbreite** (oberhalb von Sidebar + Header) — die Sidebar beginnt erst darunter, wodurch das AdTool-Logo + die Sidebar einen optischen Versatz zum linken Rand des Tickers haben (siehe grüner Kreis im Screenshot, Mockup unten zeigt: blauer Strich = Sidebar-Top).

User-Wunsch (Mockup unten im Bild): Der News-Ticker liegt **rechts neben** der Sidebar — die Sidebar zieht sich oben durch und ist bündig mit dem oberen Fensterrand. Kein Versatz mehr.

### Macht das Sinn?

**Ja, definitiv.** Drei Gründe:

1. **Visuelle Konsistenz**: Aktuell "schwebt" das AdTool-Logo unter dem Ticker, statt am oberen Rand zu sitzen. Das wirkt unbeabsichtigt.
2. **Standard-Pattern**: Fast alle Web-Apps mit Sidebar (Notion, Linear, Vercel, Slack) lassen die Sidebar bis ganz oben durchlaufen — Top-Bars/Ticker liegen rechts daneben.
3. **Minimaler Aufwand, klarer Gewinn**: Eine Layout-Änderung in `App.tsx` (Zeile 134–138) — kein Re-Design.

### Aktuelle Struktur (`src/App.tsx` Z. 134–138)

```
<div flex>
  <AppSidebar />              ← startet UNTER dem Ticker
  <div flex-col>
    <NewsTicker />            ← volle Breite oben
    <AppHeader />
    <main>...</main>
  </div>
</div>
```

### Geplante Struktur

```
<div flex-col>                ← neuer äußerer Wrapper
  <div flex>                  ← Sidebar + Content nebeneinander
    <AppSidebar />            ← bündig oben
    <div flex-col flex-1>
      <NewsTicker />          ← nur über Content-Bereich
      <AppHeader />
      <main>...</main>
    </div>
  </div>
</div>
```

### Änderungen

**1. `src/App.tsx` (Z. 133–285)**
- `NewsTicker` von außerhalb in den rechten Spaltenbereich verschieben (innerhalb des `flex-col`-Containers neben der Sidebar) — **war schon so**, aber: der Ticker erstreckt sich aktuell über die ganze Breite weil das Layout `flex-row` ist und der Ticker im rechten Bereich liegt — **passt eigentlich schon strukturell**. 
- Der wahre Bug: Die **Sidebar hat oben einen Padding/Margin** der mit dem Ticker-Höhe nicht übereinstimmt, ODER der Ticker hat eine andere Hintergrundfarbe die bis links unter die Sidebar reicht.

**Ich prüfe das in der Implementierungs-Phase nochmal genauer** — vermutlich liegt es an:
- `AppSidebar` hat ein `mt-X` oder `pt-X` 
- ODER der Ticker-Container hat `position: fixed` + volle Breite
- ODER der äußere `<div className="flex">` lässt Sidebar bei voller Höhe starten, aber die Sidebar selbst hat oben Whitespace

**2. `src/components/dashboard/NewsTicker.tsx`**
- Falls der Ticker `fixed`/`absolute` mit `left: 0` ist → auf `relative` umstellen, sodass er nur den Content-Bereich rechts der Sidebar einnimmt.

**3. `src/components/AppSidebar.tsx`**
- Sicherstellen dass `top: 0` und keine `mt-*`/`pt-*` Klasse oben drauf ist, sodass das Logo bündig mit dem Ticker-Top abschließt.

### Was NICHT geändert wird

- Ticker-Inhalt, Animation, News-Quelle bleiben
- Header/AppHeader bleibt unter dem Ticker
- Sidebar-Inhalte (Menü-Items) bleiben

### Risiken

- Minimal. Reines Layout-Tweak. Keine Daten/Logic-Änderung.
- Mobile: Sidebar ist auf Mobile sowieso ein Drawer — Änderung betrifft nur Desktop.

