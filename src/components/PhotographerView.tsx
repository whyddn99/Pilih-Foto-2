import { useMemo, useState } from 'react';
import JSZip from 'jszip';
import {
  Archive,
  ArrowLeft,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FolderOpen,
  Loader2,
  ZoomIn,
} from 'lucide-react';
import type { PhotoItem, SavedPhotoItem, SavedSelection, SelectionEntry } from '../types';
import { buildDriveDirectDownloadUrl, fetchDriveMediaBlob } from '../lib/drive';
import { formatFileSize, formatOrderBadge } from '../lib/format';
import { DrivePhoto } from './DrivePhoto';
import { GoogleSignInButton } from './GoogleSignInButton';
import { LightboxModal } from './LightboxModal';

interface PhotographerViewProps {
  selection: SavedSelection;
  accessToken: string | null;
  isSigningIn: boolean;
  onSignIn: () => Promise<void>;
  onBackToClientWorkspace: () => void;
}

export function PhotographerView({
  selection,
  accessToken,
  isSigningIn,
  onSignIn,
  onBackToClientWorkspace,
}: PhotographerViewProps) {
  const [zipLoading, setZipLoading] = useState(false);
  const [zipProgress, setZipProgress] = useState({ current: 0, total: 0, fileName: '' });
  const [zipError, setZipError] = useState<string | null>(null);
  const [needsDriveAuthForZip, setNeedsDriveAuthForZip] = useState(false);

  const [stripExtension, setStripExtension] = useState(false);
  const [copiedLightroom, setCopiedLightroom] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const sortedPhotos = useMemo(() => {
    return [...selection.photos].sort((a, b) => a.order - b.order);
  }, [selection.photos]);

  const lightboxPhotos: PhotoItem[] = useMemo(
    () =>
      sortedPhotos.map((p) => ({
        id: p.id,
        name: p.name,
        mimeType: p.mimeType,
        size: p.size,
        thumbnailLink: p.thumbnailLink,
        webContentLink: p.webContentLink,
        webViewLink: p.webViewLink,
        demoSrc: p.demoSrc,
        exif:
          p.width && p.height
            ? { width: p.width, height: p.height }
            : undefined,
      })),
    [sortedPhotos]
  );

  const lightboxSelectionMap = useMemo(() => {
    const map: Record<string, SelectionEntry> = {};
    for (const p of sortedPhotos) {
      map[p.id] = { order: p.order, note: p.note || '' };
    }
    return map;
  }, [sortedPhotos]);

  const lightroomFilterString = useMemo(() => {
    return sortedPhotos
      .map((p) => {
        if (!stripExtension) return p.name;
        const dotIdx = p.name.lastIndexOf('.');
        return dotIdx > 0 ? p.name.slice(0, dotIdx) : p.name;
      })
      .join(', ');
  }, [sortedPhotos, stripExtension]);

  const handleCopyLightroom = async () => {
    try {
      await navigator.clipboard.writeText(lightroomFilterString);
      setCopiedLightroom(true);
      setTimeout(() => setCopiedLightroom(false), 2200);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleExportTxt = () => {
    const lines = [
      `DAFTAR FOTO PILIHAN KLIEN`,
      `Sesi: ${selection.projectTitle}`,
      `Klien: ${selection.clientName}`,
      `Total Pilihan: ${sortedPhotos.length} foto`,
      selection.driveFolderUrl ? `Folder Drive: ${selection.driveFolderUrl}` : '',
      selection.generalNote ? `Catatan Umum: ${selection.generalNote}` : '',
      ``,
      `--------------------------------------------------`,
      ...sortedPhotos.map((p) => {
        const note = p.note?.trim() ? ` | Catatan: ${p.note.trim()}` : '';
        return `${formatOrderBadge(p.order)} ${p.name}${note}`;
      }),
    ].filter(Boolean);

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Daftar_Pilihan_${selection.projectTitle.replace(/[^\w-]+/g, '_')}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleDownloadSingle = async (photo: SavedPhotoItem) => {
    if (photo.demoSrc) {
      const res = await fetch(photo.demoSrc);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = photo.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return;
    }

    if (accessToken) {
      try {
        const blob = await fetchDriveMediaBlob(accessToken, photo.id);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = photo.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        return;
      } catch {
        // Fall through to direct Google Drive download link
      }
    }

    const a = document.createElement('a');
    a.href = photo.webContentLink || buildDriveDirectDownloadUrl(photo.id);
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.download = photo.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleDownloadAllZip = async () => {
    setZipLoading(true);
    setZipError(null);
    setNeedsDriveAuthForZip(false);
    setZipProgress({ current: 0, total: sortedPhotos.length, fileName: '' });

    try {
      const zip = new JSZip();
      let successCount = 0;

      for (let i = 0; i < sortedPhotos.length; i += 1) {
        const photo = sortedPhotos[i];
        setZipProgress({
          current: i + 1,
          total: sortedPhotos.length,
          fileName: photo.name,
        });

        let blob: Blob | null = null;

        if (photo.demoSrc) {
          const res = await fetch(photo.demoSrc);
          if (res.ok) blob = await res.blob();
        } else if (accessToken) {
          blob = await fetchDriveMediaBlob(accessToken, photo.id);
        } else {
          const res = await fetch(
            `/api/drive/file/${encodeURIComponent(photo.id)}?name=${encodeURIComponent(photo.name)}`
          );
          if (res.status === 403 || res.status === 401) {
            setNeedsDriveAuthForZip(true);
            throw new Error(
              'Folder Google Drive ini bersifat privat. Klik "Sign in with Google" di bawah untuk langsung download semua file asli ke dalam ZIP.'
            );
          }
          if (res.ok) {
            blob = await res.blob();
          }
        }

        if (blob) {
          const prefix = String(photo.order).padStart(2, '0');
          zip.file(`${prefix}_${photo.name}`, blob);
          successCount += 1;
        }
      }

      if (successCount === 0) {
        throw new Error('Tidak ada file yang berhasil diunduh.');
      }

      // Include client note summary inside the ZIP archive for convenience
      const summaryLines = [
        `Sesi: ${selection.projectTitle}`,
        `Klien: ${selection.clientName}`,
        `Total Pilihan: ${sortedPhotos.length} foto`,
        selection.generalNote ? `Catatan Umum: ${selection.generalNote}` : '',
        '',
        ...sortedPhotos.map(
          (p) => `${formatOrderBadge(p.order)} ${p.name}${p.note ? ` — ${p.note}` : ''}`
        ),
      ].filter(Boolean);
      zip.file('00_DAFTAR_DAN_CATATAN_KLIEN.txt', summaryLines.join('\n'));

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Pilihan_${sortedPhotos.length}_Foto_${selection.projectTitle.replace(/[^\w-]+/g, '_')}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setZipError(err instanceof Error ? err.message : 'Gagal membuat arsip ZIP.');
    } finally {
      setZipLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header Banner */}
      <div className="border-b border-[#1E1E26] pb-6 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div className="space-y-2">
          <button
            type="button"
            onClick={onBackToClientWorkspace}
            className="inline-flex items-center gap-1.5 text-xs text-[#9494A0] hover:text-[#FAFAFA] transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Kembali ke Workspace Seleksi</span>
          </button>

          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#FAFAFA]">
              {selection.projectTitle}
            </h1>
            <span className="font-mono text-sm font-semibold text-[#F2B705]">
              {sortedPhotos.length} Foto Siap Edit
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#9494A0]">
            <span>Klien: {selection.clientName}</span>
            <span aria-hidden="true">·</span>
            <span>
              Dikirim {new Date(selection.createdAt).toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </span>
            {selection.driveFolderUrl && !selection.isDemo && (
              <>
                <span aria-hidden="true">·</span>
                <a
                  href={selection.driveFolderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[#D4D4DC] hover:text-[#F2B705]"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>Buka Folder Drive Asli</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </>
            )}
          </div>
        </div>

        {/* Primary Batch Actions for Photographer */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleExportTxt}
            className="px-3.5 py-2.5 rounded-lg border border-[#2A2A34] bg-[#121217] text-xs font-medium text-[#E4E4EA] hover:bg-[#1B1B22] inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <FileSpreadsheet className="w-4 h-4 text-[#9494A0]" />
            <span>Export Daftar (.txt)</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadAllZip}
            disabled={zipLoading}
            className="px-5 py-2.5 rounded-lg bg-[#F2B705] text-[#050505] text-sm font-semibold hover:bg-[#eab004] transition-colors inline-flex items-center gap-2 disabled:opacity-60 cursor-pointer whitespace-nowrap"
          >
            {zipLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>
                  Mengemas {zipProgress.current}/{zipProgress.total}...
                </span>
              </>
            ) : (
              <>
                <Archive className="w-4 h-4" />
                <span>Download Semua (.zip)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ZIP Auth Helper or Progress */}
      {zipLoading && (
        <div className="rounded-xl bg-[#101014] border border-[#262630] p-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#D4D4DC]">
              Mengunduh file asli: <span className="font-mono text-[#FAFAFA]">{zipProgress.fileName}</span>
            </span>
            <span className="font-mono text-[#F2B705]">
              {zipProgress.current} / {zipProgress.total}
            </span>
          </div>
          <div className="h-1.5 w-full bg-[#1C1C24] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#F2B705] transition-all duration-150"
              style={{
                width: `${zipProgress.total ? Math.round((zipProgress.current / zipProgress.total) * 100) : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {zipError && (
        <div className="rounded-xl bg-[#161114] border border-amber-500/40 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <p className="text-xs sm:text-sm text-amber-100 leading-relaxed">{zipError}</p>
          {needsDriveAuthForZip && !accessToken && (
            <GoogleSignInButton
              label="Hubungkan Google Drive"
              loading={isSigningIn}
              onClick={onSignIn}
              className="shrink-0"
            />
          )}
        </div>
      )}

      {/* General Client Note + Lightroom Filename Filter Box */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 rounded-xl bg-[#0D0D11] border border-[#22222A] p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-[#FAFAFA]">
                Filter Cepat Adobe Lightroom / Finder
              </h2>
              <p className="text-xs text-[#8E8E9A] mt-0.5">
                Tempel di Lightroom (Library Filter &gt; Text &gt; Filename &gt; Contains) untuk langsung memilih semua file RAW di komputer.
              </p>
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-[#B4B4C0] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={stripExtension}
                onChange={(e) => setStripExtension(e.target.checked)}
                className="accent-[#F2B705]"
              />
              <span>Tanpa ekstensi (.JPG)</span>
            </label>
          </div>

          <div className="flex items-stretch gap-2">
            <div className="flex-1 rounded-lg bg-[#070709] border border-[#1E1E26] px-3 py-2 font-mono text-xs text-[#D4D4DC] overflow-x-auto whitespace-nowrap">
              {lightroomFilterString}
            </div>
            <button
              type="button"
              onClick={handleCopyLightroom}
              className="px-4 py-2 rounded-lg bg-[#1A1A22] border border-[#2C2C36] text-xs font-semibold text-[#FAFAFA] hover:bg-[#24242E] inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              {copiedLightroom ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Disalin</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Salin Filter</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="lg:col-span-5 rounded-xl bg-[#0D0D11] border border-[#22222A] p-5 flex flex-col justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[#FAFAFA]">Catatan Umum Klien</h2>
            <p className="text-sm text-[#C4C4CE] mt-1.5 leading-relaxed">
              {selection.generalNote?.trim()
                ? selection.generalNote
                : 'Tidak ada catatan umum tambahan dari klien.'}
            </p>
          </div>
          {!selection.isDemo && !accessToken && (
            <div className="pt-3 border-t border-[#1D1D24] flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-[#9494A0]">
                Folder privat? Login akun Google Drive pemilik folder:
              </span>
              <GoogleSignInButton
                label="Sign in with Google"
                loading={isSigningIn}
                onClick={onSignIn}
              />
            </div>
          )}
        </div>
      </div>

      {/* Selected Photos Numbered Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {sortedPhotos.map((photo, index) => (
          <article
            key={photo.id}
            className="group rounded-xl bg-[#0D0D11] border border-[#22222A] overflow-hidden flex flex-col"
          >
            <div
              onClick={() => setLightboxIndex(index)}
              className="relative aspect-[4/3] bg-[#08080B] overflow-hidden cursor-pointer"
            >
              <DrivePhoto
                fileId={photo.id}
                name={photo.name}
                thumbnailLink={photo.thumbnailLink}
                demoSrc={photo.demoSrc}
                accessToken={accessToken}
                thumbSize={640}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30 opacity-80" />

              <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded bg-[#F2B705] font-mono text-xs font-bold text-[#050505]">
                {formatOrderBadge(photo.order)}
              </span>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIndex(index);
                }}
                aria-label={`Perbesar ${photo.name}`}
                className="absolute top-2.5 right-2.5 p-2 rounded-lg bg-[#050505]/75 border border-white/15 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-3.5 flex-1 flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-medium text-[#FAFAFA] truncate">
                    {photo.name}
                  </span>
                  <span className="font-mono text-[11px] text-[#8E8E9A] shrink-0">
                    {formatFileSize(photo.size)}
                  </span>
                </div>

                {photo.note?.trim() && (
                  <p className="mt-2 rounded-md bg-[#14141A] border border-[#262632] px-2.5 py-2 text-xs text-[#E4E4EA] leading-snug">
                    {photo.note}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => handleDownloadSingle(photo)}
                className="w-full py-2 px-3 rounded-lg border border-[#282834] bg-[#14141A] hover:bg-[#1E1E28] text-xs font-medium text-[#FAFAFA] inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-[#F2B705]" />
                <span>Download File</span>
              </button>
            </div>
          </article>
        ))}
      </div>

      {lightboxIndex !== null && (
        <LightboxModal
          photos={lightboxPhotos}
          currentIndex={lightboxIndex}
          selections={lightboxSelectionMap}
          targetCount={sortedPhotos.length}
          accessToken={accessToken}
          readOnly
          onClose={() => setLightboxIndex(null)}
          onChangeIndex={(next) => setLightboxIndex(next)}
          onToggleSelect={() => {}}
          onUpdateNote={() => {}}
        />
      )}
    </div>
  );
}
