import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { CheckCircle, Sparkles, Copy, Trash } from "lucide-react";

interface PlannerToolbarProps {
  weekplan: any;
  onWeeksChange: (weeks: number) => void;
  onApprove: () => void;
  onApplyRecommendations: () => void;
}

export function PlannerToolbar({
  weekplan,
  onWeeksChange,
  onApprove,
  onApplyRecommendations,
}: PlannerToolbarProps) {
  return (
    <div className="border-b p-4 flex items-center justify-between bg-background">
      <div className="flex items-center gap-4">
        <div>
          <Label className="text-xs text-muted-foreground">Zeitraum</Label>
          <Select
            value={String(weekplan?.weeks || 2)}
            onValueChange={(val) => onWeeksChange(Number(val))}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 Woche</SelectItem>
              <SelectItem value="2">2 Wochen</SelectItem>
              <SelectItem value="3">3 Wochen</SelectItem>
              <SelectItem value="4">4 Wochen</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">Zeitzone</Label>
          <Select value={weekplan?.timezone || "Europe/Berlin"} disabled>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Europe/Berlin">Europe/Berlin</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onApplyRecommendations}>
          <Sparkles className="h-4 w-4 mr-2" />
          AI-Empfehlungen
        </Button>

        <Button size="sm" onClick={onApprove}>
          <CheckCircle className="h-4 w-4 mr-2" />
          Genehmigen
        </Button>
      </div>
    </div>
  );
}
