// Playwright 用: ローカルにサーバーを立てず、ブラウザの要求を横取りして dist/ のファイルを返す（https://ns.test/）
const { readFileSync, existsSync, statSync } = require('node:fs');
const { join, extname } = require('node:path');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wav': 'audio/wav' };
async function serveDist(context, root, origin = 'https://ns.test') {
  await context.route(origin + '/**', (route) => {
    const u = new URL(route.request().url());
    let p = join(root, decodeURIComponent(u.pathname));
    if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
    if (!existsSync(p)) return route.fulfill({ status: 404, body: 'not found' });
    route.fulfill({ status: 200, body: readFileSync(p), headers: { 'content-type': MIME[extname(p)] || 'application/octet-stream' } });
  });
  return origin;
}
module.exports = { serveDist };
