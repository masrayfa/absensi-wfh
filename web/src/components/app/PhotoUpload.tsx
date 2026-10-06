import { CameraIcon, ImagePlusIcon, XIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { Button, buttonVariants } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface PhotoUploadProps {
  /** Selected file, or null when nothing is selected. The parent owns the state. */
  value: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Custom photo picker: a file input accepting images with `capture` so mobile
 * opens the camera, a live preview of the selected file, a required marker,
 * and a remove action. The parent owns the File, so a failed submit keeps it.
 */
export function PhotoUpload({ value, onChange, disabled, className }: PhotoUploadProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  // Revoke the object URL on unmount and whenever the file changes.
  /* oxlint-disable react/set-state-in-effect -- the URL factory is an external system; setState mirrors it and the cleanup revokes it. */
  useEffect(() => {
    if (!value) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(value);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);
  /* oxlint-enable react/set-state-in-effect */

  function clear() {
    onChange(null);
    // Reset the input so picking the same file again still fires a change event.
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className={cn('grid gap-2', className)}>
      <Label htmlFor={inputId}>
        Foto{' '}
        <span aria-hidden="true" className="text-destructive">
          *
        </span>
        <span className="sr-only">(wajib)</span>
      </Label>

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="image/*"
          capture="environment"
          required
          disabled={disabled}
          className="peer sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onChange(file);
          }}
        />
        <label
          htmlFor={inputId}
          className={cn(
            buttonVariants({ variant: 'outline' }),
            'cursor-pointer peer-focus-visible:border-ring peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50',
            disabled && 'pointer-events-none opacity-50',
          )}
        >
          {value ? <ImagePlusIcon /> : <CameraIcon />}
          {value ? 'Ganti foto' : 'Pilih / ambil foto'}
        </label>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clear}
            disabled={disabled}
            aria-label="Hapus foto"
          >
            <XIcon /> Hapus
          </Button>
        )}
      </div>

      {preview && (
        <img
          src={preview}
          alt="Pratinjau foto"
          className="h-40 w-full rounded-lg border bg-muted object-contain"
        />
      )}
    </div>
  );
}
