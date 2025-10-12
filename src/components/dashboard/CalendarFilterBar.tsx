import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "lucide-react";

interface CalendarFilterBarProps {
  timeRange: string;
  platform: string;
  campaignId: string;
  timezone: string;
  onTimeRangeChange: (value: string) => void;
  onPlatformChange: (value: string) => void;
  onCampaignChange: (value: string) => void;
  onTimezoneChange: (value: string) => void;
  campaigns?: Array<{ id: string; title: string }>;
}

export function CalendarFilterBar({
  timeRange,
  platform,
  campaignId,
  timezone,
  onTimeRangeChange,
  onPlatformChange,
  onCampaignChange,
  onTimezoneChange,
  campaigns = [],
}: CalendarFilterBarProps) {
  return (
    <Card className="mb-6">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm font-medium">Filter:</span>
          </div>

          <Select value={timeRange} onValueChange={onTimeRangeChange}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Zeitraum" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Diese Woche</SelectItem>
              <SelectItem value="2weeks">Nächste 2 Wochen</SelectItem>
              <SelectItem value="custom">Benutzerdefiniert</SelectItem>
            </SelectContent>
          </Select>

          <Select value={platform} onValueChange={onPlatformChange}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Plattform" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Plattformen</SelectItem>
              <SelectItem value="instagram">Instagram</SelectItem>
              <SelectItem value="facebook">Facebook</SelectItem>
              <SelectItem value="tiktok">TikTok</SelectItem>
              <SelectItem value="linkedin">LinkedIn</SelectItem>
              <SelectItem value="twitter">Twitter</SelectItem>
            </SelectContent>
          </Select>

          <Select value={campaignId} onValueChange={onCampaignChange}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Kampagne" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Kampagnen</SelectItem>
              {campaigns.map((campaign) => (
                <SelectItem key={campaign.id} value={campaign.id}>
                  {campaign.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={timezone} onValueChange={onTimezoneChange}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Zeitzone" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="UTC">UTC</SelectItem>
              <SelectItem value="Europe/Berlin">Berlin (CEST)</SelectItem>
              <SelectItem value="America/New_York">New York (EST)</SelectItem>
              <SelectItem value="America/Los_Angeles">Los Angeles (PST)</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" onClick={() => {
            onTimeRangeChange("week");
            onPlatformChange("all");
            onCampaignChange("all");
            onTimezoneChange("UTC");
          }}>
            Zurücksetzen
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
