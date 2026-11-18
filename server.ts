import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import type { Request, Response } from 'express';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isDev = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';

const DATA_DIR = path.resolve(__dirname, 'data');
const SELECTIONS_FILE = path.join(DATA_DIR, 'selections.json');

interface SavedPhotoItem {
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

interface SavedSelection {
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

function ensureDataStore(): Record<string, SavedSelection> {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(SELECTIONS_FILE)) {
    fs.writeFileSync(SELECTIONS_FILE, JSON.stringify({}, null, 2), 'utf-8');
    return {};
  }
  try {
    const raw = fs.readFileSync(SELECTIONS_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, SavedSelection>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeDataStore(store: Record<string, SavedSelection>): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(SELECTIONS_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

function generateShareId(): string {
  return crypto.randomBytes(5).toString('base64url').slice(0, 8);
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.post('/api/selections', (req: Request, res: Response) => {
    try {
      const body = req.body as Partial<SavedSelection>;
      if (!Array.isArray(body.photos) || body.photos.length === 0) {
        res.status(400).json({ error: 'Pilih minimal 1 foto sebelum membuat link bagikan.' });
        return;
      }

      const store = ensureDataStore();
      let id = generateShareId();
      while (store[id]) {
        id = generateShareId();
      }

      const sanitizedPhotos: SavedPhotoItem[] = body.photos.slice(0, 500).map((p, index) => ({
        id: String(p.id || ''),
        name: String(p.name || `Foto_${index + 1}.jpg`),
        mimeType: String(p.mimeType || 'image/jpeg'),
        size: typeof p.size === 'number' ? p.size : undefined,
        thumbnailLink: typeof p.thumbnailLink === 'string' ? p.thumbnailLink : undefined,
        webContentLink: typeof p.webContentLink === 'string' ? p.webContentLink : undefined,
        webViewLink: typeof p.webViewLink === 'string' ? p.webViewLink : undefined,
        width: typeof p.width === 'number' ? p.width : undefined,
        height: typeof p.height === 'number' ? p.height : undefined,
        note: typeof p.note === 'string' ? p.note.slice(0, 500) : '',
        order: typeof p.order === 'number' ? p.order : index + 1,
        demoSrc: typeof p.demoSrc === 'string' ? p.demoSrc : undefined,
      }));

      const record: SavedSelection = {
        id,
        projectTitle: String(body.projectTitle || 'Sesi Foto Pilihan').slice(0, 120),
        clientName: String(body.clientName || 'Klien').slice(0, 80),
        photographerPhone: String(body.photographerPhone || '').replace(/[^\d]/g, '').slice(0, 20),
        driveFolderId: String(body.driveFolderId || '').slice(0, 120),
        driveFolderUrl: String(body.driveFolderUrl || '').slice(0, 300),
        targetCount: typeof body.targetCount === 'number' ? body.targetCount : 50,
        generalNote: String(body.generalNote || '').slice(0, 1000),
        isDemo: Boolean(body.isDemo),
        createdAt: new Date().toISOString(),
        photos: sanitizedPhotos,
      };

      store[id] = record;
      writeDataStore(store);

      res.status(201).json({ id, selection: record });
    } catch (err) {
      console.error('Failed to save selection:', err);
      res.status(500).json({ error: 'Gagal menyimpan daftar pilihan foto.' });
    }
  });

  app.get('/api/selections/:id', (req: Request, res: Response) => {
    const id = String(req.params.id || '').trim();
    if (!id) {
      res.status(400).json({ error: 'ID pilihan tidak valid.' });
      return;
    }
    const store = ensureDataStore();
    const record = store[id];
    if (!record) {
      res.status(404).json({ error: 'Daftar pilihan foto tidak ditemukan atau sudah kedaluwarsa.' });
      return;
    }
    res.json({ selection: record });
  });

  // List files & subfolders in a public ("Anyone with the link") Google Drive folder without login
  app.get('/api/drive/public-folder/:folderId', async (req: Request, res: Response) => {
    const folderId = String(req.params.folderId || '').trim();
    const resourceKey = String(req.query.resourcekey || '').trim();

    if (!folderId || !/^[a-zA-Z0-9_-]{8,120}$/.test(folderId)) {
      res.status(400).json({ error: 'ID folder Google Drive tidak valid.' });
      return;
    }

    try {
      const rkParam = resourceKey ? `&resourcekey=${encodeURIComponent(resourceKey)}` : '';
      const embedUrl = `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}${rkParam}#grid`;

      const driveRes = await fetch(embedUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
      });

      const finalUrl = driveRes.url || '';
      const html = await driveRes.text();

      if (
        finalUrl.includes('accounts.google.com') ||
        html.includes('accounts.google.com/ServiceLogin') ||
        driveRes.status === 401 ||
        driveRes.status === 403
      ) {
        res.status(403).json({
          requiresAuth: true,
          error:
            'Folder ini masih privat. Ubah akses folder di Drive menjadi "Siapa saja yang memiliki link" atau login Google Drive.',
        });
        return;
      }

      if (driveRes.status === 404 || html.includes('Error 404')) {
        res.status(404).json({ error: 'Folder Google Drive tidak ditemukan.' });
        return;
      }

      const decodeHtml = (str: string): string =>
        str
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&#(\d+);/g, (_m, dec) => String.fromCharCode(Number(dec)));

      const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
      const rawTitle = titleMatch ? decodeHtml(titleMatch[1]).trim() : 'Folder Google Drive';
      const folderName = rawTitle.replace(/\s*-\s*Google Drive$/i, '').trim() || 'Folder Google Drive';

      const IMAGE_EXTS = new Set([
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

      const photos: Array<{
        id: string;
        name: string;
        mimeType: string;
        thumbnailLink: string;
        webContentLink: string;
        webViewLink: string;
      }> = [];
      const subfolders: Array<{ id: string; name: string }> = [];

      // Split HTML by flip-entry containers
      const entryChunks = html.split(/<div[^>]+class="[^"]*flip-entry[^"]*"[^>]*id="entry-([^"]+)"/i);
      for (let i = 1; i < entryChunks.length; i += 2) {
        const entryId = entryChunks[i]?.trim();
        const chunk = entryChunks[i + 1] || '';
        if (!entryId) continue;

        const nameMatch = chunk.match(/<div[^>]+class="[^"]*flip-entry-title[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        const name = nameMatch ? decodeHtml(nameMatch[1].replace(/<[^>]+>/g, '')).trim() : entryId;

        const isFolder =
          chunk.includes('/drive/folders/') ||
          chunk.includes('folderview') ||
          chunk.includes('drive/u/0/folders/');

        if (isFolder) {
          subfolders.push({ id: entryId, name });
          continue;
        }

        const ext = name.split('.').pop()?.toLowerCase() || '';
        const thumbMatch = chunk.match(/<img[^>]+src="([^"]+)"/i);
        const hasImageThumb = Boolean(thumbMatch?.[1]);

        if (!IMAGE_EXTS.has(ext) && !hasImageThumb) {
          continue;
        }

        const mimeType =
          ext === 'png'
            ? 'image/png'
            : ext === 'webp'
              ? 'image/webp'
              : ext === 'heic' || ext === 'heif'
                ? 'image/heic'
                : 'image/jpeg';

        photos.push({
          id: entryId,
          name,
          mimeType,
          thumbnailLink: `https://drive.google.com/thumbnail?id=${encodeURIComponent(entryId)}&sz=w800`,
          webContentLink: `https://drive.google.com/uc?export=download&id=${encodeURIComponent(entryId)}`,
          webViewLink: `https://drive.google.com/file/d/${encodeURIComponent(entryId)}/view`,
        });
      }

      res.json({
        folder: { id: folderId, name: folderName },
        photos,
        subfolders,
      });
    } catch (err) {
      console.error('Public Drive folder parse error:', err);
      res.status(500).json({ error: 'Gagal membaca folder publik Google Drive.' });
    }
  });

  // Stream file bytes from Google Drive (via OAuth Bearer token or public Drive link)
  app.get('/api/drive/file/:fileId', async (req: Request, res: Response) => {
    const fileId = String(req.params.fileId || '').trim();
    const filename = String(req.query.name || `${fileId}.jpg`).replace(/["\r\n]/g, '_');
    const authHeader = req.headers.authorization;

    if (!fileId || !/^[a-zA-Z0-9_-]{8,120}$/.test(fileId)) {
      res.status(400).json({ error: 'Invalid Google Drive file ID' });
      return;
    }

    try {
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const driveRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
          {
            headers: {
              Authorization: authHeader,
            },
          }
        );

        if (!driveRes.ok) {
          res.status(driveRes.status).json({
            error: 'Gagal mengunduh file dari Google Drive.',
            requiresAuth: driveRes.status === 401 || driveRes.status === 403,
          });
          return;
        }

        const contentType = driveRes.headers.get('content-type') || 'application/octet-stream';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        const arrayBuf = await driveRes.arrayBuffer();
        res.send(Buffer.from(arrayBuf));
        return;
      }

      // Attempt public Google Drive download for "Anyone with the link" folders
      const publicUrl = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
      const publicRes = await fetch(publicUrl, { redirect: 'follow' });
      const contentType = publicRes.headers.get('content-type') || '';

      if (!publicRes.ok || contentType.includes('text/html')) {
        res.status(403).json({
          requiresAuth: true,
          error:
            'Folder ini bersifat privat. Silakan hubungkan akun Google Drive Anda untuk mengunduh file asli.',
        });
        return;
      }

      res.setHeader('Content-Type', contentType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      const arrayBuf = await publicRes.arrayBuffer();
      res.send(Buffer.from(arrayBuf));
    } catch (err) {
      console.error('Drive proxy error:', err);
      res.status(500).json({ error: 'Terjadi kesalahan saat mengunduh file dari Google Drive.' });
    }
  });

  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PilihFoto server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
