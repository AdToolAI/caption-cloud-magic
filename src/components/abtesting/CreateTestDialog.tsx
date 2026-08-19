import { tx } from "@/lib/i18nText";
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus } from 'lucide-react';
import { useVideoTemplates } from '@/hooks/useVideoTemplates';

interface Props {
  onCreateTest: (data: {
    template_id: string;
    test_name: string;
    hypothesis?: string;
    target_metric?: string;
  }) => void;
}

export function CreateTestDialog({ onCreateTest }: Props) {
  const [open, setOpen] = useState(false);
  const [testName, setTestName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [hypothesis, setHypothesis] = useState('');
  const [targetMetric, setTargetMetric] = useState('engagement_rate');

  const { data: templates, isLoading: templatesLoading } = useVideoTemplates();

  const handleSubmit = () => {
    if (!testName || !templateId) return;

    onCreateTest({
      template_id: templateId,
      test_name: testName,
      hypothesis: hypothesis || undefined,
      target_metric: targetMetric
    });

    // Reset form
    setTestName('');
    setTemplateId('');
    setHypothesis('');
    setTargetMetric('engagement_rate');
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          {tx({ de: "{tx({ de: \"Neuen A/B Test erstellen\", en: \"Create new A/B Test\", es: \"Crear nueva prueba A/B\" })}", en: "Create new A/B Test", es: "Crear nueva prueba A/B" })}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{tx({ de: "A/B Test erstellen", en: "Create A/B test", es: "Crear prueba A/B" })}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="test-name">Test Name *</Label>
            <Input
              id="test-name"
              placeholder="z.B. Thumbnail Farben Test"
              value={testName}
              onChange={(e) => setTestName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="template">Template *</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder={tx({ de: "Template auswählen", en: "Select template", es: "Seleccionar plantilla" })} />
              </SelectTrigger>
              <SelectContent>
                {templatesLoading ? (
                  <SelectItem value="loading" disabled>{tx({ de: "Lade Templates...", en: "Loading Templates...", es: "Cargando plantillas..." })}</SelectItem>
                ) : (
                  templates?.map(template => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="hypothesis">Hypothese (optional)</Label>
            <Textarea
              id="hypothesis"
              placeholder={tx({ de: "z.B. Rote Thumbnails generieren 20% mehr Klicks als blaue", en: "e.g. Red thumbnails generate 20% more clicks than blue ones", es: "p.ej. Las miniaturas rojas generan un 20% más de clics que las azules" })}
              value={hypothesis}
              onChange={(e) => setHypothesis(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="target-metric">Ziel-Metrik</Label>
            <Select value={targetMetric} onValueChange={setTargetMetric}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="views">Views</SelectItem>
                <SelectItem value="engagement_rate">Engagement Rate</SelectItem>
                <SelectItem value="conversion_rate">Conversion Rate</SelectItem>
                <SelectItem value="watch_time">Watch Time</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setOpen(false)}>
              {tx({ de: "{tx({ de: \"Abbrechen\", en: \"Cancel\", es: \"Cancelar\" })}", en: "Cancel", es: "Cancelar" })}
            </Button>
            <Button onClick={handleSubmit} disabled={!testName || !templateId}>
              {tx({ de: "{tx({ de: \"Test erstellen\", en: \"Create Test\", es: \"Crear prueba\" })}", en: "Create Test", es: "Crear prueba" })}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
