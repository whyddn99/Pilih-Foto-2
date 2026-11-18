import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { User } from 'firebase/auth';
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronRight,
  Folder,
  FolderOpen,
  Grid2X2,
  Grid3X3,
  LayoutGrid,
  Link2,
  Loader2,
  LogOut,
  MessageSquare,
  RotateCcw,
  Search,
  Send,
  SlidersHorizontal,
  ZoomIn,
} from 'lucide-react';
import { googleSignIn, initAuth, logout } from './lib/auth';
import {
  extractDriveFolderId,
  extractDriveResourceKey,
  fetchPublicDriveFolder,
  getFolderMetadata,
  listAccessibleFolders,
  listFolderContents,
} from './lib/drive';
import { buildDemoPhotos, DEMO_FOLDER_URL, DEMO_PROJECT_TITLE } from './lib/demoData';
import { formatFileSize, formatOrderBadge } from './lib/format';
import type {
  DriveFolderItem,
  FilterMode,
  GridDensity,
  PhotoItem,
  SavedSelection,
  SelectionEntry,
  SortMode,
} from './types';
import { DrivePhoto } from './components/DrivePhoto';
import { GoogleSignInButton } from './components/GoogleSignInButton';
import { LightboxModal } from './components/LightboxModal';
import { PhotographerView } from './components/PhotographerView';
import { ShareModal } from './components/ShareModal';

export default function App() {
  // Optional OAuth state (only needed for private non-public folders)
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showPrivateLogin, setShowPrivateLogin] = useState(false);

  // Shared Photographer Delivery View (?share=...)
  const [sharedSelection, setSharedSelection] = useState<SavedSelection | null>(null);
  const [loadingShared, setLoadingShared] = useState(false);
  const [sharedLoadError, setSharedLoadError] = useState<string | null>(null);

  // Active Drive / Demo Folder state
  const [driveInput, setDriveInput] = useState('');
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [activeFolderName, setActiveFolderName] = useState('');
  const [activeFolderUrl, setActiveFolderUrl] = useState('');
  const [folderStack, setFolderStack] = useState<Array<{ id: string; name: string }>>([]);
  const [subfolders, setSubfolders] = useState<DriveFolderItem[]>([]);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [isDemoMode, setIsDemoMode] = useState(false);

  const [loadingFolder, setLoadingFolder] = useState(false);
  const [loadProgressCount, setLoadProgressCount] = useState(0);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [folderNeedsAuth, setFolderNeedsAuth] = useState(false);

  // Optional folder picker when signed in
  const [accessibleFolders, setAccessibleFolders] = useState<DriveFolderItem[]>([]);

  // Selection state (ordered picks 1..50 + notes)
  const [selections, setSelections] = useState<Record<string, SelectionEntry>>({});
  const [targetCount, setTargetCount] = useState<number>(50);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [sortMode, setSortMode] = useState<SortMode>('name-asc');
  const [searchQuery, setSearchQuery] = useState('');
  const [density, setDensity] = useState<GridDensity>('standard');

  // Modals & Toast
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 3400);
  }, []);

  useEffect(() => {
    const unsubscribe = initAuth(
      (authedUser, token) => {
        setUser(authedUser);
        setAccessToken(token);
      },
      (signedInUser) => {
        setUser(signedInUser);
        setAccessToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  // Load shared selection if ?share= is in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shareId = params.get('share');
    if (!shareId) return;

    setLoadingShared(true);
    setSharedLoadError(null);
    fetch(`/api/selections/${encodeURIComponent(shareId)}`)
      .then(async (res) => {
        const data = (await res.json()) as { selection?: SavedSelection; error?: string };
        if (!res.ok || !data.selection) {
          throw new Error(data.error || 'Link daftar foto tidak ditemukan.');
        }
        setSharedSelection(data.selection);
      })
      .catch((err) => {
        setSharedLoadError(err instanceof Error ? err.message : 'Gagal memuat daftar pilihan.');
      })
      .finally(() => {
        setLoadingShared(false);
      });
  }, []);

  // Load Drive folders if user chooses to sign in for private folders
  useEffect(() => {
    if (!accessToken) {
      setAccessibleFolders([]);
      return;
    }
    listAccessibleFolders(accessToken)
      .then(({ sharedFolders, myFolders }) => {
        setAccessibleFolders([...sharedFolders, ...myFolders].slice(0, 8));
      })
      .catch(() => {});
  }, [accessToken]);

  // Auto-save client selections in localStorage keyed by folderId
  useEffect(() => {
    if (!activeFolderId) return;
    try {
      localStorage.setItem(
        `pilihfoto_draft_${activeFolderId}`,
        JSON.stringify({ selections, targetCount })
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [activeFolderId, selections, targetCount]);

  const restoreDraftForFolder = useCallback((folderId: string) => {
    try {
      const raw = localStorage.getItem(`pilihfoto_draft_${folderId}`);
      if (!raw) {
        setSelections({});
        return;
      }
      const parsed = JSON.parse(raw) as {
        selections?: Record<string, SelectionEntry>;
        targetCount?: number;
      };
      setSelections(parsed.selections && typeof parsed.selections === 'object' ? parsed.selections : {});
      if (typeof parsed.targetCount === 'number') {
        setTargetCount(parsed.targetCount);
      }
    } catch {
      setSelections({});
    }
  }, []);

  const loadFolder = useCallback(
    async (
      folderId: string,
      options?: {
        pushToStack?: boolean;
        overrideName?: string;
        tokenOverride?: string;
        resourceKey?: string;
      }
    ) => {
      const token = options?.tokenOverride || accessToken;
      setLoadingFolder(true);
      setFolderError(null);
      setFolderNeedsAuth(false);
      setLoadProgressCount(0);
      setIsDemoMode(false);

      try {
        if (token) {
          const meta = options?.overrideName
            ? { id: folderId, name: options.overrideName }
            : await getFolderMetadata(token, folderId);
          const { photos: fetchedPhotos, subfolders: fetchedSubfolders } =
            await listFolderContents(token, folderId, (count) => setLoadProgressCount(count));

          setActiveFolderId(folderId);
          setActiveFolderName(meta.name);
          setActiveFolderUrl(`https://drive.google.com/drive/folders/${folderId}`);
          setPhotos(fetchedPhotos);
          setSubfolders(fetchedSubfolders);
          setFilterMode('all');
          setSearchQuery('');
          restoreDraftForFolder(folderId);

          if (options?.pushToStack) {
            setFolderStack((prev) => [...prev, { id: folderId, name: meta.name }]);
          } else {
            setFolderStack([{ id: folderId, name: meta.name }]);
          }
          return;
        }

        // Public Drive folder mode (NO LOGIN REQUIRED)
        const data = await fetchPublicDriveFolder(folderId, options?.resourceKey);
        setActiveFolderId(folderId);
        setActiveFolderName(options?.overrideName || data.folder.name);
        setActiveFolderUrl(`https://drive.google.com/drive/folders/${folderId}`);
        setPhotos(data.photos);
        setSubfolders(data.subfolders);
        setFilterMode('all');
        setSearchQuery('');
        restoreDraftForFolder(folderId);

        if (options?.pushToStack) {
          setFolderStack((prev) => [
            ...prev,
            { id: folderId, name: options?.overrideName || data.folder.name },
          ]);
        } else {
          setFolderStack([{ id: folderId, name: options?.overrideName || data.folder.name }]);
        }
      } catch (err) {
        const typedErr = err as Error & { requiresAuth?: boolean };
        setFolderError(typedErr.message || 'Gagal membuka folder Google Drive.');
        if (typedErr.requiresAuth) {
          setFolderNeedsAuth(true);
          setShowPrivateLogin(true);
        }
      } finally {
        setLoadingFolder(false);
      }
    },
    [accessToken, restoreDraftForFolder]
  );

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setFolderError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setAccessToken(result.accessToken);
        setShowPrivateLogin(false);
        const pendingId = extractDriveFolderId(driveInput);
        if (pendingId) {
          await loadFolder(pendingId, { tokenOverride: result.accessToken });
        }
      }
    } catch (err) {
      setFolderError(err instanceof Error ? err.message : 'Gagal login Google.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setAccessToken(null);
  };

  const handleDriveLinkSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const parsedId = extractDriveFolderId(driveInput);
    if (!parsedId) {
      setFolderError('Link folder Google Drive tidak valid.');
      return;
    }
    const resourceKey = extractDriveResourceKey(driveInput);
    await loadFolder(parsedId, { resourceKey });
  };

  const handleStartDemo = () => {
    const demoPhotos = buildDemoPhotos();
    setIsDemoMode(true);
    setActiveFolderId('demo_session');
    setActiveFolderName(DEMO_PROJECT_TITLE);
    setActiveFolderUrl(DEMO_FOLDER_URL);
    setFolderStack([{ id: 'demo_session', name: DEMO_PROJECT_TITLE }]);
    setSubfolders([]);
    setPhotos(demoPhotos);
    setTargetCount(50);
    setFilterMode('all');
    setSearchQuery('');
    setFolderError(null);
    restoreDraftForFolder('demo_session');
  };

  const handleToggleSelect = useCallback(
    (photo: PhotoItem) => {
      setSelections((prev) => {
        const existing = prev[photo.id];
        if (existing) {
          const next: Record<string, SelectionEntry> = {};
          Object.entries(prev)
            .filter(([id]) => id !== photo.id)
            .sort((a, b) => a[1].order - b[1].order)
            .forEach(([id, entry], idx) => {
              next[id] = { ...entry, order: idx + 1 };
            });
          return next;
        }

        const currentCount = Object.keys(prev).length;
        if (targetCount > 0 && currentCount >= targetCount) {
          showToast(`Kuota ${targetCount} foto sudah penuh.`);
          return prev;
        }

        return {
          ...prev,
          [photo.id]: {
            order: currentCount + 1,
            note: '',
          },
        };
      });
    },
    [targetCount, showToast]
  );

  const handleUpdateNote = useCallback(
    (photoId: string, note: string) => {
      setSelections((prev) => {
        const existing = prev[photoId];
        if (existing) {
          return { ...prev, [photoId]: { ...existing, note } };
        }
        const currentCount = Object.keys(prev).length;
        if (targetCount > 0 && currentCount >= targetCount) {
          showToast(`Kuota ${targetCount} foto sudah penuh.`);
          return prev;
        }
        return {
          ...prev,
          [photoId]: { order: currentCount + 1, note },
        };
      });
    },
    [targetCount, showToast]
  );

  const selectedCount = Object.keys(selections).length;

  const selectedPhotoList = useMemo(() => {
    return photos
      .filter((p) => Boolean(selections[p.id]))
      .map((p) => ({ photo: p, entry: selections[p.id] }))
      .sort((a, b) => a.entry.order - b.entry.order);
  }, [photos, selections]);

  const visiblePhotos = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = photos.filter((photo) => {
      const isSelected = Boolean(selections[photo.id]);
      if (filterMode === 'selected' && !isSelected) return false;
      if (filterMode === 'unselected' && isSelected) return false;
      if (q && !photo.name.toLowerCase().includes(q)) return false;
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sortMode === 'name-asc') return a.name.localeCompare(b.name, undefined, { numeric: true });
      if (sortMode === 'name-desc') return b.name.localeCompare(a.name, undefined, { numeric: true });
      if (sortMode === 'date-asc') return (a.createdTime || '').localeCompare(b.createdTime || '');
      const orderA = selections[a.id]?.order ?? 999999;
      const orderB = selections[b.id]?.order ?? 999999;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    });
  }, [photos, selections, filterMode, searchQuery, sortMode]);

  const gridColsClass =
    density === 'compact'
      ? 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5'
      : density === 'large'
        ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'
        : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5';

  const quotaPct =
    targetCount > 0 ? Math.min(100, Math.round((selectedCount / targetCount) * 100)) : 0;

  return (
    <div className="min-h-screen bg-[#050505] text-[#FAFAFA] flex flex-col">
      {/* Minimal 3-Zone Top Bar */}
      <header className="sticky top-0 z-30 bg-[#050505]/92 backdrop-blur-md border-b border-[#1A1A22]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => {
              setSharedSelection(null);
              setActiveFolderId(null);
              if (window.location.search.includes('share=')) {
                window.history.replaceState({}, '', '/');
              }
            }}
            className="font-display text-base font-bold tracking-tight text-[#FAFAFA] whitespace-nowrap shrink-0 cursor-pointer"
          >
            PilihFoto
          </button>

          <nav className="hidden sm:flex items-center gap-6 text-xs font-medium text-[#9494A0]">
            <button
              type="button"
              onClick={() => {
                setSharedSelection(null);
                setActiveFolderId(null);
                if (window.location.search.includes('share=')) {
                  window.history.replaceState({}, '', '/');
                }
              }}
              className="hover:text-[#FAFAFA] whitespace-nowrap shrink-0 cursor-pointer"
            >
              Ganti Folder
            </button>
            <button
              type="button"
              onClick={() => {
                setSharedSelection(null);
                handleStartDemo();
              }}
              className="hover:text-[#FAFAFA] whitespace-nowrap shrink-0 cursor-pointer"
            >
              Contoh Galeri
            </button>
            {accessToken && (
              <button
                type="button"
                onClick={handleLogout}
                className="hover:text-[#FAFAFA] whitespace-nowrap shrink-0 inline-flex items-center gap-1 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Keluar Google</span>
              </button>
            )}
          </nav>

          <div className="shrink-0">
            {sharedSelection ? (
              <button
                type="button"
                onClick={() => {
                  setSharedSelection(null);
                  window.history.replaceState({}, '', '/');
                }}
                className="px-3.5 py-1.5 rounded-lg bg-[#FAFAFA] text-[#050505] text-xs font-semibold hover:bg-[#E4E4EA] whitespace-nowrap cursor-pointer"
              >
                Seleksi Baru
              </button>
            ) : activeFolderId ? (
              <button
                type="button"
                onClick={() => setShowShareModal(true)}
                disabled={selectedCount === 0}
                className="px-3.5 py-1.5 rounded-lg bg-[#F2B705] text-[#050505] text-xs font-semibold hover:bg-[#eab004] disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>
                  Kirim WA ({selectedCount}/{targetCount > 0 ? targetCount : '∞'})
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStartDemo}
                className="px-3.5 py-1.5 rounded-lg border border-[#282832] bg-[#111116] text-xs font-medium text-[#FAFAFA] hover:bg-[#1B1B22] whitespace-nowrap cursor-pointer"
              >
                Coba Contoh
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        {loadingShared ? (
          <div className="max-w-md mx-auto px-6 py-28 text-center space-y-3">
            <Loader2 className="w-7 h-7 animate-spin text-[#F2B705] mx-auto" />
            <p className="text-xs text-[#9494A0]">Memuat daftar foto...</p>
          </div>
        ) : sharedLoadError ? (
          <div className="max-w-md mx-auto px-6 py-24 text-center space-y-4">
            <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
            <p className="text-sm text-[#D4D4DC]">{sharedLoadError}</p>
            <button
              type="button"
              onClick={() => {
                setSharedLoadError(null);
                window.history.replaceState({}, '', '/');
              }}
              className="px-4 py-2 rounded-lg bg-[#F2B705] text-[#050505] text-xs font-semibold cursor-pointer"
            >
              Kembali
            </button>
          </div>
        ) : sharedSelection ? (
          <PhotographerView
            selection={sharedSelection}
            accessToken={accessToken}
            isSigningIn={isLoggingIn}
            onSignIn={handleLogin}
            onBackToClientWorkspace={() => {
              setSharedSelection(null);
              window.history.replaceState({}, '', '/');
            }}
          />
        ) : !activeFolderId ? (
          /* Simple, Focused Input Screen — No Login Required for Public Drive Links */
          <div className="max-w-xl mx-auto px-4 sm:px-6 py-16 sm:py-24 space-y-6">
            <div className="space-y-2 text-center">
              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#FAFAFA]">
                Pilih Foto dari Google Drive
              </h1>
              <p className="text-sm text-[#8E8E9A]">
                Tempel link folder Google Drive publik (akses semua orang), tanpa perlu login.
              </p>
            </div>

            <div className="rounded-2xl bg-[#0D0D11] border border-[#22222A] p-5 space-y-4">
              <form onSubmit={handleDriveLinkSubmit} className="space-y-3">
                <div className="relative">
                  <Link2 className="w-4 h-4 text-[#6E6E7A] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={driveInput}
                    onChange={(e) => setDriveInput(e.target.value)}
                    placeholder="https://drive.google.com/drive/folders/..."
                    className="w-full rounded-lg bg-[#070709] border border-[#272732] pl-10 pr-3.5 py-3 text-sm text-[#FAFAFA] placeholder:text-[#5E5E6A] focus:outline-none focus:border-[#F2B705]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loadingFolder}
                  className="w-full py-3 px-4 rounded-lg bg-[#F2B705] text-[#050505] text-sm font-semibold hover:bg-[#eab004] transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
                >
                  {loadingFolder ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Membuka Folder {loadProgressCount > 0 ? `(${loadProgressCount})` : '...'}</span>
                    </>
                  ) : (
                    <>
                      <span>Buka Folder Foto</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              {folderError && (
                <div className="rounded-lg bg-red-950/40 border border-red-800/60 px-3.5 py-2.5 text-xs text-red-200 space-y-2">
                  <p>{folderError}</p>
                  {folderNeedsAuth && !accessToken && (
                    <GoogleSignInButton
                      label="Sign in with Google"
                      loading={isLoggingIn}
                      onClick={handleLogin}
                    />
                  )}
                </div>
              )}

              <div className="pt-2 border-t border-[#1A1A22] flex flex-wrap items-center justify-between gap-3 text-xs text-[#8E8E9A]">
                <button
                  type="button"
                  onClick={handleStartDemo}
                  className="hover:text-[#FAFAFA] underline underline-offset-4 cursor-pointer"
                >
                  Coba contoh galeri (16 foto)
                </button>

                {!accessToken ? (
                  <button
                    type="button"
                    onClick={() => setShowPrivateLogin((v) => !v)}
                    className="hover:text-[#FAFAFA] cursor-pointer"
                  >
                    Folder privat? Login Google
                  </button>
                ) : (
                  <span className="text-emerald-400 truncate max-w-[200px]">
                    {user?.email}
                  </span>
                )}
              </div>

              {showPrivateLogin && !accessToken && (
                <div className="pt-2 flex items-center justify-between gap-3">
                  <span className="text-xs text-[#9494A0]">Khusus folder tidak publik:</span>
                  <GoogleSignInButton
                    label="Sign in with Google"
                    loading={isLoggingIn}
                    onClick={handleLogin}
                  />
                </div>
              )}
            </div>

            {/* Optional quick folders if user logged in */}
            {accessToken && accessibleFolders.length > 0 && (
              <div className="rounded-xl bg-[#0B0B0E] border border-[#1E1E26] p-4 space-y-2.5">
                <div className="text-xs font-medium text-[#9494A0]">Folder Google Drive Anda</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {accessibleFolders.map((folder) => (
                    <button
                      key={folder.id}
                      type="button"
                      onClick={() => loadFolder(folder.id, { overrideName: folder.name })}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#121217] border border-[#22222C] hover:border-[#F2B705]/60 text-left text-xs text-[#FAFAFA] truncate cursor-pointer"
                    >
                      <Folder className="w-3.5 h-3.5 text-[#F2B705] shrink-0" />
                      <span className="truncate">{folder.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Active Client Proofing Contact Sheet */
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 space-y-5">
            {/* Compact Header + Quota */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#1A1A22]">
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#8E8E9A]">
                  <button
                    type="button"
                    onClick={() => setActiveFolderId(null)}
                    className="hover:text-white cursor-pointer"
                  >
                    Beranda
                  </button>
                  {folderStack.map((item, idx) => (
                    <span key={item.id} className="inline-flex items-center gap-1.5">
                      <ChevronRight className="w-3.5 h-3.5" />
                      <button
                        type="button"
                        onClick={() => {
                          if (isDemoMode || idx === folderStack.length - 1) return;
                          setFolderStack((prev) => prev.slice(0, idx + 1));
                          loadFolder(item.id, { overrideName: item.name, pushToStack: false });
                        }}
                        className={`truncate max-w-[180px] ${
                          idx === folderStack.length - 1 ? 'text-[#FAFAFA]' : 'hover:text-white cursor-pointer'
                        }`}
                      >
                        {item.name}
                      </button>
                    </span>
                  ))}
                </div>

                <div className="flex items-baseline gap-2.5">
                  <h1 className="font-display text-xl font-bold text-[#FAFAFA] truncate">
                    {activeFolderName}
                  </h1>
                  <span className="font-mono text-xs text-[#8E8E9A] shrink-0">
                    {photos.length} foto
                  </span>
                </div>
              </div>

              {/* Quota Counter & Target Picker */}
              <div className="flex flex-wrap items-center gap-3 bg-[#0D0D11] border border-[#22222A] rounded-xl px-3.5 py-2.5 shrink-0">
                <div className="min-w-[150px] space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#9494A0]">Terpilih</span>
                    <span className="font-mono font-semibold">
                      <span className="text-[#F2B705]">{selectedCount}</span> /{' '}
                      {targetCount > 0 ? targetCount : '∞'}
                    </span>
                  </div>
                  {targetCount > 0 && (
                    <div className="h-1 w-full bg-[#1C1C24] rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-200 ${
                          selectedCount >= targetCount ? 'bg-emerald-400' : 'bg-[#F2B705]'
                        }`}
                        style={{ width: `${quotaPct}%` }}
                      />
                    </div>
                  )}
                </div>

                <select
                  aria-label="Batas jumlah foto"
                  value={targetCount}
                  onChange={(e) => setTargetCount(Number(e.target.value))}
                  className="rounded-md bg-[#14141A] border border-[#282832] px-2 py-1 font-mono text-xs text-[#FAFAFA] focus:outline-none focus:border-[#F2B705]"
                >
                  <option value={20}>Maks 20</option>
                  <option value={30}>Maks 30</option>
                  <option value={50}>Maks 50</option>
                  <option value={75}>Maks 75</option>
                  <option value={100}>Maks 100</option>
                  <option value={0}>Bebas</option>
                </select>

                {selectedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelections({});
                      showToast('Pilihan dikosongkan.');
                    }}
                    title="Reset pilihan"
                    className="p-1.5 rounded-md text-[#8E8E9A] hover:text-white hover:bg-[#1A1A22] cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Subfolders */}
            {subfolders.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {subfolders.map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() =>
                      loadFolder(sub.id, { overrideName: sub.name, pushToStack: true })
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0E0E12] border border-[#24242E] hover:border-[#F2B705]/60 text-xs text-[#E4E4EA] cursor-pointer"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-[#F2B705]" />
                    <span>{sub.name}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Filter, Search & Sort */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-[#0E0E12] border border-[#22222A] self-start">
                <button
                  type="button"
                  onClick={() => setFilterMode('all')}
                  className={`px-3 py-1 rounded-md text-xs font-medium cursor-pointer ${
                    filterMode === 'all' ? 'bg-[#22222C] text-[#FAFAFA]' : 'text-[#8E8E9A] hover:text-white'
                  }`}
                >
                  Semua ({photos.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('selected')}
                  className={`px-3 py-1 rounded-md text-xs font-medium cursor-pointer ${
                    filterMode === 'selected'
                      ? 'bg-[#F2B705] text-[#050505] font-semibold'
                      : 'text-[#8E8E9A] hover:text-white'
                  }`}
                >
                  Terpilih ({selectedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('unselected')}
                  className={`px-3 py-1 rounded-md text-xs font-medium cursor-pointer ${
                    filterMode === 'unselected'
                      ? 'bg-[#22222C] text-[#FAFAFA]'
                      : 'text-[#8E8E9A] hover:text-white'
                  }`}
                >
                  Belum ({Math.max(0, photos.length - selectedCount)})
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 sm:w-52">
                  <Search className="w-3.5 h-3.5 text-[#6E6E7A] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari nama file..."
                    className="w-full rounded-lg bg-[#0E0E12] border border-[#22222A] pl-8 pr-3 py-1.5 text-xs text-[#FAFAFA] placeholder:text-[#636370] focus:outline-none focus:border-[#F2B705]"
                  />
                </div>

                <div className="inline-flex items-center gap-1.5 rounded-lg bg-[#0E0E12] border border-[#22222A] px-2.5 py-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-[#8E8E9A]" />
                  <select
                    aria-label="Urutkan"
                    value={sortMode}
                    onChange={(e) => setSortMode(e.target.value as SortMode)}
                    className="bg-transparent text-xs text-[#E4E4EA] focus:outline-none cursor-pointer"
                  >
                    <option value="name-asc" className="bg-[#0E0E12]">Nama A–Z</option>
                    <option value="name-desc" className="bg-[#0E0E12]">Nama Z–A</option>
                    <option value="selected-order" className="bg-[#0E0E12]">Urutan #1–#50</option>
                  </select>
                </div>

                <div className="hidden sm:inline-flex items-center gap-0.5 p-1 rounded-lg bg-[#0E0E12] border border-[#22222A]">
                  <button
                    type="button"
                    onClick={() => setDensity('large')}
                    aria-label="Besar"
                    className={`p-1 rounded cursor-pointer ${density === 'large' ? 'bg-[#22222C] text-white' : 'text-[#7E7E8A]'}`}
                  >
                    <Grid2X2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDensity('standard')}
                    aria-label="Standar"
                    className={`p-1 rounded cursor-pointer ${density === 'standard' ? 'bg-[#22222C] text-white' : 'text-[#7E7E8A]'}`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDensity('compact')}
                    aria-label="Padat"
                    className={`p-1 rounded cursor-pointer ${density === 'compact' ? 'bg-[#22222C] text-white' : 'text-[#7E7E8A]'}`}
                  >
                    <Grid3X3 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {loadingFolder ? (
              <div className="py-24 text-center space-y-2.5">
                <Loader2 className="w-7 h-7 animate-spin text-[#F2B705] mx-auto" />
                <p className="text-xs text-[#9494A0]">
                  Memuat foto... {loadProgressCount > 0 ? loadProgressCount : ''}
                </p>
              </div>
            ) : visiblePhotos.length === 0 ? (
              <div className="rounded-xl bg-[#0D0D11] border border-[#22222A] py-14 px-6 text-center text-xs text-[#9494A0]">
                {photos.length === 0
                  ? 'Tidak ada foto di folder ini.'
                  : 'Tidak ada foto sesuai filter.'}
              </div>
            ) : (
              <div className={`grid ${gridColsClass}`}>
                {visiblePhotos.map((photo, idx) => {
                  const selection = selections[photo.id];
                  const isSelected = Boolean(selection);
                  return (
                    <article
                      key={photo.id}
                      className={`group rounded-xl overflow-hidden bg-[#0D0D11] border transition-colors flex flex-col ${
                        isSelected
                          ? 'border-[#F2B705] ring-1 ring-[#F2B705]/40'
                          : 'border-[#202028] hover:border-[#3A3A48]'
                      }`}
                    >
                      <div
                        onClick={() => setLightboxIndex(idx)}
                        className="relative aspect-[4/3] bg-[#08080B] overflow-hidden cursor-pointer"
                      >
                        <DrivePhoto
                          fileId={photo.id}
                          name={photo.name}
                          thumbnailLink={photo.thumbnailLink}
                          demoSrc={photo.demoSrc}
                          accessToken={accessToken}
                          thumbSize={density === 'large' ? 900 : 600}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                        />

                        {isSelected && selection ? (
                          <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-[#F2B705] font-mono text-[11px] font-bold text-[#050505]">
                            {formatOrderBadge(selection.order)}
                          </span>
                        ) : (
                          <span className="absolute top-2 left-2 p-1.5 rounded-md bg-[#050505]/70 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                            <ZoomIn className="w-3.5 h-3.5" />
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleSelect(photo);
                          }}
                          aria-label={isSelected ? `Batal ${photo.name}` : `Pilih ${photo.name}`}
                          className={`absolute top-2 right-2 w-7 h-7 rounded-md flex items-center justify-center transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-[#F2B705] text-[#050505]'
                              : 'bg-[#050505]/75 border border-white/20 text-white hover:bg-[#FAFAFA] hover:text-[#050505]'
                          }`}
                        >
                          <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                        </button>
                      </div>

                      <div className="px-2.5 py-2 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-mono text-xs text-[#EAEAF0] truncate">
                            {photo.name}
                          </div>
                          {(photo.size || selection?.note) && (
                            <div className="flex items-center gap-1.5 text-[11px] text-[#7E7E8A] font-mono">
                              {photo.size && <span>{formatFileSize(photo.size)}</span>}
                              {selection?.note && (
                                <span className="inline-flex items-center gap-0.5 text-[#F2B705] font-sans">
                                  <MessageSquare className="w-3 h-3" />
                                  <span>Note</span>
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleToggleSelect(photo)}
                          className={`px-2 py-1 rounded text-[11px] font-medium shrink-0 cursor-pointer ${
                            isSelected
                              ? 'bg-[#F2B705]/15 text-[#F2B705]'
                              : 'bg-[#17171E] text-[#D4D4DC] hover:bg-[#23232E]'
                          }`}
                        >
                          {isSelected ? 'Dipilih' : 'Pilih'}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {lightboxIndex !== null && (
        <LightboxModal
          photos={visiblePhotos}
          currentIndex={lightboxIndex}
          selections={selections}
          targetCount={targetCount}
          accessToken={accessToken}
          onClose={() => setLightboxIndex(null)}
          onChangeIndex={(next) => setLightboxIndex(next)}
          onToggleSelect={handleToggleSelect}
          onUpdateNote={handleUpdateNote}
        />
      )}

      {showShareModal && (
        <ShareModal
          selectedPhotos={selectedPhotoList}
          defaultProjectTitle={activeFolderName}
          defaultClientName={user?.displayName || 'Klien'}
          driveFolderId={activeFolderId || ''}
          driveFolderUrl={activeFolderUrl}
          targetCount={targetCount}
          isDemo={isDemoMode}
          accessToken={accessToken}
          onClose={() => setShowShareModal(false)}
          onPreviewPhotographer={(record) => {
            setShowShareModal(false);
            setSharedSelection(record);
            window.history.replaceState({}, '', `/?share=${encodeURIComponent(record.id)}`);
          }}
        />
      )}

      {toastMessage && (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-[#16161D] border border-[#F2B705]/50 text-xs text-[#FAFAFA] shadow-xl"
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}
