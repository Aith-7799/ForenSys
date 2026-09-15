import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { env } from '../lib/env.js';
import { badRequest } from '../lib/errors.js';

/** Absolute path to the upload directory, created on first use. */
export const uploadRoot = path.resolve(process.cwd(), env.uploadDir);
fs.mkdirSync(uploadRoot, { recursive: true });

const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.txt', '.rtf',
  '.csv', '.json', '.xml',
  '.jpg', '.jpeg', '.png', '.tif', '.tiff',
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (_req, file, cb) => {
    // Never trust the client filename: keep only a sanitised extension and use a
    // random name so a crafted filename cannot escape the upload directory.
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

export const uploadReport = multer({
  storage,
  limits: { fileSize: env.maxUploadMb * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      cb(badRequest(
        `Unsupported file type "${ext || '(none)'}". Allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}.`,
      ));
      return;
    }
    cb(null, true);
  },
});
