import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RecentEvent } from "@/hooks/usePostHogMetrics";
import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";

interface EventDetailModalProps {
  event: RecentEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EventDetailModal({ event, open, onOpenChange }: EventDetailModalProps) {
  const [copied, setCopied] = useState(false);

  if (!event) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(event, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatEventName = (eventStr: string) => {
    return eventStr
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-2xl">
                {formatEventName(event.event)}
              </DialogTitle>
              <DialogDescription className="mt-2">
                <Badge variant="outline" className="mt-1">
                  {event.event}
                </Badge>
              </DialogDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="gap-2"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy JSON
                </>
              )}
            </Button>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-6">
            {/* Event Metadata */}
            <div>
              <h3 className="font-semibold mb-3">Event Details</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">Timestamp</span>
                  <span className="font-mono">
                    {format(new Date(event.timestamp), 'PPpp')}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">User ID</span>
                  <span className="font-mono">{event.distinctId}</span>
                </div>
              </div>
            </div>

            {/* Event Properties */}
            {Object.keys(event.properties).length > 0 && (
              <div>
                <h3 className="font-semibold mb-3">Properties</h3>
                <div className="rounded-lg border bg-muted/50 p-4">
                  <pre className="text-xs overflow-x-auto">
                    {JSON.stringify(event.properties, null, 2)}
                  </pre>
                </div>
              </div>
            )}

            {/* Raw JSON */}
            <div>
              <h3 className="font-semibold mb-3">Raw Event Data</h3>
              <div className="rounded-lg border bg-muted/50 p-4">
                <pre className="text-xs overflow-x-auto">
                  {JSON.stringify(event, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
