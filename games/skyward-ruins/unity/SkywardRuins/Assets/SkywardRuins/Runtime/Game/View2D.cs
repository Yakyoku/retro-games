// 2D アーケード表示：224×288 のレンダーテクスチャに正射影カメラでドット絵を描き、点補間のまま画面に拡大表示する。
// リサイズしても論理画面の範囲・速度・配置は変わらない（拡大率と余白だけが変わる）。
using System.Collections.Generic;
using SkywardRuins.Core;
using UnityEngine;

namespace SkywardRuins
{
    public class View2D : GameViewBase
    {
        public const int Layer = 8;
        Camera cam; RenderTexture rt; Transform world;
        TerrainChunks terrain; readonly List<SpriteRenderer> terrainSR = new List<SpriteRenderer>();
        readonly Dictionary<Texture2D, Sprite> chunkSprites = new Dictionary<Texture2D, Sprite>();
        readonly Stack<SpriteRenderer> pool = new Stack<SpriteRenderer>();
        readonly List<SpriteRenderer> used = new List<SpriteRenderer>();
        class Fx { public SpriteSet set; public Vector2 pos; public bool ground; public float t0, scale; public int order; }
        readonly List<Fx> fx = new List<Fx>();
        float shake; MaterialPropertyBlock mpb;
        static readonly int FlashId = Shader.PropertyToID("_Flash");

        public override void Setup(GameDatabase db, Hud hud)
        {
            base.Setup(db, hud);
            var t = db.tuning;
            rt = new RenderTexture((int)t.fieldW, (int)t.fieldH, 16, RenderTextureFormat.ARGB32) { filterMode = FilterMode.Point, name = "Game2D_RT" };
            rt.Create();
            world = new GameObject("World2D").transform; world.SetParent(transform, false);
            var camGo = new GameObject("Camera2D"); camGo.transform.SetParent(transform, false);
            cam = camGo.AddComponent<Camera>(); cam.orthographic = true; cam.orthographicSize = t.fieldH / 2;
            cam.transform.position = new Vector3(t.fieldW / 2, t.fieldH / 2, -50); cam.clearFlags = CameraClearFlags.SolidColor; cam.backgroundColor = Color.black;
            cam.cullingMask = 1 << Layer; cam.targetTexture = rt; cam.nearClipPlane = 0.1f; cam.farClipPlane = 200f; cam.allowHDR = false; cam.allowMSAA = false;
            if (hud != null && hud.gameImage != null) hud.gameImage.texture = rt;
            // 2D ではメインカメラは余白の色を塗るだけ（立体のものは映さない）
            if (Services.Instance != null) { var mc = Services.Instance.mainCamera; mc.clearFlags = CameraClearFlags.SolidColor; mc.backgroundColor = new Color(0.03f, 0.04f, 0.06f); mc.cullingMask = 0; }
            terrain = new TerrainChunks(db.AreaList(), t.areaLength, false);
            mpb = new MaterialPropertyBlock();
        }

        void OnDestroy() { Clear(); terrain?.Dispose(); if (rt) { rt.Release(); Destroy(rt); } }

        public override void Clear()
        {
            foreach (var s in used) { s.gameObject.SetActive(false); pool.Push(s); }
            used.Clear(); fx.Clear();
        }

        SpriteRenderer Get(string set, int frame, Vector2 p, int order, float rotDeg = 0, float alpha = 1, float flash = 0)
        {
            var s = db.Sprite(set); if (s == null || s.frames.Length == 0) return null;
            var sr = pool.Count > 0 ? pool.Pop() : NewSR();
            sr.gameObject.SetActive(true); used.Add(sr);
            sr.sprite = s.frames[Mathf.Clamp(frame, 0, s.frames.Length - 1)];
            sr.sortingOrder = order; sr.color = new Color(1, 1, 1, alpha);
            // 半端な座標でドットが崩れないよう、整数ピクセルに揃える（スプライトの中心が奇数幅なら 0.5 ずらす）
            var size = sr.sprite.rect.size;
            float ox = (size.x % 2 == 1) ? 0.5f : 0f, oy = (size.y % 2 == 1) ? 0.5f : 0f;
            sr.transform.localPosition = new Vector3(Mathf.Round(p.x - ox) + ox, Mathf.Round(p.y - oy) + oy, 0);
            sr.transform.localRotation = Quaternion.Euler(0, 0, -rotDeg); sr.transform.localScale = Vector3.one;
            mpb.SetFloat(FlashId, flash); sr.SetPropertyBlock(mpb);
            return sr;
        }
        SpriteRenderer NewSR()
        {
            var go = new GameObject("spr"); go.layer = Layer; go.transform.SetParent(world, false);
            var sr = go.AddComponent<SpriteRenderer>(); sr.sharedMaterial = db.spriteMaterial; return sr;
        }

        protected override void Draw(float dt)
        {
            if (sim == null) return;
            foreach (var s in used) { s.gameObject.SetActive(false); pool.Push(s); }
            used.Clear();
            var set = SaveService.Settings;
            float scroll = Scroll;
            float H = sim.T.fieldH;

            // 地表
            int i = 0;
            foreach (var c in terrain.Visible(sim.AreaIndex, scroll, H + 2, 1))
            {
                if (terrainSR.Count <= i) { var go = new GameObject("ground"); go.layer = Layer; go.transform.SetParent(world, false); var sr0 = go.AddComponent<SpriteRenderer>(); sr0.sharedMaterial = db.spriteMaterial; sr0.sortingOrder = -100; terrainSR.Add(sr0); }
                var sr = terrainSR[i++]; sr.gameObject.SetActive(true);
                if (!chunkSprites.TryGetValue(c.tex, out var sp)) { sp = Sprite.Create(c.tex, new Rect(0, 0, c.tex.width, c.tex.height), Vector2.zero, 1f, 0, SpriteMeshType.FullRect); chunkSprites[c.tex] = sp; }
                sr.sprite = sp; sr.transform.localPosition = new Vector3(0, Mathf.Round(c.k * TerrainChunks.ChunkH - scroll), 0);
            }
            for (; i < terrainSR.Count; i++) terrainSR[i].gameObject.SetActive(false);

            var pp = PlayerPos;
            // 地上物（地表と一緒に流れる）
            foreach (var f in sim.Forts) if (!f.destroyed) Get("fortress", FrameAt(db.Sprite("fortress"), time), new Vector2(f.x, f.worldY - scroll), -10);
            foreach (var g in sim.Ground)
            {
                var p = new Vector2(g.x, g.worldY - scroll);
                if (p.y < -40 || p.y > H + 60) continue;
                if (g.state == GroundState.Hidden) continue;
                if (g.state == GroundState.Destroyed) { if (g.fortress == null && g.kind != SpawnKind.Banner) Get("crater", 0, p, -20); continue; }
                float fl = g.hitFlash > 0 ? 1 : 0;
                switch (g.kind)
                {
                    case SpawnKind.Turret: case SpawnKind.FortTurret:
                        Get(SpriteName(g.kind), g.tele > 0 && (set.reduceFlash || (int)(time * 16) % 2 == 0) ? 1 : 0, p, -5, AimAngle(p, pp), 1, fl); break;
                    case SpawnKind.Tank: Get("tank", FrameAt(db.Sprite("tank"), time), p, -5, g.vx >= 0 ? 90 : -90, 1, fl); break;
                    case SpawnKind.Bunker: Get("bunker", g.hp <= 1 ? 2 : (g.tele > 0 ? 1 : 0), p, -5, 0, 1, fl); break;
                    case SpawnKind.Radar: Get("radar", FrameAt(db.Sprite("radar"), time), p, -5, 0, 1, fl); break;
                    case SpawnKind.Obelisk: Get("obelisk", ObeliskFrame(g), p, -4, 0, 1, fl); break;
                    case SpawnKind.Banner: Get("banner", FrameAt(db.Sprite("banner"), time), p, -4); break;
                    case SpawnKind.FortCore:
                        {
                            int fr = g.fortress.coreOpen ? Mathf.Min(3, (int)((g.fortress.coreCycle % 3f - 1.4f) / 0.06f) + 1) : 0;
                            Get("core", fr, p, -4); break;
                        }
                }
            }
            // 影
            foreach (var a in sim.Air) { var p = Pos(a.uid, a.pos); var s = Get("crater", 0, p + new Vector2(7, -11), 2, 0, 0.0f); if (s) s.color = new Color(0, 0, 0, 0.28f); }
            // 照準（隠し対象の反応は点滅。強い点滅を抑える設定ではゆっくり）
            var sight = new Vector2(pp.x, pp.y + sim.T.sightDistance);
            int sf = sim.SightHint ? ((set.reduceFlash ? (int)(time * 3) % 2 == 0 : (int)(time * 10) % 2 == 0) ? 2 : 0) : (sim.SightLock ? 1 : 0);
            if (sim.State == SimState.Playing) Get("sight", sf, sight, 4);
            foreach (var b in sim.Bombs) { var p = sim.BombScreenPos(b); float k = Mathf.Clamp01(b.t / sim.T.bombFlight); Get("bomb", FrameAt(db.Sprite("bomb"), time), new Vector2(p.x, p.y + (curScroll - scroll) * k), 5); }  // 着弾点は地表に固定（補間中の地表と一致させる）
            // 空中
            foreach (var a in sim.Air)
            {
                var p = Pos(a.uid, a.pos); var ss = db.Sprite(SpriteName(a.kind));
                int fr = a.kind == SpawnKind.Shard ? (int)(a.spin * 2.5f) % 8 : (a.tele > 0 ? 1 : FrameAt(ss, time));
                Get(SpriteName(a.kind), fr, p, 6);
            }
            foreach (var s in sim.Shots) Get("shot", 0, new Vector2(s.pos.x, s.pos.y), 7);
            if (sim.State == SimState.Playing)
            {
                bool blink = sim.Invuln > 0 && (set.reduceFlash ? (int)(time * 6) % 2 == 0 : (int)(time * 15) % 2 == 0);
                Get("player", FrameAt(db.Sprite("player"), time), pp, 8, 0, blink ? 0.35f : 1f);
            }
            foreach (var b in sim.Bullets) Get("bullet", FrameAt(db.Sprite("bullet"), time), Pos(b.uid, b.pos), 9);
            // エフェクト（爆発は弾より下に描き、弾を隠さない）
            for (int k = fx.Count - 1; k >= 0; k--)
            {
                var e = fx[k]; int fr = (int)((time - e.t0) * e.set.fps);
                if (fr >= e.set.frames.Length) { fx.RemoveAt(k); continue; }
                var p = e.ground ? new Vector2(e.pos.x, e.pos.y - scroll) : e.pos;
                var s = Get(e.set.name, fr, p, e.order); if (s) s.transform.localScale = Vector3.one * e.scale;
            }
            // 画面振動（初期 OFF）
            shake = Mathf.Max(0, shake - dt * 3);
            float sh = set.screenShake ? shake : 0;
            cam.transform.position = new Vector3(sim.T.fieldW / 2 + Mathf.Round(Random.Range(-sh, sh) * 3), sim.T.fieldH / 2 + Mathf.Round(Random.Range(-sh, sh) * 3), -50);
        }

        void AddFx(string set, Vector2 p, bool ground, int order, float scale = 1)
        {
            var s = db.Sprite(set); if (s == null) return;
            fx.Add(new Fx { set = s, pos = ground ? new Vector2(p.x, p.y + sim.Scroll) : p, ground = ground, t0 = time, scale = scale, order = order });
        }

        public override void OnEvent(in SimEvent e)
        {
            var p = new Vector2(e.x, e.y);
            switch (e.type)
            {
                case EvType.AirKill: AddFx("boomair", p, false, 3); break;
                case EvType.GroundKill: case EvType.FortTurretKill: case EvType.ObeliskBreak: AddFx("boomground", p, true, -3); break;
                case EvType.BombLand: AddFx("bombburst", p, true, -3); break;
                case EvType.HeavyHit: case EvType.ShardBlock: case EvType.ObeliskHit: case EvType.CoreClang: AddFx("spark", p, false, 10); break;
                case EvType.PlayerHit: AddFx("boomair", p, false, 10, 2f); shake = 1; break;
                case EvType.FortressDestroyed:
                    for (int k = 0; k < 6; k++) AddFx("boomground", p + new Vector2(Mathf.Cos(k) * 30, Mathf.Sin(k * 1.7f) * 22), true, -3, 1.5f);
                    shake = 1.5f; break;
                case EvType.ObeliskReveal: case EvType.BannerReveal: NoteReveal(e.uid); AddFx("spark", p, true, 10); break;
            }
        }

        public override Vector3 WorldPos(float x, float y, bool air) => new Vector3(x, y, 0);
        public override Vector2 HudNorm(float x, float y, bool air) => new Vector2(x / sim.T.fieldW, y / sim.T.fieldH);
    }
}
