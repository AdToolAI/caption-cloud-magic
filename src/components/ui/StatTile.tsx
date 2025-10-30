import { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface StatTileProps {
  title: string;
  value: string | number;
  change?: {
    value: number;
    type: 'increase' | 'decrease' | 'neutral';
  };
  icon?: ReactNode;
  suffix?: string;
  description?: string;
  className?: string;
}

export const StatTile = ({
  title,
  value,
  change,
  icon,
  suffix,
  description,
  className = ''
}: StatTileProps) => {
  const getTrendIcon = () => {
    if (!change) return null;
    
    switch (change.type) {
      case 'increase':
        return <TrendingUp className="h-4 w-4 text-success" />;
      case 'decrease':
        return <TrendingDown className="h-4 w-4 text-destructive" />;
      case 'neutral':
        return <Minus className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getTrendColor = () => {
    if (!change) return '';
    
    switch (change.type) {
      case 'increase':
        return 'text-success';
      case 'decrease':
        return 'text-destructive';
      case 'neutral':
        return 'text-muted-foreground';
    }
  };

  return (
    <Card className={`p-6 ${className}`}>
      <div className="flex items-start justify-between mb-2">
        <p className="text-sm font-medium text-muted-foreground">
          {title}
        </p>
        {icon && (
          <div className="text-muted-foreground">
            {icon}
          </div>
        )}
      </div>
      
      <div className="flex items-baseline gap-2 mb-1">
        <h3 className="text-3xl font-bold text-foreground">
          {value}
        </h3>
        {suffix && (
          <span className="text-lg text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>

      {change && (
        <div className={`flex items-center gap-1 text-sm ${getTrendColor()}`}>
          {getTrendIcon()}
          <span className="font-medium">
            {Math.abs(change.value)}%
          </span>
          <span className="text-muted-foreground">
            vs. vorher
          </span>
        </div>
      )}

      {description && (
        <p className="text-xs text-muted-foreground mt-2">
          {description}
        </p>
      )}
    </Card>
  );
};
