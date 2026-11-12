// models.json を three.js で描いて確認写真を撮る（Playwright の Chromium で file:// を開く。サーバは立てない）
// 1) 全モデルの一覧  2) ボットの場面を斜め見下ろしの 3D で再構成（Unity の Game3D と同じ構図・縮尺の目安）
import { createRequire } from 'node:module';
import { writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const here = dirname(fileURLToPath(import.meta.url));
const three = pathToFileURL(join(here, '..', '..', '..', 'node_modules', 'three', 'build', 'three.module.js')).href;
const models = readFileSync(join(here, '..', 'unity', 'SkywardRuins', 'Assets', 'SkywardRuins', 'Data', 'models.json'), 'utf8');
const simDir = join(here, 'preview', 'sim');
const snaps = readFileSync(join(simDir, 'snapshots.json'), 'utf8');
const html = `<!doctype html><body style="margin:0"><script type="importmap">{"imports":{"three":"${three}"}}</script>
<script type="module">
import * as THREE from 'three';
const M=${models}, SN=${snaps}, simBase=${JSON.stringify(pathToFileURL(simDir).href)};
const r=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true}); r.setSize(1200,800); document.body.appendChild(r.domElement);
function mesh(name){ const d=M[name]; const pos=[],col=[]; d.tris.forEach((t,i)=>{ const c=new THREE.Color(d.cols[i]); for(let k=0;k<3;k++){ pos.push(t[k*3],t[k*3+1],-t[k*3+2]); col.push(c.r,c.g,c.b);} });
 const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('color',new THREE.Float32BufferAttribute(col,3)); g.computeVertexNormals();
 return new THREE.Mesh(g,new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide,flatShading:true})); }
function lights(s){ s.add(new THREE.HemisphereLight(0xdde8ff,0x445533,1.1)); const d=new THREE.DirectionalLight(0xffffff,2.0); d.position.set(-40,80,40); s.add(d); }
window.gallery=()=>{ const s=new THREE.Scene(); s.background=new THREE.Color('#5a7a48'); lights(s);
 const names=Object.keys(M); names.forEach((n,i)=>{ const m=mesh(n); const big=n==='fortress'; const col=i%7,row=Math.floor(i/7); if(big){m.scale.setScalar(0.32);} m.position.set((col-3)*26,0,(row-1.5)*26); s.add(m); });
 const cam=new THREE.PerspectiveCamera(35,1.5,1,2000); cam.position.set(0,150,150); cam.lookAt(0,0,8); r.render(s,cam); };
window.scene3d=async (idx)=>{ const sn=SN[idx]; const s=new THREE.Scene(); s.background=new THREE.Color('#a8c4e0'); s.fog=new THREE.Fog('#a8c4e0',300,700); lights(s);
 const tex=await new THREE.TextureLoader().loadAsync(simBase+'/'+sn.terrain); tex.magFilter=THREE.NearestFilter; tex.colorSpace=THREE.SRGBColorSpace;
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(224,296),new THREE.MeshLambertMaterial({map:tex})); ground.rotation.x=-Math.PI/2; ground.position.set(112,0,-(148-(8-sn.scrollFrac))); s.add(ground);
 // 画面外へ続く地面（色だけ）
 const far=new THREE.Mesh(new THREE.PlaneGeometry(900,900),new THREE.MeshLambertMaterial({color:'#4f7a3a'})); far.rotation.x=-Math.PI/2; far.position.set(112,-0.5,-150); s.add(far);
 const AIR=18; const put=(n,x,y,h,rot=0,sc=1)=>{ const m=mesh(n); m.position.set(x,h,-y); m.rotation.y=rot; m.scale.setScalar(sc); s.add(m); return m; };
 for(const f of sn.forts) if(!f[2]) put('fortress',f[0],f[1],0.5);
 for(const g of sn.ground){ if(g[3]) continue; const map={turret:'turret',tank:'tank',bunker:'bunker',radar:'radar',obelisk:'obelisk',banner:'banner',fortturret:'fortturret',fortcore:'core'}; const n=map[g[0]]; if(!n) continue; const h=(g[0]==='fortturret'||g[0]==='fortcore')?6.5:0; const rot=Math.atan2(sn.player[0]-g[1], sn.player[1]-g[2]); put(n,g[1],g[2],h,(n==='turret'||n==='fortturret')?rot:0); if(n==='core'&&g[4]) put('core_eye',g[1],g[2],h+3.6); }
 const shadow=(x,y)=>{ const c=new THREE.Mesh(new THREE.CircleGeometry(5,12),new THREE.MeshBasicMaterial({color:0,transparent:true,opacity:0.3})); c.rotation.x=-Math.PI/2; c.position.set(x,0.3,-y); s.add(c); };
 for(const a of sn.air){ const m=put(a[0],a[1],a[2],AIR,a[0]==='shard'?a[3]:0); if(a[0]!=='shard') m.rotation.y=Math.PI; shadow(a[1],a[2]); }
 put('player',sn.player[0],sn.player[1],AIR); shadow(sn.player[0],sn.player[1]);
 for(const b of sn.bullets) put('bullet',b[0],b[1],AIR); for(const b of sn.shots) put('shot',b[0],b[1],AIR);
 // 地上照準（地面に投影した輪）
 const ring=new THREE.Mesh(new THREE.RingGeometry(6,7.5,24),new THREE.MeshBasicMaterial({color:sn.lock?'#ff4040':'#ffffff'})); ring.rotation.x=-Math.PI/2; ring.position.set(sn.sight[0],0.4,-sn.sight[1]); s.add(ring);
 const cam=new THREE.PerspectiveCamera(42,1.5,1,2000); cam.position.set(112,190,60); cam.lookAt(112,0,-150); r.render(s,cam); };
window.ready=true;
</script>`;
writeFileSync(join(here, 'preview', 'models.html'), html);
const b = await chromium.launch({ args: ['--allow-file-access-from-files', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
p.on('console', m => { if (m.type() === 'error') console.log('console:', m.text()); }); p.on('pageerror', e => console.log('pageerror', e.message));
await p.goto(pathToFileURL(join(here, 'preview', 'models.html')).href); await p.waitForFunction(() => window.ready);
await p.evaluate(() => gallery()); await p.screenshot({ path: join(here, 'preview', 'models-gallery.png') });
const n = JSON.parse(snaps).length;
for (let i = 0; i < n; i++) { await p.evaluate(i => scene3d(i), i); await p.screenshot({ path: join(here, 'preview', `scene3d-${i}.png`) }); }
await b.close(); console.log('ok', n);
