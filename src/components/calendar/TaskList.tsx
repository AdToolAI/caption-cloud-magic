import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, CheckCircle2, Circle } from "lucide-react";

interface Task {
  id: string;
  event_id: string;
  title: string;
  description: string | null;
  owner_id: string | null;
  status: string;
  priority: number;
  due_at: string | null;
  estimate_minutes: number | null;
  parent_task_id: string | null;
  created_at: string;
  updated_at: string;
}

interface TaskListProps {
  eventId: string;
  readOnly?: boolean;
}

export function TaskList({ eventId, readOnly = false }: TaskListProps) {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchTasks();
  }, [eventId]);

  const fetchTasks = async () => {
    const { data, error } = await supabase
      .from("calendar_tasks")
      .select("*")
      .eq("event_id", eventId)
      .order("priority", { ascending: false })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Failed to fetch tasks:", error);
    } else {
      setTasks(data || []);
    }
  };

  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) return;

    setLoading(true);

    try {
      const { error } = await supabase
        .from("calendar_tasks")
        .insert({
          event_id: eventId,
          title: newTaskTitle,
          owner_id: user?.id,
          status: 'todo',
          priority: 1,
        });

      if (error) throw error;

      setNewTaskTitle("");
      fetchTasks();
      toast.success("Task added");
    } catch (error: any) {
      console.error("Failed to add task:", error);
      toast.error(error.message || "Failed to add task");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleTask = async (task: Task) => {
    const newStatus = task.status === 'done' ? 'todo' : 'done';

    const { error } = await supabase
      .from("calendar_tasks")
      .update({ status: newStatus })
      .eq("id", task.id);

    if (error) {
      console.error("Failed to update task:", error);
      toast.error("Failed to update task");
    } else {
      fetchTasks();
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    const { error } = await supabase
      .from("calendar_tasks")
      .delete()
      .eq("id", taskId);

    if (error) {
      console.error("Failed to delete task:", error);
      toast.error("Failed to delete task");
    } else {
      fetchTasks();
      toast.success("Task deleted");
    }
  };

  const getPriorityColor = (priority: number) => {
    switch (priority) {
      case 3: return "text-red-500";
      case 2: return "text-yellow-500";
      default: return "text-gray-500";
    }
  };

  const getPriorityLabel = (priority: number) => {
    switch (priority) {
      case 3: return "High";
      case 2: return "Medium";
      default: return "Low";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Tasks ({tasks.length})</h3>
        <Badge variant="outline">
          {tasks.filter(t => t.status === 'done').length} / {tasks.length} completed
        </Badge>
      </div>

      {/* Task List */}
      <div className="space-y-2">
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No tasks yet. Add one to get started!
          </p>
        ) : (
          tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-3 p-2 rounded-lg border hover:bg-accent/50 transition-colors group"
            >
              <button
                onClick={() => handleToggleTask(task)}
                disabled={readOnly}
                className="flex-shrink-0"
              >
                {task.status === 'done' ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                ) : (
                  <Circle className="w-5 h-5 text-muted-foreground" />
                )}
              </button>

              <div className="flex-1 min-w-0">
                <p className={`text-sm ${task.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
                  {task.title}
                </p>
                {task.description && (
                  <p className="text-xs text-muted-foreground truncate">
                    {task.description}
                  </p>
                )}
              </div>

              <Badge
                variant="outline"
                className={`text-xs ${getPriorityColor(task.priority)}`}
              >
                {getPriorityLabel(task.priority)}
              </Badge>

              {!readOnly && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDeleteTask(task.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Add Task Input */}
      {!readOnly && (
        <div className="flex gap-2">
          <Input
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAddTask()}
            placeholder="Add a new task..."
            disabled={loading}
          />
          <Button
            size="sm"
            onClick={handleAddTask}
            disabled={loading || !newTaskTitle.trim()}
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
