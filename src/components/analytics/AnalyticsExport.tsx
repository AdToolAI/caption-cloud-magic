import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Download, FileText, FileSpreadsheet } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { AnalyticsData } from '@/hooks/useContentAnalytics';

interface Props {
  data: AnalyticsData;
  dateRange?: { start: string; end: string };
}

export function AnalyticsExport({ data, dateRange }: Props) {
  const { toast } = useToast();

  const exportToCSV = () => {
    try {
      // Create CSV for video performance
      let csv = 'Video Performance Report\n\n';
      csv += 'Video,Template,Views,Engagement Rate,Conversion Rate,Avg Watch Time,Created At\n';
      
      data.videoPerformance.forEach(v => {
        csv += `"${v.title}","${v.template_name}",${v.views},${v.engagement_rate.toFixed(2)},${v.conversion_rate.toFixed(2)},${v.avg_watch_time.toFixed(0)},${v.created_at}\n`;
      });

      csv += '\n\nTemplate ROI Analysis\n\n';
      csv += 'Template,Total Videos,Total Views,Avg Engagement,Total Cost,ROI Score,Revenue\n';
      
      data.templateROI.forEach(t => {
        csv += `"${t.template_name}",${t.total_videos},${t.total_views},${t.avg_engagement.toFixed(2)},${t.total_cost.toFixed(2)},${t.roi_score.toFixed(2)},${(t.revenue_generated || 0).toFixed(2)}\n`;
      });

      csv += '\n\nEngine Comparison\n\n';
      csv += 'Engine,Total Renders,Avg Render Time,Success Rate,Total Cost\n';
      csv += `Remotion,${data.engineComparison.remotion.total_renders},${data.engineComparison.remotion.avg_render_time},${data.engineComparison.remotion.success_rate},${data.engineComparison.remotion.total_cost.toFixed(2)}\n`;
      csv += `Shotstack,${data.engineComparison.shotstack.total_renders},${data.engineComparison.shotstack.avg_render_time},${data.engineComparison.shotstack.success_rate},${data.engineComparison.shotstack.total_cost.toFixed(2)}\n`;

      // Download
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `analytics-report-${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: 'CSV Export erfolgreich',
        description: 'Report wurde heruntergeladen'
      });
    } catch (error) {
      toast({
        title: 'Export fehlgeschlagen',
        description: 'CSV konnte nicht erstellt werden',
        variant: 'destructive'
      });
    }
  };

  const exportToPDF = () => {
    toast({
      title: 'PDF Export',
      description: 'PDF-Export wird vorbereitet... (Feature in Entwicklung)'
    });
  };

  const exportToJSON = () => {
    try {
      const jsonData = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonData], { type: 'application/json' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `analytics-data-${new Date().toISOString().split('T')[0]}.json`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: 'JSON Export erfolgreich',
        description: 'Rohdaten wurden heruntergeladen'
      });
    } catch (error) {
      toast({
        title: 'Export fehlgeschlagen',
        description: 'JSON konnte nicht erstellt werden',
        variant: 'destructive'
      });
    }
  };

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">📊 Reports exportieren</h3>
      
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Exportiere deine Analytics-Daten für externe Auswertungen oder Präsentationen
        </p>

        {dateRange && (
          <div className="text-xs text-muted-foreground">
            Zeitraum: {new Date(dateRange.start).toLocaleDateString('de-DE')} - {new Date(dateRange.end).toLocaleDateString('de-DE')}
          </div>
        )}

        <div className="grid grid-cols-3 gap-3 mt-4">
          <Button onClick={exportToCSV} variant="outline" className="w-full">
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            CSV Export
          </Button>

          <Button onClick={exportToPDF} variant="outline" className="w-full">
            <FileText className="h-4 w-4 mr-2" />
            PDF Report
          </Button>

          <Button onClick={exportToJSON} variant="outline" className="w-full">
            <Download className="h-4 w-4 mr-2" />
            JSON Daten
          </Button>
        </div>

        <div className="mt-4 p-3 rounded-lg bg-muted/30 text-xs text-muted-foreground">
          <p className="font-medium mb-1">Export enthält:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>{data.videoPerformance.length} Video Performance Einträge</li>
            <li>{data.templateROI.length} Template ROI Analysen</li>
            <li>Komplette Kostenaufstellung</li>
            <li>Engine Vergleichsdaten (Remotion vs. Shotstack)</li>
          </ul>
        </div>
      </div>
    </Card>
  );
}
