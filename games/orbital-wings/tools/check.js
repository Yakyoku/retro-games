// 公開前の点検: dist に必要なファイルがあるか、トップページに制作注記があるか、内部資料が混ざっていないか
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = process.argv[2] || join(here, 'dist');
let bad = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'NG   ') + m); if (!c) bad++; };
for (const f of ['index.html', '2d/index.html', '2d/main.js', '2d/render2d.js', '3d/index.html', 'shared/app.js', 'shared/audio/worklet.js', 'shared/audio/chip.js', 'vendor/three/three.module.js', 'vendor/three/three.core.js', 'build-info.json', '_headers'])
  ok(existsSync(join(dist, f)), 'dist/' + f);
const top = existsSync(join(dist, 'index.html')) ? readFileSync(join(dist, 'index.html'), 'utf8') : '';
ok(top.includes('このゲームは、Claude Codeのクラウドセッションで制作しました。'), 'トップページの制作注記');
ok(top.includes('初代グラディウスに着想を得た非公式作品です。コナミの公式作品ではありません。'), 'トップページの非公式注記');
const files = []; (function w(d) { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? w(p) : files.push(p.slice(dist.length + 1)); } })(dist);
ok(!files.some((f) => /\.(md|wav|ogg|test\.js|mjs)$/.test(f) || f.startsWith('tests/') || f.startsWith('tools/') || f.startsWith('docs/')), '内部資料・音源マスター・テストを含まない');
// 相対 import の参照切れ
for (const f of files.filter((f) => f.endsWith('.js') && !f.startsWith('vendor/'))) {
  const src = readFileSync(join(dist, f), 'utf8');
  for (const m of src.matchAll(/(?:import|from)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
    const target = join(dirname(join(dist, f)), m[1]);
    if (!existsSync(target)) ok(false, `${f} → ${m[1]} が無い`);
  }
}
const info = JSON.parse(readFileSync(join(dist, 'build-info.json'), 'utf8'));
console.log(`build ${info.build} (${files.length} files)`);
process.exit(bad ? 1 : 0);
