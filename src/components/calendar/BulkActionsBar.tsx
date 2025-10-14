import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Trash2, Copy, Calendar, CheckCircle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

interface BulkActionsBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onBulkDelete: () => void;
  onBulkDuplicate: () => void;
  onBulkStatusChange: (status: string) => void;
  onBulkReschedule: () => void;
}

export function BulkActionsBar({
  selectedCount,
  onClearSelection,
  onBulkDelete,
  onBulkDuplicate,
  onBulkStatusChange,
  onBulkReschedule,
}: BulkActionsBarProps) {
  const { t } = useTranslation();

  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground rounded-lg shadow-lg p-4 flex items-center gap-4 z-50">
      <div className="flex items-center gap-2">
        <CheckCircle className="h-5 w-5" />
        <span className="font-medium">{selectedCount} selected</span>
      </div>

      <div className="h-6 w-px bg-primary-foreground/20" />

      <div className="flex items-center gap-2">
        <Select onValueChange={onBulkStatusChange}>
          <SelectTrigger className="w-[180px] bg-background text-foreground">
            <SelectValue placeholder="Change status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="briefing">Briefing</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="review">Review</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="secondary" size="sm" onClick={onBulkReschedule}>
          <Calendar className="h-4 w-4 mr-2" />
          Reschedule
        </Button>

        <Button variant="secondary" size="sm" onClick={onBulkDuplicate}>
          <Copy className="h-4 w-4 mr-2" />
          Duplicate
        </Button>

        <Button variant="destructive" size="sm" onClick={onBulkDelete}>
          <Trash2 className="h-4 w-4 mr-2" />
          Delete
        </Button>
      </div>

      <div className="h-6 w-px bg-primary-foreground/20" />

      <Button variant="ghost" size="sm" onClick={onClearSelection}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
