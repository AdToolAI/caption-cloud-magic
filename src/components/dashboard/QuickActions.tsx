import { Link } from "react-router-dom";
import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface QuickAction {
  label: string;
  icon: LucideIcon;
  to: string;
  variant?: 'default' | 'outline';
}

interface QuickActionsProps {
  actions: QuickAction[];
}

export function QuickActions({ actions }: QuickActionsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {actions.map((action, i) => (
        <Button 
          key={i}
          asChild 
          size="lg" 
          variant={action.variant || 'outline'}
          className="h-auto py-6 rounded-2xl shadow-soft hover:shadow-glow transition-all"
        >
          <Link to={action.to}>
            <div className="flex flex-col items-center gap-2">
              <action.icon className="h-6 w-6" />
              <span className="text-sm font-medium">{action.label}</span>
            </div>
          </Link>
        </Button>
      ))}
    </div>
  );
}
