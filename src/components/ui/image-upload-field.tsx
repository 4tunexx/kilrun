'use client';

import { useRef, useState } from 'react';
import { Loader2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

const MAX_BYTES = 2_500_000; // ~2.5MB — files are written to disk, not Mongo

/**
 * URL input + upload button. Files are posted to /api/admin/upload-site-image
 * and stored under /public/uploads/site; the field value is a short public path.
 */
export function ImageUploadField({
  label,
  value,
  onChange,
  className,
  kind = 'misc',
  widePreview = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  /** Controls resize/strip pipeline on the server. */
  kind?: 'mark' | 'wordmark' | 'hero' | 'bg' | 'misc';
  /** Use a wider preview box (wordmarks / heroes). */
  widePreview?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Please choose an image file', variant: 'destructive' });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast({
        title: 'Image too large (max 2.5MB)',
        description: 'Compress the file or paste a hosted image URL instead.',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('kind', kind);
      const res = await fetch('/api/admin/upload-site-image', {
        method: 'POST',
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !data.url) {
        throw new Error(data.error || 'Upload failed');
      }
      onChange(data.url);
      toast({ title: 'Image uploaded' });
    } catch (err: unknown) {
      toast({
        title: 'Upload failed',
        description: err instanceof Error ? err.message : 'Try again',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className={className ?? 'space-y-1'}>
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://... or upload a file"
          className="bg-slate-900/50 border-slate-700"
          disabled={uploading}
        />
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0"
          onClick={() => inputRef.current?.click()}
          title="Upload image"
          disabled={uploading}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
        </Button>
        {value && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0"
            onClick={() => onChange('')}
            title="Clear"
            disabled={uploading}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      {value && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={value}
          alt="Preview"
          className={
            widePreview
              ? 'mt-2 h-14 max-w-full w-auto rounded object-contain border border-slate-700 bg-slate-950/50'
              : 'mt-2 h-16 w-16 rounded object-contain border border-slate-700 bg-slate-950/50'
          }
        />
      )}
    </div>
  );
}
