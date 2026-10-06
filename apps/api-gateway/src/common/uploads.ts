import { existsSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { loadConfig } from '@app/common';

/**
 * Absolute path of the shared uploads directory, used by BOTH the static
 * `/uploads` serving and the multer destination.
 *
 * `UPLOAD_DIR` is written relative to the repo root (see `.env`) and the seeded
 * attendance row points at `/uploads/placeholder.png`, so this must not depend
 * on the process cwd. The root is found by walking up to the workspace manifest,
 * which stays correct whether this file runs from `src/common/` (ts-node) or
 * `dist/src/common/` (compiled) �?" a fixed `../../..` is not.
 */
export const uploadRoot = resolveUploadRoot();

function resolveUploadRoot(): string {
  const { uploadDir } = loadConfig();
  return isAbsolute(uploadDir) ? uploadDir : resolve(repoRoot(), uploadDir);
}

function repoRoot(): string {
  let dir = __dirname;
  while (!existsSync(resolve(dir, 'pnpm-workspace.yaml'))) {
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`Could not find repo root (pnpm-workspace.yaml) above ${__dirname}`);
    }
    dir = parent;
  }
  return dir;
}
