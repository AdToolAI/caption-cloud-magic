import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { MiniCalendar } from "./MiniCalendar";
import { CheckCircle, Sparkles, Calendar, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface PlannerToolbarProps {
  weekplan: any;
  postsPerDay: Record<string, { scheduled: number; approved: number }>;
  onWeeksChange: (weeks: number) => void;
  onApprove: () => void;
  onApplyRecommendations: () => void;
  onDateClick: (date: Date) => void;
}

export function PlannerToolbar({
  weekplan,
  postsPerDay,
  onWeeksChange,
  onApprove,
  onApplyRecommendations,
  onDateClick,
}: PlannerToolbarProps) {
  return (
    <div className="border-b p-4 flex items-center justify-between bg-background">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <span className="font-semibold">Content Planner</span>
        </div>

        {weekplan && (
          <MiniCalendar
            startDate={weekplan.start_date}
            weeks={weekplan.weeks}
            postsPerDay={postsPerDay}
            onDateClick={onDateClick}
          />
        )}

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

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>Duplizieren</DropdownMenuItem>
            <DropdownMenuItem>Leeren</DropdownMenuItem>
            <DropdownMenuItem>Export</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
