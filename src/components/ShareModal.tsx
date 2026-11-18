import { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Send,
  X,
} from 'lucide-react';
import type { PhotoItem, SavedSelection, SelectionEntry } from '../types';
import { formatOrderBadge, normalizeWhatsAppPhone } from '../lib/format';
import { DrivePhoto } from './DrivePhoto';

interface ShareModalProps {
  selectedPhotos: Array<{ photo: PhotoItem; entry: SelectionEntry }>;
  defaultProjectTitle: string;
  defaultClientName: string;
  driveFolderId: string;
  driveFolderUrl: string;
  targetCount: number;
  isDemo: boolean;
  accessToken: string | null;
  onClose: () => void;
  onPreviewPhotographer: (selection: SavedSelection) => void;
}

export function ShareModal({
  selectedPhotos,
  defaultProjectTitle,
  defaultClientName,
  driveFolderId,
  driveFolderUrl,
  targetCount,
  isDemo,
  accessToken,
  onClose,
  onPreviewPhotographer,
}: ShareModalProps) {
  const [projectTitle, setProjectTitle] = useState(defaultProjectTitle || 'Sesi Foto Pilihan');
  const [clientName, setClientName] = useState(defaultClientName || 'Klien');
  const [photographerPhone, setPhotographerPhone] = useState('');
  const [generalNote, setGeneralNote] = useState('');
  const [includeTextList, setIncludeTextList] = useState(true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedRecord, setSavedRecord] = useState<SavedSelection | null>(null);
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const shareUrl = useMemo(() => {
    if (!savedRecord) return '';
    return `${window.location.origin}/?share=${encodeURIComponent(savedRecord.id)}`;
  }, [savedRecord]);

  const whatsappMessage = useMemo(() => {
    if (!savedRecord) return '';
    const lines: string[] = [
      `Halo Kak! Ini daftar *${savedRecord.photos.length} foto pilihan* saya untuk diedit:`,
      ``,
      `Sesi: ${savedRecord.projectTitle}`,
      `Klien: ${savedRecord.clientName}`,
      ``,
      `Link Download Langsung (tinggal buka & klik Download Semua .zip tanpa pilih manual):`,
      shareUrl,
    ];

    if (savedRecord.generalNote.trim()) {
      lines.push('', `Catatan Umum: ${savedRecord.generalNote.trim()}`);
    }

    if (includeTextList) {
      lines.push('', `Daftar File (${savedRecord.photos.length} foto):`);
      const maxPreview = 60;
      savedRecord.photos.slice(0, maxPreview).forEach((p) => {
        const notePart = p.note?.trim() ? ` — catatan: ${p.note.trim()}` : '';
        lines.push(`${p.order}. ${p.name}${notePart}`);
      });
      if (savedRecord.photos.length > maxPreview) {
        lines.push(`...dan ${savedRecord.photos.length - maxPreview} foto lainnya di dalam link di atas.`);
      }
    }

    return lines.join('\n');
  }, [savedRecord, shareUrl, includeTextList]);

  const whatsappHref = useMemo(() => {
    if (!whatsappMessage) return '#';
    const normalizedPhone = normalizeWhatsAppPhone(photographerPhone);
    const encoded = encodeURIComponent(whatsappMessage);
    return normalizedPhone
      ? `https://wa.me/${normalizedPhone}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;
  }, [whatsappMessage, photographerPhone]);

  const handleGenerateLink = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        projectTitle: projectTitle.trim() || 'Sesi Foto Pilihan',
        clientName: clientName.trim() || 'Klien',
        photographerPhone: normalizeWhatsAppPhone(photographerPhone),
        driveFolderId,
        driveFolderUrl,
        targetCount,
        generalNote: generalNote.trim(),
        isDemo,
        photos: selectedPhotos.map(({ photo, entry }) => ({
          id: photo.id,
          name: photo.name,
          mimeType: photo.mimeType,
          size: photo.size,
          thumbnailLink: photo.thumbnailLink,
          webContentLink: photo.webContentLink,
          webViewLink: photo.webViewLink,
          width: photo.exif?.width,
          height: photo.exif?.height,
          note: entry.note.trim(),
          order: entry.order,
          demoSrc: photo.demoSrc,
        })),
      };

      const res = await fetch('/api/selections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as { selection?: SavedSelection; error?: string };
      if (!res.ok || !data.selection) {
        throw new Error(data.error || 'Gagal membuat link pilihan foto.');
      }

      setSavedRecord(data.selection);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan daftar pilihan.');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyText = async (text: string, type: 'message' | 'link') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'message') {
        setCopiedMessage(true);
        setTimeout(() => setCopiedMessage(false), 2000);
      } else {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      }
    } catch {
      // Clipboard fallback ignored safely
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Kirim Pilihan Foto ke WhatsApp"
    >
      <div className="w-full max-w-2xl bg-[#0D0D11] border border-[#25252E] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E1E26]">
          <div>
            <h2 className="font-display text-lg font-semibold text-[#FAFAFA]">
              Kirim Daftar Pilihan ke Fotografer
            </h2>
            <p className="text-xs text-[#9494A0] mt-0.5">
              Buat link khusus agar fotografer bisa langsung download semua {selectedPhotos.length} foto tanpa pilih manual.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal"
            className="p-2 rounded-lg text-[#9494A0] hover:text-white hover:bg-[#1A1A22] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          {/* Selected Photos Strip Preview */}
          <div>
            <div className="flex items-center justify-between text-xs text-[#9494A0] mb-2">
              <span>Ringkasan Foto Terpilih</span>
              <span className="font-mono text-[#F2B705] font-semibold">
                {selectedPhotos.length} Foto
              </span>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              {selectedPhotos.map(({ photo, entry }) => (
                <div
                  key={photo.id}
                  className="relative w-16 h-16 shrink-0 rounded-lg overflow-hidden border border-[#262630] bg-[#141418]"
                  title={`${formatOrderBadge(entry.order)} ${photo.name}`}
                >
                  <DrivePhoto
                    fileId={photo.id}
                    name={photo.name}
                    thumbnailLink={photo.thumbnailLink}
                    demoSrc={photo.demoSrc}
                    accessToken={accessToken}
                    thumbSize={220}
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute top-1 left-1 px-1 py-0.5 rounded bg-[#050505]/85 font-mono text-[10px] font-semibold text-[#F2B705]">
                    {formatOrderBadge(entry.order)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {!savedRecord ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="share-project" className="block text-xs font-medium text-[#C4C4CE] mb-1.5">
                    Nama Sesi / Project
                  </label>
                  <input
                    id="share-project"
                    type="text"
                    value={projectTitle}
                    onChange={(e) => setProjectTitle(e.target.value)}
                    placeholder="Contoh: Prewedding Raka & Dina"
                    className="w-full rounded-lg bg-[#141418] border border-[#272732] px-3.5 py-2.5 text-sm text-[#FAFAFA] placeholder:text-[#636370] focus:outline-none focus:border-[#F2B705]"
                  />
                </div>
                <div>
                  <label htmlFor="share-client" className="block text-xs font-medium text-[#C4C4CE] mb-1.5">
                    Nama Kamu (Klien)
                  </label>
                  <input
                    id="share-client"
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Contoh: Raka Pratama"
                    className="w-full rounded-lg bg-[#141418] border border-[#272732] px-3.5 py-2.5 text-sm text-[#FAFAFA] placeholder:text-[#636370] focus:outline-none focus:border-[#F2B705]"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="share-wa-phone" className="block text-xs font-medium text-[#C4C4CE] mb-1.5">
                  Nomor WhatsApp Fotografer (Opsional)
                </label>
                <input
                  id="share-wa-phone"
                  type="tel"
                  value={photographerPhone}
                  onChange={(e) => setPhotographerPhone(e.target.value)}
                  placeholder="Contoh: 081234567890 (kosongkan jika ingin pilih kontak di WA)"
                  className="w-full rounded-lg bg-[#141418] border border-[#272732] px-3.5 py-2.5 text-sm text-[#FAFAFA] placeholder:text-[#636370] focus:outline-none focus:border-[#F2B705]"
                />
              </div>

              <div>
                <label htmlFor="share-general-note" className="block text-xs font-medium text-[#C4C4CE] mb-1.5">
                  Catatan Umum untuk Fotografer (Opsional)
                </label>
                <textarea
                  id="share-general-note"
                  rows={2}
                  value={generalNote}
                  onChange={(e) => setGeneralNote(e.target.value)}
                  placeholder="Contoh: Tolong warna dibuat agak warm natural, kulit tetap natural jangan terlalu halus."
                  className="w-full rounded-lg bg-[#141418] border border-[#272732] px-3.5 py-2.5 text-sm text-[#FAFAFA] placeholder:text-[#636370] focus:outline-none focus:border-[#F2B705] resize-none"
                />
              </div>

              <label className="flex items-center gap-2.5 text-xs text-[#C4C4CE] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeTextList}
                  onChange={(e) => setIncludeTextList(e.target.checked)}
                  className="w-4 h-4 accent-[#F2B705] rounded"
                />
                <span>Sertakan daftar nama file 1–{selectedPhotos.length} di dalam teks pesan WhatsApp</span>
              </label>

              {error && (
                <div className="rounded-lg bg-red-950/50 border border-red-800/60 px-4 py-3 text-xs text-red-200">
                  {error}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl bg-[#131318] border border-[#272732] p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-emerald-400 flex items-center gap-1.5">
                    <Check className="w-4 h-4" />
                    <span>Link Download Fotografer Siap Dikirim</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyText(shareUrl, 'link')}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-[#F2B705] hover:underline cursor-pointer"
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedLink ? 'Link Disalin' : 'Salin Link'}</span>
                  </button>
                </div>
                <div className="font-mono text-xs text-[#E4E4EA] bg-[#09090C] border border-[#1E1E26] rounded-lg px-3 py-2 break-all">
                  {shareUrl}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-[#C4C4CE]">Preview Pesan WhatsApp</span>
                  <button
                    type="button"
                    onClick={() => handleCopyText(whatsappMessage, 'message')}
                    className="inline-flex items-center gap-1.5 text-xs text-[#9494A0] hover:text-white cursor-pointer"
                  >
                    {copiedMessage ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedMessage ? 'Pesan Disalin' : 'Salin Pesan'}</span>
                  </button>
                </div>
                <pre className="max-h-44 overflow-y-auto rounded-lg bg-[#09090C] border border-[#1E1E26] p-3.5 text-xs text-[#D4D4DC] whitespace-pre-wrap font-sans leading-relaxed">
                  {whatsappMessage}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-[#1E1E26] bg-[#0A0A0D] flex flex-wrap items-center justify-between gap-3">
          {!savedRecord ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium text-[#9494A0] hover:text-white cursor-pointer"
              >
                Kembali Pilih Foto
              </button>
              <button
                type="button"
                onClick={handleGenerateLink}
                disabled={saving || selectedPhotos.length === 0}
                className="px-5 py-2.5 rounded-lg bg-[#F2B705] text-[#050505] text-sm font-semibold hover:bg-[#eab004] transition-colors inline-flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Menyimpan Daftar...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Buat Link &amp; Siapkan WhatsApp</span>
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onPreviewPhotographer(savedRecord)}
                className="px-4 py-2 rounded-lg border border-[#2C2C38] bg-[#14141A] text-xs sm:text-sm font-medium text-[#E4E4EA] hover:bg-[#1E1E26] inline-flex items-center gap-2 cursor-pointer"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Lihat Halaman Fotografer</span>
              </button>

              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 py-2.5 rounded-lg bg-[#25D366] text-[#052611] text-sm font-semibold hover:bg-[#20bd5a] transition-colors inline-flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                <span>Kirim ke WhatsApp Sekarang</span>
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
