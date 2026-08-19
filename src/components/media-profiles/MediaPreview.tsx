import { MediaProfileConfig } from '@/lib/mediaProfileSchema';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface MediaPreviewProps {
  config: MediaProfileConfig | null;
}

export function MediaPreview({ config }: MediaPreviewProps) {
  if (!config) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Preview</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[400px] text-muted-foreground">
          Konfiguration laden...
        </CardContent>
      </Card>
    );
  }

  const aspectRatio = config.width / config.height;
  const maxPreviewHeight = 400;
  const previewHeight = Math.min(maxPreviewHeight, config.height);
  const previewWidth = previewHeight * aspectRatio;

  const safeMargins = config.safeMargins || { top: 0, bottom: 0, left: 0, right: 0 };
  const scaleX = previewWidth / config.width;
  const scaleY = previewHeight / config.height;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center justify-between">
          <span>Live Preview</span>
          <Badge variant="outline">{config.aspect}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center space-y-4">
        <div className="relative" style={{ width: previewWidth, height: previewHeight }}>
          <div
            className="absolute inset-0 border-2 border-primary"
            style={{
              backgroundColor: config.background || '#f0f0f0'
            }}
          >
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-xs">
              <span className="bg-background/80 px-2 py-1 rounded">
                {config.fitMode === 'cover' && 'Cover: Füllt Frame, schneidet ab'}
                {config.fitMode === 'contain' && 'Contain: Passt rein, Letterbox'}
                {config.fitMode === 'pad' && 'Pad: Zentriert, Padding'}
                {config.fitMode === 'smart' && 'Smart: Intelligente Anpassung'}
              </span>
            </div>

            {(safeMargins.top > 0 || safeMargins.bottom > 0 || safeMargins.left > 0 || safeMargins.right > 0) && (
              <>
                {safeMargins.top > 0 && (
                  <div
                    className="absolute top-0 left-0 right-0 bg-red-500/20 border-b border-red-500"
                    style={{ height: safeMargins.top * scaleY }}
                  />
                )}
                {safeMargins.bottom > 0 && (
                  <div
                    className="absolute bottom-0 left-0 right-0 bg-red-500/20 border-t border-red-500"
                    style={{ height: safeMargins.bottom * scaleY }}
                  />
                )}
                {safeMargins.left > 0 && (
                  <div
                    className="absolute top-0 bottom-0 left-0 bg-red-500/20 border-r border-red-500"
                    style={{ width: safeMargins.left * scaleX }}
                  />
                )}
                {safeMargins.right > 0 && (
                  <div
                    className="absolute top-0 bottom-0 right-0 bg-red-500/20 border-l border-red-500"
                    style={{ width: safeMargins.right * scaleX }}
                  />
                )}
              </>
            )}
          </div>

          <div className="absolute -bottom-6 left-0 right-0 text-center text-xs text-muted-foreground">
            {config.width} × {config.height} px
          </div>
        </div>

        <div className="w-full space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Typ:</span>
            <Badge variant="secondary">{config.type}</Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Fit Mode:</span>
            <span className="font-mono">{config.fitMode}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Größenlimit:</span>
            <span className="font-mono">{config.sizeLimitMb} MB</span>
          </div>
          {config.video && (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Dauer:</span>
                <span className="font-mono">
                  {config.video.minDurationSec || 0}s - {config.video.maxDurationSec || '∞'}s
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">FPS:</span>
                <span className="font-mono">{config.video.targetFps || 30} fps</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bitrate:</span>
                <span className="font-mono">{config.video.targetBitrateMbps || 'auto'} Mbps</span>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
