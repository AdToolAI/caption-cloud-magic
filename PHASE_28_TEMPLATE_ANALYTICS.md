# Phase 28: Template Analytics & Business Intelligence - Dokumentation

## Überblick

Phase 28 implementiert ein vollständiges Analytics- und A/B-Testing-Framework für Content-Templates mit:
- Performance-Tracking (Views, Selections, Conversions)
- Conversion-Funnel-Analyse
- A/B-Testing mit statistischer Signifikanzprüfung
- Echtzeit-Dashboards und Visualisierungen

## Architektur

### Backend (Edge Functions)

#### 1. `track-template-event`
Trackt Template-Interaktionen entlang des Conversion-Funnels.

**Verwendung:**
```typescript
await supabase.functions.invoke('track-template-event', {
  body: {
    template_id: 'uuid',
    event_type: 'viewed' | 'selected' | 'created' | 'published',
    session_id: 'optional-session-id',
    metadata: { any: 'data' }
  }
});
```

#### 2. `get-template-analytics`
Ruft aggregierte Analytics-Daten für ein Template ab.

**Parameter:**
- `template_id` (required)
- `days` (optional, default: 30)
- `date_from` (optional)
- `date_to` (optional)

**Response:**
```typescript
{
  summary: TemplatePerformanceSummary,
  conversion: ConversionFunnel,
  daily_metrics: DailyMetric[],
  active_tests: ABTest[]
}
```

#### 3. `create-ab-test`
Erstellt einen neuen A/B-Test für Template-Varianten.

**Body:**
```typescript
{
  template_id: string,
  test_name: string,
  hypothesis?: string,
  variant_a_config: any,
  variant_b_config: any,
  target_metric?: string,
  target_sample_size?: number,
  confidence_level?: number
}
```

#### 4. `get-ab-test-results`
Berechnet statistische Ergebnisse eines A/B-Tests.

**Parameter:**
- `test_id` (required)

**Features:**
- Z-Test für Proportionen
- P-Value-Berechnung
- Winner-Bestimmung mit Lift-Berechnung
- Sample-Progress-Tracking

### Frontend (React Hooks & Components)

#### Hooks

##### `useTemplateAnalytics(templateId, options)`
```typescript
import { useTemplateAnalytics } from '@/hooks/useTemplateAnalytics';

const { data, loading, error, refetch, trackEvent } = useTemplateAnalytics(
  'template-id',
  { 
    days: 30,
    dateFrom: '2025-01-01',
    dateTo: '2025-01-31'
  }
);

// Event tracking
trackEvent('viewed', { source: 'browse' });
trackEvent('selected', { variant: 'A' });
trackEvent('created', { project_id: 'xyz' });
trackEvent('published', { platform: 'instagram' });
```

##### `useABTesting()`
```typescript
import { useABTesting } from '@/hooks/useABTesting';

const {
  tests,
  loading,
  error,
  createTest,
  getTestResults,
  startTest,
  pauseTest,
  completeTest,
  fetchActiveTests
} = useABTesting();

// Create test
const test = await createTest({
  template_id: 'xyz',
  test_name: 'Header Variation Test',
  hypothesis: 'Shorter header increases conversions',
  variant_a_config: { /* config */ },
  variant_b_config: { /* config */ },
  target_sample_size: 1000
});

// Manage test lifecycle
await startTest(testId);
await pauseTest(testId);
await completeTest(testId, 'A'); // with winner

// Get results
const results = await getTestResults(testId);
```

#### Components

##### `<TemplatePerformanceDashboard>`
Zeigt KPIs, Conversion-Funnel und Performance-Trends.

```tsx
import { TemplatePerformanceDashboard } from '@/components/template-analytics/TemplatePerformanceDashboard';

<TemplatePerformanceDashboard templateId="xyz" days={30} />
```

##### `<ABTestManager>`
Interface zum Erstellen, Starten und Auswerten von A/B-Tests.

```tsx
import { ABTestManager } from '@/components/template-analytics/ABTestManager';

<ABTestManager templateId="xyz" />
```

## Integration in bestehende Components

### 1. Template Browse/View

```tsx
import { useTemplateAnalytics } from '@/hooks/useTemplateAnalytics';

function TemplateCard({ template }) {
  const { trackEvent } = useTemplateAnalytics(template.id);

  return (
    <div 
      onClick={() => {
        trackEvent('viewed');
        // navigate to template details
      }}
    >
      <TemplatePreview template={template} />
    </div>
  );
}
```

### 2. Template Selection

```tsx
function TemplateDetails({ template }) {
  const { trackEvent } = useTemplateAnalytics(template.id);

  const handleUseTemplate = () => {
    trackEvent('selected');
    // proceed with template usage
  };

  return (
    <Button onClick={handleUseTemplate}>
      Template verwenden
    </Button>
  );
}
```

### 3. Project Creation

```tsx
function CreateProject({ templateId }) {
  const { trackEvent } = useTemplateAnalytics(templateId);

  const handleCreate = async () => {
    // create project logic
    await createProject(/* ... */);
    
    // Track conversion
    trackEvent('created', {
      project_id: newProjectId,
      source: 'template'
    });
  };

  return (
    <Button onClick={handleCreate}>Erstellen</Button>
  );
}
```

### 4. Publishing

```tsx
function PublishButton({ projectId, templateId }) {
  const { trackEvent } = useTemplateAnalytics(templateId);

  const handlePublish = async () => {
    await publishProject(projectId);
    
    // Track final conversion
    trackEvent('published', {
      project_id: projectId,
      platforms: ['instagram', 'facebook']
    });
  };

  return (
    <Button onClick={handlePublish}>Veröffentlichen</Button>
  );
}
```

## Datenbank Schema

### `template_performance_metrics`
Tägliche aggregierte Metriken pro Template.

**Felder:**
- `template_id` - Template UUID
- `date` - Datum (DATE)
- `total_views` - Anzahl Views
- `total_selections` - Anzahl Auswahlen
- `projects_created` - Anzahl erstellter Projekte
- `projects_published` - Anzahl Veröffentlichungen
- `avg_rating_in_period` - Durchschnittsbewertung
- `ratings_submitted` - Anzahl Bewertungen

### `template_conversion_events`
Einzelne Tracking-Events für Funnel-Analyse.

**Felder:**
- `template_id` - Template UUID
- `user_id` - User UUID
- `session_id` - Session-ID (für Funnel-Tracking)
- `event_type` - 'viewed' | 'selected' | 'created' | 'published'
- `viewed_at` - Timestamp
- `selected_at` - Timestamp
- `created_at` - Timestamp
- `published_at` - Timestamp
- `metadata` - Zusätzliche Daten (JSONB)

### `template_ab_tests`
A/B Test Definitionen und Ergebnisse.

**Felder:**
- `template_id` - Template UUID
- `test_name` - Name des Tests
- `hypothesis` - Hypothese (optional)
- `variant_a_config` - Konfiguration Variante A (JSONB)
- `variant_b_config` - Konfiguration Variante B (JSONB)
- `target_metric` - Zielmetrik (default: 'conversion_rate')
- `target_sample_size` - Ziel Sample Size
- `confidence_level` - Konfidenz-Level (0-1)
- `status` - 'draft' | 'active' | 'paused' | 'completed'
- `winner_variant` - 'A' | 'B' | null
- `statistical_significance` - P-Value
- `started_at` - Start-Timestamp
- `completed_at` - Abschluss-Timestamp

## Statistische Methoden

### Z-Test für Proportionen
Verwendet für den Vergleich von Conversion-Raten zwischen Varianten.

**Formel:**
```
z = (p1 - p2) / sqrt(p_pool * (1 - p_pool) * (1/n1 + 1/n2))
```

**Interpretation:**
- `p < 0.05`: Statistisch signifikanter Unterschied
- `p >= 0.05`: Kein signifikanter Unterschied

### Lift-Berechnung
```
lift = ((winner_rate - loser_rate) / loser_rate) * 100
```

## Performance-Optimierung

### Indexe
Automatisch erstellt für schnelle Queries:
- `idx_template_performance_template_date` - Template + Datum
- `idx_conversion_events_template_user` - Template + User
- `idx_conversion_events_session` - Session-basierte Queries
- `idx_ab_tests_template_status` - Aktive Tests pro Template

### Caching
- Performance-Metriken werden täglich aggregiert
- Dashboard-Daten können gecacht werden (5-15 Minuten)

## Monitoring & Alerts

Wichtige Metriken zu überwachen:
1. **Conversion-Rate-Drops** - Plötzliche Rückgänge
2. **Test-Sample-Size** - Ausreichende Datenmenge
3. **Event-Tracking-Fehler** - Failed tracking calls
4. **Performance** - Query-Zeiten für Analytics

## Best Practices

### Tracking
1. **Session-IDs verwenden** für Funnel-Tracking
2. **Metadata hinzufügen** für detaillierte Analysen
3. **Fehler-Handling** - Tracking sollte nie User-Flow blockieren
4. **Privacy** - Keine PII in Event-Metadaten

### A/B Testing
1. **Klare Hypothesen** definieren
2. **Ausreichende Sample-Size** (min. 100 pro Variante)
3. **Einen Metric** als Hauptziel
4. **Nicht zu früh abbrechen** - Warten auf statistische Signifikanz

### Performance
1. **Zeiträume begrenzen** bei Analytics-Queries
2. **Aggregierte Daten** aus `template_performance_metrics` nutzen
3. **Indexes** für häufige Query-Patterns
4. **Batch-Processing** für große Datenmengen

## Zugriff

**Analytics-Dashboard:**
```
/template-analytics/:templateId
```

**Navigation:**
- Von Template-Browser: "Analytics"-Button
- Von Template-Details: "Performance anzeigen"
- Direkter Link mit Template-ID

## Nächste Schritte

Mögliche Erweiterungen:
1. **Multi-variate Testing** (>2 Varianten)
2. **Predictive Analytics** (ML-basierte Vorhersagen)
3. **Cohort-Analyse** (User-Segmentierung)
4. **Export-Funktionen** (CSV, PDF Reports)
5. **Automated Insights** (AI-generierte Empfehlungen)
6. **Email-Alerts** bei wichtigen Events

## Support

Bei Fragen oder Problemen:
- Dokumentation: `/docs/analytics`
- Support-Team kontaktieren
- Issues in GitHub erstellen
