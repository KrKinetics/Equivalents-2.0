import fs from 'fs';
import path from 'path';

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function timestampStamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

/**
 * Copy a file into backups/ with timestamp prefix.
 * @returns {string} backup path
 */
export function backupFile(filePath, backupsDir, label = 'backup') {
  ensureDir(backupsDir);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Cannot backup missing file: ${filePath}`);
  }
  const base = path.basename(filePath);
  const dest = path.join(backupsDir, `${timestampStamp()}_${label}_${base}`);
  fs.copyFileSync(filePath, dest);
  return dest;
}
