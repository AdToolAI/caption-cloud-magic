import { ReactNode } from "react";

interface MetricCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  trend?: { value: number; isPositive: boolean };
}

export function MetricCard({ label, value, subtitle, icon, trend }: MetricCardProps) {
  return (
    <div className="rounded-2xl bg-card shadow-soft hover:shadow-glow transition-all duration-300 p-6 border border-border/50">
      <div className="flex items-start justify-between mb-3">
        <div className="text-sm font-medium text-muted-foreground">{label}</div>
        {icon && <div className="text-primary">{icon}</div>}
      </div>
      
      <div className="text-3xl font-bold font-heading mb-1">{value}</div>
      
      {subtitle && (
        <div className="text-xs text-muted-foreground">{subtitle}</div>
      )}
      
      {trend && (
        <div className={`text-xs font-medium mt-2 ${trend.isPositive ? 'text-success' : 'text-danger'}`}>
          {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
        </div>
      )}
    </div>
  );
}
