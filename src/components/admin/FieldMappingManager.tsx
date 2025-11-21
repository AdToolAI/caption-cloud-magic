import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Edit, Trash2, Save, X } from 'lucide-react';
import { useTemplates, useFieldMappings } from '@/hooks/useTemplateData';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const FieldMappingManager = () => {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);
  const [editingMapping, setEditingMapping] = useState<any>(null);

  const { data: templates } = useTemplates();
  const { data: fieldMappings, refetch } = useFieldMappings(selectedTemplateId);

  const selectedTemplate = templates?.find(t => t.id === selectedTemplateId);

  const transformations = [
    'to_number',
    'to_string',
    'to_boolean',
    'to_array',
    'color_to_hex',
    'url_encode',
    'trim',
    'lowercase',
    'uppercase',
  ];

  const handleSaveMapping = async () => {
    if (!editingMapping || !selectedTemplateId) return;

    try {
      const { error } = await supabase
        .from('template_field_mappings')
        .upsert({
          template_id: selectedTemplateId,
          field_key: editingMapping.field_key,
          remotion_prop_name: editingMapping.remotion_prop_name,
          transformation_function: editingMapping.transformation_function || null,
        });

      if (error) throw error;

      toast.success('Field-Mapping gespeichert');
      setIsEditing(false);
      setEditingMapping(null);
      refetch();
    } catch (error) {
      console.error('Error saving mapping:', error);
      toast.error('Fehler beim Speichern');
    }
  };

  const handleDeleteMapping = async (fieldKey: string) => {
    if (!selectedTemplateId) return;

    try {
      const { error } = await supabase
        .from('template_field_mappings')
        .delete()
        .eq('template_id', selectedTemplateId)
        .eq('field_key', fieldKey);

      if (error) throw error;

      toast.success('Field-Mapping gelöscht');
      refetch();
    } catch (error) {
      console.error('Error deleting mapping:', error);
      toast.error('Fehler beim Löschen');
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-2">Field-Mapping Verwaltung</h2>
          <p className="text-sm text-muted-foreground">
            Verwalte die Zuordnung von Template-Feldern zu Remotion-Props
          </p>
        </div>

        {/* Template Selection */}
        <div className="mb-6">
          <label className="text-sm font-medium mb-2 block">Template auswählen</label>
          <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
            <SelectTrigger>
              <SelectValue placeholder="Template wählen..." />
            </SelectTrigger>
            <SelectContent>
              {templates?.map((template) => (
                <SelectItem key={template.id} value={template.id}>
                  {template.name} ({template.content_type})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedTemplate && (
          <>
            {/* Template Info */}
            <Card className="p-4 mb-6 bg-muted/30">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Template:</span>
                  <span className="text-sm">{selectedTemplate.name}</span>
                  {selectedTemplate.remotion_component_id && (
                    <Badge variant="outline">
                      {selectedTemplate.remotion_component_id}
                    </Badge>
                  )}
                </div>
                <div>
                  <span className="text-sm font-medium">Verfügbare Felder:</span>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {selectedTemplate.customizable_fields.map((field: any, idx: number) => (
                      <Badge key={idx} variant="secondary">
                        {field.key} ({field.type})
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            {/* Add New Mapping */}
            <div className="mb-6">
              <Button
                onClick={() => {
                  setIsEditing(true);
                  setEditingMapping({
                    field_key: '',
                    remotion_prop_name: '',
                    transformation_function: null,
                  });
                }}
                size="sm"
              >
                <Plus className="h-4 w-4 mr-2" />
                Neues Mapping hinzufügen
              </Button>
            </div>

            {/* Editing Form */}
            {isEditing && (
              <Card className="p-4 mb-6 border-primary">
                <h3 className="font-semibold mb-4">
                  {editingMapping?.field_key ? 'Mapping bearbeiten' : 'Neues Mapping'}
                </h3>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Field Key</label>
                    <Input
                      value={editingMapping?.field_key || ''}
                      onChange={(e) =>
                        setEditingMapping({ ...editingMapping, field_key: e.target.value })
                      }
                      placeholder="z.B. productName"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Remotion Prop Name</label>
                    <Input
                      value={editingMapping?.remotion_prop_name || ''}
                      onChange={(e) =>
                        setEditingMapping({ ...editingMapping, remotion_prop_name: e.target.value })
                      }
                      placeholder="z.B. productName"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Transformation</label>
                    <Select
                      value={editingMapping?.transformation_function || 'none'}
                      onValueChange={(value) =>
                        setEditingMapping({
                          ...editingMapping,
                          transformation_function: value === 'none' ? null : value,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Keine</SelectItem>
                        {transformations.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleSaveMapping} size="sm">
                    <Save className="h-4 w-4 mr-2" />
                    Speichern
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsEditing(false);
                      setEditingMapping(null);
                    }}
                    size="sm"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Abbrechen
                  </Button>
                </div>
              </Card>
            )}

            {/* Existing Mappings */}
            <div className="space-y-3">
              <h3 className="font-semibold">
                Bestehende Mappings ({fieldMappings?.length || 0})
              </h3>
              
              {!fieldMappings || fieldMappings.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Keine Field-Mappings vorhanden. Erstelle ein neues Mapping.
                </p>
              ) : (
                fieldMappings.map((mapping: any, idx: number) => (
                  <Card key={idx} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 grid grid-cols-3 gap-4">
                        <div>
                          <span className="text-xs text-muted-foreground">Field Key</span>
                          <p className="font-mono text-sm">{mapping.field_key}</p>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground">Remotion Prop</span>
                          <p className="font-mono text-sm">{mapping.remotion_prop_name}</p>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground">Transformation</span>
                          <p className="font-mono text-sm">
                            {mapping.transformation_function || '-'}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setIsEditing(true);
                            setEditingMapping(mapping);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteMapping(mapping.field_key)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  );
};
