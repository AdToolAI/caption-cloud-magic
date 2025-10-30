import { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: 'default' | 'outline' | 'secondary';
  };
  className?: string;
}

export const EmptyState = ({ 
  icon, 
  title, 
  description, 
  action,
  className = '' 
}: EmptyStateProps) => {
  return (
    <Card className={`p-12 text-center ${className}`}>
      <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4 text-muted-foreground">
        {icon}
      </div>
      <h3 className="text-xl font-semibold mb-2 text-foreground">
        {title}
      </h3>
      <p className="text-muted-foreground mb-6 max-w-md mx-auto">
        {description}
      </p>
      {action && (
        <Button 
          onClick={action.onClick}
          variant={action.variant || 'default'}
        >
          {action.label}
        </Button>
      )}
    </Card>
  );
};
