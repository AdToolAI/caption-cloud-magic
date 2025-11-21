# Phase 24: Performance Optimization & Caching

## Übersicht

Phase 24 implementiert umfassende Performance-Optimierungen und intelligentes Caching für das Template-System.

## Implementierte Features

### 1. Template Cache Manager (`src/lib/template-cache.ts`)

Intelligentes Caching-System für Templates, Field-Mappings und Customizations:

#### Features

- **TTL-basiertes Caching**: Konfigurierbare Time-To-Live für Cache-Einträge
- **LRU Eviction**: Automatisches Entfernen ältester Einträge bei Kapazitätsgrenze
- **Pattern-basierte Invalidierung**: Lösche mehrere Cache-Einträge auf einmal
- **Cache Statistics**: Hit Rate, Misses, Sets, Invalidations
- **Auto-Cleanup**: Automatische Bereinigung abgelaufener Einträge alle 5 Minuten
- **Max Size Control**: Begrenzung auf 100 Einträge (konfigurierbar)

#### Verwendung

```typescript
import { templateCache, cacheKeys } from '@/lib/template-cache';

// Set cache entry
templateCache.set(
  cacheKeys.template(templateId),
  templateData,
  10 * 60 * 1000 // 10 minutes TTL
);

// Get cache entry
const cached = templateCache.get<ContentTemplate>(
  cacheKeys.template(templateId)
);

// Invalidate specific entry
templateCache.invalidate(cacheKeys.template(templateId));

// Invalidate pattern
templateCache.invalidatePattern(/^templates:/);

// Get statistics
const stats = templateCache.getStats();
console.log(`Hit Rate: ${Math.round(stats.hitRate * 100)}%`);
```

#### Cache Keys

```typescript
// Vordefinierte Cache-Keys
cacheKeys.template(templateId)           // "template:{id}"
cacheKeys.templates(contentType)         // "templates:{type}" oder "templates:all"
cacheKeys.fieldMappings(templateId)      // "field-mappings:{id}"
cacheKeys.customizations(projectId)      // "customizations:{id}"
cacheKeys.compositionSettings(compId)    // "composition:{id}"
```

### 2. Optimized Data Hooks (`src/hooks/useTemplateData.ts`)

React Query basierte Hooks mit integriertem Caching:

#### `useTemplates(contentType?)`

Lädt alle Templates mit Caching:

```typescript
const { data: templates, isLoading } = useTemplates('ad');
```

- Cache-TTL: 10 Minuten
- Stale Time: 5 Minuten
- Automatic refetch on focus

#### `useTemplate(templateId)`

Lädt einzelnes Template mit Caching:

```typescript
const { data: template, isLoading } = useTemplate(templateId);
```

- Cache-TTL: 10 Minuten
- Stale Time: 5 Minuten
- Enabled only when templateId is provided

#### `useFieldMappings(templateId)`

Lädt Field-Mappings mit Caching:

```typescript
const { data: mappings, isLoading } = useFieldMappings(templateId);
```

- Cache-TTL: 30 Minuten (selten geändert)
- Stale Time: 15 Minuten

#### Cache Invalidierung

```typescript
const { invalidateTemplate, invalidateTemplates, invalidateFieldMappings, invalidateAll } 
  = useInvalidateTemplateCache();

// Nach Template-Update
invalidateTemplate(templateId);

// Nach neuen Templates
invalidateTemplates();

// Alles zurücksetzen
invalidateAll();
```

#### Prefetching

```typescript
const { prefetchTemplate, prefetchFieldMappings } = usePrefetchTemplate();

// Prefetch beim Hover
onMouseEnter={() => prefetchTemplate(template.id)}
```

### 3. Lazy Loading (`src/components/content-studio/TemplateCard.lazy.tsx`)

Code-Splitting für bessere Initial-Load-Zeit:

```typescript
import { TemplateCardLazy } from './TemplateCard.lazy';

<TemplateCardLazy
  template={template}
  onSelect={handleSelect}
  isSelected={false}
/>
```

#### Benefits

- Reduziertes Initial Bundle
- Skeleton während des Ladens
- Nur laden wenn benötigt

### 4. Performance Utilities (`src/utils/performance.ts`)

Umfassende Performance-Tools:

#### Measurement

```typescript
import { measurePerformance, measurePerformanceAsync } from '@/utils/performance';

// Sync measurement
const result = measurePerformance('operationName', () => {
  return expensiveOperation();
});

// Async measurement
const result = await measurePerformanceAsync('asyncOp', async () => {
  return await fetchData();
});
```

#### Debouncing & Throttling

```typescript
import { debounce, throttle } from '@/utils/performance';

// Debounce (300ms default)
const debouncedSearch = debounce(search, 300);

// Throttle (100ms)
const throttledScroll = throttle(handleScroll, 100);
```

#### Memoization

```typescript
import { memoize } from '@/utils/performance';

const expensiveCalc = memoize((a, b) => {
  // Heavy calculation
  return result;
});

// With custom key generator
const memoizedFn = memoize(
  (obj) => transform(obj),
  (obj) => obj.id // Use ID as cache key
);
```

#### Performance Monitoring

```typescript
import { performanceMonitor } from '@/utils/performance';

// Record metric
performanceMonitor.record('render', 45.2);

// Get metrics
const metrics = performanceMonitor.getMetrics('render');
console.log(`Avg: ${metrics.avg}ms, Max: ${metrics.max}ms`);

// Get all metrics
const allMetrics = performanceMonitor.getAllMetrics();

// Export as JSON
const json = performanceMonitor.export();
```

#### Request Idle Callback

```typescript
import { requestIdleTask } from '@/utils/performance';

requestIdleTask(() => {
  // Non-critical work
  analyzeData();
}, { timeout: 2000 });
```

#### Component Performance Tracking

```typescript
import { withPerformanceTracking } from '@/utils/performance';

const MyComponent = ({ data }) => {
  return <div>{data}</div>;
};

export default withPerformanceTracking(MyComponent, 'MyComponent');
```

### 5. Cache Monitor (`src/components/content-studio/CacheMonitor.tsx`)

Entwickler-Tool zur Cache-Visualisierung:

#### Features

- **Real-time Statistics**: Hits, Misses, Hit Rate, Cache-Größe
- **Cache Keys View**: Alle cached Keys mit Einzellöschung
- **Performance Metrics**: Detaillierte Timing-Informationen
- **Operations**: Clear, Clean Expired, Reset Stats
- **Visual Progress Bars**: Hit Rate und Cache-Größe

#### Zugriff

```typescript
// Route: /cache-monitor
import CacheMonitorPage from '@/pages/CacheMonitor';
```

### 6. Performance Best Practices

#### React Query Configuration

```typescript
// Optimale Konfiguration
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,      // 5 Minuten
      gcTime: 10 * 60 * 1000,         // 10 Minuten
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: 1,
    },
  },
});
```

#### Lazy Loading

```typescript
// Component lazy loading
const HeavyComponent = lazy(() => import('./HeavyComponent'));

// With suspense fallback
<Suspense fallback={<Skeleton />}>
  <HeavyComponent />
</Suspense>
```

#### Memoization in Components

```typescript
import { useMemo, useCallback } from 'react';

const MyComponent = ({ data, onUpdate }) => {
  // Memoize expensive calculations
  const processedData = useMemo(() => {
    return expensiveTransform(data);
  }, [data]);

  // Memoize callbacks
  const handleClick = useCallback(() => {
    onUpdate(processedData);
  }, [processedData, onUpdate]);

  return <div onClick={handleClick}>{processedData}</div>;
};
```

## Performance Metriken

### Cache Performance

- **Target Hit Rate**: >80%
- **Average Lookup Time**: <1ms
- **Max Cache Size**: 100 Einträge
- **Default TTL**: 5-30 Minuten (je nach Datentyp)

### Load Times

- **Initial Bundle**: Reduziert durch Code-Splitting
- **Template Load**: <100ms (cached)
- **Field Mappings Load**: <50ms (cached)
- **Preview Render**: <200ms

### Memory Usage

- **Cache Size**: ~10-50 KB (abhängig von Template-Komplexität)
- **Max Memory**: ~5 MB bei voller Auslastung

## Integration

### CustomizationStep mit Caching

```typescript
import { useFieldMappings } from '@/hooks/useTemplateData';

export const CustomizationStep = ({ selectedTemplate }) => {
  // Automatisches Caching
  const { data: fieldMappings, isLoading } = useFieldMappings(
    selectedTemplate?.id
  );

  // Verwende fieldMappings...
};
```

### Template Selection mit Prefetching

```typescript
import { usePrefetchTemplate } from '@/hooks/useTemplateData';

const TemplateGrid = ({ templates }) => {
  const { prefetchTemplate } = usePrefetchTemplate();

  return templates.map(template => (
    <div
      key={template.id}
      onMouseEnter={() => prefetchTemplate(template.id)}
    >
      <TemplateCard template={template} />
    </div>
  ));
};
```

## Monitoring & Debugging

### Cache Statistics

```typescript
import { templateCache } from '@/lib/template-cache';

// In DevTools Console
console.log(templateCache.getStats());
// { hits: 45, misses: 12, hitRate: 0.78, ... }
```

### Performance Metrics

```typescript
import { performanceMonitor } from '@/utils/performance';

// Export all metrics
console.log(performanceMonitor.getAllMetrics());
```

### React Query DevTools

```typescript
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

// In App.tsx
<ReactQueryDevtools initialIsOpen={false} />
```

## Optimization Checklist

- [x] Template-Daten caching implementiert
- [x] Field-Mappings caching implementiert
- [x] React Query für Data Fetching
- [x] Code-Splitting für große Komponenten
- [x] Lazy Loading für TemplateCard
- [x] Debouncing für Preview-Updates
- [x] Memoization für teure Berechnungen
- [x] Performance-Monitoring implementiert
- [x] Cache-Invalidierung bei Updates
- [x] Prefetching für bessere UX
- [x] Auto-Cleanup für abgelaufene Cache-Einträge

## Nächste Schritte

- [ ] Service Worker für Offline-Caching
- [ ] IndexedDB für persistentes Caching
- [ ] Image Lazy Loading optimieren
- [ ] Virtual Scrolling für Template-Listen
- [ ] CDN-Integration für Assets
- [ ] Server-Side Rendering (SSR) evaluieren

## Performance-Tipps

### 1. Cache Strategien

- Templates: 10 Minuten (häufige Änderungen)
- Field-Mappings: 30 Minuten (selten geändert)
- Composition Settings: Permanent (statisch)

### 2. Invalidierung

```typescript
// Nach Template-Update
invalidateTemplate(templateId);
invalidateFieldMappings(templateId);

// Nach Batch-Update
invalidateAll();
```

### 3. Prefetching

```typescript
// Beim Template-Hover
onMouseEnter={() => {
  prefetchTemplate(template.id);
  prefetchFieldMappings(template.id);
}}
```

### 4. Lazy Loading

```typescript
// Nur laden wenn sichtbar
<IntersectionObserver>
  <TemplateCardLazy template={template} />
</IntersectionObserver>
```

## Bekannte Limitierungen

- Cache ist nicht persistent (nur Session)
- Max 100 Cache-Einträge
- Keine Cross-Tab-Synchronisation
- Kein Offline-Modus

## Anmerkungen

- Performance-Optimierungen sind progressiv
- Cache-Hit-Rate steigt mit Nutzung
- Monitoring nur in Development aktiv
- Production-Build ist automatisch optimiert
