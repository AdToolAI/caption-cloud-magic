import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { WeekGrid } from "@/components/planner/WeekGrid";
import { ContentLibrary } from "@/components/planner/ContentLibrary";
import { PlannerToolbar } from "@/components/planner/PlannerToolbar";
import { BlockEditorDrawer } from "@/components/planner/BlockEditorDrawer";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";

export default function Planner() {
  const { user } = useAuth();
  const [weekplan, setWeekplan] = useState<any>(null);
  const [blocks, setBlocks] = useState<any[]>([]);
  const [selectedBlock, setSelectedBlock] = useState<any>(null);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

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

        if (error) throw error;
        if (data) {
          setWeekplan(data);
          setBlocks([]);
        }
      }
    } catch (error: any) {
      console.error("Error loading weekplan:", error);
      toast.error("Fehler beim Laden des Plans");
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
      toast.error("Fehler beim Speichern");
      return;
    }

    if (data?.results?.[0]) {
      // Reload blocks
      loadBlocks(weekplan.id);
      toast.success("Post geplant");
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

    const { data, error } = await supabase.functions.invoke("planner-apply-recommendations", {
      body: {
        workspace_id: workspaceId,
        weekplan_id: weekplan.id,
      },
    });

    if (error) {
      toast.error("Fehler beim Laden der Empfehlungen");
      return;
    }

    if (data) {
      setRecommendations(data.recommendations || []);
      toast.success(`${data.suggestions?.length || 0} Empfehlungen gefunden`);
    }
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
            onBlockDrop={handleBlockDrop}
            onBlockClick={setSelectedBlock}
            workspaceId={workspaceId}
            weekplanId={weekplan?.id}
          />
        </div>
      </div>

      {/* Right Drawer: Editor */}
      <BlockEditorDrawer
        block={selectedBlock}
        onSave={handleBlockSave}
        onClose={() => setSelectedBlock(null)}
      />

      <Footer />
    </div>
  );
}
