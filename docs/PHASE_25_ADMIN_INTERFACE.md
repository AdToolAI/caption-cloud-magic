# Phase 25: Admin Interface & Template Management

## Übersicht

Phase 25 implementiert ein umfassendes Admin-Interface zur Verwaltung von Templates, Field-Mappings und zum System-Monitoring.

## Implementierte Features

### 1. Admin Dashboard (`src/pages/Admin.tsx`)

Zentrale Admin-Oberfläche mit Tab-Navigation:

#### Tabs

1. **Templates** - Template-Verwaltung
2. **Field-Mappings** - Field-Mapping-Konfiguration  
3. **System Monitor** - System-Gesundheit und Metriken
4. **Logs** - Log-Viewer
5. **Cache** - Cache-Monitor

#### Zugriff

```typescript
// Route: /admin
import Admin from '@/pages/Admin';
```

### 2. Template Manager (`src/components/admin/TemplateManager.tsx`)

Vollständige Template-Verwaltung:

#### Features

- **Template-Liste**: Alle Templates mit Suche und Filter
- **Suche**: Durchsuche Namen und Beschreibungen
- **Filter**: Nach Content-Type filtern (ad, story, reel, etc.)
- **Details**: Template-Informationen, Felder, AI-Features
- **Actions**: Ansehen, Bearbeiten, Löschen
- **Refresh**: Templates neu laden mit Cache-Invalidierung

#### Anzeige

Für jedes Template:
- Name und Beschreibung
- Content-Type Badge
- Remotion Component ID
- Kategorie und Plattform
- Anzahl customizable Fields
- Dauer-Range
- AI-Features als Badges

#### Template-Statistiken

- Gesamtanzahl Templates
- Gefilterte Anzahl
- Templates pro Content-Type

### 3. Field-Mapping Manager (`src/components/admin/FieldMappingManager.tsx`)

Verwalte Field-zu-Prop-Mappings:

#### Features

- **Template-Auswahl**: Dropdown zur Template-Selektion
- **Template-Info**: Zeigt verfügbare Fields und Remotion Component
- **CRUD Operations**: 
  - Create: Neue Mappings hinzufügen
  - Read: Alle Mappings anzeigen
  - Update: Mappings bearbeiten
  - Delete: Mappings löschen
- **Transformation-Auswahl**: Dropdown mit allen verfügbaren Transformationen

#### Mapping-Struktur

```typescript
interface FieldMapping {
  field_key: string;              // Template field key
  remotion_prop_name: string;     // Remotion component prop name
  transformation_function: string | null;  // Optional transformation
}
```

#### Verfügbare Transformationen

- `to_number` - String zu Number
- `to_string` - Zu String konvertieren
- `to_boolean` - Zu Boolean konvertieren
- `to_array` - String zu Array (split by comma/newline)
- `color_to_hex` - RGB/RGBA zu Hex
- `url_encode` - URL-Encoding
- `trim` - Whitespace entfernen
- `lowercase` - Zu Kleinbuchstaben
- `uppercase` - Zu Großbuchstaben

#### Workflow

1. Template auswählen
2. Verfügbare Fields werden angezeigt
3. Neues Mapping erstellen:
   - Field Key eingeben (aus verfügbaren Fields)
   - Remotion Prop Name eingeben
   - Optional: Transformation wählen
   - Speichern
4. Mapping wird in Datenbank gespeichert
5. Cache wird invalidiert

#### Validierung

- Field Key muss existieren (aus customizable_fields)
- Remotion Prop Name ist erforderlich
- Transformation ist optional

### 4. System Monitor (`src/components/admin/SystemMonitor.tsx`)

Überwache System-Gesundheit und Performance:

#### System Health Status

Automatische Bewertung basierend auf:
- **Healthy** (Grün): <5 Fehler, Hit Rate >50%
- **Warning** (Gelb): 5-10 Fehler oder Hit Rate <50%
- **Critical** (Rot): >10 Fehler

#### Metriken-Kategorien

##### Cache Health
- Hit Rate mit Progress Bar
- Hits vs Misses
- Cache-Größe (x/100)
- Visuelle Darstellung

##### Error Tracking
- Fehleranzahl (letzte 1000 Logs)
- Warnungsanzahl
- Farbcodierte Anzeige (Rot/Gelb)

##### Performance
- Top 3 Performance-Metriken
- Durchschnittliche Ausführungszeit
- Messanzahl pro Metrik

#### System-Metriken

- **Cache Operations**: Anzahl Sets
- **Invalidierungen**: Cache-Leerungen
- **Performance Samples**: Gesamtmessungen
- **Uptime**: Zeit seit Seitenaufruf

#### Automatische Empfehlungen

Das System gibt kontextbasierte Empfehlungen:

1. **Niedrige Hit-Rate** (<70%):
   ```
   ⚠️ Niedrige Cache-Hit-Rate
   Erwäge TTL-Anpassungen oder mehr Prefetching
   ```

2. **Hohe Fehlerrate** (>5):
   ```
   ❌ Hohe Fehlerrate
   X Fehler erkannt. Überprüfe die Logs
   ```

3. **Cache fast voll** (>80%):
   ```
   ℹ️ Cache fast voll
   Älteste Einträge werden automatisch entfernt
   ```

4. **System optimal**:
   ```
   ✅ System läuft optimal
   Keine Aktion erforderlich
   ```

#### Auto-Update

- Updates alle 5 Sekunden
- Real-time Metriken
- Keine manuelle Aktualisierung nötig

### 5. Integration mit bestehenden Tools

#### Log Viewer Integration

- Vollständig integriert im Admin-Dashboard
- Filter nach Level und Kategorie
- Export-Funktion

#### Cache Monitor Integration

- Real-time Cache-Statistiken
- Cache-Verwaltung
- Performance-Metriken

## Verwendung

### Template verwalten

```typescript
// Im Admin Dashboard
1. Navigiere zu "Templates" Tab
2. Suche/Filtere Templates
3. Klicke auf Aktions-Buttons:
   - 👁️ Ansehen: Template-Details
   - ✏️ Bearbeiten: Template bearbeiten
   - 🗑️ Löschen: Template löschen
```

### Field-Mapping erstellen

```typescript
// Im Admin Dashboard
1. Navigiere zu "Field-Mappings" Tab
2. Wähle Template aus Dropdown
3. Klicke "Neues Mapping hinzufügen"
4. Fülle Formular aus:
   - Field Key: z.B. "productName"
   - Remotion Prop: z.B. "productName"
   - Transformation: Optional "to_number", etc.
5. Klicke "Speichern"
```

### System überwachen

```typescript
// Im Admin Dashboard
1. Navigiere zu "System Monitor" Tab
2. Überprüfe Health Status (Grün/Gelb/Rot)
3. Analysiere Metriken:
   - Cache Hit Rate
   - Fehler/Warnungen
   - Performance
4. Folge Empfehlungen bei Bedarf
```

## Datenbank-Operationen

### Template Queries

```typescript
// Alle Templates laden
const { data: templates } = useTemplates();

// Templates nach Type filtern
const { data: templates } = useTemplates('ad');

// Einzelnes Template laden
const { data: template } = useTemplate(templateId);
```

### Field-Mapping Queries

```typescript
// Mappings laden
const { data: mappings } = useFieldMappings(templateId);

// Mapping erstellen/aktualisieren
await supabase
  .from('template_field_mappings')
  .upsert({
    template_id,
    field_key,
    remotion_prop_name,
    transformation_function,
  });

// Mapping löschen
await supabase
  .from('template_field_mappings')
  .delete()
  .eq('template_id', templateId)
  .eq('field_key', fieldKey);
```

### Cache Invalidierung

```typescript
const { invalidateTemplate, invalidateTemplates } = useInvalidateTemplateCache();

// Nach Template-Update
invalidateTemplate(templateId);
invalidateTemplates();
```

## UI/UX Design

### Farb-Codierung

- **Grün**: Erfolg, Healthy Status
- **Gelb**: Warnung, Warning Status
- **Rot**: Fehler, Critical Status
- **Blau**: Information, Info Status
- **Lila**: Performance-Metriken

### Icons

- 📄 `FileCode` - Templates
- 🗄️ `Database` - Field-Mappings
- 📊 `Activity` - System Monitor
- 🛡️ `Shield` - Logs
- 💾 `HardDrive` - Cache
- ➕ `Plus` - Hinzufügen
- ✏️ `Edit` - Bearbeiten
- 🗑️ `Trash2` - Löschen
- 👁️ `Eye` - Ansehen
- 🔄 `RefreshCw` - Aktualisieren

### Responsive Design

- Mobile-optimiert
- Grid-Layout für Karten
- Scroll-Areas für Listen
- Collapsible Sections

## Best Practices

### 1. Template-Verwaltung

```typescript
// ✅ GOOD: Immer Cache invalidieren nach Änderungen
await updateTemplate(template);
invalidateTemplates();

// ❌ BAD: Cache nicht invalidiert
await updateTemplate(template);
// Cache bleibt veraltet
```

### 2. Field-Mapping

```typescript
// ✅ GOOD: Validiere Transformationen
const validTransformations = [
  'to_number', 'to_string', 'to_array', ...
];
if (validTransformations.includes(transformation)) {
  // OK
}

// ❌ BAD: Keine Validierung
// Kann zu Runtime-Fehlern führen
```

### 3. System-Monitoring

```typescript
// ✅ GOOD: Regelmäßig Metriken prüfen
useEffect(() => {
  const interval = setInterval(updateMetrics, 5000);
  return () => clearInterval(interval);
}, []);

// ❌ BAD: Einmalige Prüfung
// Keine Real-time Updates
```

## Sicherheit

### Zugriffskontrolle

- Admin-Interface sollte authentifiziert sein
- Nur autorisierte Benutzer haben Zugriff
- CRUD-Operationen benötigen Permissions

### Empfohlene RLS Policies

```sql
-- Nur Admins können Templates erstellen/bearbeiten
CREATE POLICY "admin_only_templates"
ON content_templates
FOR ALL
USING (
  auth.uid() IN (
    SELECT user_id FROM admin_users
  )
);

-- Nur Admins können Field-Mappings ändern
CREATE POLICY "admin_only_mappings"
ON template_field_mappings
FOR ALL
USING (
  auth.uid() IN (
    SELECT user_id FROM admin_users
  )
);
```

## Performance-Überlegungen

### Template-Liste

- Pagination für große Listen
- Virtual Scrolling für 100+ Templates
- Lazy Loading von Details

### Field-Mappings

- Mappings werden pro Template geladen
- Cache-TTL: 30 Minuten (selten geändert)

### System Monitor

- Auto-Update alle 5 Sekunden
- Nur letzte 1000 Logs analysiert
- Performance-Metriken auf Top 3 begrenzt

## Troubleshooting

### Problem: Templates laden nicht

```typescript
// Lösung: Cache invalidieren und neu laden
const { invalidateTemplates } = useInvalidateTemplateCache();
invalidateTemplates();
refetch();
```

### Problem: Field-Mapping speichert nicht

```typescript
// Überprüfe:
1. Sind alle Pflichtfelder ausgefüllt?
2. Existiert der field_key im Template?
3. Ist die Transformation valid?
4. Sind Permissions korrekt?
```

### Problem: System Monitor zeigt falsche Daten

```typescript
// Lösung: Stats zurücksetzen
templateCache.resetStats();
performanceMonitor.reset();
templateLogger.clearLogs();
```

## Zukünftige Erweiterungen

- [ ] Bulk-Import von Templates
- [ ] Template-Versionierung
- [ ] Mapping-Validierung mit Remotion-Schema
- [ ] Automatische Mapping-Generierung
- [ ] Export/Import von Konfigurationen
- [ ] Audit-Log für Admin-Aktionen
- [ ] Template-Vorschau im Admin
- [ ] A/B-Test-Integration
- [ ] Analytics Dashboard
- [ ] User-Management

## Anmerkungen

- Admin-Interface ist nur für autorisierte Benutzer
- Alle Änderungen werden in Echtzeit reflektiert
- Cache wird automatisch invalidiert nach Updates
- System-Monitor aktualisiert sich automatisch
- Performance-Metriken nur in Development-Modus detailliert
