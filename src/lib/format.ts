import type { PhotoExif } from '../types';

export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatExposure(exposureTime?: number): string | null {
  if (!exposureTime || exposureTime <= 0) return null;
  if (exposureTime >= 1) return `${exposureTime.toFixed(1)}s`;
  const denom = Math.round(1 / exposureTime);
  return `1/${denom}s`;
}

export function formatExifSummary(exif?: PhotoExif): string {
  if (!exif) return '';
  const parts: string[] = [];
  if (exif.focalLength) parts.push(`${Math.round(exif.focalLength)}mm`);
  if (exif.aperture) parts.push(`f/${exif.aperture}`);
  const shutter = formatExposure(exif.exposureTime);
  if (shutter) parts.push(shutter);
  if (exif.isoSpeed) parts.push(`ISO ${exif.isoSpeed}`);
  return parts.join(' · ');
}

export function normalizeWhatsAppPhone(input: string): string {
  const digits = input.replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) {
    return `62${digits.slice(1)}`;
  }
  if (digits.startsWith('8')) {
    return `62${digits}`;
  }
  return digits;
}

export function formatOrderBadge(order: number): string {
  return `#${String(order).padStart(2, '0')}`;
}
