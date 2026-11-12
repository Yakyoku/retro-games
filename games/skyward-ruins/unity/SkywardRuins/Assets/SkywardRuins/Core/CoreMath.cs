// Skyward Ruins — ゲーム論理の基礎型（UnityEngine に依存しない。2D/3D と .NET テストで共有）
using System;

namespace SkywardRuins.Core
{
    [Serializable]
    public struct Vec2
    {
        public float x, y;
        public Vec2(float x, float y) { this.x = x; this.y = y; }
        public static Vec2 operator +(Vec2 a, Vec2 b) => new Vec2(a.x + b.x, a.y + b.y);
        public static Vec2 operator -(Vec2 a, Vec2 b) => new Vec2(a.x - b.x, a.y - b.y);
        public static Vec2 operator *(Vec2 a, float s) => new Vec2(a.x * s, a.y * s);
        public float Length => (float)Math.Sqrt(x * x + y * y);
        public float SqrLength => x * x + y * y;
        public Vec2 Normalized { get { float l = Length; return l > 1e-6f ? new Vec2(x / l, y / l) : new Vec2(0, 0); } }
        public static float Dist(Vec2 a, Vec2 b) => (a - b).Length;
        public override string ToString() => $"({x:0.00},{y:0.00})";
    }

    /// <summary>シード管理された乱数（xorshift32）。同じシード・同じ呼び出し順で同じ列を返す。</summary>
    public sealed class Rng
    {
        uint s;
        public Rng(uint seed) { s = seed == 0 ? 0x9E3779B9u : seed; }
        public uint NextU() { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return s; }
        public float Next01() => (NextU() >> 8) * (1f / 16777216f);
        public float Range(float a, float b) => a + (b - a) * Next01();
        public int RangeInt(int a, int bExclusive) => a + (int)(NextU() % (uint)Math.Max(1, bExclusive - a));
        public bool Chance(float p) => Next01() < p;
        public uint State => s;
    }

    public static class Geo
    {
        /// <summary>線分 a→b と円（c, r）の交差。高速弾のすり抜け防止に使う（掃引判定）。</summary>
        public static bool SegmentCircle(Vec2 a, Vec2 b, Vec2 c, float r)
        {
            Vec2 d = b - a; Vec2 f = a - c;
            float dd = d.SqrLength;
            float t = dd > 1e-9f ? -(f.x * d.x + f.y * d.y) / dd : 0f;
            if (t < 0) t = 0; else if (t > 1) t = 1;
            Vec2 p = a + d * t;
            return (p - c).SqrLength <= r * r;
        }
        public static bool CircleCircle(Vec2 a, float ra, Vec2 b, float rb)
        {
            float r = ra + rb; return (a - b).SqrLength <= r * r;
        }
        public static float Clamp(float v, float lo, float hi) => v < lo ? lo : (v > hi ? hi : v);
        public static float Approach(float v, float target, float step)
        {
            if (v < target) return Math.Min(v + step, target);
            return Math.Max(v - step, target);
        }
    }
}
