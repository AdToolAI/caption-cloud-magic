import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import { CSVUploadStep } from '@/components/batch-video/CSVUploadStep';
import { BatchProgressDashboard } from '@/components/batch-video/BatchProgressDashboard';
import { useBatchVideoCreation } from '@/hooks/useBatchVideoCreation';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function BatchVideoCreator() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const templateId = searchParams.get('template_id');
  
  const [step, setStep] = useState(0);
  const [template, setTemplate] = useState<any>(null);
  const [jobName, setJobName] = useState('');
  const [csvData, setCsvData] = useState<Array<Record<string, any>>>([]);
  const [batchJobId, setBatchJobId] = useState<string | null>(null);
  
  const { createBatch, loading } = useBatchVideoCreation();

  useEffect(() => {
    if (!templateId) {
      navigate('/');
      return;
    }
    fetchTemplate();
  }, [templateId]);

  const fetchTemplate = async () => {
    const { data } = await supabase
      .from('video_templates')
      .select('*')
      .eq('id', templateId)
      .single();
    
    if (data) {
      setTemplate(data);
      setJobName(`Batch ${data.name} ${new Date().toLocaleDateString()}`);
    }
  };

  const handleStartBatch = async () => {
    if (!templateId || !csvData.length || !jobName) return;

    const result = await createBatch(templateId, jobName, csvData);
    if (result) {
      setBatchJobId(result.batch_job_id);
      setStep(2); // Go to progress dashboard
    }
  };

  if (!template) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Card className="p-6">
          <p className="text-center text-muted-foreground">Template wird geladen...</p>
        </Card>
      </div>
    );
  }

  const steps = [
    { title: 'CSV hochladen', description: 'Videodaten importieren' },
    { title: 'Bestätigen', description: 'Details überprüfen' },
    { title: 'Fortschritt', description: 'Videos werden erstellt' }
  ];

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Sparkles className="h-8 w-8 text-primary" />
            Batch Video Generator
          </h1>
          <p className="text-muted-foreground mt-1">
            Template: <span className="font-medium">{template.name}</span>
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Zurück
        </Button>
      </div>

      {/* Progress Stepper */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all ${
                    i <= step
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {i + 1}
                </div>
                <div className="text-center mt-2">
                  <span className={`text-sm font-medium ${i <= step ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {s.title}
                  </span>
                  <p className="text-xs text-muted-foreground">{s.description}</p>
                </div>
              </div>
              {i < steps.length - 1 && (
                <div className={`h-1 flex-1 mx-4 transition-colors ${i < step ? 'bg-primary' : 'bg-muted'}`} />
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Step Content */}
      {step === 0 && (
        <CSVUploadStep
          templateFields={template.customizable_fields || []}
          onDataParsed={setCsvData}
        />
      )}

      {step === 1 && csvData.length > 0 && (
        <Card className="p-6 space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-4">Batch-Details bestätigen</h3>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="job-name">Job Name</Label>
                <Input
                  id="job-name"
                  value={jobName}
                  onChange={(e) => setJobName(e.target.value)}
                  placeholder="z.B. Produktvideos März 2024"
                />
              </div>

              <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Template</p>
                  <p className="font-medium">{template.name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Anzahl Videos</p>
                  <p className="font-medium">{csvData.length}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Kosten</p>
                  <p className="font-medium">{csvData.length * 50} Credits</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Geschätzte Dauer</p>
                  <p className="font-medium">~{Math.ceil(csvData.length * 1.5)} Minuten</p>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {step === 2 && batchJobId && (
        <BatchProgressDashboard batchJobId={batchJobId} />
      )}

      {/* Navigation Buttons */}
      {step < 2 && (
        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => setStep(Math.max(0, step - 1))}
            disabled={step === 0}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Zurück
          </Button>
          
          {step === 0 && (
            <Button
              onClick={() => setStep(1)}
              disabled={csvData.length === 0}
            >
              Weiter
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
          
          {step === 1 && (
            <Button
              onClick={handleStartBatch}
              disabled={loading || !jobName}
            >
              {loading ? 'Wird gestartet...' : `${csvData.length} Videos erstellen`}
              <Sparkles className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
