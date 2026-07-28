## Bug

`RecentActivityFeed` crasht mit `Cannot read properties of null (reading 'filter')`.

`useCache` initialisiert `data` als `null` (nicht `undefined`). Meine Destrukturierung `const { data: events = [] }` greift den Default nur bei `undefined`, also ist `events === null` beim ersten Render — `events.filter(...)` in `useMemo` wirft.

## Fix

`src/components/dashboard/RecentActivityFeed.tsx` — Null-Sicherung:

```ts
const { data, loading } = useCache(...);
const events = data ?? [];
```

Sonst nichts.