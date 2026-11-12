// Skyward Ruins — 決定的なゲーム進行（固定 60Hz）。2D と 3D の描画はこの状態を読むだけで、ルールは持たない。
// 座標系: 論理画面 224×288、原点は左下、+y が進行方向（画面上）。
//  - 空中層（自機・空中敵・弾）は画面座標で動く。
//  - 地上層（砲台・隠し対象・要塞）は地表座標 worldY を持ち、画面 y = worldY - scroll。
using System;
using System.Collections.Generic;

namespace SkywardRuins.Core
{
    public struct InputFrame
    {
        public float mx, my;      // -1..1（斜めは Sim 内で正規化）
        public bool air, ground;  // 押下中
    }

    public enum EvType
    {
        AirFire, GroundFire, BombLand, AirKill, HeavyHit, ShardBlock, GroundKill, PlayerHit, Respawn, Extend,
        ObeliskReveal, ObeliskHit, ObeliskBreak, BannerReveal, BannerGet, FortressWarn, FortressArrive, CoreOpen, CoreClang,
        FortTurretKill, FortressDestroyed, FortressLeave, AreaStart, LoopComplete, GameOver, EnemyFire, Telegraph, Score,
    }

    public struct SimEvent
    {
        public EvType type; public float x, y; public int value; public SpawnKind kind; public int uid;
        public override string ToString() => $"{type}({x:0},{y:0},{value})";
    }

    public enum SimState { Playing, Dying, GameOver }

    public class AirEnemy
    {
        public int uid; public SpawnKind kind; public Vec2 pos, vel; public float t, heading, fireT, tele, radius; public int hp, phase, dir, idx;
        public bool alive = true;
        public float spin;          // 見た目用（回転角）
    }

    public enum GroundState { Hidden, Visible, Destroyed }

    public class GroundObj
    {
        public int uid, rewardId; public SpawnKind kind; public float x, worldY, vx, fireT, tele, radius, hitFlash; public int hp;
        public GroundState state = GroundState.Visible; public Fortress fortress; public Vec2 offset;
    }

    public class Fortress
    {
        public int uid, rewardId; public float x, worldY, t, coreCycle; public int phase; // 0 接近 1 滞空 2 離脱
        public bool coreOpen, destroyed, left; public List<GroundObj> parts = new List<GroundObj>(); public GroundObj core;
    }

    public class Shot { public Vec2 pos, prev; public bool alive = true; }
    public class Bomb { public Vec2 start; public float tx, tworldY, t; public bool alive = true; public int uid; }
    public class Bullet { public Vec2 pos, vel; public bool alive = true; public int uid; }

    public class Sim
    {
        public readonly Tuning T;
        public readonly List<AreaData> Areas;
        public readonly Difficulty Diff;
        public readonly AssistSettings Assist;

        public SimState State { get; private set; }
        public int AreaIndex { get; private set; }
        public int Loop { get; private set; }
        public float Scroll { get; private set; }      // 現エリア内の進行距離
        public int Score { get; private set; }
        public int Lives { get; private set; }
        public int Frame { get; private set; }
        public Vec2 Player;
        public float Invuln { get; private set; }
        public float DyingT { get; private set; }
        public bool SightHint { get; private set; }     // 照準下に隠し対象（オベリスク）
        public bool SightLock { get; private set; }     // 照準下に地上目標
        public float ScrollMul { get; private set; } = 1f;
        public float AirCooldown { get; private set; }
        public float GroundCooldown { get; private set; }
        public int NextExtend { get; private set; }
        public float BulletMul => T.BulletSpeedMul(Diff, Loop);
        public AreaData Area => Areas[AreaIndex];
        public Vec2 Sight => new Vec2(Player.x, Player.y + T.sightDistance);

        public readonly List<AirEnemy> Air = new List<AirEnemy>();
        public readonly List<GroundObj> Ground = new List<GroundObj>();
        public readonly List<Fortress> Forts = new List<Fortress>();
        public readonly List<Shot> Shots = new List<Shot>();
        public readonly List<Bomb> Bombs = new List<Bomb>();
        public readonly List<Bullet> Bullets = new List<Bullet>();
        public readonly List<SimEvent> Events = new List<SimEvent>();

        readonly HashSet<long> claimed = new HashSet<long>();
        readonly List<(SpawnEvent ev, int i, float due)> pendingAir = new List<(SpawnEvent, int, float)>();
        int eventCursor, uidSeq = 1;
        bool prevGround;
        float bombBuffer;
        Rng rng;
        readonly uint seed;

        public float Dt => 1f / T.fixedHz;

        public Sim(Tuning t, List<AreaData> areas, Difficulty diff, AssistSettings assist, int startArea = 0, uint seed = 12345)
        {
            T = t; Areas = areas; Diff = diff; Assist = assist ?? new AssistSettings(); this.seed = seed;
            Lives = t.StartLives(diff);
            NextExtend = t.extendFirst;
            AreaIndex = Math.Max(0, Math.Min(areas.Count - 1, startArea));
            Player = new Vec2(t.fieldW / 2, 40);
            rng = new Rng(seed);
            StartArea(false);
        }

        long Key(int id, int sub = 0) => ((long)Loop << 32) | ((long)AreaIndex << 20) | ((long)sub << 16) | (uint)id;
        public bool IsClaimed(int id, int sub = 0) => claimed.Contains(Key(id, sub));

        void Emit(EvType ty, float x, float y, int v = 0, SpawnKind k = SpawnKind.Dart, int uid = 0) => Events.Add(new SimEvent { type = ty, x = x, y = y, value = v, kind = k, uid = uid });

        void AddScore(int pts, float x, float y)
        {
            if (pts <= 0) return;
            Score += pts;
            Emit(EvType.Score, x, y, pts);
            while (Score >= NextExtend)
            {
                Lives++; Emit(EvType.Extend, Player.x, Player.y, Lives);
                NextExtend += T.extendEvery;
            }
        }

        void StartArea(bool respawn)
        {
            Scroll = 0; eventCursor = 0; ScrollMul = 1f;
            Air.Clear(); Ground.Clear(); Forts.Clear(); Shots.Clear(); Bombs.Clear(); Bullets.Clear(); pendingAir.Clear();
            rng = new Rng(seed ^ (uint)(AreaIndex * 2654435761u) ^ (uint)(Loop * 40503));  // エリア開始ごとに同じ列（復帰でも同じ攻撃）
            Player = new Vec2(T.fieldW / 2, 40);
            AirCooldown = GroundCooldown = 0; bombBuffer = 0;
            State = SimState.Playing;
            if (respawn) { Invuln = T.respawnInvuln; Emit(EvType.Respawn, Player.x, Player.y, Lives); }
            Emit(EvType.AreaStart, 0, 0, AreaIndex);
        }

        public void Step(InputFrame inp)
        {
            Events.Clear();
            Frame++;
            float dt = Dt;
            if (State == SimState.GameOver) return;
            if (State == SimState.Dying)
            {
                DyingT -= dt;
                // 戦闘進行は止める（弾・敵・スクロールは停止）
                if (DyingT <= 0)
                {
                    if (Lives <= 0) { State = SimState.GameOver; Emit(EvType.GameOver, Player.x, Player.y, Score); }
                    else StartArea(true);
                }
                return;
            }

            // ---- スクロールと出現 ----
            ScrollMul = Geo.Approach(ScrollMul, TargetScrollMul(), dt * 0.8f);
            Scroll += T.scrollSpeed * ScrollMul * dt;
            SpawnDue();

            // ---- 自機 ----
            Vec2 mv = new Vec2(inp.mx, inp.my);
            if (mv.SqrLength > 1f) mv = mv.Normalized;       // 斜めでも速くならない
            Player.x = Geo.Clamp(Player.x + mv.x * T.playerSpeed * dt, T.playerMarginX, T.fieldW - T.playerMarginX);
            Player.y = Geo.Clamp(Player.y + mv.y * T.playerSpeed * dt, T.playerMinY, T.playerMaxY);
            if (Invuln > 0) Invuln -= dt;

            // ---- 対空 ----
            AirCooldown -= dt;
            bool wantAir = inp.air || Assist.autoAir;
            if (wantAir && AirCooldown <= 0 && Shots.Count < T.airShotMaxAlive)
            {
                var p = new Vec2(Player.x, Player.y + 8);
                Shots.Add(new Shot { pos = p, prev = p });
                AirCooldown = T.airInterval;
                Emit(EvType.AirFire, p.x, p.y);
            }
            // ---- 対地 ----
            GroundCooldown -= dt;
            bool pressed = inp.ground && !prevGround;
            prevGround = inp.ground;
            if (pressed) bombBuffer = 0.12f; else bombBuffer -= dt;
            bool wantBomb = bombBuffer > 0 || (Assist.holdAutoBomb && inp.ground);
            if (wantBomb && GroundCooldown <= 0)
            {
                var s = Sight;
                // 着弾地点はこの時点の地表座標で確定する（以後の自機移動に追従しない）
                Bombs.Add(new Bomb { start = new Vec2(Player.x, Player.y + 4), tx = s.x, tworldY = s.y + Scroll, uid = uidSeq++ });
                GroundCooldown = T.groundCooldown; bombBuffer = 0;
                Emit(EvType.GroundFire, Player.x, Player.y);
            }

            UpdateShots(dt);
            UpdateBombs(dt);
            UpdateAir(dt);
            UpdateGround(dt);
            UpdateForts(dt);
            UpdateBullets(dt);
            UpdateSight();
            CheckPlayerHits();

            // ---- エリア終了（雑魚の全滅は不要） ----
            if (State == SimState.Playing && Scroll >= T.areaLength) AdvanceArea();
        }

        float TargetScrollMul()
        {
            foreach (var f in Forts) if (f.phase == 1 && !f.destroyed) return 0.25f;
            return 1f;
        }

        void AdvanceArea()
        {
            float len = T.areaLength;
            // 地上物は次エリアへ座標を引き継ぐ（地表が連続しているため）
            foreach (var g in Ground) g.worldY -= len;
            foreach (var f in Forts) f.worldY -= len;
            foreach (var b in Bombs) b.tworldY -= len;
            Scroll -= len;
            AreaIndex++;
            if (AreaIndex >= Areas.Count)
            {
                AreaIndex = 0; Loop++;
                Emit(EvType.LoopComplete, 0, 0, Loop);
            }
            eventCursor = 0; pendingAir.Clear();
            // 前エリアの残存地上物は ID が新エリアと衝突しないよう報酬を無効化
            foreach (var g in Ground) g.rewardId = -1;
            Emit(EvType.AreaStart, 0, 0, AreaIndex);
        }

        // ---------- 出現 ----------
        void SpawnDue()
        {
            var evs = Area.events;
            while (eventCursor < evs.Count)
            {
                var e = evs[eventCursor];
                float trigger = e.IsGround ? e.at - T.fieldH - 24 : (e.kind == SpawnKind.Fortress ? e.at - 110 : e.at);
                if (Scroll < trigger) break;
                eventCursor++;
                if (e.kind == SpawnKind.Fortress) { SpawnFortress(e); continue; }
                if (e.IsGround) { SpawnGround(e); continue; }
                for (int i = 0; i < Math.Max(1, e.count); i++)
                {
                    float delay = (e.kind == SpawnKind.Arc || e.kind == SpawnKind.Seeker || e.kind == SpawnKind.Crosser) ? i * e.spacing : 0;
                    pendingAir.Add((e, i, Frame * Dt + delay));
                }
            }
            float now = Frame * Dt;
            for (int k = pendingAir.Count - 1; k >= 0; k--)
                if (pendingAir[k].due <= now) { SpawnAir(pendingAir[k].ev, pendingAir[k].i); pendingAir.RemoveAt(k); }
        }

        void SpawnAir(SpawnEvent e, int i)
        {
            var a = new AirEnemy { uid = uidSeq++, kind = e.kind, hp = 1, radius = 6, idx = i, dir = e.param == 0 ? 1 : e.param, fireT = 0.8f + rng.Range(0, 0.6f) };
            float top = T.fieldH + 12;
            switch (e.kind)
            {
                case SpawnKind.Dart:
                    a.pos = new Vec2(Geo.Clamp(e.x + (i - (e.count - 1) / 2f) * e.spacing, 12, T.fieldW - 12), top); a.vel = new Vec2(0, -78); break;
                case SpawnKind.Arc:
                    a.pos = new Vec2(e.x, top); a.heading = -(float)Math.PI / 2; break;
                case SpawnKind.Seeker:
                    a.pos = new Vec2(Geo.Clamp(Player.x + rng.Range(-40, 40), 16, T.fieldW - 16), top); a.heading = -(float)Math.PI / 2; break;
                case SpawnKind.Crosser:
                    a.pos = new Vec2(a.dir > 0 ? -12 : T.fieldW + 12, e.x); a.vel = new Vec2(a.dir * 104, -12); break;
                case SpawnKind.Sniper:
                    a.pos = new Vec2(Geo.Clamp(e.x + i * e.spacing - (e.count - 1) * e.spacing / 2, 20, T.fieldW - 20), top); a.vel = new Vec2(0, -90); break;
                case SpawnKind.Heavy:
                    a.pos = new Vec2(e.x, top + 6); a.vel = new Vec2(0, -34); a.hp = 5; a.radius = 9; break;
                case SpawnKind.Shard:
                    a.pos = new Vec2(Geo.Clamp(e.x + i * e.spacing, 10, T.fieldW - 10), top); a.vel = new Vec2(0, -48); a.radius = 7; a.hp = int.MaxValue; break;
            }
            Air.Add(a);
        }

        void SpawnGround(SpawnEvent e)
        {
            if (IsClaimed(e.id)) return;                      // 破壊・取得済みの固定対象は復帰後も再出現しない
            var g = new GroundObj { uid = uidSeq++, rewardId = e.id, kind = e.kind, x = e.x, worldY = e.at, hp = 1, radius = 7, fireT = 1.2f + (e.id % 7) * 0.23f };
            switch (e.kind)
            {
                case SpawnKind.Tank: g.vx = (e.id % 2 == 0 ? 1 : -1) * 0; g.radius = 6; break;
                case SpawnKind.Bunker: g.hp = 2; g.radius = 9; break;
                case SpawnKind.Radar: g.radius = 7; break;
                case SpawnKind.Obelisk: g.state = IsClaimed(e.id, 1) ? GroundState.Visible : GroundState.Hidden; g.hp = 2; g.radius = 7; break;
                case SpawnKind.Banner: g.state = IsClaimed(e.id, 1) ? GroundState.Visible : GroundState.Hidden; g.radius = 9; break;
            }
            Ground.Add(g);
        }

        void SpawnFortress(SpawnEvent e)
        {
            if (IsClaimed(e.id)) return;
            Emit(EvType.FortressWarn, T.fieldW / 2, T.fieldH, e.param);
            var f = new Fortress { uid = uidSeq++, rewardId = e.id, x = e.x, worldY = Scroll + T.fieldH + 86 };
            int n = Math.Max(2, e.param);
            for (int i = 0; i < n; i++)
            {
                double a = Math.PI * 2 * i / n + Math.PI / n;
                var off = new Vec2((float)Math.Cos(a) * 40, (float)Math.Sin(a) * 30);
                var p = new GroundObj { uid = uidSeq++, rewardId = -1, kind = SpawnKind.FortTurret, fortress = f, offset = off, hp = 1, radius = 7, fireT = 1.0f + i * 0.31f };
                f.parts.Add(p); Ground.Add(p);
            }
            f.core = new GroundObj { uid = uidSeq++, rewardId = -1, kind = SpawnKind.FortCore, fortress = f, offset = new Vec2(0, 0), hp = 1, radius = 9, fireT = 2f };
            Ground.Add(f.core);
            Forts.Add(f);
            SyncFort(f);
        }

        void SyncFort(Fortress f)
        {
            foreach (var p in f.parts) { p.x = f.x + p.offset.x; p.worldY = f.worldY + p.offset.y; }
            f.core.x = f.x; f.core.worldY = f.worldY;
        }

        // ---------- 更新 ----------
        void UpdateShots(float dt)
        {
            foreach (var s in Shots)
            {
                s.prev = s.pos; s.pos.y += T.airShotSpeed * dt;
                if (s.pos.y > T.fieldH + 8) { s.alive = false; continue; }
                // 掃引判定：前フレーム位置→現位置の線分で判定（すり抜け防止）
                AirEnemy best = null; float bestY = float.MaxValue;
                foreach (var a in Air)
                {
                    if (!a.alive) continue;
                    if (Geo.SegmentCircle(s.prev, s.pos, a.pos, a.radius + T.airShotRadius) && a.pos.y < bestY) { best = a; bestY = a.pos.y; }
                }
                if (best == null) continue;
                s.alive = false;
                if (best.kind == SpawnKind.Shard) { Emit(EvType.ShardBlock, best.pos.x, best.pos.y, 0, best.kind, best.uid); continue; }
                best.hp--;
                if (best.hp > 0) { Emit(EvType.HeavyHit, best.pos.x, best.pos.y, best.hp, best.kind, best.uid); continue; }
                best.alive = false;
                Emit(EvType.AirKill, best.pos.x, best.pos.y, 0, best.kind, best.uid);
                AddScore(best.kind == SpawnKind.Heavy ? T.ptHeavyAir : T.ptSmallAir, best.pos.x, best.pos.y);
            }
            Shots.RemoveAll(s => !s.alive);
        }

        public Vec2 BombScreenPos(Bomb b)
        {
            float k = Math.Min(1f, b.t / T.bombFlight);
            var target = new Vec2(b.tx, b.tworldY - Scroll);
            return b.start + (target - b.start) * k;
        }

        void UpdateBombs(float dt)
        {
            foreach (var b in Bombs)
            {
                b.t += dt;
                if (b.t < T.bombFlight) continue;
                b.alive = false;
                float sy = b.tworldY - Scroll;
                Emit(EvType.BombLand, b.tx, sy, 0, SpawnKind.Dart, b.uid);
                ResolveBomb(b.tx, b.tworldY);
            }
            Bombs.RemoveAll(b => !b.alive);
        }

        void ResolveBomb(float x, float wy)
        {
            var tgt = new Vec2(x, wy);
            // 隠し対象は「出現前」でも照準位置への爆撃で作用する。空中敵には作用しない。
            foreach (var g in Ground)
            {
                if (g.state == GroundState.Destroyed) continue;
                var gp = new Vec2(g.x, g.worldY);
                float sy = g.worldY - Scroll;
                bool hit = Geo.CircleCircle(tgt, T.bombRadius, gp, g.radius * 0.5f);
                if (!hit) continue;
                switch (g.kind)
                {
                    case SpawnKind.Obelisk:
                        if (g.state == GroundState.Hidden)
                        {
                            g.state = GroundState.Visible;
                            Emit(EvType.ObeliskReveal, g.x, sy, 0, g.kind, g.uid);
                            if (g.rewardId > 0 && !IsClaimed(g.rewardId, 1)) { claimed.Add(Key(g.rewardId, 1)); AddScore(T.ptObeliskReveal, g.x, sy); }
                        }
                        else
                        {
                            g.hp--; g.hitFlash = 0.15f;
                            if (g.hp > 0) { Emit(EvType.ObeliskHit, g.x, sy, g.hp, g.kind, g.uid); break; }
                            g.state = GroundState.Destroyed;
                            Emit(EvType.ObeliskBreak, g.x, sy, 0, g.kind, g.uid);
                            if (g.rewardId > 0 && !IsClaimed(g.rewardId)) { claimed.Add(Key(g.rewardId)); AddScore(T.ptObeliskBreak, g.x, sy); }
                        }
                        break;
                    case SpawnKind.Banner:
                        if (g.state == GroundState.Hidden)
                        {
                            g.state = GroundState.Visible;
                            if (g.rewardId > 0) claimed.Add(Key(g.rewardId, 1));
                            Emit(EvType.BannerReveal, g.x, sy, 0, g.kind, g.uid);
                        }
                        break;   // 旗は爆撃では壊れない（回収対象）
                    case SpawnKind.FortCore:
                        var f = g.fortress;
                        if (f.destroyed) break;
                        if (!f.coreOpen) { Emit(EvType.CoreClang, g.x, sy, 0, g.kind, g.uid); break; }
                        DestroyFortress(f);
                        break;
                    case SpawnKind.FortTurret:
                        g.state = GroundState.Destroyed;
                        Emit(EvType.FortTurretKill, g.x, sy, 0, g.kind, g.uid);
                        AddScore(T.ptFortTurret, g.x, sy);
                        break;
                    default:
                        g.hp--; g.hitFlash = 0.15f;
                        if (g.hp > 0) { Emit(EvType.HeavyHit, g.x, sy, g.hp, g.kind, g.uid); break; }
                        g.state = GroundState.Destroyed;
                        Emit(EvType.GroundKill, g.x, sy, 0, g.kind, g.uid);
                        int pts = g.kind == SpawnKind.Turret ? T.ptTurret : g.kind == SpawnKind.Bunker ? T.ptHardGround : g.kind == SpawnKind.Tank ? T.ptTank : T.ptRadar;
                        if (g.rewardId > 0 && !IsClaimed(g.rewardId)) { claimed.Add(Key(g.rewardId)); AddScore(pts, g.x, sy); }
                        else if (g.rewardId < 0) AddScore(pts, g.x, sy);
                        break;
                }
            }
        }

        void DestroyFortress(Fortress f)
        {
            f.destroyed = true;
            float sy = f.worldY - Scroll;
            foreach (var p in f.parts) if (p.state != GroundState.Destroyed) p.state = GroundState.Destroyed;
            f.core.state = GroundState.Destroyed;
            claimed.Add(Key(f.rewardId));
            Bullets.Clear();   // 撃破時は敵弾を消して安全にする
            Emit(EvType.FortressDestroyed, f.x, sy, T.ptCore, SpawnKind.Fortress, f.uid);
            AddScore(T.ptCore, f.x, sy);
        }

        bool CanFireFrom(Vec2 p)
        {
            if (p.x < 6 || p.x > T.fieldW - 6 || p.y < 24 || p.y > T.fieldH - 10) return false;  // 画面外・端からは撃たない
            return Vec2.Dist(p, Player) > T.noFireNearPlayer;
        }

        void FireAimed(Vec2 from, float spreadDeg = 0, int ways = 1, float speedMul = 1f)
        {
            Vec2 d = (Player - from).Normalized; if (d.SqrLength < 0.5f) d = new Vec2(0, -1);
            float baseA = (float)Math.Atan2(d.y, d.x);
            float sp = T.enemyBulletSpeed * BulletMul * speedMul;
            for (int i = 0; i < ways; i++)
            {
                float a = baseA + (float)((i - (ways - 1) / 2f) * spreadDeg * Math.PI / 180);
                Bullets.Add(new Bullet { pos = from, vel = new Vec2((float)Math.Cos(a) * sp, (float)Math.Sin(a) * sp), uid = uidSeq++ });
            }
            Emit(EvType.EnemyFire, from.x, from.y, ways);
        }

        /// <summary>予兆つき射撃：fireT が尽きたら tele 秒点滅してから撃つ。撃てない位置なら保留。</summary>
        bool TeleFire(ref float fireT, ref float tele, Vec2 at, float interval)
        {
            if (tele > 0)
            {
                tele -= Dt;
                if (tele <= 0) { fireT = interval; return CanFireFrom(at); }
                return false;
            }
            fireT -= Dt;
            if (fireT <= 0 && CanFireFrom(at)) { tele = T.telegraph; Emit(EvType.Telegraph, at.x, at.y); }
            else if (fireT <= 0) fireT = 0.2f;
            return false;
        }

        void UpdateAir(float dt)
        {
            foreach (var a in Air)
            {
                if (!a.alive) continue;
                a.t += dt; a.spin += dt * (a.kind == SpawnKind.Shard ? 3.2f : 1f);
                switch (a.kind)
                {
                    case SpawnKind.Dart:
                        if (a.pos.y < 210) a.vel.x = Geo.Approach(a.vel.x, Math.Sign(Player.x - a.pos.x) * 22, dt * 40);
                        break;
                    case SpawnKind.Arc:
                        {
                            float sp = 96;
                            if (a.phase == 0 && a.pos.y < 168) a.phase = 1;
                            if (a.phase == 1)
                            {
                                a.heading += a.dir * 2.5f * dt;
                                if (Math.Abs(a.heading - (-(float)Math.PI / 2)) >= (float)Math.PI) a.phase = 2;
                            }
                            a.vel = new Vec2((float)Math.Cos(a.heading) * sp, (float)Math.Sin(a.heading) * sp);
                            if (a.phase == 1 && Math.Abs(a.t - 1.6f) < dt * 0.5f && TeleFireOnce(a)) { }
                        }
                        break;
                    case SpawnKind.Seeker:
                        {
                            float sp = 88 + a.t * 26;
                            if (a.t < 1.7f)
                            {
                                Vec2 to = (Player - a.pos);
                                float want = (float)Math.Atan2(to.y, to.x);
                                float diff = WrapPi(want - a.heading);
                                a.heading += Geo.Clamp(diff, -2.2f * dt, 2.2f * dt);
                            }
                            a.vel = new Vec2((float)Math.Cos(a.heading) * sp, (float)Math.Sin(a.heading) * sp);
                        }
                        break;
                    case SpawnKind.Crosser:
                        if (a.phase == 0 && Math.Abs(a.pos.x - T.fieldW / 2) < 30) { a.phase = 1; a.fireT = 0; }
                        if (a.phase == 1 && TeleFire(ref a.fireT, ref a.tele, a.pos, 99f)) { FireAimed(a.pos); a.phase = 2; }
                        break;
                    case SpawnKind.Sniper:
                        if (a.phase == 0) { a.vel.y = Geo.Approach(a.vel.y, a.pos.y > 214 ? -90 : 0, dt * 180); if (a.vel.y == 0) { a.phase = 1; a.fireT = 0.2f; } }
                        else if (a.phase == 1) { if (TeleFire(ref a.fireT, ref a.tele, a.pos, 99f)) { FireAimed(a.pos, 16, 3); a.phase = 2; a.t = 0; } }
                        else if (a.phase == 2 && a.t > 0.6f) { a.vel.y = Geo.Approach(a.vel.y, 170, dt * 260); }  // 離脱
                        break;
                    case SpawnKind.Heavy:
                        if (a.phase == 0 && a.pos.y < 224) { a.phase = 1; a.t = 0; a.vel = new Vec2(0, 0); }
                        if (a.phase == 1)
                        {
                            a.vel.x = (float)Math.Sin(a.t * 1.3) * 26;
                            if (TeleFire(ref a.fireT, ref a.tele, a.pos, 1.3f)) FireAimed(a.pos, 0, 1, 1.1f);
                            if (a.t > 5f) { a.phase = 2; a.vel = new Vec2(0, -46); }
                        }
                        break;
                }
                a.pos = a.pos + a.vel * dt;
                if (a.pos.y < -24 || a.pos.y > T.fieldH + 40 || a.pos.x < -30 || a.pos.x > T.fieldW + 30) a.alive = false;
            }
            Air.RemoveAll(a => !a.alive);
        }

        bool TeleFireOnce(AirEnemy a) { if (CanFireFrom(a.pos) && rng.Chance(0.35f)) { FireAimed(a.pos); return true; } return false; }

        static float WrapPi(float a) { while (a > Math.PI) a -= (float)(Math.PI * 2); while (a < -Math.PI) a += (float)(Math.PI * 2); return a; }

        void UpdateGround(float dt)
        {
            foreach (var g in Ground)
            {
                if (g.hitFlash > 0) g.hitFlash -= dt;
                if (g.state != GroundState.Visible) continue;
                if (g.fortress != null) continue;               // 要塞の部位は UpdateForts で扱う
                float sy = g.worldY - Scroll;
                var sp = new Vec2(g.x, sy);
                switch (g.kind)
                {
                    case SpawnKind.Turret:
                        if (TeleFire(ref g.fireT, ref g.tele, sp, 2.3f)) FireAimed(sp);
                        break;
                    case SpawnKind.Bunker:
                        if (TeleFire(ref g.fireT, ref g.tele, sp, 2.9f)) FireAimed(sp, 22, 2);
                        break;
                    case SpawnKind.Tank:
                        {
                            if (g.vx == 0) g.vx = (g.uid % 2 == 0) ? 12 : -12;
                            float nx = g.x + g.vx * dt;
                            var tl = Area.TileAtWorld(nx + Math.Sign(g.vx) * 5, g.worldY);
                            if (tl != Tile.Road && tl != Tile.Bridge && tl != Tile.Base) g.vx = -g.vx; else g.x = nx;
                            if (TeleFire(ref g.fireT, ref g.tele, sp, 3.1f)) FireAimed(sp);
                        }
                        break;
                    case SpawnKind.Banner:
                        if (Vec2.Dist(sp, Player) < g.radius + 4)
                        {
                            g.state = GroundState.Destroyed;
                            if (g.rewardId > 0 && !IsClaimed(g.rewardId)) { claimed.Add(Key(g.rewardId)); Lives++; Emit(EvType.BannerGet, g.x, sy, Lives); }
                        }
                        break;
                }
            }
            Ground.RemoveAll(g => (g.worldY - Scroll) < -40 && g.fortress == null);
        }

        void UpdateForts(float dt)
        {
            foreach (var f in Forts)
            {
                f.t += dt;
                float sy = f.worldY - Scroll;
                if (f.destroyed) continue;
                if (f.phase == 0 && sy < 206) { f.phase = 1; f.t = 0; Emit(EvType.FortressArrive, f.x, sy); }
                if (f.phase == 1 && f.t > 16f) { f.phase = 2; Emit(EvType.FortressLeave, f.x, sy); }
                // コアの開閉（開いている間だけ爆撃が有効。開く直前に予兆音）
                f.coreCycle += dt;
                bool open = f.phase == 1 && (f.coreCycle % 3.0f) > 1.4f;
                if (open && !f.coreOpen) Emit(EvType.CoreOpen, f.x, sy);
                f.coreOpen = open;
                SyncFort(f);
                if (f.phase != 1) continue;
                foreach (var p in f.parts)
                {
                    if (p.state != GroundState.Visible) continue;
                    var pp = new Vec2(p.x, p.worldY - Scroll);
                    if (TeleFire(ref p.fireT, ref p.tele, pp, 1.9f)) FireAimed(pp);
                }
                if (f.coreOpen)
                {
                    var cp = new Vec2(f.x, sy);
                    if (TeleFire(ref f.core.fireT, ref f.core.tele, cp, 2.6f)) FireAimed(cp, 20, 5, 0.75f);
                }
            }
            foreach (var f in Forts)
            {
                if (!f.left && (f.worldY - Scroll) < -90)
                {
                    f.left = true;
                    foreach (var p in f.parts) Ground.Remove(p);
                    Ground.Remove(f.core);
                }
            }
            Forts.RemoveAll(f => f.left);
        }

        void UpdateBullets(float dt)
        {
            foreach (var b in Bullets)
            {
                b.pos = b.pos + b.vel * dt;
                if (b.pos.y < -10 || b.pos.y > T.fieldH + 10 || b.pos.x < -10 || b.pos.x > T.fieldW + 10) b.alive = false;
            }
            Bullets.RemoveAll(b => !b.alive);
        }

        void UpdateSight()
        {
            var s = Sight; float wy = s.y + Scroll;
            bool hint = false, lk = false;
            foreach (var g in Ground)
            {
                if (g.state == GroundState.Destroyed) continue;
                float d = Vec2.Dist(new Vec2(g.x, g.worldY), new Vec2(s.x, wy));
                if (g.state == GroundState.Hidden) { if (g.kind == SpawnKind.Obelisk && d < T.hintRadius) hint = true; }
                else if (d < T.bombRadius + g.radius * 0.5f && g.kind != SpawnKind.Banner) lk = true;
            }
            SightHint = hint; SightLock = lk;
        }

        void CheckPlayerHits()
        {
            if (Invuln > 0 || State != SimState.Playing) return;
            bool hit = false; Vec2 at = Player;
            foreach (var b in Bullets) if (Geo.CircleCircle(b.pos, T.enemyBulletRadius, Player, T.playerHitRadius)) { hit = true; break; }
            if (!hit) foreach (var a in Air) if (a.alive && Geo.CircleCircle(a.pos, a.radius * 0.8f, Player, T.playerHitRadius)) { hit = true; break; }
            if (!hit) return;
            // 1 回の被弾で 1 機だけ減らす（状態を Dying に移し、以後の判定を止める）
            Lives--;
            State = SimState.Dying; DyingT = T.deathFreeze;
            Emit(EvType.PlayerHit, at.x, at.y, Lives);
        }

        /// <summary>進行比較用のハッシュ（同じ入力列とシードなら一致する）。</summary>
        public ulong StateHash()
        {
            ulong h = 1469598103934665603UL;
            void Mix(float v) { h ^= (ulong)BitConverter.SingleToInt32Bits(v) & 0xFFFFFFFFUL; h *= 1099511628211UL; }
            Mix(Player.x); Mix(Player.y); Mix(Scroll); Mix(Score); Mix(Lives); Mix(AreaIndex); Mix(Loop);
            foreach (var a in Air) { Mix(a.pos.x); Mix(a.pos.y); }
            foreach (var b in Bullets) { Mix(b.pos.x); Mix(b.pos.y); }
            foreach (var g in Ground) { Mix(g.x); Mix((int)g.state); }
            return h;
        }
    }
}
