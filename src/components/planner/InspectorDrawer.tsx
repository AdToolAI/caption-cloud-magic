import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Trash2, Edit, Clock, Check, Image as ImageIcon, Video as VideoIcon, Sparkles } from "lucide-react";
import { ConflictWarning } from "./ConflictWarning";
import { checkBlockConflicts } from "@/lib/plannerValidation";
import { PublishNowButton } from "./PublishNowButton";
import { format } from "date-fns";
import { OptimizationPanel } from '@/components/optimization/OptimizationPanel';

interface InspectorDrawerProps {
  block: any;
  allBlocks: any[];
  aiRecommendations: any[];
  onSave: (block: any) => void;
  onDelete: (blockId: string) => void;
  onApprove: (blockIds: string[]) => void;
  onClose: () => void;
}

export function InspectorDrawer({
  block,
  allBlocks,
  aiRecommendations,
  onSave,
  onDelete,
  onApprove,
  onClose,
}: InspectorDrawerProps) {
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [startAt, setStartAt] = useState("");
  const [platform, setPlatform] = useState("Instagram");
  const [status, setStatus] = useState("draft");
  const [duration, setDuration] = useState(60);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showOptimization, setShowOptimization] = useState(false);

  useEffect(() => {
    if (block) {
      setTitle(block.title_override || block.content_items?.title || "");
      setCaption(block.caption_override || block.content_items?.caption || "");
      setStartAt(block.start_at ? new Date(block.start_at).toISOString().slice(0, 16) : "");
      setPlatform(block.platform || "Instagram");
      setStatus(block.status || "draft");
      
      const durationSec = block.content_items?.duration_sec || 
        Math.round((new Date(block.end_at).getTime() - new Date(block.start_at).getTime()) / 1000);
      setDuration(durationSec);
    }
  }, [block]);

  const handleSave = () => {
    const startDate = new Date(startAt);
    const endDate = new Date(startDate.getTime() + duration * 1000);

    onSave({
      ...block,
      title_override: title,
      caption_override: caption,
      start_at: startDate.toISOString(),
      end_at: endDate.toISOString(),
      platform,
      status,
    });
  };

  const handleQuickApprove = () => {
    onApprove([block.id]);
  };

  const conflicts = block ? checkBlockConflicts(
    { ...block, start_at: startAt, platform },
    allBlocks,
    aiRecommendations
  ) : [];

  const statusOptions = [
    { value: "draft", label: "Entwurf", color: "bg-slate-500" },
    { value: "scheduled", label: "Geplant", color: "bg-blue-500" },
    { value: "approved", label: "Genehmigt", color: "bg-green-500" },
  ];

  return (
    <>
      <Sheet open={!!block} onOpenChange={(open) => !open && onClose()}>
        <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Post Details</SheetTitle>
          </SheetHeader>

          <div className="space-y-4 mt-6">
            {/* Conflicts */}
            {conflicts.length > 0 && (
              <ConflictWarning conflicts={conflicts} />
            )}

            {/* Title */}
            <div>
              <Label>Titel *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={80}
                placeholder="Max. 80 Zeichen"
              />
              <p className="text-xs text-muted-foreground mt-1">{title.length}/80</p>
            </div>

            {/* Caption */}
            <div>
              <Label>Caption</Label>
              <Textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={6}
                maxLength={2200}
                placeholder="Post-Text..."
              />
              <p className="text-xs text-muted-foreground mt-1">{caption.length}/2200</p>
            </div>

            {/* Platform */}
            <div>
              <Label>Plattform *</Label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Instagram">Instagram</SelectItem>
                  <SelectItem value="TikTok">TikTok</SelectItem>
                  <SelectItem value="LinkedIn">LinkedIn</SelectItem>
                  <SelectItem value="Facebook">Facebook</SelectItem>
                  <SelectItem value="X">X (Twitter)</SelectItem>
                  <SelectItem value="YouTube">YouTube</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Date & Time */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Datum & Uhrzeit *</Label>
                <Input
                  type="datetime-local"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                />
              </div>

              <div>
                <Label>Dauer (Sekunden)</Label>
                <Input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  min={5}
                  max={900}
                />
              </div>
            </div>

            {/* Status */}
            <div>
              <Label>Status</Label>
              <div className="flex gap-2 mt-2 flex-wrap">
                {statusOptions.map((s) => (
                  <Badge
                    key={s.value}
                    variant={status === s.value ? "default" : "outline"}
                    className={`cursor-pointer ${status === s.value ? s.color : ""}`}
                    onClick={() => setStatus(s.value)}
                  >
                    {s.label}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Media Preview */}
            {block?.content_items && (
              <div className="p-4 bg-muted rounded-md space-y-2">
                <div className="text-sm font-medium flex items-center gap-2">
                  {block.content_items.type === "video" ? (
                    <VideoIcon className="h-4 w-4" />
                  ) : (
                    <ImageIcon className="h-4 w-4" />
                  )}
                  Original Content
                </div>
                <div className="text-xs text-muted-foreground">
                  {block.content_items.title}
                </div>
                {block.content_items.thumb_url && (
                  <img 
                    src={block.content_items.thumb_url} 
                    alt="Preview" 
                    className="w-full h-32 object-cover rounded"
                  />
                )}
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <span>Quelle: {block.content_items.source}</span>
                  {block.content_items.duration_sec && (
                    <span>· {block.content_items.duration_sec}s</span>
                  )}
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div className="flex gap-2 pt-4 border-t">
              <Button onClick={handleSave} className="flex-1">
                <Check className="h-4 w-4 mr-2" />
                Speichern
              </Button>
              
              <Button onClick={() => setShowOptimization(!showOptimization)} variant="outline">
                <Sparkles className="h-4 w-4 mr-2" />
                {showOptimization ? 'Schließen' : 'Optimieren'}
              </Button>
              
              {status !== "approved" && (
                <Button variant="secondary" onClick={handleQuickApprove}>
                  <Check className="h-4 w-4 mr-2" />
                  Genehmigen
                </Button>
              )}
            </div>

            {/* Optimization Panel */}
            {showOptimization && (
              <div className="mt-4 p-4 bg-muted rounded-lg">
                <OptimizationPanel
                  caption={caption}
                  hashtags={block.hashtags || []}
                  platforms={[platform.toLowerCase()]}
                />
              </div>
            )}

            {/* Publish Now */}
            {block && (
              <div className="pt-2">
                <PublishNowButton block={block} onPublished={onClose} />
              </div>
            )}

            {/* Delete */}
            <div className="pt-2">
              <Button
                variant="destructive"
                onClick={() => setShowDeleteDialog(true)}
                className="w-full"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Post löschen
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Post löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Möchten Sie diesen geplanten Post wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (block?.id) {
                  onDelete(block.id);
                  setShowDeleteDialog(false);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}