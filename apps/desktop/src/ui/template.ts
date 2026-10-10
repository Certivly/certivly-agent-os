import * as path from 'path';
import * as fs from 'fs';

const htmlPath = path.join(__dirname, 'index.html');
export const DESKTOP_HTML = fs.readFileSync(htmlPath, 'utf-8');
