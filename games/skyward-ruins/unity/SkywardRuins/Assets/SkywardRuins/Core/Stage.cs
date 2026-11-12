// 16 エリアの地表と出現データ。配置はすべてこの作品の独自構成（原作の配置を写したものではない）。
// 生成はエリアごとのシードで決定的に行い、Unity 側ではエディタ処理で AreaAsset（ScriptableObject）へ書き出す。
using System;
using System.Collections.Generic;

namespace SkywardRuins.Core
{
    public enum Tile : byte { Grass = 0, Forest = 1, Water = 2, Sand = 3, Road = 4, Base = 5, Glyph = 6, Bridge = 7, Rock = 8 }

    public enum GlyphShape { None, Spiral, Sun, Serpent, Lattice, Eye, Heron, Maze, Wheel }

    public enum SpawnKind
    {
        // 空中
        Dart = 0, Arc = 1, Seeker = 2, Crosser = 3, Sniper = 4, Heavy = 5, Shard = 6,
        // 地上
        Turret = 20, Tank = 21, Bunker = 22, Radar = 23, Obelisk = 24, Banner = 25,
        Fortress = 40, FortTurret = 41, FortCore = 42,
    }

    [Serializable]
    public class SpawnEvent
    {
        public int id;            // エリア内で一意（報酬の重複防止キーに使う）
        public SpawnKind kind;
        public float at;          // 空中: 出現するスクロール距離 / 地上: 地表上の位置 worldY
        public float x;
        public int count = 1;
        public float spacing = 0; // 編隊の間隔
        public int param = 0;     // 種別ごとの補助値（向き・変種など）
        public bool IsGround => (int)kind >= 20 && (int)kind < 40;
        public bool IsAir => (int)kind < 20;
    }

    [Serializable]
    public class AreaProfile
    {
        public string name;       // 英語名（タイトル・HUD 表示用）
        public string nameJa;
        public float forest, desert;
        public int rivers;
        public bool lake;
        public int seaSide;       // -1 左が海 / 1 右が海 / 0 なし
        public int roads, bases;
        public GlyphShape glyph;
        public int turrets, tanks, bunkers, radars;
        public bool banner;
        public int fortressTurrets; // 0 = 要塞なし
        public SpawnKind[] airKinds;
        public float airDensity;    // 1.0 = 標準
        public uint palette;        // 地表の色調（0..3）
    }

    [Serializable]
    public class AreaData
    {
        public int index;
        public AreaProfile profile;
        public int cols, rows;      // 8 単位タイル
        public byte[] tiles;        // rows*cols（行 0 がエリア開始地点）
        public List<SpawnEvent> events = new List<SpawnEvent>();
        public Tile TileAt(int c, int r)
        {
            if (c < 0) c = 0; if (c >= cols) c = cols - 1;
            if (r < 0) r = 0; if (r >= rows) r = rows - 1;
            return (Tile)tiles[r * cols + c];
        }
        public Tile TileAtWorld(float x, float worldY) => TileAt((int)Math.Floor(x / Stage.TileSize), (int)Math.Floor(worldY / Stage.TileSize));
    }

    public static class Stage
    {
        public const float TileSize = 8f;
        public const int SeamRows = 10;

        static readonly SpawnKind[] A1 = { SpawnKind.Dart, SpawnKind.Arc };
        static readonly SpawnKind[] A2 = { SpawnKind.Dart, SpawnKind.Arc, SpawnKind.Crosser };
        static readonly SpawnKind[] A3 = { SpawnKind.Dart, SpawnKind.Seeker, SpawnKind.Crosser, SpawnKind.Sniper };
        static readonly SpawnKind[] A4 = { SpawnKind.Arc, SpawnKind.Seeker, SpawnKind.Sniper, SpawnKind.Heavy, SpawnKind.Shard };
        static readonly SpawnKind[] A5 = { SpawnKind.Dart, SpawnKind.Arc, SpawnKind.Seeker, SpawnKind.Crosser, SpawnKind.Sniper, SpawnKind.Heavy, SpawnKind.Shard };

        static AreaProfile P(string n, string j, float forest, float desert, int rivers, bool lake, int sea, int roads, int bases,
            GlyphShape g, int tur, int tank, int bunk, int radar, bool banner, int fort, SpawnKind[] air, float dens, uint pal)
            => new AreaProfile { name = n, nameJa = j, forest = forest, desert = desert, rivers = rivers, lake = lake, seaSide = sea, roads = roads, bases = bases,
                glyph = g, turrets = tur, tanks = tank, bunkers = bunk, radars = radar, banner = banner, fortressTurrets = fort, airKinds = air, airDensity = dens, palette = pal };

        /// <summary>16 エリアの構成表（独自）。地形・敵・要塞・発見要素の組み合わせをエリアごとに変える。</summary>
        public static AreaProfile[] Profiles() => new[]
        {
            P("VERDANT GATE",   "緑の門",       0.55f, 0.00f, 1, false,  0, 1, 0, GlyphShape.None,    4, 0, 0, 0, false, 0, A1, 0.80f, 0),
            P("RIVER CHOIR",    "川の合唱",     0.40f, 0.05f, 2, false,  0, 1, 1, GlyphShape.Spiral,  6, 1, 1, 0, true,  0, A2, 0.90f, 0),
            P("STONE ROADS",    "石の道",       0.30f, 0.15f, 1, false,  0, 3, 1, GlyphShape.None,    7, 3, 1, 1, false, 4, A2, 1.00f, 1),
            P("MIRROR LAKE",    "鏡の湖",       0.45f, 0.00f, 1, true,   0, 1, 1, GlyphShape.Sun,     6, 1, 2, 1, true,  0, A3, 1.00f, 0),
            P("SUN PLAINS",     "陽の平原",     0.15f, 0.45f, 0, false,  0, 2, 1, GlyphShape.Heron,   8, 2, 2, 1, false, 0, A3, 1.05f, 2),
            P("IRON HARBOR",    "鉄の港",       0.20f, 0.05f, 0, false,  1, 2, 2, GlyphShape.None,    9, 2, 3, 2, true,  4, A3, 1.10f, 1),
            P("SERPENT DUNES",  "蛇の砂丘",     0.05f, 0.60f, 1, false,  0, 1, 1, GlyphShape.Serpent, 8, 3, 2, 1, false, 0, A4, 1.10f, 2),
            P("TWIN FORKS",     "双子の分流",   0.40f, 0.10f, 3, false,  0, 2, 1, GlyphShape.Lattice, 9, 2, 2, 1, true,  0, A4, 1.15f, 0),
            P("WATCHER VALE",   "見張りの谷",   0.35f, 0.20f, 1, true,   0, 2, 2, GlyphShape.Eye,    10, 3, 3, 2, false, 6, A4, 1.20f, 3),
            P("COAST OF GLASS", "硝子の海岸",   0.25f, 0.20f, 0, false, -1, 1, 2, GlyphShape.Wheel,  10, 2, 3, 2, true,  0, A5, 1.20f, 1),
            P("THE CITADEL",    "城塞",         0.10f, 0.10f, 1, false,  0, 4, 4, GlyphShape.None,   12, 4, 4, 3, false, 0, A5, 1.25f, 3),
            P("LABYRINTH",      "迷路の地",     0.20f, 0.40f, 0, false,  0, 2, 1, GlyphShape.Maze,   10, 3, 3, 1, true,  6, A5, 1.30f, 2),
            P("DEEP FOREST",    "深い森",       0.80f, 0.00f, 2, false,  0, 1, 1, GlyphShape.Spiral, 10, 2, 3, 1, false, 0, A5, 1.30f, 0),
            P("DROWNED REALM",  "沈んだ国",     0.20f, 0.05f, 2, true,   1, 2, 2, GlyphShape.Sun,    11, 3, 4, 2, true,  8, A5, 1.35f, 1),
            P("ASH ROADS",      "灰の道",       0.10f, 0.35f, 1, false,  0, 4, 3, GlyphShape.Heron,  12, 5, 4, 2, false, 0, A5, 1.40f, 3),
            P("HEART OF RUINS", "遺跡の中心",   0.30f, 0.30f, 1, true,  -1, 3, 4, GlyphShape.Eye,    13, 4, 5, 3, true,  8, A5, 1.45f, 2),
        };

        public static List<AreaData> BuildAll(Tuning t)
        {
            var list = new List<AreaData>();
            var profiles = Profiles();
            for (int i = 0; i < profiles.Length; i++) list.Add(Build(i, profiles[i], t));
            return list;
        }

        // ---------- 地表 ----------
        static float Hash(int x, int y, uint seed)
        {
            uint h = (uint)(x * 374761393) ^ (uint)(y * 668265263) ^ (seed * 2246822519u);
            h = (h ^ (h >> 13)) * 1274126177u; h ^= h >> 16;
            return (h & 0xFFFFFF) / 16777216f;
        }
        static float Noise(float x, float y, uint seed)
        {
            int xi = (int)Math.Floor(x), yi = (int)Math.Floor(y);
            float fx = x - xi, fy = y - yi;
            fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
            float a = Hash(xi, yi, seed), b = Hash(xi + 1, yi, seed), c = Hash(xi, yi + 1, seed), d = Hash(xi + 1, yi + 1, seed);
            return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
        }
        static float Fbm(float x, float y, uint seed) => 0.6f * Noise(x, y, seed) + 0.3f * Noise(x * 2.1f, y * 2.1f, seed + 7) + 0.1f * Noise(x * 4.3f, y * 4.3f, seed + 13);

        public static AreaData Build(int index, AreaProfile p, Tuning t)
        {
            uint seed = 0x5EED0000u + (uint)index * 7919u;
            var rng = new Rng(seed);
            int cols = (int)(t.fieldW / TileSize);
            int rows = (int)Math.Ceiling(t.areaLength / TileSize) + (int)(t.fieldH / TileSize) + 4;
            var a = new AreaData { index = index, profile = p, cols = cols, rows = rows, tiles = new byte[cols * rows] };
            Func<int, int, Tile> get = (c, r) => (Tile)a.tiles[r * cols + c];
            Action<int, int, Tile> set = (c, r, v) => { if (c >= 0 && c < cols && r >= 0 && r < rows) a.tiles[r * cols + c] = (byte)v; };
            int bodyEnd = (int)(t.areaLength / TileSize);

            // 1) 草原・森・砂地（継ぎ目の行はエリア共通の規則で草原寄りにし、エリア間を連続させる）
            for (int r = 0; r < rows; r++)
            {
                float seamW = r < SeamRows ? 1f - r / (float)SeamRows : (r > bodyEnd - SeamRows ? Math.Min(1f, (r - (bodyEnd - SeamRows)) / (float)SeamRows) : 0f);
                for (int c = 0; c < cols; c++)
                {
                    float fN = Fbm(c * 0.18f, r * 0.18f, seed + 1);
                    float sN = Fbm(c * 0.10f + 50, r * 0.10f, seed + 2);
                    float seamN = Fbm(c * 0.18f, (r < SeamRows ? r : r - bodyEnd) * 0.18f, 0xC0FFEE);
                    float forest = p.forest * (1 - seamW) + 0.35f * seamW;
                    float n = fN * (1 - seamW) + seamN * seamW;
                    Tile v = Tile.Grass;
                    if (sN < p.desert * 0.85f * (1 - seamW)) v = Tile.Sand;
                    else if (n > 1f - forest * 0.9f) v = Tile.Forest;
                    else if (Hash(c, r, seed + 3) < 0.012f) v = Tile.Rock;
                    set(c, r, v);
                }
            }
            // 2) 海岸
            if (p.seaSide != 0)
            {
                for (int r = SeamRows; r < bodyEnd - SeamRows; r++)
                {
                    float fade = Math.Min(1f, Math.Min(r - SeamRows, bodyEnd - SeamRows - r) / 14f);
                    int depth = (int)((6 + 4 * Math.Sin(r * 0.05 + index) + 2 * Noise(r * 0.2f, 0, seed + 4)) * fade);
                    for (int k = 0; k < depth; k++) set(p.seaSide < 0 ? k : cols - 1 - k, r, Tile.Water);
                    if (depth > 0) set(p.seaSide < 0 ? depth : cols - 1 - depth, r, Tile.Sand);
                }
            }
            // 3) 川（画面の左右から入り、蛇行して抜ける）
            for (int i = 0; i < p.rivers; i++)
            {
                int r0 = SeamRows + 4 + rng.RangeInt(0, Math.Max(1, bodyEnd / Math.Max(1, p.rivers) / 2)) + i * (bodyEnd - 2 * SeamRows) / Math.Max(1, p.rivers);
                int len = rng.RangeInt(90, 170);
                float ph = rng.Range(0, 6.28f), amp = rng.Range(5, 9), x0 = rng.Range(8, cols - 8);
                bool fromLeft = rng.Chance(0.5f);
                for (int k = 0; k < len; k++)
                {
                    int r = r0 + k; if (r >= bodyEnd - SeamRows) break;
                    float enter = Math.Min(1f, k / 16f);
                    float x = x0 + amp * (float)Math.Sin(k * 0.06 + ph);
                    float sideX = fromLeft ? -3 : cols + 3;
                    x = sideX + (x - sideX) * enter;
                    float exitW = Math.Max(0f, (k - (len - 16)) / 16f);
                    x = x + ((fromLeft ? cols + 3 : -3) - x) * exitW;
                    int w = 2 + (int)(Noise(k * 0.1f, i, seed + 5) * 2.2f);
                    for (int dx = -w / 2; dx <= w / 2 + 1; dx++) set((int)x + dx, r, Tile.Water);
                    set((int)x - w / 2 - 1, r, get(Math.Max(0, Math.Min(cols - 1, (int)x - w / 2 - 1)), r) == Tile.Water ? Tile.Water : Tile.Sand);
                }
            }
            // 4) 湖
            if (p.lake)
            {
                float cy = rng.Range(bodyEnd * 0.3f, bodyEnd * 0.7f), cx = rng.Range(9, cols - 9), rx = rng.Range(6, 9), ry = rng.Range(9, 15);
                for (int r = (int)(cy - ry - 3); r <= cy + ry + 3; r++)
                    for (int c = 0; c < cols; c++)
                    {
                        float dx = (c - cx) / rx, dy = (r - cy) / ry;
                        float d = dx * dx + dy * dy + (Noise(c * 0.3f, r * 0.3f, seed + 6) - 0.5f) * 0.5f;
                        if (r < 0 || r >= rows) continue;
                        if (d < 1f) set(c, r, Tile.Water); else if (d < 1.25f && get(c, r) != Tile.Water) set(c, r, Tile.Sand);
                    }
            }
            // 5) 地上絵（砂の広場に線で描く。図案はこの作品の独自）
            float glyphCx = 0, glyphCy = 0;
            if (p.glyph != GlyphShape.None)
            {
                glyphCy = rng.Range(bodyEnd * 0.25f, bodyEnd * 0.55f); glyphCx = cols / 2f + rng.Range(-3, 3);
                for (int r = (int)glyphCy - 14; r <= glyphCy + 14; r++)
                    for (int c = 0; c < cols; c++)
                    {
                        float dx = (c - glyphCx) / 12f, dy = (r - glyphCy) / 14f;
                        if (dx * dx + dy * dy + (Noise(c * 0.4f, r * 0.4f, seed + 8) - 0.5f) * 0.3f < 1f) set(c, r, Tile.Sand);
                    }
                StampGlyph(p.glyph, glyphCx, glyphCy, (c, r) => set(c, r, Tile.Glyph));
            }
            // 6) 基地（舗装された区画）
            var baseRects = new List<int[]>();
            for (int i = 0; i < p.bases; i++)
            {
                int bw = rng.RangeInt(6, 11), bh = rng.RangeInt(7, 13);
                int by = SeamRows + 20 + i * (bodyEnd - 2 * SeamRows - 40) / Math.Max(1, p.bases) + rng.RangeInt(0, 20);
                int bx = rng.RangeInt(2, cols - bw - 2);
                if (p.glyph != GlyphShape.None && Math.Abs(by + bh / 2 - glyphCy) < 22) by += 34;
                if (by + bh >= bodyEnd - SeamRows) continue;
                for (int r = by; r < by + bh; r++) for (int c = bx; c < bx + bw; c++) set(c, r, Tile.Base);
                baseRects.Add(new[] { bx, by, bw, bh });
            }
            // 7) 道路（縦の幹線＋横の交差。水の上は橋）
            var roadCols = new List<int>();
            for (int i = 0; i < p.roads; i++)
            {
                float x = rng.Range(3, cols - 3);
                int jogEvery = rng.RangeInt(30, 60);
                for (int r = 0; r < rows; r++)
                {
                    if (r % jogEvery == 0 && r > 0)
                    {
                        float nx = Geo.Clamp(x + rng.Range(-4, 4), 2, cols - 3);
                        // 曲がり角は横につなぐ（道が途切れないように）
                        for (int cc = Math.Min((int)x, (int)nx); cc <= Math.Max((int)x, (int)nx); cc++)
                        {
                            Tile cu = get(cc, r);
                            if (cu == Tile.Glyph) continue;
                            set(cc, r, cu == Tile.Water ? Tile.Bridge : (cu == Tile.Base ? Tile.Base : Tile.Road));
                        }
                        x = nx;
                    }
                    int c = (int)x;
                    Tile cur = get(c, r);
                    if (cur == Tile.Glyph) continue;
                    set(c, r, cur == Tile.Water ? Tile.Bridge : (cur == Tile.Base ? Tile.Base : Tile.Road));
                    if (r % 8 == 0) roadCols.Add(r * 1000 + c);
                }
            }
            for (int i = 0; i < p.roads; i++)
            {
                int r = SeamRows + rng.RangeInt(10, bodyEnd - 2 * SeamRows - 10);
                for (int c = 0; c < cols; c++) { Tile cur = get(c, r); if (cur == Tile.Glyph || cur == Tile.Base) continue; set(c, r, cur == Tile.Water ? Tile.Bridge : Tile.Road); }
            }

            // ---------- 出現データ ----------
            int nextId = 1;
            Func<int> id = () => nextId++;
            float bodyStart = SeamRows * TileSize + 40, bodyStop = t.areaLength - 160;
            Func<Tile[], float, float, float[]> pick = (allowed, y0, y1) =>
            {
                for (int tries = 0; tries < 80; tries++)
                {
                    float x = rng.Range(16, t.fieldW - 16), y = rng.Range(y0, y1);
                    Tile tl = a.TileAtWorld(x, y);
                    if (Array.IndexOf(allowed, tl) < 0) continue;
                    bool clear = true;
                    foreach (var e in a.events) if (e.IsGround && Math.Abs(e.at - y) < 22 && Math.Abs(e.x - x) < 22) { clear = false; break; }
                    if (clear) return new[] { x, y };
                }
                return null;
            };
            var land = new[] { Tile.Grass, Tile.Sand, Tile.Base, Tile.Rock };
            Action<SpawnKind, int, Tile[]> scatter = (k, n, allowed) =>
            {
                for (int i = 0; i < n; i++)
                {
                    float y0 = bodyStart + (bodyStop - bodyStart) * i / Math.Max(1, n), y1 = bodyStart + (bodyStop - bodyStart) * (i + 1) / Math.Max(1, n);
                    var pos = pick(allowed, y0, y1); if (pos == null) continue;
                    a.events.Add(new SpawnEvent { id = id(), kind = k, x = pos[0], at = pos[1] });
                }
            };
            scatter(SpawnKind.Turret, p.turrets, land);
            scatter(SpawnKind.Bunker, p.bunkers, baseRects.Count > 0 ? new[] { Tile.Base } : land);
            scatter(SpawnKind.Radar, p.radars, baseRects.Count > 0 ? new[] { Tile.Base, Tile.Grass } : land);
            scatter(SpawnKind.Tank, p.tanks, new[] { Tile.Road });
            // 隠し対象：オベリスク（ソル相当）2 基。1 基は地上絵の中心、もう 1 基は森の切れ目など
            if (p.glyph != GlyphShape.None)
                a.events.Add(new SpawnEvent { id = id(), kind = SpawnKind.Obelisk, x = glyphCx * TileSize, at = glyphCy * TileSize });
            var ob = pick(new[] { Tile.Grass, Tile.Forest, Tile.Sand }, bodyStart + 400, bodyStop - 200);
            if (ob != null) a.events.Add(new SpawnEvent { id = id(), kind = SpawnKind.Obelisk, x = ob[0], at = ob[1] });
            if (p.banner)
            {
                var bn = pick(new[] { Tile.Grass, Tile.Forest }, bodyStart + 200, bodyStop - 600);
                if (bn != null) a.events.Add(new SpawnEvent { id = id(), kind = SpawnKind.Banner, x = bn[0], at = bn[1] });
            }

            // 空中の波
            float fortAt = p.fortressTurrets > 0 ? t.areaLength * 0.62f : -1;
            float wd = 160;
            int waveNo = 0;
            float densMul = p.airDensity;
            while (wd < t.areaLength - 260)
            {
                if (fortAt > 0 && wd > fortAt - 120 && wd < fortAt + 900) { wd = fortAt + 900; continue; }
                var k = p.airKinds[rng.RangeInt(0, p.airKinds.Length)];
                var e = new SpawnEvent { id = id(), kind = k, at = wd, x = rng.Range(36, t.fieldW - 36) };
                switch (k)
                {
                    case SpawnKind.Dart: e.count = 3 + rng.RangeInt(0, 3); e.spacing = 18; break;
                    case SpawnKind.Arc: e.count = 4 + rng.RangeInt(0, 3); e.spacing = 0.22f; e.param = rng.Chance(0.5f) ? 1 : -1; break;
                    case SpawnKind.Seeker: e.count = 2 + rng.RangeInt(0, 2); e.spacing = 0.5f; break;
                    case SpawnKind.Crosser: e.count = 3 + rng.RangeInt(0, 2); e.spacing = 0.35f; e.param = rng.Chance(0.5f) ? 1 : -1; e.x = rng.Range(150, 250); break;
                    case SpawnKind.Sniper: e.count = 1 + rng.RangeInt(0, 2); e.spacing = 60; break;
                    case SpawnKind.Heavy: e.count = 1; break;
                    case SpawnKind.Shard: e.count = 3 + rng.RangeInt(0, 2); e.spacing = 46; e.x = rng.Range(30, 70); break;
                }
                a.events.Add(e);
                waveNo++;
                wd += rng.Range(150, 240) / densMul;
            }
            if (fortAt > 0)
                a.events.Add(new SpawnEvent { id = id(), kind = SpawnKind.Fortress, at = fortAt, x = t.fieldW / 2, param = p.fortressTurrets, count = 1 });
            a.events.Sort((l, r) => (l.IsGround ? l.at - t.fieldH : l.at).CompareTo(r.IsGround ? r.at - t.fieldH : r.at));
            return a;
        }

        /// <summary>地上絵の図案（独自）。中心 (cx, cy) にタイル単位で線を置く。</summary>
        public static void StampGlyph(GlyphShape g, float cx, float cy, Action<int, int> plot)
        {
            Action<float, float, float, float> line = (x0, y0, x1, y1) =>
            {
                int n = (int)(Math.Max(Math.Abs(x1 - x0), Math.Abs(y1 - y0)) * 2) + 1;
                for (int i = 0; i <= n; i++) { float tt = i / (float)n; plot((int)Math.Round(cx + x0 + (x1 - x0) * tt), (int)Math.Round(cy + y0 + (y1 - y0) * tt)); }
            };
            Action<float, float, float> ring = (rx, ry, phase) =>
            {
                for (int i = 0; i < 64; i++) { double a0 = i / 64.0 * Math.PI * 2, a1 = (i + 1) / 64.0 * Math.PI * 2; line((float)(Math.Cos(a0) * rx), (float)(Math.Sin(a0) * ry), (float)(Math.Cos(a1) * rx), (float)(Math.Sin(a1) * ry)); }
            };
            switch (g)
            {
                case GlyphShape.Spiral:
                    for (int i = 0; i < 160; i++) { double a0 = i * 0.12, r0 = 1 + i * 0.065, a1 = (i + 1) * 0.12, r1 = 1 + (i + 1) * 0.065; line((float)(Math.Cos(a0) * r0), (float)(Math.Sin(a0) * r0 * 1.1), (float)(Math.Cos(a1) * r1), (float)(Math.Sin(a1) * r1 * 1.1)); }
                    break;
                case GlyphShape.Sun:
                    ring(4, 4, 0); for (int i = 0; i < 12; i++) { double a = i / 12.0 * Math.PI * 2; line((float)Math.Cos(a) * 5, (float)Math.Sin(a) * 5, (float)Math.Cos(a) * 10, (float)Math.Sin(a) * 11); }
                    break;
                case GlyphShape.Serpent:
                    for (int i = 0; i < 48; i++) { float y0 = -12 + i * 0.5f, y1 = -12 + (i + 1) * 0.5f; line((float)Math.Sin(y0 * 0.7) * 6, y0, (float)Math.Sin(y1 * 0.7) * 6, y1); }
                    ring(1.5f, 1.5f, 0); break;
                case GlyphShape.Lattice:
                    for (int i = -2; i <= 2; i++) { line(i * 4, -10, i * 4 + 3, 10); line(-9, i * 4, 9, i * 4 + 2); }
                    break;
                case GlyphShape.Eye:
                    for (int i = 0; i < 32; i++) { double a0 = Math.PI * i / 32, a1 = Math.PI * (i + 1) / 32; line((float)Math.Cos(a0) * 10, (float)Math.Sin(a0) * 5, (float)Math.Cos(a1) * 10, (float)Math.Sin(a1) * 5); line((float)Math.Cos(a0) * 10, -(float)Math.Sin(a0) * 5, (float)Math.Cos(a1) * 10, -(float)Math.Sin(a1) * 5); }
                    ring(2.5f, 2.5f, 0); break;
                case GlyphShape.Heron:
                    line(-8, -9, 0, 0); line(0, 0, 8, -9); line(0, 0, 0, 10); line(0, 10, 3, 12); line(-8, -9, -10, -3); line(8, -9, 10, -3); line(-2, 4, 2, 4);
                    break;
                case GlyphShape.Maze:
                    for (int s = 2; s <= 10; s += 3) { line(-s, -s, s, -s); line(s, -s, s, s); line(s, s, -s + 2, s); line(-s, s, -s, -s + 2); }
                    break;
                case GlyphShape.Wheel:
                    ring(9, 9, 0); ring(3, 3, 0); for (int i = 0; i < 6; i++) { double a = i / 6.0 * Math.PI * 2; line((float)Math.Cos(a) * 3, (float)Math.Sin(a) * 3, (float)Math.Cos(a) * 9, (float)Math.Sin(a) * 9); }
                    break;
            }
        }
    }
}
