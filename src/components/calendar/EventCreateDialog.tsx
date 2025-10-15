import { useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEventEmitter } from "@/hooks/useEventEmitter";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { CalendarIcon, ArrowLeft, ArrowRight, Save } from "lucide-react";
import { cn } from "@/lib/utils";

interface EventCreateDialogProps {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  clients: Array<{ id: string; name: string }>;
  brands: Array<{ id: string; brand_name?: string }>;
  workspaceMembers: Array<{ user_id: string; profiles: { email: string } }>;
  prefillDate?: Date | null;
  prefillCaption?: string;
  prefillHashtags?: string[];
  prefillChannels?: string[];
  prefillStartDate?: Date;
  onSuccess: () => void;
}

const CHANNELS = ["Instagram", "TikTok", "LinkedIn", "Facebook", "Twitter", "YouTube"];
const STATUSES = [
  { value: "briefing", label: "Briefing" },
  { value: "in_progress", label: "In Progress" },
  { value: "review", label: "Review" },
  { value: "approved", label: "Approved" },
  { value: "scheduled", label: "Scheduled" },
  { value: "published", label: "Published" },
];

export function EventCreateDialog({
  open,
  onClose,
  workspaceId,
  clients,
  brands,
  workspaceMembers,
  prefillDate,
  prefillCaption,
  prefillHashtags,
  prefillChannels,
  prefillStartDate,
  onSuccess,
}: EventCreateDialogProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { emit } = useEventEmitter();
  const isMobile = useIsMobile();

  const [currentStep, setCurrentStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Step 1: Basics
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [clientId, setClientId] = useState<string>("");
  const [brandId, setBrandId] = useState<string>("");
  const [campaignId, setCampaignId] = useState<string>("");

  // Step 2: Planning
  const [status, setStatus] = useState("briefing");
  const [selectedChannels, setSelectedChannels] = useState<string[]>(prefillChannels || []);
  const [startDate, setStartDate] = useState<Date | undefined>(
    prefillStartDate || prefillDate || undefined
  );
  const [startTime, setStartTime] = useState(() => {
    if (prefillStartDate) {
      return `${String(prefillStartDate.getHours()).padStart(2, "0")}:${String(
        prefillStartDate.getMinutes()
      ).padStart(2, "0")}`;
    }
    return "12:00";
  });
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [endTime, setEndTime] = useState("13:00");
  const [timezone, setTimezone] = useState("Europe/Berlin");

  // Step 3: Content
  const [caption, setCaption] = useState(prefillCaption || "");
  const [hashtags, setHashtags] = useState(
    prefillHashtags ? prefillHashtags.join(", ") : ""
  );
  const [tags, setTags] = useState("");

  // Step 4: Team
  const [ownerId, setOwnerId] = useState<string>(user?.id || "");
  const [assignees, setAssignees] = useState<string[]>([]);
  const [etaMinutes, setEtaMinutes] = useState<number>(60);

  const toggleChannel = (channel: string) => {
    setSelectedChannels(prev =>
      prev.includes(channel)
        ? prev.filter(c => c !== channel)
        : [...prev, channel]
    );
  };

  const toggleAssignee = (userId: string) => {
    setAssignees(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const validateStep = (step: number): boolean => {
    switch (step) {
      case 1:
        if (!title.trim()) {
          toast.error(t("calendar.create.titleRequired"));
          return false;
        }
        return true;
      case 2:
        if (selectedChannels.length === 0) {
          toast.error(t("calendar.create.channelRequired"));
          return false;
        }
        return true;
      case 3:
      case 4:
        return true;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, 4));
    }
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleSaveAsDraft = async () => {
    await handleSave("briefing");
  };

  const handleCreate = async () => {
    if (!validateStep(4)) return;
    await handleSave(status);
  };

  const handleSave = async (eventStatus: string) => {
    setSaving(true);

    try {
      const startDateTime = startDate
        ? new Date(`${format(startDate, "yyyy-MM-dd")}T${startTime}:00`)
        : null;
      const endDateTime = endDate
        ? new Date(`${format(endDate, "yyyy-MM-dd")}T${endTime}:00`)
        : null;

      const hashtagsArray = hashtags
        .split(",")
        .map(h => h.trim())
        .filter(Boolean);
      const tagsArray = tags
        .split(",")
        .map(t => t.trim())
        .filter(Boolean);

      const eventData = {
        workspace_id: workspaceId,
        client_id: clientId || null,
        brand_kit_id: brandId || null,
        campaign_id: campaignId || null,
        title,
        brief: brief || null,
        caption: caption || null,
        channels: selectedChannels,
        status: eventStatus as any,
        start_at: startDateTime?.toISOString() || null,
        end_at: endDateTime?.toISOString() || null,
        timezone,
        owner_id: ownerId || null,
        assignees: assignees.length > 0 ? assignees : null,
        eta_minutes: etaMinutes || null,
        hashtags: hashtagsArray.length > 0 ? hashtagsArray : null,
        tags: tagsArray.length > 0 ? tagsArray : null,
        created_by: user?.id,
      };

      const { error } = await supabase.from("calendar_events").insert([eventData]);

      if (error) {
        console.error("Event creation error:", error);
        toast.error(t("calendar.create.eventCreationFailed"));
        return;
      }

      await emit(
        {
          event_type: "calendar.post.scheduled",
          source: "calendar_create",
          payload: { workspace_id: workspaceId, title },
        },
        { silent: true }
      );

      toast.success(t("calendar.create.eventCreated"));
      onSuccess();
      onClose();
    } catch (error) {
      console.error("Save error:", error);
      toast.error(t("calendar.create.eventCreationFailed"));
    } finally {
      setSaving(false);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="title">{t("calendar.create.eventTitle")} *</Label>
              <Input
                id="title"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={t("calendar.create.eventTitle")}
              />
            </div>

            <div>
              <Label htmlFor="brief">{t("calendar.create.eventBrief")}</Label>
              <Textarea
                id="brief"
                value={brief}
                onChange={e => setBrief(e.target.value)}
                placeholder={t("calendar.create.eventBrief")}
                rows={4}
              />
            </div>

            <div>
              <Label htmlFor="client">{t("calendar.create.selectClient")}</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger id="client">
                  <SelectValue placeholder={t("calendar.create.selectClient")} />
                </SelectTrigger>
                <SelectContent>
                  {clients.map(client => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="brand">{t("calendar.create.selectBrand")}</Label>
              <Select value={brandId} onValueChange={setBrandId}>
                <SelectTrigger id="brand">
                  <SelectValue placeholder={t("calendar.create.selectBrand")} />
                </SelectTrigger>
                <SelectContent>
                  {brands.map(brand => (
                    <SelectItem key={brand.id} value={brand.id}>
                      {brand.brand_name || "Unnamed Brand"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="status">{t("calendar.create.selectStatus")}</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map(s => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{t("calendar.create.selectChannels")} *</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {CHANNELS.map(channel => (
                  <Button
                    key={channel}
                    type="button"
                    variant={selectedChannels.includes(channel) ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleChannel(channel)}
                  >
                    {channel}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="startDate">{t("calendar.create.startDateTime")}</Label>
              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "justify-start text-left font-normal flex-1",
                        !startDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={setStartDate}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
                <Input
                  type="time"
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                  className="w-32"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="endDate">{t("calendar.create.endDateTime")}</Label>
              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "justify-start text-left font-normal flex-1",
                        !endDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {endDate ? format(endDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={setEndDate}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
                <Input
                  type="time"
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                  className="w-32"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="timezone">{t("calendar.create.timezone")}</Label>
              <Input
                id="timezone"
                value={timezone}
                onChange={e => setTimezone(e.target.value)}
              />
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="caption">{t("calendar.create.caption")}</Label>
              <Textarea
                id="caption"
                value={caption}
                onChange={e => setCaption(e.target.value)}
                placeholder={t("calendar.create.caption")}
                rows={6}
              />
              <p className="text-sm text-muted-foreground mt-1">
                {caption.length} characters
              </p>
            </div>

            <div>
              <Label htmlFor="hashtags">{t("calendar.create.hashtags")}</Label>
              <Input
                id="hashtags"
                value={hashtags}
                onChange={e => setHashtags(e.target.value)}
                placeholder="#marketing, #socialmedia"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Separate with commas
              </p>
            </div>

            <div>
              <Label htmlFor="tags">{t("calendar.create.tags")}</Label>
              <Input
                id="tags"
                value={tags}
                onChange={e => setTags(e.target.value)}
                placeholder="promo, sale, announcement"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Separate with commas
              </p>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="owner">{t("calendar.create.selectOwner")}</Label>
              <Select value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger id="owner">
                  <SelectValue placeholder={t("calendar.create.selectOwner")} />
                </SelectTrigger>
                <SelectContent>
                  {workspaceMembers.map(member => (
                    <SelectItem key={member.user_id} value={member.user_id}>
                      {member.profiles.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{t("calendar.create.selectAssignees")}</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {workspaceMembers.map(member => (
                  <Button
                    key={member.user_id}
                    type="button"
                    variant={assignees.includes(member.user_id) ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleAssignee(member.user_id)}
                  >
                    {member.profiles.email}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="eta">{t("calendar.create.estimatedMinutes")}</Label>
              <Input
                id="eta"
                type="number"
                value={etaMinutes}
                onChange={e => setEtaMinutes(parseInt(e.target.value) || 0)}
                min={0}
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const dialogContent = (
    <>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">{t("calendar.create.title")}</h3>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className={currentStep >= 1 ? "text-primary font-medium" : ""}>
            1
          </span>
          <span>→</span>
          <span className={currentStep >= 2 ? "text-primary font-medium" : ""}>
            2
          </span>
          <span>→</span>
          <span className={currentStep >= 3 ? "text-primary font-medium" : ""}>
            3
          </span>
          <span>→</span>
          <span className={currentStep >= 4 ? "text-primary font-medium" : ""}>
            4
          </span>
        </div>
      </div>

      <div className="py-6">{renderStepContent()}</div>

      <div className="flex justify-between items-center pt-4 border-t">
        <div>
          {currentStep > 1 && (
            <Button variant="outline" onClick={handleBack} disabled={saving}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t("calendar.create.back")}
            </Button>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={handleSaveAsDraft}
            disabled={saving}
          >
            <Save className="mr-2 h-4 w-4" />
            {t("calendar.create.saveAsDraft")}
          </Button>

          {currentStep < 4 ? (
            <Button onClick={handleNext} disabled={saving}>
              {t("calendar.create.next")}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? t("calendar.messages.saving") : t("calendar.create.createEvent")}
            </Button>
          )}
        </div>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onClose}>
        <SheetContent side="bottom" className="h-[90vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{t("calendar.create.title")}</SheetTitle>
          </SheetHeader>
          <div className="mt-4">{dialogContent}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("calendar.create.title")}</DialogTitle>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
            <span className={currentStep >= 1 ? "text-primary font-medium" : ""}>
              1. {t("calendar.create.stepBasics")}
            </span>
            <span>→</span>
            <span className={currentStep >= 2 ? "text-primary font-medium" : ""}>
              2. {t("calendar.create.stepPlanning")}
            </span>
            <span>→</span>
            <span className={currentStep >= 3 ? "text-primary font-medium" : ""}>
              3. {t("calendar.create.stepContent")}
            </span>
            <span>→</span>
            <span className={currentStep >= 4 ? "text-primary font-medium" : ""}>
              4. {t("calendar.create.stepTeam")}
            </span>
          </div>
        </DialogHeader>

        <div className="py-6">{renderStepContent()}</div>

        <div className="flex justify-between items-center pt-4 border-t">
          <div>
            {currentStep > 1 && (
              <Button variant="outline" onClick={handleBack} disabled={saving}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t("calendar.create.back")}
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={handleSaveAsDraft}
              disabled={saving}
            >
              <Save className="mr-2 h-4 w-4" />
              {t("calendar.create.saveAsDraft")}
            </Button>

            {currentStep < 4 ? (
              <Button onClick={handleNext} disabled={saving}>
                {t("calendar.create.next")}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleCreate} disabled={saving}>
                {saving ? t("calendar.messages.saving") : t("calendar.create.createEvent")}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
