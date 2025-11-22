import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { CalendarIcon } from "lucide-react";
import { format, subDays } from "date-fns";
import { cn } from "@/lib/utils";

interface DateRange {
  from: Date;
  to: Date;
}

interface DateRangeSelectorProps {
  onRangeChange: (range: DateRange, compareEnabled: boolean) => void;
  currentRange: DateRange;
  compareEnabled: boolean;
}

const PRESET_RANGES = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];

export function DateRangeSelector({ onRangeChange, currentRange, compareEnabled }: DateRangeSelectorProps) {
  const [localRange, setLocalRange] = useState<DateRange>(currentRange);
  const [localCompare, setLocalCompare] = useState(compareEnabled);
  const [customMode, setCustomMode] = useState(false);

  const handlePresetClick = (days: number) => {
    const newRange = {
      from: subDays(new Date(), days),
      to: new Date(),
    };
    setLocalRange(newRange);
    setCustomMode(false);
    onRangeChange(newRange, localCompare);
  };

  const handleCustomRangeChange = (date: Date | undefined, type: 'from' | 'to') => {
    if (!date) return;
    
    const newRange = {
      ...localRange,
      [type]: date,
    };
    setLocalRange(newRange);
  };

  const handleApplyCustomRange = () => {
    onRangeChange(localRange, localCompare);
  };

  const handleCompareToggle = (checked: boolean) => {
    setLocalCompare(checked);
    onRangeChange(localRange, checked);
  };

  return (
    <div className="flex items-center gap-3">
      {/* Preset Buttons */}
      {PRESET_RANGES.map((preset) => (
        <Button
          key={preset.days}
          variant="outline"
          size="sm"
          onClick={() => handlePresetClick(preset.days)}
          className={cn(
            "transition-colors",
            !customMode && 
            format(currentRange.from, "yyyy-MM-dd") === format(subDays(new Date(), preset.days), "yyyy-MM-dd") &&
            "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
        >
          {preset.label}
        </Button>
      ))}

      {/* Custom Range Picker */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "gap-2",
              customMode && "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
          >
            <CalendarIcon className="h-4 w-4" />
            Custom
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-4" align="start">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">From Date</label>
              <Calendar
                mode="single"
                selected={localRange.from}
                onSelect={(date) => handleCustomRangeChange(date, 'from')}
                disabled={(date) => date > new Date()}
                className="pointer-events-auto"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">To Date</label>
              <Calendar
                mode="single"
                selected={localRange.to}
                onSelect={(date) => handleCustomRangeChange(date, 'to')}
                disabled={(date) => date > new Date() || date < localRange.from}
                className="pointer-events-auto"
              />
            </div>
            <Button 
              onClick={() => {
                setCustomMode(true);
                handleApplyCustomRange();
              }}
              className="w-full"
            >
              Apply Custom Range
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Compare Toggle */}
      <div className="flex items-center gap-2 ml-2 pl-2 border-l">
        <Checkbox
          id="compare"
          checked={localCompare}
          onCheckedChange={handleCompareToggle}
        />
        <label
          htmlFor="compare"
          className="text-sm font-medium cursor-pointer select-none"
        >
          Compare to previous period
        </label>
      </div>
    </div>
  );
}
