import { tx } from "@/lib/i18nText";
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
            title: tx({ de: 'Fehlende Felder', en: 'Missing fields', es: 'Campos faltantes' }),
            description: tx({ de: `CSV fehlt: ${missingFields.join(', ')}`, en: `CSV missing: ${missingFields.join(', ')}`, es: `Falta CSV: ${missingFields.join(', ')}` }),
            variant: 'destructive'
          });
          return;
        }

        setCsvData(data.filter(row => Object.values(row).some(val => val)));
        toast({
          title: tx({ de: 'CSV hochgeladen', en: 'CSV uploaded', es: 'CSV cargado' }),
          description: tx({ de: `${data.length} Zeilen erkannt`, en: `${data.length} lines detected`, es: `${data.length} líneas detectadas` })
        });
      },
      error: (error) => {
        toast({
          title: tx({ de: 'Fehler beim Lesen', en: 'Error reading', es: 'Error de lectura' }),
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
        title: tx({ de: 'Keine Daten', en: 'No data', es: 'Sin datos' }),
        description: tx({ de: 'Bitte CSV-Datei hochladen', en: 'Please upload CSV file', es: 'Por favor, sube un archivo CSV' }),
        variant: 'destructive'
      });
      return;
    }

    await createBatch(templateId, csvData);
  };

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h3 className="font-semibold text-foreground mb-2">{tx({ de: "Batch-Video-Erstellung", en: "Batch video creation", es: "Creación de vídeos por lotes" })}</h3>
        <p className="text-sm text-muted-foreground">
          tx({ de: "Erstelle mehrere Videos auf einmal mit CSV-Upload", en: "Create multiple videos at once with CSV upload", es: "Crea varios vídeos a la vez con la carga de CSV" })
        </p>
      </div>

      <div className="space-y-3">
        <Button
          variant="outline"
          className="w-full"
          onClick={downloadTemplate}
        >
          <Download className="h-4 w-4 mr-2" />
          tx({ de: "CSV-Template herunterladen", en: "Download CSV template", es: "Descargar plantilla CSV" })
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
              {csvData.length} tx({ de: "Videos bereit", en: "Videos ready", es: "Vídeos listos" })
            </p>
            <p className="text-xs text-muted-foreground">
              tx({ de: `Kosten: ${csvData.length * 50} Credits`, en: `Cost: ${csvData.length * 50} credits`, es: `Costo: ${csvData.length * 50} créditos` })
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
              tx({ de: `Erstelle ${csvData.length} Videos...`, en: `Creating ${csvData.length} videos...`, es: `Creando ${csvData.length} vídeos...` })
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-2" />
              tx({ de: "Batch starten", en: "Start batch", es: "Iniciar lote" })
            </>
          )}
        </Button>
      </div>
    </Card>
  );
};
