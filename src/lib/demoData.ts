import type { PhotoItem } from '../types';

const SAMPLE_ASSETS = [
  {
    src: '/src/assets/images/shoot_editorial_couple_1795007360878.jpg',
    width: 3000,
    height: 4000,
    camera: 'Sony ILCE-7M4',
    focalLength: 50,
    aperture: 1.8,
    exposureTime: 1 / 640,
    isoSpeed: 160,
  },
  {
    src: '/src/assets/images/shoot_studio_portrait_1795007360827.jpg',
    width: 3000,
    height: 4000,
    camera: 'Hasselblad X2D 100C',
    focalLength: 90,
    aperture: 2.5,
    exposureTime: 1 / 250,
    isoSpeed: 100,
  },
  {
    src: '/src/assets/images/shoot_candid_laugh_1795007362725.jpg',
    width: 4000,
    height: 3000,
    camera: 'Leica Q3',
    focalLength: 28,
    aperture: 1.7,
    exposureTime: 1 / 160,
    isoSpeed: 800,
  },
  {
    src: '/src/assets/images/shoot_silhouette_arch_1795007361314.jpg',
    width: 4000,
    height: 3000,
    camera: 'Canon EOS R5',
    focalLength: 35,
    aperture: 4.0,
    exposureTime: 1 / 1000,
    isoSpeed: 200,
  },
];

export const DEMO_PROJECT_TITLE = 'Sesi_Editorial_Kota_Tua_Sample';
export const DEMO_FOLDER_URL = 'https://drive.google.com/drive/folders/demo-session-kotatua';

export function buildDemoPhotos(): PhotoItem[] {
  const photos: PhotoItem[] = [];
  for (let i = 0; i < 16; i += 1) {
    const asset = SAMPLE_ASSETS[i % SAMPLE_ASSETS.length];
    const num = String(401 + i).padStart(4, '0');
    const minute = String(10 + i * 2).padStart(2, '0');
    photos.push({
      id: `demo_photo_${num}`,
      name: `DSC_${num}.JPG`,
      mimeType: 'image/jpeg',
      size: 11_400_000 + (i % 5) * 1_850_000,
      createdTime: `2026-11-17T16:${minute}:00.000Z`,
      isDemo: true,
      demoSrc: asset.src,
      exif: {
        width: asset.width,
        height: asset.height,
        time: `2026:11:17 16:${minute}:00`,
        cameraMake: asset.camera.split(' ')[0],
        cameraModel: asset.camera,
        focalLength: asset.focalLength,
        aperture: asset.aperture,
        exposureTime: asset.exposureTime,
        isoSpeed: asset.isoSpeed,
      },
    });
  }
  return photos;
}
