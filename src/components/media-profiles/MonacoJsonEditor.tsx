import { useEffect, useRef, useState } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { useTheme } from 'next-themes';
import { mediaProfileConfigSchema } from '@/lib/mediaProfileSchema';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

interface MonacoJsonEditorProps {
  value: string;
  onChange: (value: string) => void;
  onValidationChange: (isValid: boolean, errors: string[]) => void;
  height?: string;
}

export function MonacoJsonEditor({
  value,
  onChange,
  onValidationChange,
  height = '400px'
}: MonacoJsonEditorProps) {
  const { theme } = useTheme();
  const editorRef = useRef<any>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      schemaValidation: 'error',
      schemas: []
    });
  };

  const validateJson = (jsonString: string) => {
    try {
      const parsed = JSON.parse(jsonString);
      const result = mediaProfileConfigSchema.safeParse(parsed);
      
      if (result.success) {
        setErrors([]);
        onValidationChange(true, []);
        return true;
      } else {
        const errorMessages = result.error.errors.map(
          (err) => `${err.path.join('.')}: ${err.message}`
        );
        setErrors(errorMessages);
        onValidationChange(false, errorMessages);
        return false;
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Ungültiges JSON';
      setErrors([errorMsg]);
      onValidationChange(false, [errorMsg]);
      return false;
    }
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      validateJson(value);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [value]);

  return (
    <div className="space-y-2">
      <Editor
        height={height}
        language="json"
        value={value}
        onChange={(newValue) => onChange(newValue || '')}
        onMount={handleEditorDidMount}
        theme={theme === 'dark' ? 'vs-dark' : 'light'}
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          wordWrap: 'on',
          formatOnPaste: true,
          formatOnType: true
        }}
      />

      {errors.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <ul className="list-disc list-inside space-y-1">
              {errors.map((error, idx) => (
                <li key={idx} className="text-xs">{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
