import rcedit from 'rcedit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const exe = process.argv[2] || path.join(root, 'desktop/src-tauri/target/release/kilrun-engine.exe');
const ico = path.join(root, 'desktop/src-tauri/icons/icon.ico');
await rcedit(exe, {
  icon: ico,
  'version-string': {
    CompanyName: 'Kilrun',
    FileDescription: 'Kilrun Engine',
    ProductName: 'Kilrun Engine',
    LegalCopyright: 'Kilrun',
    OriginalFilename: 'kilrun-engine.exe',
  },
  'file-version': '0.1.3',
  'product-version': '0.1.3',
});
console.log('Stamped icon onto', exe);
