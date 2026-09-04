import { useState } from "react";
import { tx } from "@/lib/i18nText";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  isControlVisible,
  pickLocalized,
  type PictureModelControl,
  type PictureModelDefinition,
} from "@/config/pictureModels";

interface ModelControlsProps {
  model: PictureModelDefinition;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  language: string;
}

/**
 * Renders a model's controls straight from the registry schema —
 * no per-model React special case.
 */
export function ModelControls({ model, values, onChange, language }: ModelControlsProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const controls = (model.controls ?? []).filter((c) => isControlVisible(c, values));
  const basic = controls.filter((c) => !c.advanced);
  const advanced = controls.filter((c) => c.advanced);

  if (!controls.length) return null;

  return (
    <div className="space-y-4">
      {basic.map((control) => (
        <ControlField
          key={control.key}
          control={control}
          value={values[control.key]}
          onChange={onChange}
          language={language}
        />
      ))}

      {advanced.length > 0 && (
        <div className="rounded-lg border border-border/50">
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-between px-3"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            <span className="text-sm">
              {tx({
                de: "Erweiterte Einstellungen",
                en: "Advanced settings",
                es: "Ajustes avanzados",
              })}
            </span>
            {showAdvanced ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
          {showAdvanced && (
            <div className="space-y-4 border-t border-border/50 p-3">
              {advanced.map((control) => (
                <ControlField
                  key={control.key}
                  control={control}
                  value={values[control.key]}
                  onChange={onChange}
                  language={language}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ControlField({
  control,
  value,
  onChange,
  language,
}: {
  control: PictureModelControl;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  language: string;
}) {
  const label = pickLocalized(control.label, language);
  const help = control.help ? pickLocalized(control.help, language) : null;

  if (control.type === "toggle") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 p-3">
        <div>
          <Label className="text-sm">{label}</Label>
          {help && <p className="text-[11px] text-muted-foreground">{help}</p>}
        </div>
        <Switch checked={value === true} onCheckedChange={(v) => onChange(control.key, v)} />
      </div>
    );
  }

  if (control.type === "select") {
    const current = value === undefined || value === null ? "" : String(value);
    return (
      <div className="space-y-1.5">
        <Label className="text-sm">{label}</Label>
        <Select
          value={current}
          onValueChange={(raw) => {
            const option = control.options?.find((o) => String(o.value) === raw);
            onChange(control.key, option ? option.value : raw);
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {control.options?.map((option) => (
              <SelectItem key={String(option.value)} value={String(option.value)}>
                {pickLocalized(option.label, language)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {help && <p className="text-[11px] text-muted-foreground">{help}</p>}
      </div>
    );
  }

  if (control.type === "slider") {
    const numeric = typeof value === "number" ? value : Number(control.default ?? 0);
    return (
      <div className="space-y-2">
        <Label className="text-sm">
          {label} <span className="text-muted-foreground">({round(numeric)})</span>
        </Label>
        <Slider
          min={control.min ?? 0}
          max={control.max ?? 1}
          step={control.step ?? 0.05}
          value={[numeric]}
          onValueChange={(v) => onChange(control.key, v[0])}
        />
        {help && <p className="text-[11px] text-muted-foreground">{help}</p>}
      </div>
    );
  }

  if (control.type === "number") {
    return (
      <div className="space-y-1.5">
        <Label className="text-sm">{label}</Label>
        <Input
          type="number"
          value={typeof value === "number" ? value : ""}
          onChange={(e) => onChange(control.key, e.target.value === "" ? undefined : Number(e.target.value))}
        />
        {help && <p className="text-[11px] text-muted-foreground">{help}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <Input
        value={typeof value === "string" ? value : ""}
        placeholder={help ?? ""}
        onChange={(e) => onChange(control.key, e.target.value)}
      />
    </div>
  );
}

function round(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
