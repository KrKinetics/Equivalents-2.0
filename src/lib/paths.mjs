/**
 * Project path resolution with env overrides for test isolation.
 */
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..', '..');

export function resolvePaths(overrides = {}) {
  const root = overrides.root || process.env.PROJECT_ROOT || ROOT;
  return {
    root,
    foodDataPath:
      overrides.foodDataPath ||
      process.env.FOOD_DATA_PATH ||
      path.join(root, 'src', 'data', 'food-equivalents.json'),
    versionDataPath:
      overrides.versionDataPath ||
      process.env.VERSION_DATA_PATH ||
      path.join(root, 'src', 'data', 'nutrition-data-version.json'),
    groupsPath:
      overrides.groupsPath ||
      process.env.GROUPS_DATA_PATH ||
      path.join(root, 'src', 'data', 'calculation-groups.json'),
    schemaPath:
      overrides.schemaPath ||
      process.env.SCHEMA_PATH ||
      path.join(root, 'src', 'data', 'food-equivalents.schema.json'),
    reportsDir:
      overrides.reportsDir || process.env.REPORTS_DIR || path.join(root, 'reports'),
    backupsDir:
      overrides.backupsDir || process.env.BACKUPS_DIR || path.join(root, 'backups'),
    reviewDataPath:
      overrides.reviewDataPath ||
      process.env.REVIEW_DATA_PATH ||
      path.join(root, 'tools', 'food-data-review-data.js'),
  };
}
