import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, X, SlidersHorizontal } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';

export interface SearchFilters {
  query: string;
  category: string;
  platform: string;
  aspectRatio: string;
  minRating: number;
  tags: string[];
  sortBy: 'popular' | 'recent' | 'rating' | 'name';
}

interface TemplateSearchProps {
  filters: SearchFilters;
  onFiltersChange: (filters: SearchFilters) => void;
  availableTags?: string[];
}

const CATEGORIES = [
  { value: 'all', label: 'Alle Kategorien' },
  { value: 'product', label: 'Produkt' },
  { value: 'service', label: 'Service' },
  { value: 'event', label: 'Event' },
  { value: 'testimonial', label: 'Testimonial' },
  { value: 'sale', label: 'Sale' },
];

const PLATFORMS = [
  { value: 'all', label: 'Alle Plattformen' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'facebook', label: 'Facebook' },
];

const ASPECT_RATIOS = [
  { value: 'all', label: 'Alle Formate' },
  { value: '9:16', label: '9:16 (Stories)' },
  { value: '16:9', label: '16:9 (Landscape)' },
  { value: '1:1', label: '1:1 (Square)' },
];

const SORT_OPTIONS = [
  { value: 'popular', label: 'Beliebtheit' },
  { value: 'recent', label: 'Neueste' },
  { value: 'rating', label: 'Bewertung' },
  { value: 'name', label: 'Name' },
];

export const TemplateSearch = ({
  filters,
  onFiltersChange,
  availableTags = [],
}: TemplateSearchProps) => {
  const [localQuery, setLocalQuery] = useState(filters.query);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (localQuery !== filters.query) {
        onFiltersChange({ ...filters, query: localQuery });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [localQuery]);

  const updateFilter = (key: keyof SearchFilters, value: any) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const toggleTag = (tag: string) => {
    const newTags = filters.tags.includes(tag)
      ? filters.tags.filter(t => t !== tag)
      : [...filters.tags, tag];
    updateFilter('tags', newTags);
  };

  const resetFilters = () => {
    onFiltersChange({
      query: '',
      category: 'all',
      platform: 'all',
      aspectRatio: 'all',
      minRating: 0,
      tags: [],
      sortBy: 'popular',
    });
    setLocalQuery('');
  };

  const hasActiveFilters = 
    filters.category !== 'all' ||
    filters.platform !== 'all' ||
    filters.aspectRatio !== 'all' ||
    filters.minRating > 0 ||
    filters.tags.length > 0;

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Templates durchsuchen..."
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            className="pl-9"
          />
          {localQuery && (
            <button
              onClick={() => setLocalQuery('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2"
            >
              <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </button>
          )}
        </div>

        <Popover open={showAdvanced} onOpenChange={setShowAdvanced}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon">
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="end">
            <div className="space-y-4">
              <h4 className="font-medium">Erweiterte Filter</h4>

              <div className="space-y-2">
                <Label>Mindestbewertung: {filters.minRating} Sterne</Label>
                <Slider
                  value={[filters.minRating]}
                  onValueChange={([value]) => updateFilter('minRating', value)}
                  max={5}
                  step={0.5}
                />
              </div>

              {availableTags.length > 0 && (
                <div className="space-y-2">
                  <Label>Tags</Label>
                  <div className="flex flex-wrap gap-2">
                    {availableTags.slice(0, 10).map((tag) => (
                      <Badge
                        key={tag}
                        variant={filters.tags.includes(tag) ? 'default' : 'outline'}
                        className="cursor-pointer"
                        onClick={() => toggleTag(tag)}
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Quick Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={filters.category} onValueChange={(v) => updateFilter('category', v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((cat) => (
              <SelectItem key={cat.value} value={cat.value}>
                {cat.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.platform} onValueChange={(v) => updateFilter('platform', v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PLATFORMS.map((plat) => (
              <SelectItem key={plat.value} value={plat.value}>
                {plat.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.aspectRatio} onValueChange={(v) => updateFilter('aspectRatio', v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ASPECT_RATIOS.map((ratio) => (
              <SelectItem key={ratio.value} value={ratio.value}>
                {ratio.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.sortBy} onValueChange={(v) => updateFilter('sortBy', v as any)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            <X className="h-4 w-4 mr-2" />
            Filter zurücksetzen
          </Button>
        )}
      </div>

      {/* Active Tags */}
      {filters.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1">
              {tag}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => toggleTag(tag)}
              />
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
};