import { Router } from 'express';
import multer from 'multer';
import { promises as fs } from 'fs';
import path from 'path';
import mammoth from 'mammoth';
import { wrapRouter } from '../middleware/async-wrap.js';

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx', '.txt', '.md'];
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
  },
});

const router = wrapRouter(Router());

router.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se subió archivo' });
  const ext = path.extname(req.file.originalname).toLowerCase();
  let text = '';
  try {
    if (ext === '.txt' || ext === '.md') {
      text = await fs.readFile(req.file.path, 'utf8');
    } else if (ext === '.docx') {
      const buf = await fs.readFile(req.file.path);
      text = (await mammoth.extractRawText({ buffer: buf })).value;
    } else if (ext === '.pdf') {
      const { default: pdfParse } = await import('pdf-parse');
      const buf = await fs.readFile(req.file.path);
      text = (await pdfParse(buf)).text;
    } else {
      text = `[Archivo ${req.file.originalname} subido (${ext})]`;
    }
    await fs.unlink(req.file.path).catch(() => {});
    res.json({ text, filename: req.file.originalname });
  } catch (err) {
    await fs.unlink(req.file.path).catch(() => {});
    res.status(500).json({ error: err.message });
  }
});

export default router;
