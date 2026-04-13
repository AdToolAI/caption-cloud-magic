

## Plan: Ticker-Tipps automatisch jede Stunde neu mischen

### Änderung

In `src/components/dashboard/NewsTicker.tsx`:
- `shuffledTips` von `useState` (einmalig) auf `useState` + `useEffect` mit `setInterval` umstellen
- Alle 60 Minuten (3.600.000 ms) wird das Array neu gemischt und per `setShuffledTips` aktualisiert
- Shuffle-Logik in eine eigene Funktion extrahieren für Wiederverwendung

### Code-Änderung

```tsx
const shuffle = (arr: string[]) => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

export const NewsTicker = () => {
  const [shuffledTips, setShuffledTips] = useState(() => shuffle(TIPS));

  useEffect(() => {
    const interval = setInterval(() => {
      setShuffledTips(shuffle(TIPS));
    }, 60 * 60 * 1000); // 1 Stunde
    return () => clearInterval(interval);
  }, []);
  // ...rest bleibt gleich
};
```

### Betroffene Datei
- `src/components/dashboard/NewsTicker.tsx`

### Ergebnis
- Tipps werden bei jedem Laden zufällig gemischt
- Jede Stunde automatisch neu gemischt, sodass der User frische Tipps sieht

