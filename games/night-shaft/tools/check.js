// 構文チェックと、モジュールの import 先が実在するかの確認（ブラウザで 404 になるのを公開前に防ぐ）
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const here = join(dirname(fileURLToPath(import.meta.url)), '..');
let bad = 0, n = 0;
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (['node_modules', 'dist', 'audio-master', '.git'].includes(f)) continue;
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!p.endsWith('.js')) continue;
    n++;
    try { execFileSync(process.execPath, ['--check', p], { stdio: 'pipe' }); } catch (e) { bad++; console.error('構文エラー', p, String(e.stderr)); }
    const src = readFileSync(p, 'utf8');
    for (const m of src.matchAll(/(?:import|export)[^'"]*?from\s*['"](\.[^'"]+)['"]/g)) {
      const t = resolve(dirname(p), m[1]);
      if (!existsSync(t)) { bad++; console.error('import 先が無い', p, '→', m[1]); }
    }
  }
})(here);
console.log(`[check] ${n} files, ${bad ? bad + ' problems' : 'OK'}`);
process.exit(bad ? 1 : 0);
