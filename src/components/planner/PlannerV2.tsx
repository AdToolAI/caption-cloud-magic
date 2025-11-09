import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Calendar, 
  Clock, 
  Plus, 
  Sparkles,
  LayoutGrid,
  List,
  Filter,
  SortAsc
} from "lucide-react";
import { useState } from "react";

interface PlannerV2Props {
  className?: string;
}

export function PlannerV2({ className }: PlannerV2Props) {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const dummyPosts = [
    {
      id: 1,
      title: "Morning Motivation Post",
      platform: "Instagram",
      time: "08:00",
      date: "2024-01-15",
      status: "scheduled",
    },
    {
      id: 2,
      title: "Product Launch Announcement",
      platform: "LinkedIn",
      time: "14:00",
      date: "2024-01-15",
      status: "draft",
    },
    {
      id: 3,
      title: "Behind the Scenes Story",
      platform: "TikTok",
      time: "18:00",
      date: "2024-01-15",
      status: "scheduled",
    },
  ];

  return (
    <div className={className}>
      {/* New Header */}
      <Card className="p-6 mb-6 bg-gradient-to-r from-primary/10 via-purple-500/10 to-blue-500/10 border-primary/20">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/20">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Content Planner V2</h2>
              <p className="text-sm text-muted-foreground">
                Verbesserte Oberfläche mit neuen Features
              </p>
            </div>
          </div>
          <Badge variant="default" className="gap-1">
            <Sparkles className="h-3 w-3" />
            New UI
          </Badge>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Neuer Post
          </Button>
          <Button size="sm" variant="outline" className="gap-2">
            <Sparkles className="h-4 w-4" />
            AI Vorschläge
          </Button>
          <Button size="sm" variant="outline" className="gap-2">
            <Calendar className="h-4 w-4" />
            Kalenderansicht
          </Button>
        </div>
      </Card>

      {/* Toolbar */}
      <Card className="p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={viewMode === "grid" ? "default" : "outline"}
              onClick={() => setViewMode("grid")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant={viewMode === "list" ? "default" : "outline"}
              onClick={() => setViewMode("list")}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="gap-2">
              <Filter className="h-4 w-4" />
              Filter
            </Button>
            <Button size="sm" variant="outline" className="gap-2">
              <SortAsc className="h-4 w-4" />
              Sortieren
            </Button>
          </div>
        </div>
      </Card>

      {/* Content Grid/List */}
      <div className={viewMode === "grid" ? "grid md:grid-cols-3 gap-4" : "space-y-3"}>
        {dummyPosts.map((post) => (
          <Card key={post.id} className="p-4 hover:border-primary/50 transition-colors cursor-pointer">
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold line-clamp-1">{post.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {post.platform}
                  </p>
                </div>
                <Badge variant={post.status === "scheduled" ? "default" : "secondary"}>
                  {post.status}
                </Badge>
              </div>
              
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {post.date}
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {post.time}
                </div>
              </div>

              <div className="flex gap-2 pt-2 border-t">
                <Button size="sm" variant="outline" className="flex-1">
                  Bearbeiten
                </Button>
                <Button size="sm" variant="outline">
                  <Sparkles className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Stats Footer */}
      <Card className="p-4 mt-6 bg-muted/50">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold">3</p>
            <p className="text-sm text-muted-foreground">Posts geplant</p>
          </div>
          <div>
            <p className="text-2xl font-bold">2</p>
            <p className="text-sm text-muted-foreground">Plattformen</p>
          </div>
          <div>
            <p className="text-2xl font-bold">100%</p>
            <p className="text-sm text-muted-foreground">Wochenauslastung</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
