// 地表テクスチャを高さ 120 の帯（チャンク）に分けて描き、使い回す。2D と 3D で共通。
// エリア長 3240 は 120 の倍数（27 帯）なので、エリアが切り替わっても前エリアの末尾の帯をそのまま次エリアの先頭として使える。
using System.Collections.Generic;
using SkywardRuins.Core;
using UnityEngine;

namespace SkywardRuins
{
    public class TerrainChunks
    {
        public const int ChunkH = 120;
        public class Chunk { public int k; public Texture2D tex; public bool ready; public int areaIdx; }
        readonly List<AreaData> areas; readonly int width;
        readonly Dictionary<int, Chunk> live = new Dictionary<int, Chunk>();
        readonly Stack<Chunk> pool = new Stack<Chunk>();
        int areaIdx = -1, bodyChunks;
        readonly bool mips;

        public TerrainChunks(List<AreaData> areas, float areaLength, bool mipmaps)
        {
            this.areas = areas; width = areas[0].cols * 8; mips = mipmaps;
            bodyChunks = Mathf.RoundToInt(areaLength / ChunkH);
            if (Mathf.Abs(bodyChunks * ChunkH - areaLength) > 0.01f) Debug.LogWarning("[Terrain] エリア長がチャンク高の倍数ではありません");
        }

        /// <summary>現在のエリアとスクロール位置から、見えている帯 [from, to] を用意して返す。1 フレームに描くのは最大 budget 本。</summary>
        public IEnumerable<Chunk> Visible(int area, float scroll, float viewH, int budget = 1)
        {
            if (area != areaIdx)
            {
                // 前エリアからの続き：帯番号を付け替える（同じ画素なので描き直さない）
                var moved = new Dictionary<int, Chunk>();
                foreach (var kv in live)
                {
                    int nk = (areaIdx >= 0 && (areaIdx + 1) % areas.Count == area) ? kv.Key - bodyChunks : int.MinValue;
                    if (nk >= -1) { kv.Value.k = nk; kv.Value.areaIdx = area; moved[nk] = kv.Value; } else pool.Push(kv.Value);
                }
                live.Clear(); foreach (var kv in moved) live[kv.Key] = kv.Value;
                areaIdx = area;
            }
            int from = Mathf.FloorToInt(scroll / ChunkH), to = Mathf.FloorToInt((scroll + viewH) / ChunkH);
            // 範囲外を回収
            var drop = new List<int>(); foreach (var k in live.Keys) if (k < from - 1 || k > to + 1) drop.Add(k);
            foreach (var k in drop) { pool.Push(live[k]); live.Remove(k); }
            for (int k = from; k <= to + 1; k++)
            {
                if (!live.TryGetValue(k, out var c))
                {
                    c = pool.Count > 0 ? pool.Pop() : new Chunk();
                    c.k = k; c.ready = false; c.areaIdx = area; live[k] = c;
                }
                // 見えている帯は必ず描く。先読みの帯（to+1）は予算内で描く
                if (!c.ready && (k <= to || budget > 0)) { Paint(c); if (k > to) budget--; }
            }
            for (int k = from; k <= to; k++) yield return live[k];
        }

        void Paint(Chunk c)
        {
            var a = areas[c.areaIdx]; var next = areas[(c.areaIdx + 1) % areas.Count];
            int wy0 = c.k * ChunkH;
            byte[] px;
            if (wy0 < 0) px = TerrainPainter.Paint(areas[(c.areaIdx + areas.Count - 1) % areas.Count], wy0 + bodyChunks * ChunkH, ChunkH, a);
            else px = TerrainPainter.Paint(a, wy0, ChunkH, next);
            if (c.tex == null)
            {
                c.tex = new Texture2D(width, ChunkH, TextureFormat.RGBA32, mips, false) { filterMode = FilterMode.Point, wrapMode = TextureWrapMode.Clamp, name = "TerrainChunk" };
            }
            c.tex.SetPixelData(px, 0);
            c.tex.Apply(mips, false);
            c.ready = true;
        }

        public void Dispose()
        {
            foreach (var c in live.Values) if (c.tex) Object.Destroy(c.tex);
            foreach (var c in pool) if (c.tex) Object.Destroy(c.tex);
            live.Clear(); pool.Clear();
        }

        /// <summary>森タイルの位置（3D の木を立てる）。帯 k の中の (x, worldY) を返す。</summary>
        public static IEnumerable<Vector3> Props(AreaData a, AreaData next, int k, int bodyChunks)
        {
            int r0 = k * ChunkH / 8, r1 = (k + 1) * ChunkH / 8;
            int bodyRows = bodyChunks * ChunkH / 8;
            for (int r = r0; r < r1; r++)
                for (int c = 0; c < a.cols; c++)
                {
                    Tile t = r >= bodyRows ? next.TileAt(c, r - bodyRows) : a.TileAt(c, r);
                    uint h = (uint)(c * 73856093) ^ (uint)(r * 19349663) ^ (uint)(a.index * 83492791);
                    h ^= h >> 13; h *= 0x5bd1e995; h ^= h >> 15;
                    float jx = (h & 255) / 255f * 5 - 2.5f, jy = ((h >> 8) & 255) / 255f * 5 - 2.5f, s = 0.8f + ((h >> 16) & 255) / 255f * 0.5f;
                    if (t == Tile.Forest && (h >> 24) % 3 != 0) yield return new Vector3(c * 8 + 4 + jx, s, r * 8 + 4 + jy);          // 木（y = 大きさ）
                    else if (t == Tile.Rock) yield return new Vector3(c * 8 + 4, -s, r * 8 + 4);                                       // 岩（y < 0）
                    else if (t == Tile.Base && (c % 3 == 1) && (r % 4 == 1) && (h >> 24) % 2 == 0) yield return new Vector3(c * 8 + 4, 10 + s, r * 8 + 4);  // 建物（y >= 10）
                }
        }
    }
}
