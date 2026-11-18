export interface PhotoExif {
  width?: number;
  height?: number;
  time?: string;
  cameraMake?: string;
  cameraModel?: string;
  focalLength?: number;
  aperture?: number;
  exposureTime?: number;
  isoSpeed?: number;
}

export interface PhotoItem {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  createdTime?: string;
  thumbnailLink?: string;
  webContentLink?: string;
  webViewLink?: string;
  exif?: PhotoExif;
  isDemo?: boolean;
  demoSrc?: string;
}

export interface DriveFolderItem {
  id: string;
  name: string;
  modifiedTime?: string;
  shared?: boolean;
}

export interface SelectionEntry {
  order: number;
  note: string;
}

export interface SavedPhotoItem {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  thumbnailLink?: string;
  webContentLink?: string;
  webViewLink?: string;
  width?: number;
  height?: number;
  note?: string;
  order: number;
  demoSrc?: string;
}

export interface SavedSelection {
  id: string;
  projectTitle: string;
  clientName: string;
  photographerPhone: string;
  driveFolderId: string;
  driveFolderUrl: string;
  targetCount: number;
  generalNote: string;
  isDemo: boolean;
  createdAt: string;
  photos: SavedPhotoItem[];
}

export type FilterMode = 'all' | 'selected' | 'unselected';
export type SortMode = 'name-asc' | 'name-desc' | 'date-asc' | 'selected-order';
export type GridDensity = 'compact' | 'standard' | 'large';
