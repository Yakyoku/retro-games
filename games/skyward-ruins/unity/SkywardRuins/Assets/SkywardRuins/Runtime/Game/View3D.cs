// 3D / VR 表示：機体・敵・要塞・地形を立体で描く。ルールは 2D と同じ Sim を読むだけ。
// 論理座標 (x, y) → ワールドの「盤面ルート」内のローカル座標 (x-112, 高さ, y)。盤面ルートの拡大率で
// 通常 3D（大きな地形）と VR（座席から見渡せる卓上の大きさ）を切り替え、XR のメートルとゲーム内縮尺を分離する。
using System.Collections.Generic;
using SkywardRuins.Core;
using UnityEngine;

namespace SkywardRuins
{
    public class View3D : GameViewBase
    {
        public const float AirH = 18f;         // 空中層の高さ（論理単位）
        Transform board;                        // 盤面ルート
        TerrainChunks terrain; readonly List<MeshRenderer> ground = new List<MeshRenderer>();
        Mesh chunkQuad, ringMesh, quadMesh; Material terrainMat;
        readonly Dictionary<Texture2D, Material> chunkMats = new Dictionary<Texture2D, Material>();
        class Obj { public GameObject go; public MeshFilter mf; public MeshRenderer mr; }
        readonly Stack<Obj> pool = new Stack<Obj>(); readonly List<Obj> used = new List<Obj>();
        readonly List<Matrix4x4> trees = new List<Matrix4x4>(), rocks = new List<Matrix4x4>(), buildings = new List<Matrix4x4>();
        readonly Dictionary<int, List<Vector3>> propCache = new Dictionary<int, List<Vector3>>(); int propArea = -1;
        MaterialPropertyBlock mpb; static readonly int FlashId = Shader.PropertyToID("_Flash"), ColorId = Shader.PropertyToID("_Color"), MainTexId = Shader.PropertyToID("_MainTex");
        class Fx { public string set; public Vector3 local; public bool ground; public float t0, size; public List<(Vector3 p, Vector3 v)> debris; }
        readonly List<Fx> fx = new List<Fx>();
        GameObject vignette; Material vignetteMat; Vector2 lastPlayer; float moveAmt;
        public bool VR => XRBridge.Instance != null && XRBridge.Instance.IsVR;

        public override void Setup(GameDatabase db, Hud hud)
        {
            base.Setup(db, hud);
            board = new GameObject("Board3D").transform; board.SetParent(transform, false);
            terrain = new TerrainChunks(db.AreaList(), db.tuning.areaLength, true);
            chunkQuad = Quad(db.tuning.fieldW, TerrainChunks.ChunkH, false);
            quadMesh = Quad(1, 1, true);
            ringMesh = Ring(6.5f, 8.2f, 32);
            mpb = new MaterialPropertyBlock();
            // 盤面の外にも地面を続ける（色だけの大きな板）
            var far = new GameObject("FarGround"); far.transform.SetParent(board, false);
            far.AddComponent<MeshFilter>().sharedMesh = Quad(1400, 1400, true);
            var fmr = far.AddComponent<MeshRenderer>(); fmr.sharedMaterial = new Material(db.litMaterial) { color = new Color(0.27f, 0.42f, 0.22f) };
            far.transform.localPosition = new Vector3(0, -0.6f, 144); far.transform.localRotation = Quaternion.Euler(90, 0, 0);
            CreateVignette();
            if (Services.Instance != null) { var mc = Services.Instance.mainCamera; mc.clearFlags = CameraClearFlags.SolidColor; mc.backgroundColor = new Color(0.62f, 0.75f, 0.88f); mc.cullingMask = ~(1 << View2D.Layer); mc.nearClipPlane = 0.05f; mc.farClipPlane = 1500f; }
        }

        void OnDestroy() { terrain?.Dispose(); foreach (var m in chunkMats.Values) Destroy(m); if (vignette) Destroy(vignette); }

        static Mesh Quad(float w, float h, bool centered)
        {
            var m = new Mesh { name = "quad" };
            float x0 = centered ? -w / 2 : -w / 2, z0 = centered ? -h / 2 : 0;
            m.vertices = new[] { new Vector3(x0, 0, z0), new Vector3(x0 + w, 0, z0), new Vector3(x0 + w, 0, z0 + h), new Vector3(x0, 0, z0 + h) };
            m.uv = new[] { new Vector2(0, 0), new Vector2(1, 0), new Vector2(1, 1), new Vector2(0, 1) };
            m.normals = new[] { Vector3.up, Vector3.up, Vector3.up, Vector3.up };
            m.colors = new[] { Color.white, Color.white, Color.white, Color.white };
            m.triangles = new[] { 0, 2, 1, 0, 3, 2 };
            if (centered) { var v = m.vertices; for (int i = 0; i < 4; i++) v[i] = new Vector3(v[i].x, v[i].z, 0); m.vertices = v; m.normals = new[] { Vector3.back, Vector3.back, Vector3.back, Vector3.back }; m.triangles = new[] { 0, 2, 1, 0, 3, 2 }; }
            m.RecalculateBounds(); return m;
        }
        static Mesh Ring(float r0, float r1, int n)
        {
            var m = new Mesh { name = "ring" }; var v = new List<Vector3>(); var t = new List<int>(); var c = new List<Color>();
            for (int i = 0; i <= n; i++) { float a = i * Mathf.PI * 2 / n; v.Add(new Vector3(Mathf.Cos(a) * r0, 0, Mathf.Sin(a) * r0)); v.Add(new Vector3(Mathf.Cos(a) * r1, 0, Mathf.Sin(a) * r1)); c.Add(Color.white); c.Add(Color.white); }
            for (int i = 0; i < n; i++) { int k = i * 2; t.AddRange(new[] { k, k + 1, k + 3, k, k + 3, k + 2 }); }
            m.SetVertices(v); m.SetColors(c); m.SetTriangles(t, 0); m.RecalculateNormals(); m.RecalculateBounds(); return m;
        }

        void CreateVignette()
        {
            // VR 周辺減光：カメラ前の板にフチが暗い画像を貼る（移動量と設定に応じて濃くする）
            var cam = Services.Instance != null ? Services.Instance.mainCamera : Camera.main; if (cam == null || db.vignette == null) return;
            vignette = new GameObject("ComfortVignette"); vignette.transform.SetParent(cam.transform, false);
            vignette.transform.localPosition = new Vector3(0, 0, 0.32f); vignette.transform.localScale = new Vector3(1.1f, 1.1f, 1);
            vignette.AddComponent<MeshFilter>().sharedMesh = quadMesh;
            var mr = vignette.AddComponent<MeshRenderer>(); vignetteMat = new Material(db.unlitTransparent); vignetteMat.SetTexture(MainTexId, db.vignette); vignetteMat.SetFloat("_ZTest", (float)UnityEngine.Rendering.CompareFunction.Always); vignetteMat.renderQueue = 4000; mr.sharedMaterial = vignetteMat;
            vignette.SetActive(false);
        }

        public override void Clear()
        {
            foreach (var o in used) { o.go.SetActive(false); pool.Push(o); }
            used.Clear(); fx.Clear();
        }

        // ---- 盤面の置き方（カメラ / XR リグ） ----
        void PlaceView()
        {
            var svc = Services.Instance; if (svc == null) return;
            var s = SaveService.Settings; var t = db.tuning;
            var pp = PlayerPos;
            if (VR)
            {
                if (s.view3D == 1)
                {
                    // VR コックピット：盤面を大きくし、自機の操縦席の位置に観察者を置く（スクロールでは動かさない。自機の操作でだけ動く）
                    float k = 0.06f * s.vrScale;
                    board.localScale = Vector3.one * k;
                    board.position = -new Vector3(pp.x - t.fieldW / 2, AirH + 3.2f, pp.y - 6) * k + new Vector3(0, 1.0f, 0);
                }
                else
                {
                    // VR 見下ろし（初期）：座ったまま全体を見渡せる卓上の盤面。目の高さより 0.6m ほど下、手前 0.4m から奥へ
                    float k = 0.0105f * s.vrScale;
                    board.localScale = Vector3.one * k;
                    board.position = new Vector3(0, 0.55f, 0.42f);
                }
                board.rotation = Quaternion.identity;
                svc.PlaceRig(Vector3.zero, Quaternion.identity);
                return;
            }
            board.localScale = Vector3.one * 0.1f; board.position = Vector3.zero; board.rotation = Quaternion.identity;
            var cam = svc.mainCamera; float aspect = cam.aspect;
            if (s.view3D == 1)
            {
                // コックピット：操縦席の高さ・水平を保つ（ロールしない）。自機に少し遅れて追従
                Vector3 eye = board.TransformPoint(new Vector3(pp.x - t.fieldW / 2, AirH + 8f, pp.y - 22f));
                Vector3 look = board.TransformPoint(new Vector3(pp.x - t.fieldW / 2, 0f, pp.y + 70f));
                svc.PlaceCamera(eye, Quaternion.LookRotation(look - eye, Vector3.up), aspect < 1 ? 70 : 58);
            }
            else
            {
                // 斜め上からの立体見下ろし：縦長画面では視野を広げ、戦場の横幅が必ず収まるようにする
                float fov = aspect < 0.8f ? 62f : 42f;
                Vector3 eye = board.TransformPoint(new Vector3(0, 205, -78)), look = board.TransformPoint(new Vector3(0, 0, 150));
                svc.PlaceCamera(eye, Quaternion.LookRotation(look - eye, Vector3.up), fov);
            }
        }

        Vector3 L(float x, float y, float h) => new Vector3(x - db.tuning.fieldW / 2, h, y);

        Obj Put(string mesh, Vector3 local, float yawDeg, float scale = 1f, float flash = 0f, Color? tint = null)
        {
            var m = db.Mesh(mesh); if (m == null) return null;
            var o = pool.Count > 0 ? pool.Pop() : NewObj();
            o.go.SetActive(true); used.Add(o);
            o.mf.sharedMesh = m; o.mr.sharedMaterial = db.litMaterial;
            o.go.transform.localPosition = local; o.go.transform.localRotation = Quaternion.Euler(0, yawDeg, 0); o.go.transform.localScale = Vector3.one * scale;
            mpb.Clear(); mpb.SetFloat(FlashId, flash); mpb.SetColor(ColorId, tint ?? Color.white); o.mr.SetPropertyBlock(mpb);
            return o;
        }
        Obj NewObj()
        {
            var go = new GameObject("obj"); go.transform.SetParent(board, false);
            var o = new Obj { go = go, mf = go.AddComponent<MeshFilter>(), mr = go.AddComponent<MeshRenderer>() };
            o.mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off; o.mr.receiveShadows = false;
            return o;
        }
        Obj Flat(Mesh mesh, Material mat, Vector3 local, float scale, Color col, Texture tex = null, bool billboard = false)
        {
            var o = pool.Count > 0 ? pool.Pop() : NewObj();
            o.go.SetActive(true); used.Add(o);
            o.mf.sharedMesh = mesh; o.mr.sharedMaterial = mat;
            o.go.transform.localPosition = local; o.go.transform.localScale = Vector3.one * scale;
            if (billboard && Services.Instance != null) { var cam = Services.Instance.mainCamera.transform; o.go.transform.rotation = Quaternion.LookRotation(o.go.transform.position - cam.position, cam.up); }
            else o.go.transform.localRotation = mesh == quadMesh ? Quaternion.Euler(90, 0, 0) : Quaternion.identity;
            mpb.Clear(); mpb.SetColor(ColorId, col); if (tex != null) mpb.SetTexture(MainTexId, tex); o.mr.SetPropertyBlock(mpb);
            return o;
        }

        protected override void Draw(float dt)
        {
            if (sim == null) return;
            foreach (var o in used) { o.go.SetActive(false); pool.Push(o); }
            used.Clear();
            PlaceView();
            var set = SaveService.Settings; var t = db.tuning;
            float scroll = Scroll; var pp = PlayerPos;
            float viewAhead = VR ? t.fieldH + 30 : t.fieldH + 240;   // 通常 3D は奥まで見えるので先まで描く

            // 地表と木
            trees.Clear(); rocks.Clear(); buildings.Clear();
            if (propArea != sim.AreaIndex) { propCache.Clear(); propArea = sim.AreaIndex; }
            int gi = 0; var area = sim.Area; var next = db.areas[(sim.AreaIndex + 1) % db.areas.Length].data;
            int bodyChunks = Mathf.RoundToInt(t.areaLength / TerrainChunks.ChunkH);
            foreach (var c in terrain.Visible(sim.AreaIndex, Mathf.Max(0, scroll - 40), viewAhead + 40, 1))
            {
                if (ground.Count <= gi) { var go = new GameObject("chunk"); go.transform.SetParent(board, false); go.AddComponent<MeshFilter>().sharedMesh = chunkQuad; var mr0 = go.AddComponent<MeshRenderer>(); mr0.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off; ground.Add(mr0); }
                var mr = ground[gi++]; mr.gameObject.SetActive(true);
                if (!chunkMats.TryGetValue(c.tex, out var mat)) { mat = new Material(db.terrainMaterial); mat.SetTexture(MainTexId, c.tex); chunkMats[c.tex] = mat; }
                mr.sharedMaterial = mat;
                mr.transform.localPosition = new Vector3(0, 0, c.k * TerrainChunks.ChunkH - scroll);
                if (c.k >= 0)
                {
                    if (!propCache.TryGetValue(c.k, out var props)) { props = new List<Vector3>(TerrainChunks.Props(area, next, c.k, bodyChunks)); propCache[c.k] = props; }
                    foreach (var p in props)
                    {
                        var lp = L(p.x, p.z - scroll, 0);
                        var w = board.localToWorldMatrix * Matrix4x4.TRS(lp, Quaternion.Euler(0, p.x * 37 % 360, 0), Vector3.one * Mathf.Abs(p.y >= 10 ? p.y - 10 : p.y));
                        if (p.y >= 10) buildings.Add(w); else if (p.y > 0) trees.Add(w); else rocks.Add(w);
                    }
                }
            }
            for (; gi < ground.Count; gi++) ground[gi].gameObject.SetActive(false);
            DrawInstanced("tree", trees); DrawInstanced("rock", rocks); DrawInstanced("building", buildings);

            // 地上物
            foreach (var f in sim.Forts) if (!f.destroyed) Put("fortress", L(f.x, f.worldY - scroll, 0.5f), 0);
            foreach (var g in sim.Ground)
            {
                float sy = g.worldY - scroll; if (sy < -60 || sy > viewAhead) continue;
                if (g.state == GroundState.Hidden) continue;
                if (g.state == GroundState.Destroyed) { if (g.fortress == null && g.kind != SpawnKind.Banner) Put("mound", L(g.x, sy, 0.1f), 0, 0.9f, 0, new Color(0.35f, 0.3f, 0.25f)); continue; }
                float fl = g.hitFlash > 0 ? 1 : (g.tele > 0 && (int)(time * 12) % 2 == 0 && !set.reduceFlash ? 0.6f : (g.tele > 0 ? 0.35f : 0));
                var p = new Vector2(g.x, sy); float aim = AimAngle(p, pp);
                float h = g.fortress != null ? 6.4f : 0f;
                switch (g.kind)
                {
                    case SpawnKind.Turret: Put("turret", L(g.x, sy, 0), aim, 1, fl); break;
                    case SpawnKind.FortTurret: Put("fortturret", L(g.x, sy, h), aim, 1, fl); break;
                    case SpawnKind.Tank: Put("tank", L(g.x, sy, 0), g.vx >= 0 ? 90 : -90, 1, fl); break;
                    case SpawnKind.Bunker: Put("bunker", L(g.x, sy, 0), 0, 1, fl, g.hp <= 1 ? new Color(0.7f, 0.65f, 0.6f) : (Color?)null); break;
                    case SpawnKind.Radar: Put("radar", L(g.x, sy, 0), 0, 1, fl); Put("radar_dish", L(g.x, sy, 5.2f), time * 60f); break;
                    case SpawnKind.Obelisk:
                        {
                            int fr = ObeliskFrame(g); float rise = fr >= 5 ? 1 : (fr + 1) / 5f;
                            Put("mound", L(g.x, sy, 0), 0); var o = Put("obelisk", L(g.x, sy, -16 * (1 - rise)), 0, 1, fl);
                            break;
                        }
                    case SpawnKind.Banner: Put("banner", L(g.x, sy, 0), Mathf.Sin(time * 3) * 10); break;
                    case SpawnKind.FortCore:
                        Put("core", L(g.x, sy, h + 2f), 0, 1, 0);
                        if (g.fortress.coreOpen) Put("core_eye", L(g.x, sy, h + 5.5f), 0, 1, (int)(time * 6) % 2 == 0 && !set.reduceFlash ? 0.3f : 0);
                        break;
                }
            }
            // 照準：地上の実際の着弾面（高さ 0）に置く。左右の目で同じ地点に見える（画面上の板ではない）
            if (sim.State == SimState.Playing)
            {
                Color sc = sim.SightHint ? ((set.reduceFlash || (int)(time * 8) % 2 == 0) ? new Color(1f, 0.82f, 0.2f) : Color.white) : (sim.SightLock ? new Color(1f, 0.25f, 0.25f) : new Color(0.95f, 0.97f, 1f));
                Flat(ringMesh, db.unlitTransparent, L(pp.x, pp.y + t.sightDistance, 0.25f), 1f, sc);
                // 自機から照準へ下ろす細い目印（上空の自機と地上の照準を結び付ける）
                Flat(quadMesh, db.unlitTransparent, L(pp.x, pp.y + t.sightDistance, 0.2f), 2.2f, new Color(sc.r, sc.g, sc.b, 0.6f));
            }
            // 爆弾：自機の高さから照準の地点へ放物線で落ちる。着地点は地表に固定
            foreach (var b in sim.Bombs)
            {
                float k = Mathf.Clamp01(b.t / t.bombFlight); var sp = sim.BombScreenPos(b);
                float y = sp.y + (curScroll - scroll) * k; float h = Mathf.Lerp(AirH, 0, k * k);
                Put("bomb", L(sp.x, y, h + 1), 0);
            }
            // 空中物＋地面の影
            foreach (var a in sim.Air)
            {
                var p = Pos(a.uid, a.pos); string mn = SpriteName(a.kind);
                float yaw = a.kind == SpawnKind.Shard ? a.spin * 57.3f : (a.kind == SpawnKind.Arc ? time * 120 : 180 + (a.vel.x != 0 || a.vel.y != 0 ? Mathf.Atan2(a.vel.x, -a.vel.y) * Mathf.Rad2Deg * 0.4f : 0));
                Put(mn, L(p.x, p.y, AirH + (a.kind == SpawnKind.Shard ? 2 : 0)), yaw, 1, a.tele > 0 ? 0.45f : 0);
                Shadow(p, a.kind == SpawnKind.Heavy ? 1.6f : 1f);
            }
            foreach (var s in sim.Shots) Put("shot", L(s.pos.x, s.pos.y, AirH), 0);
            if (sim.State == SimState.Playing)
            {
                bool blink = sim.Invuln > 0 && (set.reduceFlash ? (int)(time * 6) % 2 == 0 : (int)(time * 15) % 2 == 0);
                float bank = Mathf.Clamp((pp.x - lastPlayer.x) * -8f, -18, 18);   // 見た目だけのわずかな傾き（カメラは傾けない）
                var o = Put("player", L(pp.x, pp.y, AirH), 0, 1, blink ? 0.5f : 0);
                if (o != null) o.go.transform.localRotation = Quaternion.Euler(0, 0, bank);
                Shadow(pp, 1.2f);
            }
            foreach (var b in sim.Bullets) Put("bullet", L(Pos(b.uid, b.pos).x, Pos(b.uid, b.pos).y, AirH), time * 200);
            // エフェクト
            for (int i = fx.Count - 1; i >= 0; i--)
            {
                var e = fx[i]; float age = time - e.t0; var ss = db.Sprite(e.set);
                int fr = ss != null ? (int)(age * ss.fps) : 99;
                if (ss == null || fr >= ss.frames.Length) { fx.RemoveAt(i); continue; }
                var lp = e.local; if (e.ground) lp.z -= scroll;
                Flat(quadMesh, db.unlitTransparent, lp, e.size, Color.white, ss.frames[fr].texture, true);
                if (e.debris != null) foreach (var d in e.debris) { var q = lp + d.p + d.v * age + Vector3.down * 30 * age * age; if (q.y > 0) Put("debris", q, age * 400, 1); }
            }
            // 周辺減光（VR で、自機の移動に連動して視界が動くコックピットのときに強める）
            moveAmt = Mathf.Lerp(moveAmt, Vector2.Distance(pp, lastPlayer) / Mathf.Max(dt, 1e-3f) / t.playerSpeed, dt * 8);
            lastPlayer = pp;
            if (vignette != null)
            {
                bool on = VR && set.vignette > 0;
                vignette.SetActive(on);
                if (on) { float a = set.vignette * (set.view3D == 1 ? Mathf.Clamp01(0.25f + moveAmt) : 0.25f); vignetteMat.color = new Color(0, 0, 0, a); }
            }
        }

        void Shadow(Vector2 p, float s) => Flat(quadMesh, db.unlitTransparent, L(p.x, p.y, 0.15f), 11f * s, new Color(0, 0, 0, 0.3f), db.softCircle);

        void DrawInstanced(string mesh, List<Matrix4x4> list)
        {
            var m = db.Mesh(mesh); if (m == null || list.Count == 0) return;
            var rp = new RenderParams(db.litMaterial) { shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off, receiveShadows = false };
            for (int i = 0; i < list.Count; i += 1023) Graphics.RenderMeshInstanced(rp, m, 0, list, Mathf.Min(1023, list.Count - i), i);
        }

        void AddFx(string set, float x, float y, float h, bool groundAnchored, float size, int debris = 0)
        {
            var e = new Fx { set = set, local = L(x, groundAnchored ? y + sim.Scroll : y, h), ground = groundAnchored, t0 = time, size = size };
            if (debris > 0) { e.debris = new List<(Vector3, Vector3)>(); for (int i = 0; i < debris; i++) { float a = i * 2.39f; e.debris.Add((Vector3.zero, new Vector3(Mathf.Cos(a) * 30, 25 + (i % 3) * 10, Mathf.Sin(a) * 30))); } }
            fx.Add(e);
        }

        public override void OnEvent(in SimEvent e)
        {
            switch (e.type)
            {
                case EvType.AirKill: AddFx("boomair", e.x, e.y, AirH, false, 20, 5); break;
                case EvType.GroundKill: case EvType.FortTurretKill: case EvType.ObeliskBreak: AddFx("boomground", e.x, e.y, 3, true, 26, 6); break;
                case EvType.BombLand: AddFx("bombburst", e.x, e.y, 0.5f, true, 22); break;
                case EvType.HeavyHit: case EvType.ShardBlock: case EvType.ObeliskHit: case EvType.CoreClang: AddFx("spark", e.x, e.y, AirH, false, 8); break;
                case EvType.PlayerHit: AddFx("boomair", e.x, e.y, AirH, false, 40, 10); break;
                case EvType.FortressDestroyed: for (int k = 0; k < 6; k++) AddFx("boomground", e.x + Mathf.Cos(k) * 30, e.y + Mathf.Sin(k * 1.7f) * 22, 6, true, 40, 6); break;
                case EvType.ObeliskReveal: case EvType.BannerReveal: NoteReveal(e.uid); AddFx("spark", e.x, e.y, 4, true, 12); break;
            }
        }

        public override Vector3 WorldPos(float x, float y, bool air) => board != null ? board.TransformPoint(L(x, y, air ? AirH : 0)) : Vector3.zero;
        public override Vector2 HudNorm(float x, float y, bool air)
        {
            var cam = Services.Instance != null ? Services.Instance.mainCamera : Camera.main; if (cam == null) return new Vector2(0.5f, 0.5f);
            var v = cam.WorldToViewportPoint(WorldPos(x, y, air)); return new Vector2(v.x, v.y);
        }
    }
}
