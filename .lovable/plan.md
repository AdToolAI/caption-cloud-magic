

# Plan: Zahnrad-Karussell mit Schräglage + Auto-Play fix

## Probleme

1. **Keine Schräglage / kein echtes Zahnrad**: Karten stehen gerade nebeneinander. Die Skizze zeigt Karten die sich überlappen UND leicht schräg stehen (wie Karten in einem Fächer).
2. **Auto-Play funktioniert nicht**: Das `useEffect` feuert korrekt, aber `video.play()` schlägt fehl weil das `<video>` Element noch nicht geladen ist oder `preload="auto"` bei Cross-Origin nicht greift. Braucht `onCanPlay` statt `onLoadedData`.

## Umsetzung (1 Datei)

**`src/components/dashboard/DashboardVideoCarousel.tsx`**

### 1. Schräglage für Zahnrad-Effekt
Statt nur `scale` jetzt auch `rotate()` (2D-Rotation, kein 3D):
- Karten links vom Zentrum: `rotate(-3deg)` (1. Nachbar), `rotate(-5deg)` (2.)
- Karten rechts vom Zentrum: `rotate(3deg)` (1. Nachbar), `rotate(5deg)` (2.)
- Aktive Karte: `rotate(0deg)`, `scale(1.05)`
- Negativen Margin von `-24px` auf `-32px` erhöhen für engere Überlappung

### 2. Auto-Play reparieren
- `onLoadedData` durch `onCanPlay` ersetzen — dieses Event feuert wenn genug Daten zum Abspielen geladen sind
- Im Auto-Play-Effect: prüfen ob `readyState >= 3` bevor `play()` aufgerufen wird
- Fallback: bei jedem `onCanPlay` Event prüfen ob dieses Video das aktive ist und dann starten
- `crossOrigin` entfernen (verursacht CORS-Fehler bei S3 URLs die keine CORS-Header senden)

### 3. Play-Overlay anpassen
- Play-Icon Overlay nur auf **inaktiven** Karten zeigen (aktive spielt ja automatisch)
- Aktive Karte: kein Play-Overlay, Video läuft

