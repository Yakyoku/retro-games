// 2D と 3D の描画が共通に持つ部分：状態の補間（固定 60Hz の論理を 72/90Hz 等の表示でも滑らかに見せる）、
// エフェクトの寿命管理、オベリスク出現アニメの時刻管理など。描画はルールを持たず Sim を読むだけ。
using System.Collections.Generic;
using SkywardRuins.Core;
using UnityEngine;

namespace SkywardRuins
{
    public abstract class GameViewBase : MonoBehaviour
    {
        protected GameDatabase db; protected Sim sim; protected Hud hud;
        protected float alpha;                 // 前回ステップ → 今回ステップの補間率
        protected float prevScroll, curScroll; protected int prevArea, curArea;
        protected Vector2 prevPlayer, curPlayer;
        readonly Dictionary<int, Vector2> prevPos = new Dictionary<int, Vector2>(), curPos = new Dictionary<int, Vector2>();
        protected readonly Dictionary<int, float> revealAt = new Dictionary<int, float>();   // オベリスク・旗の出現時刻
        protected float time;                  // 表示用の時計（一時停止中は止まる）
        public bool Attract;                   // タイトル背景用（HUD・音なし）

        public virtual void Setup(GameDatabase db, Hud hud) { this.db = db; this.hud = hud; }

        public virtual void Begin(Sim s)
        {
            sim = s; prevPos.Clear(); curPos.Clear(); revealAt.Clear();
            Capture(); Capture();
        }

        /// <summary>Sim.Step の直前に呼ぶ：今の状態を「前回」として保存する。</summary>
        public void Capture()
        {
            prevScroll = curScroll; prevArea = curArea; prevPlayer = curPlayer;
            prevPos.Clear(); foreach (var kv in curPos) prevPos[kv.Key] = kv.Value;
            curScroll = sim.Scroll; curArea = sim.AreaIndex; curPlayer = V(sim.Player);
            curPos.Clear();
            foreach (var a in sim.Air) curPos[a.uid] = V(a.pos);
            foreach (var b in sim.Bullets) curPos[b.uid] = V(b.pos);
        }
        public void AfterStep() { /* 後で拡張（ステップ後の記録） */ }

        static Vector2 V(Vec2 v) => new Vector2(v.x, v.y);

        protected float Scroll
        {
            get
            {
                if (prevArea != curArea) return curScroll;            // エリア切替の瞬間は補間しない
                return Mathf.Lerp(prevScroll, curScroll, alpha);
            }
        }
        protected Vector2 PlayerPos => Vector2.Lerp(prevPlayer, curPlayer, alpha);
        protected Vector2 Pos(int uid, Vec2 fallback)
        {
            var c = V(fallback);
            if (!curPos.TryGetValue(uid, out var cur)) return c;
            if (!prevPos.TryGetValue(uid, out var p)) return cur;
            return Vector2.Lerp(p, cur, alpha);
        }

        public void Render(float a, float dt) { alpha = Mathf.Clamp01(a); time += dt; Draw(dt); }
        protected abstract void Draw(float dt);
        public abstract void OnEvent(in SimEvent e);
        /// <summary>論理座標（画面 x,y と高さの層）→ 音の発音位置などに使うワールド座標。</summary>
        public abstract Vector3 WorldPos(float x, float y, bool air);
        /// <summary>論理座標 → HUD の GameRect 内の正規化座標（得点表示用）。</summary>
        public abstract Vector2 HudNorm(float x, float y, bool air);
        public abstract void Clear();

        protected void NoteReveal(int uid) { revealAt[uid] = time; }
        protected int ObeliskFrame(GroundObj g)
        {
            if (g.state == GroundState.Destroyed) return -1;
            if (revealAt.TryGetValue(g.uid, out var t0)) { int f = (int)((time - t0) / 0.08f); if (f < 5) return Mathf.Clamp(f, 0, 4); }
            return g.hp <= 1 ? 6 : 5;
        }
        protected static int FrameAt(SpriteSet s, float t) { if (s == null || s.frames.Length == 0) return 0; if (s.fps <= 0) return 0; return (int)(t * s.fps) % s.frames.Length; }

        protected static string SpriteName(SpawnKind k)
        {
            switch (k)
            {
                case SpawnKind.Dart: return "dart"; case SpawnKind.Arc: return "arc"; case SpawnKind.Seeker: return "seeker";
                case SpawnKind.Crosser: return "crosser"; case SpawnKind.Sniper: return "sniper"; case SpawnKind.Heavy: return "heavy"; case SpawnKind.Shard: return "shard";
                case SpawnKind.Turret: return "turret"; case SpawnKind.Tank: return "tank"; case SpawnKind.Bunker: return "bunker"; case SpawnKind.Radar: return "radar";
                case SpawnKind.Obelisk: return "obelisk"; case SpawnKind.Banner: return "banner"; case SpawnKind.FortTurret: return "fortturret"; case SpawnKind.FortCore: return "core";
            }
            return "dart";
        }
        protected static float AimAngle(Vector2 from, Vector2 to) => Mathf.Atan2(to.x - from.x, to.y - from.y) * Mathf.Rad2Deg;  // +y から時計回り（度）
    }
}
