import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload, Download, Loader2 } from 'lucide-react';
import { useVideoBatch } from '@/hooks/useVideoBatch';
import { useToast } from '@/hooks/use-toast';
import Papa from 'papaparse';

interface BatchVideoUploadProps {
  templateId: string;
  requiredFields: string[];
}

export const BatchVideoUpload = ({ templateId, requiredFields }: BatchVideoUploadProps) => {
  const [csvData, setCsvData] = useState<Array<Record<string, string | number>>>([]);
  const { createBatch, loading } = useVideoBatch();
  const { toast } = useToast();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      complete: (results) => {
        const data = results.data as Array<Record<string, string>>;
        
        // Validate required fields
        const firstRow = data[0];
        const missingFields = requiredFields.filter(field => !(field in firstRow));
        
        if (missingFields.length > 0) {
          toast({
            title: 'Fehlende Felder',
            description: `CSV fehlt: ${missingFields.join(', ')}`,
            variant: 'destructive'
          });
          return;
        }

        setCsvData(data.filter(row => Object.values(row).some(val => val)));
        toast({
          title: 'CSV hochgeladen',
          description: `${data.length} Zeilen erkannt`
        });
      },
      error: (error) => {
        toast({
          title: 'Fehler beim Lesen',
          description: error.message,
          variant: 'destructive'
        });
      }
    });
  };

  const downloadTemplate = () => {
    const csvContent = requiredFields.join(',') + '\n';
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'batch_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleBatchCreate = async () => {
    if (csvData.length === 0) {
      toast({
        title: 'Keine Daten',
        description: 'Bitte CSV-Datei hochladen',
        variant: 'destructive'
      });
      return;
    }

    await createBatch(templateId, csvData);
  };

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h3 className="font-semibold text-foreground mb-2">Batch-Video-Erstellung</h3>
        <p className="text-sm text-muted-foreground">
          Erstelle mehrere Videos auf einmal mit CSV-Upload
        </p>
      </div>

      <div className="space-y-3">
        <Button
          variant="outline"
          className="w-full"
          onClick={downloadTemplate}
        >
          <Download className="h-4 w-4 mr-2" />
          CSV-Template herunterladen
        </Button>

        <div className="relative">
          <Input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="cursor-pointer"
          />
        </div>

        {csvData.length > 0 && (
          <div className="bg-muted p-3 rounded-md">
            <p className="text-sm text-foreground font-medium">
              {csvData.length} Videos bereit
            </p>
            <p className="text-xs text-muted-foreground">
              Kosten: {csvData.length * 50} Credits
            </p>
          </div>
        )}

        <Button
          className="w-full"
          onClick={handleBatchCreate}
          disabled={loading || csvData.length === 0}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Erstelle {csvData.length} Videos...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-2" />
              Batch starten
            </>
          )}
        </Button>
      </div>
    </Card>
  );
};
