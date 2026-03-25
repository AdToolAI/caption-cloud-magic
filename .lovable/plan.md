

## Naechster Post: immer den echten naechsten zeigen + Reschedule fuer alle Tage

### Problem
1. Die Reschedule-Logik (Zeile 307-308) prueft nur `isToday` — Posts von vergangenen Tagen werden nie als "missed" markiert oder neu geplant
2. Wenn ein Post auf "09:00" am naechsten Tag verschoben wird, bleibt er trotzdem auf der alten Tageskarte — er wird nicht wirklich auf den naechsten Tag verschoben
3. `getNextPost()` zeigt dadurch manchmal veraltete Posts

### Aenderungen in `src/pages/Home.tsx`

#### 1. Reschedule-Logik erweitern (Zeile 303-329)

Statt nur `isToday` zu pruefen, alle Tage durchgehen deren Datum+Uhrzeit in der Vergangenheit liegt:

```text
Fuer jeden Tag in days:
  Fuer jeden Post (nicht published):
    postDateTime = day.date + suggestedTime
    if (now > postDateTime):
      originalTime = suggestedTime
      newDateTime = postDateTime + 6 Stunden
      if newDateTime < now: newDateTime = now + 6h (aufgerundet auf halbe Stunde)
      if newDateTime.hours >= 22: naechster Tag 09:00
      → Post auf neuen Tag verschieben (aus altem Tag entfernen, in neuen Tag einfuegen)
      status = 'missed'
```

Kernpunkt: Posts werden tatsaechlich auf den richtigen zukuenftigen Tag verschoben, nicht nur die Uhrzeit geaendert.

#### 2. getNextPost() bleibt wie es ist

Wenn die Reschedule-Logik korrekt Posts in die Zukunft verschiebt, findet `getNextPost()` automatisch den richtigen naechsten Post.

### Dateien
- `src/pages/Home.tsx` — Reschedule-Block (Zeile 303-329) neu schreiben

