# Template-zu-Remotion Mapping System

## Übersicht

Das Template-System ermöglicht dynamisches Laden von Remotion Components basierend auf Templates aus der Datenbank. Es mappt Template-Customization-Fields automatisch zu Remotion Component Props.

## Architektur

### 1. Database Schema

#### `content_templates` Tabelle
- **`remotion_component_id`**: TEXT - Referenz auf Remotion Component (z.B. "ProductAd", "InstagramStory")

#### `template_field_mappings` Tabelle
Mappt Template-Fields zu Remotion Props:
```sql
- template_id: UUID (FK zu content_templates)
- field_key: TEXT (Key aus customizable_fields)
- remotion_prop_name: TEXT (Prop-Name in Remotion Component)
- transformation_function: TEXT (optional: z.B. "color_to_hex")
```

### 2. Komponenten

#### `DynamicCompositionLoader.tsx`
**Component Registry**: Zentrale Registry aller verfügbaren Remotion Components

**Funktionen**:
- `DynamicCompositionLoader`: Lädt Component dynamisch basierend auf ID
- `mapFieldsToProps()`: Mappt Customizations zu Remotion Props
- `applyTransformation()`: Wendet Transformationen an (color_to_hex, to_array, etc.)
- `getCompositionSettings()`: Gibt Default-Settings für Component zurück

**Verfügbare Components**:
- `ProductAd`: Produkt-Werbevideo (9:16)
- `InstagramStory`: Instagram Story Format (9:16)
- `TikTokReel`: TikTok-Style Video (9:16)
- `Testimonial`: Kunden-Testimonial (9:16)
- `Tutorial`: Tutorial Video (16:9)
- `UniversalVideo`: Universelles Video-Template (9:16)

#### `RemotionPreviewPlayer.tsx`
Erweitert um:
- `remotionComponentId` Prop
- `fieldMappings` Prop
- Automatisches Component Loading
- Props Mapping vor Render

### 3. Workflow

#### Template Rendering Flow:
```
1. User wählt Template aus DB
   ↓
2. System lädt template.remotion_component_id
   ↓
3. System lädt field_mappings für Template
   ↓
4. User customized Template-Fields
   ↓
5. DynamicCompositionLoader mappt Fields zu Props
   ↓
6. Remotion Component wird mit gemappten Props gerendert
```

## Neues Template hinzufügen

### Schritt 1: Remotion Component erstellen

```typescript
// src/remotion/templates/MyNewTemplate.tsx
import { z } from 'zod';

export const MyNewTemplateSchema = z.object({
  title: z.string(),
  backgroundColor: z.string(),
});

export const MyNewTemplate: React.FC<z.infer<typeof MyNewTemplateSchema>> = ({
  title,
  backgroundColor,
}) => {
  return (
    <AbsoluteFill style={{ backgroundColor }}>
      <h1>{title}</h1>
    </AbsoluteFill>
  );
};
```

### Schritt 2: Component zur Registry hinzufügen

```typescript
// src/remotion/DynamicCompositionLoader.tsx
import { MyNewTemplate } from './templates/MyNewTemplate';

const COMPONENT_REGISTRY = {
  // ... existing components
  MyNewTemplate,
} as const;
```

### Schritt 3: Composition Settings hinzufügen

```typescript
// In getCompositionSettings()
export const getCompositionSettings = (componentId: RemotionComponentId) => {
  const settings: Record<RemotionComponentId, {...}> = {
    // ... existing settings
    MyNewTemplate: {
      durationInFrames: 300,
      fps: 30,
      width: 1920,
      height: 1080,
    },
  };
  return settings[componentId];
};
```

### Schritt 4: Database Template erstellen

```sql
-- Template in DB anlegen
INSERT INTO content_templates (
  name,
  description,
  content_type,
  remotion_component_id,
  customizable_fields,
  ...
) VALUES (
  'My New Template',
  'Beschreibung',
  'ad',
  'MyNewTemplate',
  '[
    {
      "key": "TITLE_TEXT",
      "label": "Titel",
      "type": "text",
      "required": true
    },
    {
      "key": "BG_COLOR",
      "label": "Hintergrundfarbe",
      "type": "color",
      "required": true,
      "default_value": "#000000"
    }
  ]'::jsonb,
  ...
);
```

### Schritt 5: Field Mappings erstellen

```sql
-- Field Mappings definieren
INSERT INTO template_field_mappings (template_id, field_key, remotion_prop_name, transformation_function)
VALUES
  ('template-uuid', 'TITLE_TEXT', 'title', NULL),
  ('template-uuid', 'BG_COLOR', 'backgroundColor', 'color_to_hex');
```

## Transformations-Funktionen

Verfügbare Transformationen in `applyTransformation()`:

| Function | Beschreibung | Beispiel |
|----------|-------------|----------|
| `color_to_hex` | Konvertiert zu Hex-Format | "FF0000" → "#FF0000" |
| `to_number` | Konvertiert zu Number | "42" → 42 |
| `to_string` | Konvertiert zu String | 42 → "42" |
| `to_array` | Konvertiert zu Array | "a,b,c" → ["a", "b", "c"] |
| `url_encode` | URL-encoded String | "hello world" → "hello%20world" |

### Neue Transformation hinzufügen:

```typescript
// In applyTransformation() in DynamicCompositionLoader.tsx
case 'my_custom_transform':
  return myCustomLogic(value);
```

## Best Practices

### 1. Field Naming Convention
```
Template Field Keys: UPPERCASE_SNAKE_CASE
Remotion Props: camelCase

Beispiel:
- Template: "BG_COLOR" 
- Remotion: "backgroundColor"
```

### 2. Default Values
Immer Default Values in `customizable_fields` definieren:
```json
{
  "key": "TEXT_COLOR",
  "default_value": "#FFFFFF",
  "required": false
}
```

### 3. Required Fields
Kritische Props als `required: true` markieren:
```json
{
  "key": "PRODUCT_IMAGE",
  "type": "image",
  "required": true
}
```

### 4. Validation
Optional: Validation Rules für Fields:
```json
{
  "key": "DURATION",
  "type": "number",
  "validation": {
    "min": 5,
    "max": 60
  }
}
```

## Debugging

### Component nicht gefunden?
**Symptom**: Fehlermeldung im Player "Component nicht gefunden"

**Lösung**:
1. Prüfe COMPONENT_REGISTRY in DynamicCompositionLoader.tsx
2. Prüfe `remotion_component_id` in DB
3. Prüfe TypeScript Compilation

### Props werden nicht übernommen?
**Symptom**: Default Props statt Customizations

**Lösung**:
1. Prüfe Field Mappings in `template_field_mappings` Tabelle
2. Console.log in `mapFieldsToProps()` hinzufügen
3. Prüfe `field_key` Namen in Template vs. Customizations

### Preview zeigt altes Video?
**Symptom**: Änderungen nicht sichtbar

**Lösung**:
1. Prüfe Debounce (300ms Verzögerung ist normal)
2. Prüfe `previewKey` State Update in CustomizationStep
3. Force Refresh mit Key-Change

## Edge Function Integration

Die `render-queue-add` Edge Function:
1. Lädt Template mit `remotion_component_id`
2. Lädt Field Mappings
3. Übergibt alles an Render Queue
4. Worker mappt dann Props für finales Rendering

**Config Struktur**:
```typescript
{
  ...customizations,
  remotionComponentId: "ProductAd",
  fieldMappings: [{
    field_key: "PRODUCT_NAME",
    remotion_prop_name: "productName"
  }],
  templateData: {
    name: "Produkt Ad",
    aspectRatio: "9:16",
    duration: 15
  }
}
```

## Testing

### Manueller Test:
1. Template mit `remotion_component_id` in DB anlegen
2. Field Mappings erstellen
3. Universal Video Creator öffnen
4. Template auswählen
5. Fields customizen
6. Live Preview prüfen ✓
7. Video rendern
8. Output prüfen ✓

### Automatisiert (TODO):
```typescript
// Beispiel Test
test('maps fields correctly', () => {
  const mappings = [
    { field_key: 'TITLE', remotion_prop_name: 'title' }
  ];
  const customizations = { TITLE: 'Test' };
  const props = mapFieldsToProps(customizations, mappings);
  expect(props.title).toBe('Test');
});
```

## Roadmap

- [ ] Mehr Transformation Functions
- [ ] Validation in DynamicCompositionLoader
- [ ] Template Preview Cache
- [ ] Batch Template Import Tool
- [ ] Visual Template Builder UI
- [ ] A/B Testing für Template Variants
