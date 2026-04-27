import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { resolveFromModule } from '../../runtime/module';

// Scan assets/characters/ subfolders and update avatars.json.
// Preserves the existing file order so assigned avatarIndex values remain valid.
export function syncAvatarFiles({ debugLog }) {
  const moduleUrl = pathToFileURL(module.filename);
  const charDir = resolveFromModule(moduleUrl, '..', '..', '..', 'assets', 'characters');
  const jsonPath = resolveFromModule(moduleUrl, '..', '..', '..', 'assets', 'shared', 'avatars.json');
  const imgRegex = /\.(webp|png|jpg|jpeg|gif)$/i;

  try {
    let existingAllFiles: string[] = [];
    try {
      const existing = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      existingAllFiles = Array.isArray(existing) ? existing : existing.allFiles || [];
    } catch (_) {
      /* file missing or invalid - start fresh */
    }

    const entries = fs.readdirSync(charDir, { withFileTypes: true });
    const diskFiles: string[] = [];
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory()) continue;
      const folderFiles = fs
        .readdirSync(path.join(charDir, entry.name))
        .filter((fileName) => imgRegex.test(fileName))
        .sort();
      diskFiles.push(...folderFiles.map((fileName) => `${entry.name}/${fileName}`));
    }

    if (diskFiles.length === 0) return;

    const diskSet = new Set(diskFiles);
    const kept = existingAllFiles.filter((fileName) => diskSet.has(fileName));
    const keptSet = new Set(kept);
    const added = diskFiles.filter((fileName) => !keptSet.has(fileName));
    const allFiles = [...kept, ...added];

    const categoryMap = new Map<string, string[]>();
    for (const fileName of allFiles) {
      const folder = fileName.split('/')[0];
      if (!categoryMap.has(folder)) categoryMap.set(folder, []);
      categoryMap.get(folder)!.push(fileName);
    }
    const categories = Array.from(categoryMap.entries()).map(([name, files]) => ({ name, files }));

    fs.writeFileSync(jsonPath, JSON.stringify({ categories, allFiles }, null, 2) + '\n');
    debugLog(
      `[Main] avatars.json synced: ${allFiles.length} files (${added.length} new) in ${categories.length} categories`
    );
  } catch (error) {
    console.error('[Main] Failed to sync avatars.json:', error.message);
  }
}
