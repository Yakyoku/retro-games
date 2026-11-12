// ボットの場面スナップショットにスプライトを重ね、3 倍の画面写真を作る（Playwright の Chromium で file:// を開く。サーバは立てない）
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const simDir = join(here, 'preview', 'sim');
const spriteDir = join(here, '..', 'unity', 'SkywardRuins', 'Assets', 'SkywardRuins', 'Art', 'Sprites');
const sprites = JSON.parse(readFileSync(join(spriteDir, '..', 'sprites.json'), 'utf8'));
const snaps = JSON.parse(readFileSync(join(simDir, 'snapshots.json'), 'utf8'));
const html = `<!doctype html><body style="margin:0;background:#000"><canvas id=c width=224 height=288 style="width:672px;height:864px;image-rendering:pixelated"></canvas>
<script>
const S=${JSON.stringify(sprites)}, base=${JSON.stringify(pathToFileURL(spriteDir).href)}, simBase=${JSON.stringify(pathToFileURL(simDir).href)};
const imgs={}; function load(src){return new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src=src;});}
async function prep(){ for(const [n,s] of Object.entries(S)) for(let f=0;f<s.frames;f++) imgs[n+'_'+f]=await load(base+'/'+n+'_'+f+'.png'); }
function spr(ctx,n,f,x,y,rot){ const s=S[n]; const im=imgs[n+'_'+(f%s.frames)]; ctx.save(); ctx.translate(Math.round(x),Math.round(288-y)); if(rot) ctx.rotate(rot); ctx.drawImage(im,-Math.floor(s.w/2),-Math.floor(s.h/2)); ctx.restore(); }
window.draw=async function(sn){ const c=document.getElementById('c'),ctx=c.getContext('2d'); ctx.imageSmoothingEnabled=false;
 const t=await load(simBase+'/'+sn.terrain); ctx.drawImage(t,0,-(8-sn.scrollFrac));
 // 影（空中物は地表に影を落とす）
 ctx.fillStyle='rgba(0,0,0,0.28)'; for(const a of sn.air){ ctx.beginPath(); ctx.ellipse(a[1]+6,288-a[2]+10,5,3,0,0,7); ctx.fill(); }
 for(const f of sn.forts) if(!f[2]) spr(ctx,'fortress',0,f[0],f[1]);
 for(const g of sn.ground){ const n={turret:'turret',tank:'tank',bunker:'bunker',radar:'radar',obelisk:'obelisk',banner:'banner',fortturret:'fortturret',fortcore:'core'}[g[0]]; if(!n) continue; if(g[3]){ if(g[0]!=='fortcore'&&g[0]!=='fortturret') spr(ctx,'crater',0,g[1],g[2]); continue;} const fr = n==='core'?(g[4]?3:0):n==='obelisk'?5:0; const rot = (n==='turret'||n==='fortturret')? Math.atan2(sn.player[0]-g[1], g[2]-sn.player[1])+Math.PI:0; spr(ctx,n,fr,g[1],g[2],n==='turret'||n==='fortturret'?Math.atan2(-(sn.player[0]-g[1]),(sn.player[1]-g[2]))+Math.PI:0); }
 for(const b of sn.bombs) spr(ctx,'bomb',0,b[0],b[1]);
 spr(ctx,'sight',sn.hint?2:(sn.lock?1:0),sn.sight[0],sn.sight[1]);
 for(const a of sn.air) spr(ctx,a[0],Math.floor(a[3]*8),a[1],a[2]);
 for(const s of sn.shots) spr(ctx,'shot',0,s[0],s[1]);
 spr(ctx,'player',0,sn.player[0],sn.player[1]);
 for(const b of sn.bullets) spr(ctx,'bullet',0,b[0],b[1]);
 ctx.fillStyle='#fff'; ctx.font='8px monospace'; ctx.fillText('SCORE '+sn.score,4,10); ctx.fillText('AREA '+sn.area,170,10); ctx.fillText('x'+sn.lives,4,284);
}
</script>`;
writeFileSync(join(simDir, 'compose.html'), html);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 672, height: 864 } });
await page.goto(pathToFileURL(join(simDir, 'compose.html')).href);
await page.evaluate(() => prep());
for (const sn of snaps) { await page.evaluate(s => draw(s), sn); await page.screenshot({ path: join(simDir, `frame-${sn.tag}.png`) }); console.log('frame', sn.tag, 'air', sn.air.length, 'ground', sn.ground.length, 'bullets', sn.bullets.length); }
await browser.close();
