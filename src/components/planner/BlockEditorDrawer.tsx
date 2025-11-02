import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Trash2 } from "lucide-react";

interface BlockEditorDrawerProps {
  block: any;
  onSave: (block: any) => void;
  onDelete: (blockId: string) => void;
  onClose: () => void;
}

export function BlockEditorDrawer({ block, onSave, onDelete, onClose }: BlockEditorDrawerProps) {
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [startAt, setStartAt] = useState("");
  const [platform, setPlatform] = useState("Instagram");
  const [status, setStatus] = useState("draft");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  useEffect(() => {
    if (block) {
      setTitle(block.title_override || block.content_items?.title || "");
      setCaption(block.caption_override || block.content_items?.caption || "");
      setStartAt(block.start_at ? new Date(block.start_at).toISOString().slice(0, 16) : "");
      setPlatform(block.platform || "Instagram");
      setStatus(block.status || "draft");
    }
  }, [block]);

  const handleSave = () => {
    const duration = block.content_items?.duration_sec || 3600;
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

  return (
    <Sheet open={!!block} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle>Post bearbeiten</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 mt-6">
          <div>
            <Label>Titel</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={60}
              placeholder="Max. 60 Zeichen"
            />
          </div>

          <div>
            <Label>Caption</Label>
            <Textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={6}
              placeholder="Post-Text..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Datum & Uhrzeit</Label>
              <Input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
              />
            </div>

            <div>
              <Label>Plattform</Label>
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
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Status</Label>
            <div className="flex gap-2 mt-2 flex-wrap">
              {["draft", "scheduled", "approved"].map((s) => (
                <Badge
                  key={s}
                  variant={status === s ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => setStatus(s)}
                >
                  {s === "draft" && "Entwurf"}
                  {s === "scheduled" && "Geplant"}
                  {s === "approved" && "Genehmigt"}
                </Badge>
              ))}
            </div>
          </div>

          {block?.content_items && (
            <div className="p-3 bg-muted rounded-md">
              <div className="text-sm font-medium mb-1">Original Content</div>
              <div className="text-xs text-muted-foreground">
                {block.content_items.title}
                <br />
                Quelle: {block.content_items.source}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-4">
            <Button onClick={handleSave} className="flex-1">
              Speichern
            </Button>
            <Button variant="outline" onClick={onClose}>
              Abbrechen
            </Button>
          </div>

          <div className="flex gap-2 pt-2 border-t mt-4">
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
    </Sheet>
  );
}
