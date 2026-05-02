export type AvatarCategory = { name: string; files: string[] };
export type AvatarData = { categories: AvatarCategory[]; allFiles: string[] };

const DEFAULT_AVATAR_DATA: AvatarData = {
  categories: [
    { name: 'Origin', files: ['Origin/avatar_0.webp', 'Origin/avatar_1.webp', 'Origin/avatar_2.webp', 'Origin/avatar_3.webp'] },
    { name: 'Vocaloid', files: ['Vocaloid/HatsuneMiku.webp'] },
    { name: 'Custom', files: ['Custom/DT.png'] },
  ],
  allFiles: ['Origin/avatar_0.webp', 'Origin/avatar_1.webp', 'Origin/avatar_2.webp', 'Origin/avatar_3.webp', 'Vocaloid/HatsuneMiku.webp', 'Custom/DT.png'],
};

function cloneAvatarData(data: AvatarData): AvatarData {
  return {
    categories: data.categories.map((category) => ({ name: category.name, files: [...category.files] })),
    allFiles: [...data.allFiles],
  };
}

export const SHARED_AVATAR_DATA: AvatarData = cloneAvatarData(DEFAULT_AVATAR_DATA);

// Flat list for backward compatibility (indexing)
export const SHARED_AVATAR_FILES = SHARED_AVATAR_DATA.allFiles;

function buildAvatarCategories(files: string[]): AvatarCategory[] {
  const categories = new Map<string, string[]>();
  for (const file of files) {
    const category = file.split('/')[0] || 'Characters';
    if (!categories.has(category)) categories.set(category, []);
    categories.get(category)?.push(file);
  }
  return [...categories.entries()].map(([name, categoryFiles]) => ({ name, files: categoryFiles }));
}

function normalizeAvatarData(data: unknown): AvatarData | null {
  const record = !Array.isArray(data) && data && typeof data === 'object'
    ? data as Partial<AvatarData>
    : null;
  const allFiles = Array.isArray(data)
    ? data
    : (Array.isArray(record?.allFiles) ? record.allFiles : []);
  const files = allFiles.filter((file): file is string => typeof file === 'string' && file.length > 0);
  if (files.length === 0) return null;

  const rawCategories = record && Array.isArray(record.categories)
    ? record.categories
    : [];
  const categories = rawCategories
    .map((category) => ({
      name: typeof category?.name === 'string' ? category.name : '',
      files: Array.isArray(category?.files)
        ? category.files.filter((file): file is string => typeof file === 'string' && files.includes(file))
        : [],
    }))
    .filter((category) => category.name && category.files.length > 0);

  return {
    categories: categories.length > 0 ? categories : buildAvatarCategories(files),
    allFiles: files,
  };
}

export function setSharedAvatarData(data: unknown): AvatarData {
  const normalized = normalizeAvatarData(data) || DEFAULT_AVATAR_DATA;
  SHARED_AVATAR_DATA.categories.splice(
    0,
    SHARED_AVATAR_DATA.categories.length,
    ...normalized.categories.map((category) => ({ name: category.name, files: [...category.files] })),
  );
  SHARED_AVATAR_FILES.splice(0, SHARED_AVATAR_FILES.length, ...normalized.allFiles);
  return SHARED_AVATAR_DATA;
}

function mergeAvatarData(baseData: AvatarData, liveData: AvatarData): AvatarData {
  const liveFiles = new Set(liveData.allFiles);
  const kept = baseData.allFiles.filter((file) => liveFiles.has(file));
  const keptFiles = new Set(kept);
  const added = liveData.allFiles.filter((file) => !keptFiles.has(file));
  const allFiles = [...kept, ...added];
  return {
    categories: buildAvatarCategories(allFiles),
    allFiles,
  };
}

export async function refreshSharedAvatarData(): Promise<AvatarData> {
  let catalog = DEFAULT_AVATAR_DATA;
  try {
    const response = await fetch(toHttpAssetPath('shared/avatars.json'), { cache: 'no-store' });
    if (response.ok) {
      catalog = normalizeAvatarData(await response.json()) || catalog;
    }
  } catch {
    // Fall back to the bundled default list.
  }

  try {
    const response = await fetch('/api/avatars', { cache: 'no-store' });
    if (response.ok) {
      const liveCatalog = normalizeAvatarData(await response.json());
      if (liveCatalog) catalog = mergeAvatarData(catalog, liveCatalog);
    }
  } catch {
    // The static dashboard can still render from avatars.json.
  }

  return setSharedAvatarData(catalog);
}
import { toHttpAssetPath } from '../../shared/assetPaths';
