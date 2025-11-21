import { useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, FileSpreadsheet, Download, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Papa from 'papaparse';

interface CSVUploadStepProps {
  templateFields: Array<{ key: string; label: string; type: string; required: boolean }>;
  onDataParsed: (data: Array<Record<string, any>>) => void;
}

export function CSVUploadStep({ templateFields, onDataParsed }: CSVUploadStepProps) {
  const [csvData, setCsvData] = useState<Array<Record<string, any>>>([]);
  const [isDragging, setIsDragging] = useState(false);
  const { toast } = useToast();

  const downloadTemplate = () => {
    // Generate CSV template with example row
    const headers = templateFields.map(f => f.key);
    const exampleRow = templateFields.map(f => {
      if (f.type === 'text') return 'Beispiel Text';
      if (f.type === 'number') return '100';
      if (f.type === 'url') return 'https://example.com/image.jpg';
      return 'Beispiel';
    });

    const csv = Papa.unparse([headers, exampleRow]);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'batch-video-template.csv';
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: 'Template heruntergeladen',
      description: 'Fülle die CSV-Datei mit deinen Daten und lade sie wieder hoch.'
    });
  };

  const parseCSV = useCallback((file: File) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data as Array<Record<string, any>>;
        
        if (data.length === 0) {
          toast({
            title: 'Leere CSV',
            description: 'Die CSV-Datei enthält keine Daten.',
            variant: 'destructive'
          });
          return;
        }

        // Validate required fields
        const requiredFields = templateFields.filter(f => f.required).map(f => f.key);
        const missingFields = requiredFields.filter(field => 
          !Object.keys(data[0]).includes(field)
        );

        if (missingFields.length > 0) {
          toast({
            title: 'Fehlende Spalten',
            description: `Die CSV muss folgende Spalten enthalten: ${missingFields.join(', ')}`,
            variant: 'destructive'
          });
          return;
        }

        setCsvData(data);
        onDataParsed(data);
        toast({
          title: 'CSV erfolgreich hochgeladen',
          description: `${data.length} Videos werden erstellt.`
        });
      },
      error: (error) => {
        toast({
          title: 'CSV Parsefehler',
          description: error.message,
          variant: 'destructive'
        });
      }
    });
  }, [templateFields, onDataParsed, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.csv') || file.type === 'text/csv')) {
      parseCSV(file);
    } else {
      toast({
        title: 'Ungültiges Dateiformat',
        description: 'Bitte lade eine CSV-Datei hoch.',
        variant: 'destructive'
      });
    }
  }, [parseCSV, toast]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      parseCSV(file);
    }
  };

  return (
    <Card className="p-6 space-y-6">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">CSV-Datei hochladen</h3>
        <p className="text-sm text-muted-foreground">
          Lade eine CSV-Datei mit deinen Video-Daten hoch oder lade zuerst die Vorlage herunter.
        </p>
      </div>

      {/* Download Template Button */}
      <Button
        variant="outline"
        onClick={downloadTemplate}
        className="w-full"
      >
        <Download className="mr-2 h-4 w-4" />
        CSV-Vorlage herunterladen
      </Button>

      {/* Upload Area */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`
          border-2 border-dashed rounded-lg p-12 text-center transition-colors
          ${isDragging ? 'border-primary bg-primary/5' : 'border-muted'}
        `}
      >
        <FileSpreadsheet className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-sm text-muted-foreground mb-4">
          CSV-Datei hierher ziehen oder klicken zum Hochladen
        </p>
        <label htmlFor="csv-upload">
          <Button variant="secondary" asChild>
            <span>
              <Upload className="mr-2 h-4 w-4" />
              CSV hochladen
            </span>
          </Button>
        </label>
        <input
          id="csv-upload"
          type="file"
          accept=".csv"
          className="hidden"
          onChange={handleFileInput}
        />
      </div>

      {/* Preview */}
      {csvData.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Vorschau (erste 3 Zeilen)</h4>
            <span className="text-sm text-muted-foreground">
              {csvData.length} Videos
            </span>
          </div>
          <div className="border rounded-lg overflow-auto max-h-64">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  {Object.keys(csvData[0]).map((key) => (
                    <th key={key} className="px-4 py-2 text-left font-medium">
                      {key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {csvData.slice(0, 3).map((row, index) => (
                  <tr key={index} className="border-t">
                    {Object.values(row).map((value, i) => (
                      <td key={i} className="px-4 py-2 text-muted-foreground">
                        {String(value).substring(0, 30)}
                        {String(value).length > 30 && '...'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Validation Info */}
          <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
            <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div className="text-sm space-y-1">
              <p className="font-medium text-blue-900 dark:text-blue-100">
                Validierung erfolgreich
              </p>
              <p className="text-blue-700 dark:text-blue-300">
                Alle Pflichtfelder sind vorhanden. Kosten: {csvData.length * 50} Credits
              </p>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
