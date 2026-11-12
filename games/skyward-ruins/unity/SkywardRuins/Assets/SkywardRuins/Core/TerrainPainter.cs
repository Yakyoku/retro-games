// 地表のドット絵を 1 論理単位 = 1 ピクセルで描く。2D の地面テクスチャと 3D 地形の色テクスチャの両方に使う。
// 森・草原・川・水面・砂地・道路・基地・地上絵・岩・橋を、隣接タイルを見て境界をなじませながら描く。
using System;

namespace SkywardRuins.Core
{
    public static class TerrainPainter
    {
        // パレット（4 系統。エリアの profile.palette で選ぶ）: grass, grassDark, forestDark, forest, forestLight, waterDeep, water, waterLight, sand, sandDark, road, roadLine, base, baseLine, glyph, rock
        static readonly uint[][] Pal =
        {
            new uint[]{0x4f8a3a,0x3f7430,0x1c3c1c,0x2c5a26,0x4a7e36,0x1c3e74,0x2a5a9a,0x6e9ccc,0xc8b878,0xa49460,0x6a6862,0xd8d4b0,0x9a9a92,0x72726c,0xf0e6c0,0x84807a},
            new uint[]{0x5a8a40,0x4a7634,0x223e20,0x34602a,0x50803a,0x203a68,0x30588e,0x7aa0c8,0xc0b07a,0x9a8a5c,0x5e5e5c,0xd0ccb0,0x8e9094,0x66686e,0xeae0c4,0x7a7a7c},
            new uint[]{0x8a9a4a,0x76863e,0x34441e,0x4a5e2a,0x6a7c38,0x24486e,0x34628e,0x82aac6,0xdcc888,0xb8a46a,0x7a7262,0xe6dcb6,0xa8a090,0x807868,0xfff2cc,0x968c7a},
            new uint[]{0x4e7a44,0x3e6638,0x1a3220,0x2a4a2c,0x426a3c,0x1e3460,0x2c4e84,0x6a8cbc,0xb4aa82,0x928862,0x5a5856,0xc8c4a8,0x86868a,0x5e5e64,0xe0d8c0,0x76747a},
        };

        static uint H(int x, int y, uint s)
        {
            uint h = (uint)(x * 374761393) ^ (uint)(y * 668265263) ^ (s * 2246822519u);
            h = (h ^ (h >> 13)) * 1274126177u; return h ^ (h >> 16);
        }
        static float H01(int x, int y, uint s) => (H(x, y, s) & 0xFFFF) / 65535f;

        static void Put(byte[] px, int i, uint rgb, float k = 1f)
        {
            int r = (int)((rgb >> 16) & 255), g = (int)((rgb >> 8) & 255), b = (int)(rgb & 255);
            px[i] = (byte)Math.Min(255, r * k); px[i + 1] = (byte)Math.Min(255, g * k); px[i + 2] = (byte)Math.Min(255, b * k); px[i + 3] = 255;
        }

        /// <summary>
        /// 地表の worldY0 から height 行ぶんを幅 cols*8 ピクセルで描く。出力は RGBA、行 0 が worldY0（下端）。
        /// Unity の Texture2D.SetPixelData は下の行から並ぶので、そのまま渡せる。
        /// </summary>
        public static byte[] Paint(AreaData a, int worldY0, int height, AreaData next = null)
        {
            int w = a.cols * 8;
            var px = new byte[w * height * 4];
            var pal = Pal[a.profile.palette % Pal.Length];
            uint seed = (uint)(a.index * 977 + 13);
            int areaRows = (int)Math.Ceiling(a.rows * 8f);
            for (int yy = 0; yy < height; yy++)
            {
                int wy = worldY0 + yy;
                for (int x = 0; x < w; x++)
                {
                    int i = (yy * w + x) * 4;
                    Tile t = NaturalTile(a, next, x, wy, seed);
                    int lx = x & 7, ly = wy & 7;
                    float n = H01(x, wy, seed);
                    switch (t)
                    {
                        case Tile.Grass:
                            {
                                // 草：2 色のまだら＋短い草の筋
                                float m = Smooth(x, wy, seed, 11f);
                                uint c = m > 0.55f ? pal[0] : pal[1];
                                if (n > 0.93f) c = pal[4];
                                uint fc = ForestPixel(a, next, x, wy, pal, seed, n, true);
                                if (fc != 0) c = fc;
                                Put(px, i, c, 0.96f + n * 0.08f);
                                break;
                            }
                        case Tile.Forest:
                    {
                        Put(px, i, ForestPixel(a, next, x, wy, pal, seed, n), 0.96f + n * 0.08f);
                        break;
                    }
                case Tile.Water:
                            {
                                // 水：岸からの距離で浅瀬→深みへ。ゆるい波紋の筋
                                int dist = LandDist(a, next, x, wy, 3);
                                uint c = dist <= 1 ? pal[7] : dist == 2 ? pal[6] : pal[5];
                                if (dist >= 2 && ((x + (wy >> 2) * 3) % 23 == 0) && ((wy & 3) == 0)) c = pal[7];
                                Put(px, i, c);
                                break;
                            }
                        case Tile.Sand:
                            {
                                uint c = n > 0.85f ? pal[9] : pal[8];
                                if (Smooth(x, wy, seed + 5, 7f) > 0.7f) c = pal[9];
                                Put(px, i, c, 0.97f + n * 0.05f);
                                break;
                            }
                        case Tile.Road:
                        case Tile.Bridge:
                            {
                                bool vertical = IsRoad(TileAt(a, next, x, wy + 8)) || IsRoad(TileAt(a, next, x, wy - 8));
                                bool horizontal = IsRoad(TileAt(a, next, x + 8, wy)) || IsRoad(TileAt(a, next, x - 8, wy));
                                uint c = pal[10];
                                if (t == Tile.Bridge) c = ((ly & 1) == 0) ? 0x8a6a44u : 0x6e5434u;
                                if (vertical && !horizontal && (lx == 0 || lx == 7)) c = t == Tile.Bridge ? 0x4a3a28u : pal[12];
                                if (horizontal && !vertical && (ly == 0 || ly == 7)) c = t == Tile.Bridge ? 0x4a3a28u : pal[12];
                                if (t == Tile.Road && vertical && !horizontal && (lx == 3 || lx == 4) && ((wy >> 2) & 1) == 0 && lx == 3) c = pal[11];
                                if (t == Tile.Road && horizontal && !vertical && ly == 3 && ((x >> 2) & 1) == 0) c = pal[11];
                                Put(px, i, c, 0.97f + n * 0.05f);
                                break;
                            }
                        case Tile.Base:
                            {
                                // 舗装：16px の板の継ぎ目、ところどころの通気口
                                uint c = pal[12];
                                if ((x & 15) == 0 || (wy & 15) == 0) c = pal[13];
                                if (((x >> 4) + (wy >> 4)) % 5 == 0 && lx >= 2 && lx <= 5 && ly >= 2 && ly <= 5) c = pal[13];
                                bool edge = TileAt(a, next, x - 1, wy) != Tile.Base || TileAt(a, next, x + 1, wy) != Tile.Base || TileAt(a, next, x, wy - 1) != Tile.Base || TileAt(a, next, x, wy + 1) != Tile.Base;
                                if (edge) c = 0xc8c4b4;
                                Put(px, i, c, 0.98f + n * 0.04f);
                                break;
                            }
                        case Tile.Glyph:
                            {
                                // 地上絵：砂地に描かれた白い線。タイル中央 4px を線にして、つながる方向へ伸ばす
                                uint c = pal[8];
                                bool core = lx >= 2 && lx <= 5 && ly >= 2 && ly <= 5;
                                bool l = TileAt(a, next, x - 8, wy) == Tile.Glyph && lx < 2 && ly >= 2 && ly <= 5;
                                bool r = TileAt(a, next, x + 8, wy) == Tile.Glyph && lx > 5 && ly >= 2 && ly <= 5;
                                bool u = TileAt(a, next, x, wy + 8) == Tile.Glyph && ly > 5 && lx >= 2 && lx <= 5;
                                bool dd = TileAt(a, next, x, wy - 8) == Tile.Glyph && ly < 2 && lx >= 2 && lx <= 5;
                                if (core || l || r || u || dd) c = (n > 0.2f) ? pal[14] : pal[8];
                                Put(px, i, c);
                                break;
                            }
                        case Tile.Rock:
                            {
                                float dx = lx - 3.5f, dy = ly - 3.5f;
                                uint c = pal[0];
                                if (dx * dx + dy * dy < 9) c = (dx < 0 && dy > 0) ? 0xb0aca4 : pal[15];
                                Put(px, i, c);
                                break;
                            }
                    }
                }
            }
            return px;
        }

        /// <summary>
        /// 樹冠：ずらした 7px 格子ごとに半径の違う丸い木を置き、左上を明るく、右下に影。
        /// overflowOnly のときは森の外（草原）にはみ出した樹冠だけを返し、無ければ 0。
        /// </summary>
        static uint ForestPixel(AreaData a, AreaData next, int x, int wy, uint[] pal, uint seed, float n, bool overflowOnly = false)
        {
            const int cell = 7;
            uint best = 0; float bestY = float.MaxValue;
            int gy0 = Floor(wy, cell);
            for (int gy = gy0 - 1; gy <= gy0 + 1; gy++)
            {
                int shift = (gy & 1) * 3;
                int gx0 = Floor(x - shift, cell);
                for (int gx = gx0 - 1; gx <= gx0 + 1; gx++)
                {
                    float cx = gx * cell + shift + 3.5f + (H01(gx, gy, seed + 1) - 0.5f) * 3f;
                    float cy = gy * cell + 3.5f + (H01(gx, gy, seed + 2) - 0.5f) * 3f;
                    if (TileAt(a, next, (int)Math.Floor(cx), (int)Math.Floor(cy)) != Tile.Forest) continue;   // 木は森タイル上にだけ立つ
                    float r = 3.6f + H01(gx, gy, seed + 3) * 1.6f;
                    float dx = x + 0.5f - cx, dy = wy + 0.5f - cy; float d = (float)Math.Sqrt(dx * dx + dy * dy) / r;
                    if (d >= 1f || cy >= bestY) continue;   // 手前（worldY の小さい木）を上に重ねる
                    bestY = cy;
                    float lit = (-dx * 0.55f + dy * 0.75f) / r;   // 左上（-x, +y）が明るい
                    best = d > 0.8f && lit < 0 ? pal[2] : lit > 0.45f ? pal[4] : lit > -0.25f ? pal[3] : 0x24461fu;
                    if (d < 0.35f && lit > 0.15f) best = 0x6c9a48u;
                }
            }
            if (overflowOnly) return best;
            return best != 0 ? best : pal[2];
        }

        static bool Natural(Tile t) => t == Tile.Grass || t == Tile.Forest || t == Tile.Water || t == Tile.Sand || t == Tile.Rock;

        /// <summary>自然の境界（水・砂・森・草）だけをタイル内で揺らし、8px の階段を目立たなくする。人工物の直線は保つ。</summary>
        public static Tile NaturalTile(AreaData a, AreaData next, int x, int wy, uint seed)
        {
            Tile t = TileAt(a, next, x, wy);
            if (!Natural(t)) return t;
            int jx = (int)Math.Round((Smooth(x, wy, seed + 21, 6f) - 0.5f) * 9f);
            int jy = (int)Math.Round((Smooth(x, wy, seed + 22, 6f) - 0.5f) * 9f);
            Tile w = TileAt(a, next, x + jx, wy + jy);
            return Natural(w) ? w : t;
        }

        static bool IsRoad(Tile t) => t == Tile.Road || t == Tile.Bridge || t == Tile.Base;
        static int Floor(int v, int d) => v >= 0 ? v / d : -((-v + d - 1) / d);

        static Tile TileAt(AreaData a, AreaData next, int x, int wy)
        {
            int c = Floor(x, 8), r = Floor(wy, 8);
            int bodyRows = a.rows - (int)(288 / 8) - 4;  // エリア本体の行数（areaLength/8）
            if (next != null && r >= bodyRows) return next.TileAt(c, r - bodyRows);
            return a.TileAt(c, r);
        }

        static int LandDist(AreaData a, AreaData next, int x, int wy, int max)
        {
            for (int d = 1; d <= max; d++)
            {
                int s = d * 3;
                uint sd = (uint)(a.index * 977 + 13);
                if (NaturalTile(a, next, x - s, wy, sd) != Tile.Water || NaturalTile(a, next, x + s, wy, sd) != Tile.Water || NaturalTile(a, next, x, wy - s, sd) != Tile.Water || NaturalTile(a, next, x, wy + s, sd) != Tile.Water) return d;
            }
            return max + 1;
        }

        static float Smooth(int x, int y, uint s, float scale)
        {
            float fx = x / scale, fy = y / scale; int xi = (int)Math.Floor(fx), yi = (int)Math.Floor(fy); float tx = fx - xi, ty = fy - yi;
            float a = H01(xi, yi, s), b = H01(xi + 1, yi, s), c = H01(xi, yi + 1, s), d = H01(xi + 1, yi + 1, s);
            return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
        }
    }
}
