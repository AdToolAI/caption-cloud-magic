import { useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useEventEmitter } from "@/hooks/useEventEmitter";
import { useAuth } from "@/hooks/useAuth";
import { getProductInfo } from "@/config/pricing";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, Download } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface CSVUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export const CSVUploadDialog = ({ open, onOpenChange, onSuccess }: CSVUploadDialogProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { emit } = useEventEmitter();
  const { subscribed, productId } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const downloadTemplate = () => {
    const headers = [
      'post_id',
      'platform',
      'post_url',
      'caption_text',
      'posted_at',
      'likes',
      'comments',
      'shares',
      'saves',
      'reach',
      'impressions',
      'video_views',
      'media_type'
    ];
    
    const exampleRow = [
      'post_123456',
      'instagram',
      'https://instagram.com/p/example',
      'Check out our new product!',
      '2025-01-15T12:00:00Z',
      '150',
      '25',
      '10',
      '30',
      '5000',
      '8000',
      '2000',
      'photo'
    ];

    const csv = [headers.join(','), exampleRow.join(',')].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'post_metrics_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === 'text/csv') {
      setFile(selectedFile);
    } else {
      toast({
        title: t('common.error'),
        description: t('performance.csv.invalidFile'),
        variant: "destructive"
      });
    }
  };

  const parseCSV = (text: string): any[] => {
    const lines = text.split('\n').filter(line => line.trim());
    const headers = lines[0].split(',').map(h => h.trim());
    
    return lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim());
      const row: any = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || null;
      });
      return row;
    });
  };

  const validateRow = (row: any): boolean => {
    const required = ['post_id', 'platform', 'posted_at'];
    return required.every(field => row[field] && row[field].trim() !== '');
  };

  const handleUpload = async () => {
    if (!file) {
      toast({
        title: t('common.error'),
        description: t('performance.csv.noFile'),
        variant: "destructive"
      });
      return;
    }

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const text = await file.text();
      const rows = parseCSV(text);

      // Check plan limits
      const isPro = subscribed && productId === 'prod_TDoYdYP1nOOWsN';

      // Validate rows
      const validRows = rows.filter(validateRow);
      if (validRows.length === 0) {
        throw new Error(t('performance.csv.noValidRows'));
      }

      // Enforce free plan limit
      if (!isPro && validRows.length > 50) {
        throw new Error('Free plan limited to 50 posts. Upgrade to Pro for unlimited posts.');
      }

      // Transform and insert
      const metrics = validRows.map(row => ({
        user_id: user.id,
        provider: row.platform.toLowerCase(),
        account_id: 'csv_import',
        post_id: row.post_id,
        post_url: row.post_url || null,
        media_type: row.media_type || null,
        caption_text: row.caption_text || null,
        posted_at: row.posted_at,
        likes: row.likes ? parseInt(row.likes) : null,
        comments: row.comments ? parseInt(row.comments) : null,
        shares: row.shares ? parseInt(row.shares) : null,
        saves: row.saves ? parseInt(row.saves) : null,
        reach: row.reach ? parseInt(row.reach) : null,
        impressions: row.impressions ? parseInt(row.impressions) : null,
        video_views: row.video_views ? parseInt(row.video_views) : null
      }));

      const { error } = await supabase
        .from('post_metrics')
        .upsert(metrics, { 
          onConflict: 'user_id,provider,post_id',
          ignoreDuplicates: false 
        });

      if (error) throw error;

      await emit({
        event_type: 'performance.csv.uploaded',
        source: 'csv_upload_dialog',
        payload: {
          posts_imported: validRows.length,
          file_name: file.name,
        },
      }, { silent: true });

      toast({
        title: t('common.success'),
        description: t('performance.csv.uploadSuccess', { count: validRows.length }),
      });

      onSuccess();
      onOpenChange(false);
      setFile(null);
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('performance.csv.uploadTitle')}</DialogTitle>
          <DialogDescription>{t('performance.csv.uploadDescription')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert>
            <FileText className="h-4 w-4" />
            <AlertDescription>
              {t('performance.csv.formatInfo')}
            </AlertDescription>
          </Alert>

          <div className="flex justify-center">
            <Button variant="outline" onClick={downloadTemplate}>
              <Download className="mr-2 h-4 w-4" />
              {t('performance.csv.downloadTemplate')}
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="csv-file">{t('performance.csv.selectFile')}</Label>
            <Input
              id="csv-file"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
            />
            {file && (
              <p className="text-sm text-muted-foreground">
                {t('performance.csv.selectedFile')}: {file.name}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleUpload} disabled={!file || uploading}>
              {uploading ? t('common.uploading') : t('performance.csv.upload')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};