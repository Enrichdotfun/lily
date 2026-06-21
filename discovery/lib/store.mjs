// Tiny snapshot store. Each daemon owns one JSON file under data/ and rewrites
// it atomically (write tmp -> rename) so the API server never reads a torn file.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data');

export function dataPath(name) {
  return path.join(DATA_DIR, name);
}

export function writeSnapshot(name, obj) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const file = dataPath(name);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, file);
}

export function readSnapshot(name) {
  try {
    return JSON.parse(fs.readFileSync(dataPath(name), 'utf8'));
  } catch {
    return null;
  }
}
