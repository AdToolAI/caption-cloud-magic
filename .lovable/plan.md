

## Demo-Video fuer alle Accounts ohne eigene Videos

### Ziel
Das zuletzt erstellte Universal Creator Video (`ad8f4ad3`) soll als Demo-Video im Dashboard-Karussell und in der Mediathek erscheinen — fuer alle bestehenden und kuenftigen Accounts, die noch keine eigenen Videos haben. Sobald ein User ein eigenes Video erstellt, verschwindet das Demo-Video.

### Video-Daten
- **ID**: `ad8f4ad3-cef0-41b8-b624-ae225c7075b5`
- **URL**: `https://s3.eu-central-1.amazonaws.com/remotionlambda-eucentral1-13gm4o6s90/renders/iqab67nz53/out.mp4`
- **Erstellt**: 26. Maerz 2026

### Aenderungen

#### 1. `src/constants/demo-video.ts` (NEU)
Neue Datei mit den Demo-Video-Daten als Konstante:
```typescript
export const DEMO_VIDEO = {
  id: 'demo-video-001',
  output_url: 'https://s3.eu-central-1.amazonaws.com/remotionlambda-eucentral1-13gm4o6s90/renders/iqab67nz53/out.mp4',
  status: 'completed',
  created_at: '2026-03-26T17:07:34.954Z',
  metadata: { source: 'universal-creator', is_demo: true },
  // ... weitere Felder mit Defaults
};
```

#### 2. `src/hooks/useVideoHistory.ts`
- Nach dem Laden der echten Videos pruefen: Wenn `data.length === 0`, das `DEMO_VIDEO` Objekt als einziges Element zurueckgeben
- Dem Demo-Video ein Flag `is_demo: true` in metadata mitgeben
- Delete-Mutation fuer Demo-Videos blockieren (kein DB-Call)

#### 3. `src/components/dashboard/DashboardVideoCarousel.tsx`
- Demo-Videos mit einem kleinen "Demo" Badge kennzeichnen
- Titel fuer Demo-Videos: "Demo Video — Universal Creator" statt der generierten ID

#### 4. `src/pages/MediaLibrary.tsx`
- Gleiche Logik: Wenn `videoCreations` leer ist, das Demo-Video in die `normalizedVideoCreations` Liste einfuegen
- Demo-Videos als nicht loeschbar markieren

### Verhalten
- User hat **keine** eigenen Videos → Demo-Video erscheint im Karussell und Mediathek
- User erstellt **ein eigenes** Video → Demo-Video verschwindet automatisch (da die DB-Query dann Ergebnisse hat)
- Demo-Video kann nicht geloescht werden
- Kein DB-Insert noetig — rein clientseitig

### Dateien
1. `src/constants/demo-video.ts` (NEU)
2. `src/hooks/useVideoHistory.ts`
3. `src/components/dashboard/DashboardVideoCarousel.tsx`
4. `src/pages/MediaLibrary.tsx`

