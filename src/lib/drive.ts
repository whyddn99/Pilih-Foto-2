import type { DriveFolderItem, PhotoItem } from '../types';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';

const IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'heic',
  'heif',
  'tif',
  'tiff',
  'bmp',
  'gif',
  'raw',
  'cr2',
  'cr3',
  'nef',
  'arw',
  'dng',
  'raf',
  'orf',
  'rw2',
]);

function isPhotoFile(name: string, mimeType: string): boolean {
  if (mimeType.startsWith('image/')) return true;
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return IMAGE_EXTENSIONS.has(ext);
}

/**
 * Extracts Google Drive folder ID from all common Drive URL formats or raw IDs.
 */
export function extractDriveFolderId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Format: https://drive.google.com/drive/folders/FOLDER_ID?... or /drive/u/0/folders/FOLDER_ID
  const folderPathMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]{10,})/);
  if (folderPathMatch?.[1]) {
    return folderPathMatch[1];
  }

  // Format: https://drive.google.com/open?id=FOLDER_ID or folderview?id=FOLDER_ID
  const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (idParamMatch?.[1]) {
    return idParamMatch[1];
  }

  // Raw folder ID
  if (/^[a-zA-Z0-9_-]{15,80}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

export function extractDriveResourceKey(input: string): string | undefined {
  const match = input.match(/[?&]resourcekey=([a-zA-Z0-9_-]+)/i);
  return match?.[1];
}

export function buildDriveThumbnailUrl(
  thumbnailLink: string | undefined,
  size = 640,
  fileId?: string
): string | undefined {
  if (!thumbnailLink) {
    return fileId ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w${size}` : undefined;
  }
  if (/=s\d+$/.test(thumbnailLink)) {
    return thumbnailLink.replace(/=s\d+$/, `=s${size}`);
  }
  if (/[?&]sz=w\d+/i.test(thumbnailLink)) {
    return thumbnailLink.replace(/([?&]sz=)w\d+/i, `$1w${size}`);
  }
  return thumbnailLink;
}

export function buildDriveDirectDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
}

export async function fetchPublicDriveFolder(
  folderId: string,
  resourceKey?: string
): Promise<{
  folder: { id: string; name: string };
  photos: PhotoItem[];
  subfolders: DriveFolderItem[];
}> {
  const rkQuery = resourceKey ? `?resourcekey=${encodeURIComponent(resourceKey)}` : '';
  const res = await fetch(`/api/drive/public-folder/${encodeURIComponent(folderId)}${rkQuery}`);
  const data = (await res.json()) as {
    folder?: { id: string; name: string };
    photos?: PhotoItem[];
    subfolders?: DriveFolderItem[];
    error?: string;
    requiresAuth?: boolean;
  };

  if (!res.ok || !data.folder) {
    const err = new Error(data.error || 'Gagal membaca folder publik Google Drive.') as Error & {
      requiresAuth?: boolean;
    };
    err.requiresAuth = Boolean(data.requiresAuth);
    throw err;
  }

  return {
    folder: data.folder,
    photos: data.photos || [],
    subfolders: data.subfolders || [],
  };
}

interface RawDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
  modifiedTime?: string;
  thumbnailLink?: string;
  webContentLink?: string;
  webViewLink?: string;
  shared?: boolean;
  imageMediaMetadata?: {
    width?: number;
    height?: number;
    time?: string;
    cameraMake?: string;
    cameraModel?: string;
    focalLength?: number;
    aperture?: number;
    exposureTime?: number;
    isoSpeed?: number;
  };
}

export async function getFolderMetadata(
  accessToken: string,
  folderId: string
): Promise<{ id: string; name: string }> {
  const url = `${DRIVE_API_BASE}/files/${encodeURIComponent(folderId)}?fields=id,name,mimeType&supportsAllDrives=true`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const msg =
      errBody?.error?.message ||
      (res.status === 404
        ? 'Folder Google Drive tidak ditemukan. Pastikan link benar dan Anda memiliki akses ke folder tersebut.'
        : res.status === 401
          ? 'Sesi Google Drive berakhir. Silakan hubungkan ulang akun Google Anda.'
          : 'Gagal mengakses folder Google Drive.');
    throw new Error(msg);
  }

  const data = (await res.json()) as RawDriveFile;
  return { id: data.id, name: data.name };
}

export async function listFolderContents(
  accessToken: string,
  folderId: string,
  onProgress?: (count: number) => void
): Promise<{ photos: PhotoItem[]; subfolders: DriveFolderItem[] }> {
  const photos: PhotoItem[] = [];
  const subfolders: DriveFolderItem[] = [];
  let pageToken: string | undefined;

  const fields =
    'nextPageToken,files(id,name,mimeType,size,createdTime,thumbnailLink,webContentLink,webViewLink,imageMediaMetadata(width,height,time,cameraMake,cameraModel,focalLength,aperture,exposureTime,isoSpeed))';

  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const tokenParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
    const url = `${DRIVE_API_BASE}/files?q=${q}&fields=${encodeURIComponent(fields)}&pageSize=200&orderBy=name_natural&includeItemsFromAllDrives=true&supportsAllDrives=true${tokenParam}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody?.error?.message || 'Gagal memuat daftar file dari Google Drive.');
    }

    const data = (await res.json()) as { nextPageToken?: string; files?: RawDriveFile[] };
    const files = data.files || [];

    for (const file of files) {
      if (file.mimeType === 'application/vnd.google-apps.folder') {
        subfolders.push({
          id: file.id,
          name: file.name,
          modifiedTime: file.modifiedTime,
        });
      } else if (isPhotoFile(file.name, file.mimeType)) {
        photos.push({
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          size: file.size ? Number(file.size) : undefined,
          createdTime: file.createdTime,
          thumbnailLink: file.thumbnailLink,
          webContentLink: file.webContentLink,
          webViewLink: file.webViewLink,
          exif: file.imageMediaMetadata,
        });
      }
    }

    if (onProgress) {
      onProgress(photos.length);
    }

    pageToken = data.nextPageToken;
  } while (pageToken && photos.length < 2500);

  return { photos, subfolders };
}

export async function listAccessibleFolders(
  accessToken: string
): Promise<{ sharedFolders: DriveFolderItem[]; myFolders: DriveFolderItem[] }> {
  const fields = 'files(id,name,modifiedTime,shared)';

  const [sharedRes, myRes] = await Promise.all([
    fetch(
      `${DRIVE_API_BASE}/files?q=${encodeURIComponent(
        "sharedWithMe = true and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
      )}&fields=${encodeURIComponent(fields)}&pageSize=12&orderBy=modifiedTime desc`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    ),
    fetch(
      `${DRIVE_API_BASE}/files?q=${encodeURIComponent(
        "'root' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
      )}&fields=${encodeURIComponent(fields)}&pageSize=12&orderBy=modifiedTime desc`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    ),
  ]);

  const sharedData = sharedRes.ok ? ((await sharedRes.json()) as { files?: RawDriveFile[] }) : { files: [] };
  const myData = myRes.ok ? ((await myRes.json()) as { files?: RawDriveFile[] }) : { files: [] };

  return {
    sharedFolders: (sharedData.files || []).map((f) => ({
      id: f.id,
      name: f.name,
      modifiedTime: f.modifiedTime,
      shared: true,
    })),
    myFolders: (myData.files || []).map((f) => ({
      id: f.id,
      name: f.name,
      modifiedTime: f.modifiedTime,
      shared: f.shared,
    })),
  };
}

// Concurrency-limited queue for Drive media fetches so we don't overwhelm the browser or Drive API
const MAX_CONCURRENT_FETCHES = 5;
let activeFetches = 0;
const fetchQueue: Array<() => void> = [];
const blobUrlCache = new Map<string, string>();

function acquireSlot(): Promise<void> {
  if (activeFetches < MAX_CONCURRENT_FETCHES) {
    activeFetches += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    fetchQueue.push(() => {
      activeFetches += 1;
      resolve();
    });
  });
}

function releaseSlot(): void {
  activeFetches = Math.max(0, activeFetches - 1);
  const next = fetchQueue.shift();
  if (next) next();
}

export async function fetchDriveMediaBlob(accessToken: string, fileId: string): Promise<Blob> {
  await acquireSlot();
  try {
    const res = await fetch(
      `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.blob();
  } finally {
    releaseSlot();
  }
}

export async function getOrFetchDriveObjectUrl(accessToken: string, fileId: string): Promise<string> {
  const existing = blobUrlCache.get(fileId);
  if (existing) return existing;

  const blob = await fetchDriveMediaBlob(accessToken, fileId);
  const url = URL.createObjectURL(blob);
  blobUrlCache.set(fileId, url);
  return url;
}
