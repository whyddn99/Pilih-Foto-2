import { useEffect, useRef, useState } from 'react';
import type { MouseEvent, WheelEvent } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  MessageSquare,
  RotateCcw,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { PhotoItem, SelectionEntry } from '../types';
import { formatExifSummary, formatFileSize, formatOrderBadge } from '../lib/format';
import { DrivePhoto } from './DrivePhoto';

interface LightboxModalProps {
  photos: PhotoItem[];
  currentIndex: number;
  selections: Record<string, SelectionEntry>;
  targetCount: number;
  accessToken: string | null;
  readOnly?: boolean;
  onClose: () => void;
  onChangeIndex: (nextIndex: number) => void;
  onToggleSelect: (photo: PhotoItem) => void;
  onUpdateNote: (photoId: string, note: string) => void;
}

export function LightboxModal({
  photos,
  currentIndex,
  selections,
  targetCount,
  accessToken,
  readOnly = false,
  onClose,
  onChangeIndex,
  onToggleSelect,
  onUpdateNote,
}: LightboxModalProps) {
  const photo = photos[currentIndex];
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const noteInputRef = useRef<HTMLTextAreaElement | null>(null);

  const selection = photo ? selections[photo.id] : undefined;
  const isSelected = Boolean(selection);
  const selectedTotal = Object.keys(selections).length;
  const canSelectMore = targetCount <= 0 || selectedTotal < targetCount;

  // Reset zoom and pan when changing photos
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [photo?.id]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target?.tagName === 'TEXTAREA' || target?.tagName === 'INPUT';

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (isTyping) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (currentIndex > 0) onChangeIndex(currentIndex - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (currentIndex < photos.length - 1) onChangeIndex(currentIndex + 1);
      } else if ((e.key === ' ' || e.key.toLowerCase() === 'p') && !readOnly && photo) {
        e.preventDefault();
        onToggleSelect(photo);
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setZoom((z) => Math.min(4, Number((z + 0.5).toFixed(2))));
      } else if (e.key === '-') {
        e.preventDefault();
        setZoom((z) => {
          const next = Math.max(1, Number((z - 0.5).toFixed(2)));
          if (next === 1) setPan({ x: 0, y: 0 });
          return next;
        });
      } else if (e.key === '0') {
        e.preventDefault();
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, photos.length, onClose, onChangeIndex, onToggleSelect, photo, readOnly]);

  if (!photo) return null;

  const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.25 : -0.25;
    setZoom((z) => {
      const next = Math.min(4, Math.max(1, Number((z + delta).toFixed(2))));
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  };

  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (zoom <= 1) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!isDragging || zoom <= 1) return;
    setPan({
      x: dragStartRef.current.panX + (e.clientX - dragStartRef.current.x),
      y: dragStartRef.current.panY + (e.clientY - dragStartRef.current.y),
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const setPresetZoom = (level: number) => {
    setZoom(level);
    if (level === 1) setPan({ x: 0, y: 0 });
  };

  const exifText = formatExifSummary(photo.exif);
  const dimensions =
    photo.exif?.width && photo.exif?.height
      ? `${photo.exif.width} × ${photo.exif.height}`
      : null;

  return (
    <div
      className="fixed inset-0 z-50 bg-[#050505]/96 backdrop-blur-sm flex flex-col lg:flex-row"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${photo.name}`}
    >
      {/* Main Canvas Area */}
      <div className="relative flex-1 flex flex-col min-h-0">
        {/* Top Overlay Bar */}
        <div className="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-[#1E1E24] bg-[#0A0A0D]/90">
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-mono text-xs text-[#9494A0] shrink-0">
              {currentIndex + 1} / {photos.length}
            </span>
            <span className="text-[#3E3E48]" aria-hidden="true">
              ·
            </span>
            <h2 className="font-mono text-sm font-medium text-[#FAFAFA] truncate">
              {photo.name}
            </h2>
            {isSelected && selection && (
              <>
                <span className="text-[#3E3E48]" aria-hidden="true">
                  ·
                </span>
                <span className="font-mono text-xs font-semibold text-[#F2B705] shrink-0">
                  Terpilih {formatOrderBadge(selection.order)}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <div className="hidden sm:flex items-center bg-[#141418] border border-[#24242C] rounded-lg p-0.5 mr-2">
              <button
                type="button"
                onClick={() => setPresetZoom(1)}
                className={`px-2.5 py-1 text-xs font-mono rounded-md transition-colors cursor-pointer ${
                  zoom === 1 ? 'bg-[#262630] text-[#FAFAFA]' : 'text-[#9494A0] hover:text-[#FAFAFA]'
                }`}
              >
                Fit
              </button>
              <button
                type="button"
                onClick={() => setPresetZoom(2)}
                className={`px-2.5 py-1 text-xs font-mono rounded-md transition-colors cursor-pointer ${
                  zoom === 2 ? 'bg-[#262630] text-[#FAFAFA]' : 'text-[#9494A0] hover:text-[#FAFAFA]'
                }`}
              >
                200%
              </button>
              <button
                type="button"
                onClick={() => setPresetZoom(3)}
                className={`px-2.5 py-1 text-xs font-mono rounded-md transition-colors cursor-pointer ${
                  zoom === 3 ? 'bg-[#262630] text-[#FAFAFA]' : 'text-[#9494A0] hover:text-[#FAFAFA]'
                }`}
              >
                300%
              </button>
            </div>

            <button
              type="button"
              onClick={() =>
                setZoom((z) => {
                  const next = Math.max(1, Number((z - 0.5).toFixed(2)));
                  if (next === 1) setPan({ x: 0, y: 0 });
                  return next;
                })
              }
              disabled={zoom <= 1}
              aria-label="Perkecil"
              className="p-2 rounded-lg border border-[#24242C] bg-[#141418] text-[#D4D4DC] hover:text-white hover:border-[#3A3A46] disabled:opacity-40 cursor-pointer"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="font-mono text-xs text-[#C4C4CE] w-12 text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(4, Number((z + 0.5).toFixed(2))))}
              disabled={zoom >= 4}
              aria-label="Perbesar"
              className="p-2 rounded-lg border border-[#24242C] bg-[#141418] text-[#D4D4DC] hover:text-white hover:border-[#3A3A46] disabled:opacity-40 cursor-pointer"
            >
              <ZoomIn className="w-4 h-4" />
            </button>

            {zoom > 1 && (
              <button
                type="button"
                onClick={() => setPresetZoom(1)}
                aria-label="Reset zoom"
                className="p-2 rounded-lg border border-[#24242C] bg-[#141418] text-[#D4D4DC] hover:text-white cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup preview"
              className="ml-2 p-2 rounded-lg border border-[#2A2A34] bg-[#18181E] text-[#FAFAFA] hover:bg-[#25252E] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Interactive Zoom & Pan Viewport */}
        <div
          className={`relative flex-1 overflow-hidden flex items-center justify-center select-none ${
            zoom > 1 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'
          }`}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onDoubleClick={() => setPresetZoom(zoom === 1 ? 2 : 1)}
        >
          <div
            style={{
              transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
              transition: isDragging ? 'none' : 'transform 160ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
            className="max-w-full max-h-full flex items-center justify-center p-4 sm:p-8"
          >
            <DrivePhoto
              fileId={photo.id}
              name={photo.name}
              thumbnailLink={photo.thumbnailLink}
              demoSrc={photo.demoSrc}
              accessToken={accessToken}
              highRes
              className="max-h-[75vh] lg:max-h-[82vh] max-w-full object-contain rounded-sm shadow-2xl"
            />
          </div>

          {/* Left / Right Navigation Arrows */}
          {currentIndex > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChangeIndex(currentIndex - 1);
              }}
              aria-label="Foto sebelumnya"
              className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-[#0E0E12]/85 border border-[#2C2C36] text-[#FAFAFA] hover:bg-[#1E1E26] transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          {currentIndex < photos.length - 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChangeIndex(currentIndex + 1);
              }}
              aria-label="Foto berikutnya"
              className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-[#0E0E12]/85 border border-[#2C2C36] text-[#FAFAFA] hover:bg-[#1E1E26] transition-colors cursor-pointer"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}

          {/* Subtle bottom zoom hint */}
          <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-md bg-[#0A0A0D]/80 border border-[#22222A] text-[11px] text-[#9494A0] hidden sm:flex items-center gap-2">
            <Maximize2 className="w-3 h-3" />
            <span>Scroll atau klik 2x untuk zoom · Geser saat diperbesar · Tekan Spasi untuk pilih</span>
          </div>
        </div>
      </div>

      {/* Right Inspector Sidebar */}
      <aside className="w-full lg:w-88 shrink-0 border-t lg:border-t-0 lg:border-l border-[#1E1E24] bg-[#0B0B0E] p-5 flex flex-col justify-between gap-5 overflow-y-auto">
        <div className="space-y-5">
          <div>
            <div className="text-xs text-[#8E8E9A] mb-1">Nama File</div>
            <div className="font-mono text-sm font-medium text-[#FAFAFA] break-all">
              {photo.name}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#9494A0] font-mono">
              <span>{formatFileSize(photo.size)}</span>
              {dimensions && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{dimensions}</span>
                </>
              )}
            </div>
          </div>

          {(photo.exif?.cameraModel || exifText) && (
            <div className="pt-4 border-t border-[#1D1D23] space-y-1.5">
              <div className="text-xs text-[#8E8E9A]">Info Kamera &amp; Eksposur</div>
              {photo.exif?.cameraModel && (
                <div className="text-sm text-[#E4E4EA]">{photo.exif.cameraModel}</div>
              )}
              {exifText && (
                <div className="font-mono text-xs text-[#9494A0]">{exifText}</div>
              )}
            </div>
          )}

          {!readOnly && (
            <div className="pt-4 border-t border-[#1D1D23]">
              <label
                htmlFor="photo-retouch-note"
                className="flex items-center gap-1.5 text-xs font-medium text-[#D4D4DC] mb-2"
              >
                <MessageSquare className="w-3.5 h-3.5 text-[#F2B705]" />
                <span>Catatan Edit untuk Fotografer (Opsional)</span>
              </label>
              <textarea
                id="photo-retouch-note"
                ref={noteInputRef}
                rows={3}
                value={selection?.note || ''}
                onChange={(e) => onUpdateNote(photo.id, e.target.value)}
                placeholder="Contoh: Crop sedikit sisi kiri, tone hangat, atau hapus objek di belakang..."
                className="w-full rounded-lg bg-[#121216] border border-[#26262F] px-3 py-2.5 text-sm text-[#FAFAFA] placeholder:text-[#636370] focus:outline-none focus:border-[#F2B705] resize-none"
              />
              <p className="mt-1.5 text-[11px] text-[#7A7A86]">
                Menulis catatan akan otomatis menandai foto ini sebagai foto terpilih.
              </p>
            </div>
          )}

          {readOnly && selection?.note && (
            <div className="pt-4 border-t border-[#1D1D23]">
              <div className="text-xs text-[#8E8E9A] mb-1.5">Catatan Edit Klien</div>
              <div className="rounded-lg bg-[#141418] border border-[#26262F] p-3 text-sm text-[#F4F4F8]">
                {selection.note}
              </div>
            </div>
          )}
        </div>

        {!readOnly && (
          <div className="pt-4 border-t border-[#1D1D23] space-y-3">
            <div className="flex items-center justify-between text-xs text-[#9494A0]">
              <span>Kuota Pilihan</span>
              <span className="font-mono text-[#FAFAFA]">
                {selectedTotal} / {targetCount > 0 ? targetCount : '∞'}
              </span>
            </div>

            <button
              type="button"
              onClick={() => onToggleSelect(photo)}
              disabled={!isSelected && !canSelectMore}
              className={`w-full py-3 px-4 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-[#F2B705] text-[#050505] hover:bg-[#eab004]'
                  : canSelectMore
                    ? 'bg-[#FAFAFA] text-[#050505] hover:bg-[#E4E4EA]'
                    : 'bg-[#1A1A20] text-[#6E6E7A] cursor-not-allowed border border-[#282832]'
              }`}
            >
              <Check className="w-4 h-4" strokeWidth={2.5} />
              <span>
                {isSelected && selection
                  ? `Terpilih ${formatOrderBadge(selection.order)} · Klik untuk Batal`
                  : canSelectMore
                    ? `Pilih Foto Ini (${formatOrderBadge(selectedTotal + 1)})`
                    : `Kuota ${targetCount} Foto Penuh`}
              </span>
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
