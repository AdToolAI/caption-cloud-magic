

# Plan: Sortierung auf "neueste zuerst" + Scroll-Fix + Video-Debugging

## Zusammenfassung
Die Videos sollen primär nach Datum sortiert werden (neueste zuerst), und erst wenn Analytics-Daten vorhanden sind, nach Performance. Die Scroll-to-Rotate-Funktion wird durch einen robusteren Event-Handler repariert. Für die 3 nicht spielenden Videos wird ein aktiver Retry-Mechanismus eingebaut.

## Datei: `src/components/dashboard/DashboardVideoCarousel.tsx`

### 1. Sortierung ändern: neueste zuerst, Performance sekundär
Aktuell werden Videos primär nach `download_count + share_count` sortiert — aber alle haben Score 0. Das ist zwar schon nach Datum als Fallback, aber die Logik soll klarer werden:
- **Primär**: `created_at` absteigend (neueste zuerst)
- **Sekundär**: Wenn Analytics-Daten existieren (Score > 0), diese Videos vorziehen
- Das "Best"-Badge nur anzeigen wenn tatsächlich ein Score > 0 existiert

### 2. Scroll-to-Rotate reparieren
Der aktuelle `wheel`-Listener auf `containerRef` wird von Embla's internem Container geschluckt. Fix:
- Den Wheel-Handler direkt auf dem **Embla-Viewport** (`emblaRef`-Element) registrieren, nicht auf dem äußeren Perspective-Wrapper
- Alternativ: `watchDrag: false` in Embla-Config setzen, damit Embla nicht selbst Wheel/Drag abfängt, und stattdessen nur unsere manuelle Steuerung nutzen
- Sowohl `deltaY` als auch `deltaX` auswerten (Trackpad-Support)

### 3. Video-Playback-Retry
Alle S3-URLs sind erreichbar (getestet). Die 3 fehlenden Videos sind vermutlich ein Browser-Codec/Timing-Problem:
- Bei `onError`: statt sofort als "nicht verfügbar" markieren, einmal die `src` neu setzen und `load()` aufrufen (einmaliger Retry)
- Einen `retried`-State tracken um Endlos-Loops zu verhindern
- Erst nach dem Retry als Fehler anzeigen

### Technische Details

**Sortierung** (Zeilen 51-59):
```typescript
const sortedVideos = [...videos]
  .filter((v) => v.status === 'completed' && v.output_url)
  .sort((a, b) => {
    // Videos mit Analytics-Score nach oben
    const scoreA = (a.download_count || 0) + (a.share_count || 0);
    const scoreB = (b.download_count || 0) + (b.share_count || 0);
    if (scoreA > 0 && scoreB === 0) return -1;
    if (scoreB > 0 && scoreA === 0) return 1;
    if (scoreA > 0 && scoreB > 0 && scoreB !== scoreA) return scoreB - scoreA;
    // Sonst: neueste zuerst
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  })
  .slice(0, 10);
```

**Scroll-Fix** (Zeilen 61-67 + 112-134):
- Embla-Config: `watchDrag: false` hinzufügen
- Wheel-Handler auf das Embla-Viewport-Element (das `div` mit `ref={emblaRef}`) per `useEffect` + `addEventListener` registrieren, da Embla den Wheel-Event nicht mehr abfängt

**Retry-Mechanismus** (Zeilen 142-144 + Video-Element):
- Neuer State: `retriedVideos: Set<number>`
- `onError`: wenn noch nicht retried → src neu setzen + load(); wenn schon retried → errorVideos markieren

