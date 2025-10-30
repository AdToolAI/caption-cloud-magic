import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';

export const KpiCardSkeleton = () => (
  <Card className="p-6">
    <Skeleton className="h-4 w-24 mb-2" />
    <Skeleton className="h-8 w-32 mb-1" />
    <Skeleton className="h-3 w-20" />
  </Card>
);

export const ChartSkeleton = () => (
  <Card className="p-6">
    <Skeleton className="h-6 w-48 mb-6" />
    <div className="space-y-2">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="flex items-end gap-2">
          <Skeleton className="h-3 w-12" />
          <Skeleton 
            className="flex-1" 
            style={{ height: `${Math.random() * 100 + 50}px` }}
          />
        </div>
      ))}
    </div>
  </Card>
);

export const TableSkeleton = ({ rows = 5 }: { rows?: number }) => (
  <Card className="p-6">
    <Skeleton className="h-6 w-48 mb-4" />
    <div className="space-y-3">
      {[...Array(rows)].map((_, i) => (
        <div key={i} className="flex gap-4">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-24" />
        </div>
      ))}
    </div>
  </Card>
);

export const HeatmapSkeleton = () => (
  <Card className="p-6">
    <Skeleton className="h-6 w-48 mb-6" />
    <div className="grid grid-cols-7 gap-2">
      {[...Array(7 * 24)].map((_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  </Card>
);
