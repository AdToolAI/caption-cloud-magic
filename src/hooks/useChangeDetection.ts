import { useState, useEffect } from 'react';
import DiffMatchPatch from 'diff-match-patch';

interface ChangeDetectionOptions {
  initialValues: Record<string, any>;
  onChangesDetected?: (hasChanges: boolean) => void;
}

export const useChangeDetection = ({ initialValues, onChangesDetected }: ChangeDetectionOptions) => {
  const [currentValues, setCurrentValues] = useState<Record<string, any>>(initialValues);
  const [hasChanges, setHasChanges] = useState(false);
  const [changedFields, setChangedFields] = useState<string[]>([]);

  useEffect(() => {
    const fields = Object.keys(initialValues);
    const changed: string[] = [];

    for (const field of fields) {
      const initial = initialValues[field];
      const current = currentValues[field];

      // Deep comparison for objects
      if (JSON.stringify(initial) !== JSON.stringify(current)) {
        changed.push(field);
      }
    }

    const hasAnyChanges = changed.length > 0;
    setHasChanges(hasAnyChanges);
    setChangedFields(changed);
    
    if (onChangesDetected) {
      onChangesDetected(hasAnyChanges);
    }
  }, [currentValues, initialValues, onChangesDetected]);

  const updateValue = (field: string, value: any) => {
    setCurrentValues(prev => ({ ...prev, [field]: value }));
  };

  const resetChanges = () => {
    setCurrentValues(initialValues);
  };

  const getChangeCount = () => changedFields.length;

  const calculateCost = (): number => {
    if (!hasChanges) return 0;

    // Cost calculation based on changed fields
    let cost = 0;

    if (changedFields.includes('script_text')) {
      cost += 3; // Script changes
    }
    if (changedFields.includes('voice_style') || changedFields.includes('voice_speed')) {
      cost += 2; // Voice changes
    }
    if (changedFields.includes('quality')) {
      cost += 3; // Quality changes require re-render
    }
    if (changedFields.includes('enable_subtitles')) {
      cost += 1; // Subtitle toggle
    }

    return Math.max(cost, 5); // Minimum 5 credits
  };

  const getTextDiff = (field: string): string | null => {
    if (!changedFields.includes(field)) return null;

    const initial = String(initialValues[field] || '');
    const current = String(currentValues[field] || '');

    const dmp = new DiffMatchPatch();
    const diffs = dmp.diff_main(initial, current);
    dmp.diff_cleanupSemantic(diffs);

    return diffs
      .map(([op, text]) => {
        if (op === 1) return `<span class="bg-green-500/20 text-green-700">+${text}</span>`;
        if (op === -1) return `<span class="bg-red-500/20 text-red-700 line-through">-${text}</span>`;
        return text;
      })
      .join('');
  };

  return {
    hasChanges,
    changedFields,
    changeCount: getChangeCount(),
    estimatedCost: calculateCost(),
    updateValue,
    resetChanges,
    getTextDiff,
    currentValues,
  };
};
