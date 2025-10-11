import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Minus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface GoalProgressUpdaterProps {
  goalId: string;
  currentValue: number;
  targetValue: number;
  unit: string;
  onUpdate: () => void;
}

export function GoalProgressUpdater({
  goalId,
  currentValue,
  targetValue,
  unit,
  onUpdate,
}: GoalProgressUpdaterProps) {
  const { toast } = useToast();
  const [value, setValue] = useState(currentValue);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleIncrement = () => {
    setValue((prev) => Math.min(prev + 1, targetValue));
  };

  const handleDecrement = () => {
    setValue((prev) => Math.max(prev - 1, 0));
  };

  const handleUpdate = async () => {
    setIsUpdating(true);
    try {
      const newProgress = Math.min((value / targetValue) * 100, 100);
      const isCompleted = value >= targetValue;

      const { error } = await supabase
        .from('social_goals')
        .update({
          current_value: value,
          progress_percent: newProgress,
          status: isCompleted ? 'completed' : 'active',
          updated_at: new Date().toISOString(),
        })
        .eq('id', goalId);

      if (error) throw error;

      // Emit event if completed
      if (isCompleted && currentValue < targetValue) {
        await supabase.from('app_events').insert({
          user_id: (await supabase.auth.getUser()).data.user?.id,
          event_type: 'goal.completed',
          source: 'goals_dashboard',
          payload_json: { goal_id: goalId },
        });
      }

      toast({
        title: 'Progress Updated',
        description: `Updated to ${value} ${unit}`,
      });

      onUpdate();
    } catch (error) {
      console.error('Error updating progress:', error);
      toast({
        title: 'Error',
        description: 'Failed to update progress',
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const hasChanged = value !== currentValue;

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        onClick={handleDecrement}
        disabled={value <= 0 || isUpdating}
      >
        <Minus className="h-4 w-4" />
      </Button>
      <Input
        type="number"
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        className="w-20 text-center"
        min={0}
        max={targetValue}
        disabled={isUpdating}
      />
      <Button
        variant="outline"
        size="icon"
        onClick={handleIncrement}
        disabled={value >= targetValue || isUpdating}
      >
        <Plus className="h-4 w-4" />
      </Button>
      {hasChanged && (
        <Button onClick={handleUpdate} disabled={isUpdating} size="sm">
          {isUpdating ? 'Updating...' : 'Save'}
        </Button>
      )}
    </div>
  );
}
