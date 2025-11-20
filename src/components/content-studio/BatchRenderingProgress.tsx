import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2, Download, Package } from "lucide-react";

interface RenderResult {
  format: string;
  aspect_ratio: string;
  url: string;
  size_mb: number;
  status?: 'pending' | 'rendering' | 'completed' | 'failed';
  progress?: number;
}

interface BatchRenderingProgressProps {
  results: RenderResult[];
  isComplete?: boolean;
  onDownload?: (result: RenderResult) => void;
  onDownloadAll?: () => void;
}

export function BatchRenderingProgress({ 
  results, 
  isComplete = false,
  onDownload,
  onDownloadAll 
}: BatchRenderingProgressProps) {
  const completedCount = results.filter(r => r.status === 'completed').length;
  const totalCount = results.length;
  const overallProgress = (completedCount / totalCount) * 100;

  const formatLabel = (format: string) => format.toUpperCase();
  const formatSize = (sizeMb: number) => `${sizeMb.toFixed(1)} MB`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isComplete ? (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            ) : (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            )}
            {isComplete 
              ? `${totalCount} Videos erfolgreich erstellt!`
              : `Rendering ${totalCount} Varianten...`
            }
          </div>
          {isComplete && (
            <Badge variant="secondary">{completedCount}/{totalCount}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Individual Results */}
        <div className="space-y-3">
          {results.map((result, index) => {
            const status = result.status || 'completed';
            const progress = result.progress || (status === 'completed' ? 100 : 0);
            
            return (
              <div key={index} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    {status === 'completed' ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : status === 'rendering' ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border-2 border-muted" />
                    )}
                    <span className="font-medium">
                      {result.aspect_ratio} {formatLabel(result.format)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {status === 'completed' && (
                      <>
                        <span className="text-muted-foreground">
                          {formatSize(result.size_mb)}
                        </span>
                        {onDownload && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onDownload(result)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            );
          })}
        </div>

        {/* Summary */}
        {!isComplete && (
          <div className="flex items-center justify-between text-sm text-muted-foreground pt-4 border-t">
            <span>⏱️ Geschätzte Zeit:</span>
            <span className="font-medium">
              {Math.ceil((totalCount - completedCount) * 0.5)} Min
            </span>
          </div>
        )}

        {/* Actions */}
        {isComplete && onDownloadAll && (
          <div className="flex gap-2 pt-4 border-t">
            <Button className="flex-1" onClick={onDownloadAll}>
              <Package className="mr-2 h-4 w-4" />
              Alle als ZIP downloaden
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}