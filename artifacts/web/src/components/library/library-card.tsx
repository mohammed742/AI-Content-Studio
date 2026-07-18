"use client";

/**
 * STU-C3 (DEV-62): One Media Library tile — the uploaded photo with a hover
 * overlay carrying its label (if any) and a delete button. Square thumbnail to
 * match the Gallery grid (DESIGN §5/§9.7).
 */
import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { MediaLibraryItem } from "@/db/schema";

export function LibraryCard({
  item,
  onDelete,
}: {
  item: MediaLibraryItem;
  onDelete: (item: MediaLibraryItem) => void | Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete(item);
    } finally {
      // Card usually unmounts on success; reset guards the rollback case.
      setDeleting(false);
    }
  };

  return (
    <div className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.mediaUrl}
        alt={item.label ?? "Uploaded photo"}
        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
      />

      {/* Hover overlay */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between bg-gradient-to-t from-black/70 via-transparent to-black/10 p-3 opacity-0 transition-opacity group-hover:opacity-100">
        <div className="flex justify-end">
          <button
            type="button"
            aria-label="Delete photo"
            disabled={deleting}
            onClick={handleDelete}
            className="pointer-events-auto rounded-lg bg-black/50 p-1.5 text-white transition hover:bg-red-500 active:scale-[0.95] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
        {item.label && (
          <span className="truncate text-xs text-white/90">{item.label}</span>
        )}
      </div>
    </div>
  );
}
