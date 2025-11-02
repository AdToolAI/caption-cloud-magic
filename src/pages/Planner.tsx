import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { WeekGrid } from "@/components/planner/WeekGrid";
import { ContentLibrary } from "@/components/planner/ContentLibrary";
import { PlannerToolbar } from "@/components/planner/PlannerToolbar";
import { BlockEditorDrawer } from "@/components/planner/BlockEditorDrawer";
import { TimePickerDialog } from "@/components/planner/TimePickerDialog";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { DndContext, DragEndEvent, DragOverlay } from "@dnd-kit/core";
import { Card } from "@/components/ui/card";

export default function Planner() {
  const { user } = useAuth();
  const [weekplan, setWeekplan] = useState<any>(null);
  const [blocks, setBlocks] = useState<any[]>([]);
  const [selectedBlock, setSelectedBlock] = useState<any>(null);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingDrop, setPendingDrop] = useState<{ date: Date; content: any } | null>(null);

  useEffect(() => {
    if (user) {
      loadUserWorkspace();
    }
  }, [user]);

  useEffect(() => {
    if (workspaceId) {
      loadOrCreateWeekplan();
    }
  }, [workspaceId]);

  const loadUserWorkspace = async () => {
    const { data: workspaces } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user?.id)
      .limit(1)
      .single();

    if (workspaces) {
      setWorkspaceId(workspaces.workspace_id);
    }
  };

  const loadOrCreateWeekplan = async () => {
    setLoading(true);
    try {
      // Try to load the most recent weekplan
      const { data: plans } = await supabase
        .from("weekplans")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (plans && plans.length > 0) {
        setWeekplan(plans[0]);
        loadBlocks(plans[0].id);
      } else {
        // Create a default 2-week plan
        const startDate = new Date();
        startDate.setHours(0, 0, 0, 0);

        console.log("Creating new weekplan for workspace:", workspaceId);

        // Try edge function first
        const { data, error } = await supabase.functions.invoke("planner-upsert-weekplan", {
          body: {
            workspace_id: workspaceId,
            name: "Mein Content Plan",
            start_date: startDate.toISOString().split("T")[0],
            weeks: 2,
            timezone: "Europe/Berlin",
            default_platforms: ["Instagram", "Facebook"],
          },
        });

        if (error) {
          console.error("Edge function error:", error);
          // Fallback: Direct database insert
          console.log("Falling back to direct database insert");
          
          const { data: newPlan, error: insertError } = await supabase
            .from("weekplans")
            .insert({
              workspace_id: workspaceId,
              name: "Mein Content Plan",
              start_date: startDate.toISOString().split("T")[0],
              weeks: 2,
              timezone: "Europe/Berlin",
              default_platforms: ["Instagram", "Facebook"],
              created_by: user?.id,
            })
            .select()
            .single();

          if (insertError) {
            console.error("Direct insert error:", insertError);
            throw insertError;
          }

          if (newPlan) {
            console.log("Weekplan created successfully:", newPlan.id);
            setWeekplan(newPlan);
            setBlocks([]);
            toast.success("Content Plan erstellt");
          }
        } else if (data) {
          console.log("Weekplan created via edge function:", data.id);
          setWeekplan(data);
          setBlocks([]);
          toast.success("Content Plan erstellt");
        }
      }
    } catch (error: any) {
      console.error("Error loading/creating weekplan:", error);
      toast.error("Fehler beim Laden des Plans: " + (error.message || "Unbekannter Fehler"));
    } finally {
      setLoading(false);
    }
  };

  const loadBlocks = async (weekplanId: string) => {
    const { data } = await supabase
      .from("schedule_blocks")
      .select("*, content_items(*)")
      .eq("weekplan_id", weekplanId)
      .order("start_at", { ascending: true });

    if (data) {
      setBlocks(data);
    }
  };

  const handleBlockDrop = async (blockData: any) => {
    if (!weekplan || !workspaceId) return;

    const { data, error } = await supabase.functions.invoke("planner-upsert-blocks", {
      body: {
        workspace_id: workspaceId,
        blocks: [blockData],
      },
    });

    if (error) {
      console.error("Error saving block:", error);
      toast.error("Fehler beim Speichern: " + error.message);
      return;
    }

    const result = data?.results?.[0];
    if (result?.error) {
      console.error("Database error:", result.error);
      toast.error("Fehler: " + (result.error.message || JSON.stringify(result.error)));
      return;
    }

    if (result) {
      loadBlocks(weekplan.id);
      toast.success("Post geplant");
    } else {
      toast.error("Unerwartetes Problem beim Speichern");
    }
  };

  const handleBlockSave = async (updatedBlock: any) => {
    if (!workspaceId) return;

    const { error } = await supabase.functions.invoke("planner-upsert-blocks", {
      body: {
        workspace_id: workspaceId,
        blocks: [updatedBlock],
      },
    });

    if (error) {
      toast.error("Fehler beim Speichern");
      return;
    }

    loadBlocks(weekplan.id);
    setSelectedBlock(null);
    toast.success("Änderungen gespeichert");
  };

  const handleBlockDelete = async (blockId: string) => {
    if (!workspaceId || !weekplan) return;

    const loadingToast = toast.loading("Lösche Post...");

    try {
      const { error } = await supabase
        .from("schedule_blocks")
        .delete()
        .eq("id", blockId)
        .eq("workspace_id", workspaceId);

      if (error) {
        console.error("Delete error:", error);
        toast.error("Fehler beim Löschen: " + error.message, { id: loadingToast });
        return;
      }

      await loadBlocks(weekplan.id);
      setSelectedBlock(null);
      toast.success("Post wurde gelöscht", { id: loadingToast });
    } catch (error: any) {
      console.error("Unexpected error:", error);
      toast.error("Unerwarteter Fehler: " + error.message, { id: loadingToast });
    }
  };

  const handleWeeksChange = async (weeks: number) => {
    if (!weekplan || !workspaceId) return;

    const { data, error } = await supabase.functions.invoke("planner-upsert-weekplan", {
      body: {
        id: weekplan.id,
        workspace_id: workspaceId,
        name: weekplan.name,
        start_date: weekplan.start_date,
        weeks,
        timezone: weekplan.timezone,
        default_platforms: weekplan.default_platforms,
      },
    });

    if (error) {
      toast.error("Fehler beim Aktualisieren");
      return;
    }

    if (data) {
      setWeekplan(data);
      toast.success("Zeitraum aktualisiert");
    }
  };

  const handleApprove = async () => {
    if (!weekplan || !workspaceId) return;

    const blockIds = blocks
      .filter(b => b.status === "draft" || b.status === "scheduled")
      .map(b => b.id);

    if (blockIds.length === 0) {
      toast.info("Keine Posts zum Genehmigen");
      return;
    }

    const { data, error } = await supabase.functions.invoke("planner-approve", {
      body: {
        workspace_id: workspaceId,
        weekplan_id: weekplan.id,
        block_ids: blockIds,
      },
    });

    if (error) {
      toast.error("Fehler beim Genehmigen");
      return;
    }

    loadBlocks(weekplan.id);
    toast.success(`${data.approved_blocks} Posts genehmigt`);
  };

  const handleApplyRecommendations = async () => {
    if (!weekplan || !workspaceId) return;

    const hasExistingBlocks = blocks.length > 0;
    const mode = hasExistingBlocks ? "redistribute" : "new";

    const loadingToast = toast.loading(
      mode === "redistribute" ? "Verteile Posts neu..." : "Lade AI-Empfehlungen..."
    );

    try {
      const { data, error } = await supabase.functions.invoke("planner-apply-recommendations", {
        body: {
          workspace_id: workspaceId,
          weekplan_id: weekplan.id,
          mode,
        },
      });

      if (error) {
        console.error("Recommendations error:", error);
        toast.error("Fehler beim Laden der Empfehlungen: " + error.message, { id: loadingToast });
        return;
      }

      console.log("Recommendations response:", data);

      if (data && data.suggestions && data.suggestions.length > 0) {
        // Apply the suggestions by creating blocks
        toast.loading(
          `${mode === "redistribute" ? "Verteile" : "Erstelle"} ${data.suggestions.length} Posts...`,
          { id: loadingToast }
        );

        const { data: blocksData, error: blocksError } = await supabase.functions.invoke("planner-upsert-blocks", {
          body: {
            workspace_id: workspaceId,
            blocks: data.suggestions,
          },
        });

        if (blocksError) {
          console.error("Error creating blocks:", blocksError);
          toast.error("Fehler beim Erstellen der Posts", { id: loadingToast });
          return;
        }

        // Reload blocks and show success
        await loadBlocks(weekplan.id);
        setRecommendations(data.recommendations || []);
        toast.success(
          mode === "redistribute" 
            ? `${data.suggestions.length} Posts optimal verteilt! 🎯` 
            : `${data.suggestions.length} Posts automatisch eingeplant! 🎉`,
          { id: loadingToast }
        );
      } else {
        toast.info("Keine Content-Items in der Bibliothek gefunden", { id: loadingToast });
      }
    } catch (error: any) {
      console.error("Unexpected error:", error);
      toast.error("Unerwarteter Fehler: " + error.message, { id: loadingToast });
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const dropData = over.data.current as any;
    const dragData = active.data.current as any;

    if (dropData?.date && dragData?.content) {
      // Open time picker for new content
      setPendingDrop({
        date: new Date(dropData.date),
        content: dragData.content,
      });
    } else if (dropData?.date && dragData?.block) {
      // Moving existing block
      const dropDate = new Date(dropData.date);
      
      // Wenn hour vorhanden (HourSlot), diese verwenden
      // Sonst originale Zeit beibehalten
      if (dropData.hour !== undefined) {
        dropDate.setHours(dropData.hour, 0, 0, 0);
      } else {
        const originalTime = new Date(dragData.block.start_at);
        dropDate.setHours(originalTime.getHours(), originalTime.getMinutes(), 0, 0);
      }

      const duration = new Date(dragData.block.end_at).getTime() - new Date(dragData.block.start_at).getTime();
      const endDate = new Date(dropDate.getTime() + duration);

      handleBlockDrop({
        ...dragData.block,
        start_at: dropDate.toISOString(),
        end_at: endDate.toISOString(),
      });
    }
  };

  const handleTimeConfirm = (hour: number, minute: number) => {
    if (!pendingDrop || !weekplan) return;

    const { date, content } = pendingDrop;
    const dropDate = new Date(date);
    dropDate.setHours(hour, minute, 0, 0);

    const duration = content.duration_sec || 3600;
    const endDate = new Date(dropDate.getTime() + duration * 1000);

    const blockData = {
      weekplan_id: weekplan.id,
      content_id: content.id,
      platform: content.targets?.[0] || "Instagram",
      start_at: dropDate.toISOString(),
      end_at: endDate.toISOString(),
      status: "draft",
    };

    handleBlockDrop(blockData);
    setPendingDrop(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!workspaceId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Kein Workspace gefunden</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <DndContext onDragStart={(e) => setActiveId(e.active.id as string)} onDragEnd={handleDragEnd}>
        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar: Library */}
          <ContentLibrary
            workspaceId={workspaceId}
            onContentSelect={(content) => {
              // Handle content selection for drag
              console.log("Content selected:", content);
            }}
          />

          {/* Main Area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Toolbar */}
            <PlannerToolbar
              weekplan={weekplan}
              onWeeksChange={handleWeeksChange}
              onApprove={handleApprove}
              onApplyRecommendations={handleApplyRecommendations}
            />

            {/* Week Grid */}
            <WeekGrid
              weeks={weekplan?.weeks || 2}
              startDate={weekplan?.start_date || new Date().toISOString()}
              blocks={blocks}
              recommendations={recommendations}
              onBlockClick={setSelectedBlock}
              workspaceId={workspaceId}
              weekplanId={weekplan?.id}
            />
          </div>
        </div>

        <DragOverlay>
          {activeId ? (
            <Card className="p-2 bg-primary text-primary-foreground opacity-80">
              <div className="text-xs font-semibold">Verschieben...</div>
            </Card>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Right Drawer: Editor */}
      <BlockEditorDrawer
        block={selectedBlock}
        onSave={handleBlockSave}
        onDelete={handleBlockDelete}
        onClose={() => setSelectedBlock(null)}
      />

      <TimePickerDialog
        open={!!pendingDrop}
        date={pendingDrop?.date || null}
        content={pendingDrop?.content}
        onConfirm={handleTimeConfirm}
        onCancel={() => setPendingDrop(null)}
      />

      <Footer />
    </div>
  );
}
