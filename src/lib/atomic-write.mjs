/**
 * Shared atomic file replacement with backup-aware restore on Windows.
 */
import fs from 'fs';
import path from 'path';

export function restoreFile(backupPath, filePath, existedBefore) {
  if (backupPath && fs.existsSync(backupPath)) {
    fs.copyFileSync(backupPath, filePath);
    return;
  }
  if (!existedBefore && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

/**
 * Replace target with tempPath atomically when possible.
 * On Windows EPERM/EEXIST: unlink target then rename; restore backup if rename fails.
 */
export function replaceAtomically(tempPath, targetPath, backupPath = null) {
  try {
    fs.renameSync(tempPath, targetPath);
    return;
  } catch (error) {
    if (!['EEXIST', 'EPERM', 'EACCES'].includes(error.code) || !fs.existsSync(targetPath)) {
      throw error;
    }
  }

  fs.unlinkSync(targetPath);
  try {
    fs.renameSync(tempPath, targetPath);
  } catch (replaceError) {
    if (backupPath && fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, targetPath);
    }
    throw replaceError;
  }
}

/**
 * Write content to `${targetPath}.tmp` then replace atomically.
 */
export function writeFileAtomically(targetPath, content, backupPath = null) {
  const tempPath = `${targetPath}.tmp`;
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(tempPath, content, 'utf8');
  try {
    replaceAtomically(tempPath, targetPath, backupPath);
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
}

/**
 * Write two temp files, then replace both atomically. Restore both on failure.
 */
export function writeTwoFilesAtomically({
  firstTarget,
  firstContent,
  firstBackup,
  firstExisted,
  secondTarget,
  secondContent,
  secondBackup,
  secondExisted,
}) {
  const firstTemp = `${firstTarget}.tmp`;
  const secondTemp = `${secondTarget}.tmp`;
  fs.mkdirSync(path.dirname(firstTarget), { recursive: true });
  fs.mkdirSync(path.dirname(secondTarget), { recursive: true });
  fs.writeFileSync(firstTemp, firstContent, 'utf8');
  fs.writeFileSync(secondTemp, secondContent, 'utf8');

  try {
    replaceAtomically(firstTemp, firstTarget, firstBackup);
    try {
      replaceAtomically(secondTemp, secondTarget, secondBackup);
    } catch (secondError) {
      restoreFile(firstBackup, firstTarget, firstExisted);
      throw secondError;
    }
  } catch (error) {
    restoreFile(firstBackup, firstTarget, firstExisted);
    restoreFile(secondBackup, secondTarget, secondExisted);
    throw error;
  } finally {
    if (fs.existsSync(firstTemp)) fs.unlinkSync(firstTemp);
    if (fs.existsSync(secondTemp)) fs.unlinkSync(secondTemp);
  }
}
