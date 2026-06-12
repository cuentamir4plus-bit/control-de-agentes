import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..');

export const PORT = process.env.PORT || 3000;
export const DIRS = ['agents', 'chats', 'outputs', 'config/skills', 'uploads'];
