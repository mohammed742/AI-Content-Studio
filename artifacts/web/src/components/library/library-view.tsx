"use client";

/**
 * STU-C3 (DEV-62): Media Library view (DESIGN §5 dashboard grid, §7 states).
 *
 * Responsive grid (3/2/1) of the user's uploaded photos with an upload button
 * (multi-file), per-card delete, optimistic add/remove, and skeleton + empty +
 * error-toast states. Data via browser `fetch` to /api/media-library (same as
 * the Gallery page + onboarding logo upload).
 *
 * Upload trigger: a transparent <input type=file> laid directly over each
 * styled button (opacity-0, absolute inset-0). A real click lands on the input,
 * so the OS file picker opens through native browser behavior — no JS
 * `input.click()` (which does NOT open the picker for a display:none input in
 * some browsers) and no label/user-activation quirks.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { FolderOpen, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MediaLibraryItem } from "@/db/schema";
import { LibraryCard } from "./library-card";

// Mirrors the server-side validation in src/lib/media-library.ts.
const ALLOWED_MEDIA_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_MB = 10;
const MAX_MEDIA_BYTES = MAX_MB * 1024 * 1024;
const ACCEPT = ALLOWED_MEDIA_MIME_TYPES.join(",");

export function LibraryView() {
  const [items, setItems] = useState<MediaLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(0);

  // Load the library on mount (same pattern as GalleryView).
  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch("/api/media-library");
      const json = await res.json();
      if (json.data) setItems(json.data.items);
    } catch {
      toast.error("Couldn't load your library.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  const onFilesPicked = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    // Validate client-side first so invalid files fail fast with a clear message.
    const files: File[] = [];
    for (const file of Array.from(fileList)) {
      if (!ALLOWED_MEDIA_MIME_TYPES.includes(file.type)) {
        toast.error(`"${file.name}" isn't a PNG, JPG, or WEBP image.`);
        continue;
      }
      if (file.size > MAX_MEDIA_BYTES) {
        toast.error(`"${file.name}" is larger than ${MAX_MB} MB.`);
        continue;
      }
      files.push(file);
    }
    if (files.length === 0) return;

    setUploading((n) => n + files.length);
    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await fetch("/api/media-library", { method: "POST", body: formData });
        const json = await res.json();
        if (res.ok && json.data) {
          setItems((prev) => [json.data as MediaLibraryItem, ...prev]);
        } else {
          toast.error(json.error ?? "Upload failed");
        }
      } catch (err) {
        console.error("Media upload error", err);
        toast.error(`Couldn't upload "${file.name}". Please try again.`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const onDelete = async (item: MediaLibraryItem) => {
    // Optimistic removal, rolled back on failure.
    const prev = items;
    setItems((current) => current.filter((i) => i.id !== item.id));
    try {
      const res = await fetch(`/api/media-library/${item.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
    } catch {
      setItems(prev);
      toast.error("Couldn't delete the photo. Please try again.");
    }
  };

  const isBusy = uploading > 0;

  // A styled button with a transparent file input laid over it. The real click
  // hits the input → native OS file picker. When busy, the input is omitted.
  const uploadButton = (label: string, extraClass = "") => (
    <div className={`relative inline-flex ${extraClass}`}>
      <Button type="button" className="rounded-full" disabled={isBusy}>
        <Upload className="h-4 w-4" strokeWidth={2} />
        {isBusy ? `Uploading ${uploading}…` : label}
      </Button>
      {!isBusy && (
        <input
          type="file"
          accept={ACCEPT}
          multiple
          aria-label={label}
          title={label}
          className="absolute inset-0 cursor-pointer opacity-0"
          onChange={(e) => {
            const el = e.currentTarget;
            void onFilesPicked(el.files).finally(() => {
              el.value = "";
            });
          }}
        />
      )}
    </div>
  );

  return (
    <div className="space-y-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Media Library</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload your own photos — the agent uses them as source material for
            product shots and before/after posts.
          </p>
        </div>
        {uploadButton("Upload photos")}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-xl bg-muted/40" />
          ))}
        </div>
      ) : items.length === 0 && !isBusy ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-xl border border-dashed border-border text-center">
          <FolderOpen className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
          <p className="mt-3 mb-4 text-sm text-muted-foreground">
            No photos yet. Upload your storefront, products, or team shots.
          </p>
          {uploadButton("Upload your first photo")}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: uploading }).map((_, i) => (
            <div
              key={`uploading-${i}`}
              className="flex aspect-square animate-pulse items-center justify-center rounded-xl border border-border bg-muted/40 text-xs text-muted-foreground"
            >
              Uploading…
            </div>
          ))}
          {items.map((item) => (
            <LibraryCard key={item.id} item={item} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
