import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { buildDriveThumbnailUrl, getOrFetchDriveObjectUrl } from '../lib/drive';

interface DrivePhotoProps {
  fileId: string;
  name: string;
  thumbnailLink?: string;
  demoSrc?: string;
  accessToken: string | null;
  highRes?: boolean;
  thumbSize?: number;
  className?: string;
  draggable?: boolean;
}

export function DrivePhoto({
  fileId,
  name,
  thumbnailLink,
  demoSrc,
  accessToken,
  highRes = false,
  thumbSize = 640,
  className = '',
  draggable = false,
}: DrivePhotoProps) {
  const initialSrc =
    demoSrc || buildDriveThumbnailUrl(thumbnailLink, highRes ? 2000 : thumbSize, fileId);
  const [src, setSrc] = useState<string | undefined>(initialSrc);
  const [failed, setFailed] = useState(false);
  const [fallbackStep, setFallbackStep] = useState(0);

  useEffect(() => {
    let active = true;
    setFailed(false);
    setFallbackStep(0);

    if (demoSrc) {
      setSrc(demoSrc);
      return;
    }

    const upgradedThumb = buildDriveThumbnailUrl(
      thumbnailLink,
      highRes ? 2000 : thumbSize,
      fileId
    );
    setSrc(upgradedThumb);

    if (highRes && accessToken && !fileId.startsWith('demo_')) {
      getOrFetchDriveObjectUrl(accessToken, fileId)
        .then((objUrl) => {
          if (active) setSrc(objUrl);
        })
        .catch(() => {
          // Keep thumbnail fallback
        });
    } else if (!upgradedThumb && accessToken && !fileId.startsWith('demo_')) {
      getOrFetchDriveObjectUrl(accessToken, fileId)
        .then((objUrl) => {
          if (active) setSrc(objUrl);
        })
        .catch(() => {
          if (active) setFailed(true);
        });
    }

    return () => {
      active = false;
    };
  }, [fileId, thumbnailLink, demoSrc, accessToken, highRes, thumbSize]);

  const handleImageError = () => {
    if (fallbackStep === 0 && accessToken && !fileId.startsWith('demo_')) {
      setFallbackStep(1);
      getOrFetchDriveObjectUrl(accessToken, fileId)
        .then((objUrl) => setSrc(objUrl))
        .catch(() => setFailed(true));
      return;
    }
    if (fallbackStep === 0 && !accessToken && !fileId.startsWith('demo_')) {
      setFallbackStep(1);
      setSrc(`/api/drive/file/${encodeURIComponent(fileId)}`);
      return;
    }
    setFailed(true);
  };

  if (failed || !src) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-[#121216] text-[#8E8E9A] p-4 text-center ${className}`}
      >
        <ImageOff className="w-6 h-6 mb-2 opacity-60" strokeWidth={1.5} />
        <span className="font-mono text-[11px] truncate max-w-full px-2 text-[#C4C4CE]">{name}</span>
        <span className="text-[11px] text-[#6E6E7A] mt-0.5">Preview tidak tersedia</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      referrerPolicy="no-referrer"
      draggable={draggable}
      loading={highRes ? 'eager' : 'lazy'}
      onError={handleImageError}
      className={className}
    />
  );
}
