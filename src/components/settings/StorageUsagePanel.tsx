import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { useStorageQuota } from '@/hooks/useStorageQuota';
import { HardDrive, RefreshCw, Trash2, TrendingUp } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const StorageUsagePanel = () => {
  const { quota, breakdown, loading, recalculateUsage, deleteOldDrafts } = useStorageQuota();

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            Storage Usage
          </CardTitle>
          <CardDescription>Loading storage information...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!quota) {
    return null;
  }

  const usagePercent = quota.usage_percent || 0;
  const isWarning = usagePercent >= 80;
  const isCritical = usagePercent >= 90;
  const isExceeded = usagePercent >= 100;

  const formatSize = (mb: number) => {
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(2)} GB`;
    }
    return `${mb.toFixed(2)} MB`;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <HardDrive className="h-5 w-5" />
                Storage Usage
              </CardTitle>
              <CardDescription>
                {formatSize(quota.used_mb)} of {formatSize(quota.quota_mb)} used
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={recalculateUsage}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Recalculate
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Usage</span>
              <span className={`font-medium ${
                isExceeded ? 'text-destructive' : 
                isCritical ? 'text-orange-500' : 
                isWarning ? 'text-yellow-500' : 
                'text-foreground'
              }`}>
                {usagePercent}%
              </span>
            </div>
            <Progress 
              value={Math.min(usagePercent, 100)} 
              className={
                isExceeded ? 'bg-destructive/20' : 
                isCritical ? 'bg-orange-500/20' : 
                isWarning ? 'bg-yellow-500/20' : 
                ''
              }
            />
          </div>

          {/* Warnings */}
          {isExceeded && (
            <Alert variant="destructive">
              <AlertTitle>Storage Quota Exceeded</AlertTitle>
              <AlertDescription>
                You have exceeded your storage limit. Please delete old files or upgrade your plan to continue creating videos.
              </AlertDescription>
            </Alert>
          )}

          {!isExceeded && isCritical && (
            <Alert variant="destructive">
              <AlertTitle>Storage Almost Full</AlertTitle>
              <AlertDescription>
                You are using {usagePercent}% of your storage. Consider cleaning up old files soon.
              </AlertDescription>
            </Alert>
          )}

          {!isExceeded && !isCritical && isWarning && (
            <Alert>
              <TrendingUp className="h-4 w-4" />
              <AlertTitle>Storage Warning</AlertTitle>
              <AlertDescription>
                You are using {usagePercent}% of your storage quota.
              </AlertDescription>
            </Alert>
          )}

          {/* Storage Breakdown */}
          {breakdown && (
            <div className="space-y-3 pt-4 border-t">
              <h4 className="text-sm font-medium">Storage Breakdown</h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Original Videos</span>
                  <span className="font-medium">{formatSize(breakdown.videos)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Optimized Videos</span>
                  <span className="font-medium">{formatSize(breakdown.optimized)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Video Variants</span>
                  <span className="font-medium">{formatSize(breakdown.variants)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Thumbnails</span>
                  <span className="font-medium">{formatSize(breakdown.thumbnails)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-4 border-t">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="w-full gap-2">
                  <Trash2 className="h-4 w-4" />
                  Delete Old Drafts
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Old Drafts?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all draft projects older than 30 days and their associated files. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={deleteOldDrafts}>
                    Delete Drafts
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {isWarning && (
              <Button className="w-full">
                Upgrade Plan
              </Button>
            )}
          </div>

          {/* Plan Info */}
          <div className="text-xs text-muted-foreground text-center pt-2">
            Current plan: <span className="font-medium capitalize">{quota.plan_tier}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
