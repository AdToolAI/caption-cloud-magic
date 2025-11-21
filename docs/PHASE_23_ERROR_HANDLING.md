# Phase 23: Error Handling & Logging

## Übersicht

Phase 23 implementiert ein umfassendes Error Handling und Logging-System für das Template-System.

## Implementierte Features

### 1. Template Logger (`src/lib/template-logger.ts`)

Zentrales Logging-System mit:
- **Log Levels**: debug, info, warn, error
- **Kategorien**: Template, FieldMapping, Transformation, Component, Preview, Customization
- **Metadata**: Zusätzliche Kontextinformationen für jeden Log-Eintrag
- **Persistenz**: Speichert bis zu 1000 Log-Einträge im Speicher
- **Export**: JSON-Export für Debugging

#### Verwendung

```typescript
import { templateLogger, logTemplateSelection } from '@/lib/template-logger';

// Direkte Nutzung
templateLogger.info('Category', 'Message', { metadata: 'value' });

// Convenience Functions
logTemplateSelection(templateId, templateName);
logFieldMapping(templateId, fieldKey, remotionProp, transformation);
logTransformation(fieldKey, inputValue, outputValue, transformationFunction);
logTransformationError(fieldKey, inputValue, transformationFunction, error);
```

### 2. Custom Error Classes (`src/lib/template-errors.ts`)

Spezialisierte Fehlerklassen für besseres Error Handling:

#### Error Types

- **`TemplateMappingError`**: Fehlende oder falsche Field-Mappings
- **`TransformationError`**: Fehler bei Wert-Transformationen
- **`ComponentLoadError`**: Fehler beim Laden von Remotion-Komponenten
- **`TemplateValidationError`**: Validierungsfehler bei Template-Daten
- **`DatabaseError`**: Datenbankfehler

#### Error Handler

```typescript
import { ErrorHandler } from '@/lib/template-errors';

try {
  // Operation
} catch (error) {
  ErrorHandler.log(error, 'Context');
  const { message, details } = ErrorHandler.handle(error);
  // Zeige user-friendly message
}
```

#### Retry Utility

```typescript
import { retryOperation } from '@/lib/template-errors';

const result = await retryOperation(
  async () => {
    return await someAsyncOperation();
  },
  3, // maxRetries
  1000 // delayMs
);
```

### 3. Error Boundary (`src/components/error-boundary/TemplateErrorBoundary.tsx`)

React Error Boundary für graceful Error Handling:

#### Features

- Fängt React-Fehler auf Component-Ebene
- Zeigt user-friendly Fehlermeldungen
- Bietet "Erneut versuchen" und "Zur Startseite" Buttons
- Entwickler-Modus: Detaillierte Stack Traces
- Integration mit Template Logger

#### Verwendung

```typescript
import { TemplateErrorBoundary } from '@/components/error-boundary/TemplateErrorBoundary';

// Als Wrapper
<TemplateErrorBoundary>
  <YourComponent />
</TemplateErrorBoundary>

// Als HOC
const SafeComponent = withErrorBoundary(YourComponent);
```

### 4. Custom Hooks (`src/hooks/useTemplateErrorHandler.ts`)

React Hooks für Error Handling:

#### `useTemplateErrorHandler`

```typescript
import { useTemplateErrorHandler } from '@/hooks/useTemplateErrorHandler';

function Component() {
  const { handleError, clearError, handleAsyncError, isError, errorMessage } = useTemplateErrorHandler();

  // Sync error handling
  try {
    // operation
  } catch (error) {
    handleError(error, 'Context');
  }

  // Async error handling
  const result = await handleAsyncError(
    async () => await fetchData(),
    'DataFetch'
  );
}
```

#### `useTransformationErrorHandler`

```typescript
import { useTransformationErrorHandler } from '@/hooks/useTemplateErrorHandler';

function Component() {
  const { handleTransformationError } = useTransformationErrorHandler();

  const transformed = handleTransformationError(
    fieldKey,
    transformationFunction,
    value,
    error
  );
}
```

### 5. Log Viewer (`src/components/content-studio/LogViewer.tsx`)

Entwickler-Tool zur Log-Visualisierung:

#### Features

- Echtzeit-Log-Anzeige (aktualisiert alle 2 Sekunden)
- Filterung nach Log-Level (debug, info, warn, error)
- Filterung nach Kategorie
- Fehler-Zusammenfassung
- Log-Export als JSON
- Detaillierte Metadata-Anzeige

#### Zugriff

```typescript
// Route: /developer-logs
import DeveloperLogs from '@/pages/DeveloperLogs';
```

## Integration

### DynamicCompositionLoader

```typescript
// Automatisches Logging bei Transformationen
export const mapFieldsToProps = (customizations, fieldMappings) => {
  fieldMappings.forEach(mapping => {
    try {
      const transformed = applyTransformation(value, transformation);
      logTransformation(fieldKey, value, transformed, transformation);
    } catch (error) {
      logTransformationError(fieldKey, value, transformation, error.message);
      // Fallback auf Original-Wert
    }
  });
};
```

### CustomizationStep

```typescript
// Fehlerbehandlung beim Laden von Field-Mappings
try {
  const { data, error } = await supabase
    .from('template_field_mappings')
    .select('*')
    .eq('template_id', templateId);

  if (error) {
    const dbError = new DatabaseError('select', 'template_field_mappings', error);
    templateLogger.error('Database', dbError.message, dbError.metadata);
    toast.error('Feldkonfiguration konnte nicht geladen werden');
  }
} catch (error) {
  handleError(error, 'FieldMappings');
}
```

### UniversalVideoCreator

```typescript
// Gesamte Komponente mit Error Boundary geschützt
export const UniversalVideoCreator = ({ contentType }) => {
  return (
    <TemplateErrorBoundary>
      {/* Component Content */}
    </TemplateErrorBoundary>
  );
};
```

## Error Messages

### Deutsch (User-Facing)

- **TemplateMappingError**: "Die Feldkonfiguration für dieses Template konnte nicht geladen werden. Bitte versuche es erneut oder wähle ein anderes Template."
- **TransformationError**: "Der Wert für '[fieldKey]' konnte nicht verarbeitet werden. Bitte überprüfe die Eingabe."
- **ComponentLoadError**: "Die Video-Komponente konnte nicht geladen werden. Bitte lade die Seite neu."
- **DatabaseError**: "Es gab ein Problem beim Laden der Daten. Bitte versuche es erneut."

### Entwickler-Details

Im Development-Modus werden zusätzliche technische Details angezeigt:
- Fehlercode
- Original Error Message
- Stack Trace
- Metadata

## Best Practices

### 1. Logging

```typescript
// ✅ GOOD: Strukturiertes Logging mit Kontext
templateLogger.info('Template', 'Template selected', {
  templateId: template.id,
  templateName: template.name,
});

// ❌ BAD: Unstrukturiertes Logging
console.log('Template selected:', template.id);
```

### 2. Error Handling

```typescript
// ✅ GOOD: Spezifische Error-Klassen
throw new TransformationError(fieldKey, transformation, value);

// ❌ BAD: Generische Errors
throw new Error('Transformation failed');
```

### 3. User Feedback

```typescript
// ✅ GOOD: User-friendly + Technical Details
const { message, details } = ErrorHandler.handle(error);
toast.error(message, { description: details });

// ❌ BAD: Rohe Error-Messages
toast.error(error.message);
```

## Testing

Tests sind implementiert in:
- `src/remotion/__tests__/DynamicCompositionLoader.test.ts`
- `src/components/content-studio/__tests__/integration/template-workflow.test.tsx`

## Monitoring

### Log-Kategorien

- **Template**: Template-Auswahl und -Verwaltung
- **FieldMapping**: Field-Mapping-Operationen
- **Transformation**: Wert-Transformationen
- **Component**: Remotion-Komponenten-Laden
- **Preview**: Preview-Rendering
- **Customization**: Feld-Anpassungen
- **Database**: Datenbank-Operationen

### Metriken

- Fehlerrate pro Kategorie (via Error Summary)
- Häufigste Fehler
- Transformation-Erfolgsrate
- Log-Level-Verteilung

## Entwickler-Tools

### Log Viewer

Zugriff über `/developer-logs` (nur in Development):
- Echtzeit-Log-Stream
- Filterung und Suche
- Export-Funktion
- Fehler-Analytics

### Browser DevTools

```javascript
// Zugriff auf Logger im Browser
import { templateLogger } from '@/lib/template-logger';

// Logs abrufen
templateLogger.getRecentLogs(50);
templateLogger.getLogsByCategory('Transformation');
templateLogger.getLogsByLevel('error');
templateLogger.getErrorSummary();

// Export
console.log(templateLogger.exportLogs());
```

## Nächste Schritte

- [ ] Server-seitiges Logging (optional)
- [ ] Error-Tracking-Integration (Sentry, etc.)
- [ ] Performance-Monitoring
- [ ] Automatische Error-Reports
- [ ] A/B Testing für Error-Messages

## Anmerkungen

- Logging ist nur im Development-Modus aktiviert (Performance)
- Logs werden im Browser-Speicher gehalten (max. 1000 Einträge)
- Error Boundary fängt nur React-Rendering-Fehler
- Async-Fehler müssen explizit behandelt werden
