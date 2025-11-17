import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Palette } from 'lucide-react';

interface BrandKit {
  id: string;
  brand_name: string | null;
  primary_color: string;
  logo_url: string | null;
}

interface BrandKitSelectorProps {
  value: string | null;
  onChange: (brandKitId: string | null) => void;
  disabled?: boolean;
  label?: string;
}

export function BrandKitSelector({
  value,
  onChange,
  disabled = false,
  label = 'Brand Kit (optional)'
}: BrandKitSelectorProps) {
  const { data: brandKits, isLoading } = useQuery({
    queryKey: ['brand-kits'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('brand_kits')
        .select('id, brand_name, primary_color, logo_url')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as BrandKit[];
    }
  });

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2">
        <Palette className="h-4 w-4" />
        {label}
      </Label>
      <Select
        value={value || 'none'}
        onValueChange={(val) => onChange(val === 'none' ? null : val)}
        disabled={disabled || isLoading}
      >
        <SelectTrigger>
          <SelectValue placeholder="Brand Kit auswählen" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Kein Brand Kit</SelectItem>
          {brandKits?.map((kit) => (
            <SelectItem key={kit.id} value={kit.id}>
              <div className="flex items-center gap-2">
                {kit.logo_url && (
                  <img 
                    src={kit.logo_url} 
                    alt="" 
                    className="h-4 w-4 object-contain rounded"
                  />
                )}
                <div
                  className="h-3 w-3 rounded-full border"
                  style={{ backgroundColor: kit.primary_color }}
                />
                <span>{kit.brand_name || 'Unbenannt'}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
