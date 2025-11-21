/**
 * Lazy-loaded TemplateCard for better initial page load
 */

import { lazy, Suspense } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const TemplateCard = lazy(() => 
  import('./TemplateCard').then(module => ({ default: module.TemplateCard }))
);

interface TemplateCardLazyProps {
  template: any;
  onSelect: (template: any) => void;
  onPreview?: (template: any) => void;
  isSelected: boolean;
}

function TemplateCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <Skeleton className="h-48 w-full" />
      <div className="p-4 space-y-3">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <div className="flex gap-2 pt-2">
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="h-9 w-20" />
        </div>
      </div>
    </Card>
  );
}

export function TemplateCardLazy(props: TemplateCardLazyProps) {
  return (
    <Suspense fallback={<TemplateCardSkeleton />}>
      <TemplateCard {...props} />
    </Suspense>
  );
}
