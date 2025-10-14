import { Calendar, Users, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";

export function CalendarEmptyState() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <Card className="border-2 border-dashed border-border/50 bg-background/50">
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center space-y-6">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/10 rounded-full blur-2xl" />
          <div className="relative bg-primary/5 p-6 rounded-full">
            <Calendar className="h-16 w-16 text-primary" />
          </div>
        </div>

        <div className="space-y-3 max-w-md">
          <h3 className="text-2xl font-semibold">
            Workspace erforderlich
          </h3>
          <p className="text-muted-foreground text-base leading-relaxed">
            Der Content Calendar organisiert Ihre Beiträge in Workspaces. Erstellen Sie einen Workspace, um loszulegen.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
          <Button 
            onClick={() => navigate("/team-workspace")}
            size="lg"
            className="flex-1 group"
          >
            <Users className="h-5 w-5 mr-2" />
            Workspace erstellen
            <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
          </Button>
        </div>

        <div className="text-sm text-muted-foreground mt-4">
          Workspaces ermöglichen Team-Zusammenarbeit und organisieren Ihre Content-Planung
        </div>
      </div>
    </Card>
  );
}
