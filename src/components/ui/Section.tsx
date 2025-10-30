import { ReactNode } from 'react';

interface SectionProps {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bg?: 'default' | 'muted';
}

export function Section({ 
  title, 
  description, 
  action, 
  children, 
  className = '', 
  bg = 'default' 
}: SectionProps) {
  return (
    <section className={`py-6 ${bg === 'muted' ? 'bg-muted/30' : ''} ${className}`}>
      <div className="container max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-heading font-bold text-foreground">{title}</h2>
            {description && (
              <p className="text-sm text-muted-foreground mt-1">{description}</p>
            )}
          </div>
          {action}
        </div>
        {children}
      </div>
    </section>
  );
}
