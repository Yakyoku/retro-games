// 確認用の書き出し：地表の画像（PNG）と、ボットが遊んだ場面のスナップショット（JSON）。
// node tools/compose-frames.mjs がスプライトを重ねて画面を合成する。Unity の描画とは別物の「論理と素材の確認」用。
using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;
using SkywardRuins.Core;

static class Preview
{
    public static void WritePng(string path, int w, int h, byte[] rgbaBottomUp)
    {
        using var raw = new MemoryStream();
        for (int y = h - 1; y >= 0; y--) { raw.WriteByte(0); raw.Write(rgbaBottomUp, y * w * 4, w * 4); }
        byte[] comp; using (var ms = new MemoryStream()) { using (var z = new ZLibStream(ms, CompressionLevel.Optimal, true)) { raw.Position = 0; raw.CopyTo(z); } comp = ms.ToArray(); }
        using var f = File.Create(path);
        f.Write(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 });
        void Chunk(string type, byte[] data)
        {
            var len = BitConverter.GetBytes(data.Length); Array.Reverse(len); f.Write(len);
            var td = Encoding.ASCII.GetBytes(type).Concat(data).ToArray(); f.Write(td);
            var crc = BitConverter.GetBytes(Crc(td)); Array.Reverse(crc); f.Write(crc);
        }
        var ihdr = new byte[13]; var wb = BitConverter.GetBytes(w); Array.Reverse(wb); var hb = BitConverter.GetBytes(h); Array.Reverse(hb);
        wb.CopyTo(ihdr, 0); hb.CopyTo(ihdr, 4); ihdr[8] = 8; ihdr[9] = 6;
        Chunk("IHDR", ihdr); Chunk("IDAT", comp); Chunk("IEND", new byte[0]);
    }
    static uint[] tbl;
    static uint Crc(byte[] b)
    {
        if (tbl == null) { tbl = new uint[256]; for (uint n = 0; n < 256; n++) { uint c = n; for (int k = 0; k < 8; k++) c = (c & 1) != 0 ? 0xedb88320 ^ (c >> 1) : c >> 1; tbl[n] = c; } }
        uint cc = 0xffffffff; foreach (var x in b) cc = tbl[(cc ^ x) & 255] ^ (cc >> 8); return cc ^ 0xffffffff;
    }

    public static void Run(string outDir)
    {
        Directory.CreateDirectory(outDir);
        var T = new Tuning(); var areas = Stage.BuildAll(T);
        // 1) 各エリアの地表全体を縮小せずに書き出し（縦長）＋一覧用に 1/4 縮小
        int W = 224, Hh = (int)T.areaLength;
        var thumbs = new List<byte[]>();
        for (int i = 0; i < areas.Count; i++)
        {
            var px = TerrainPainter.Paint(areas[i], 0, Hh, areas[(i + 1) % areas.Count]);
            if (i < 2 || i == 15) WritePng(Path.Combine(outDir, $"area{i + 1:00}.png"), W, Hh, px);
            int tw = W / 4, th = Hh / 4; var t = new byte[tw * th * 4];
            for (int y = 0; y < th; y++) for (int x = 0; x < tw; x++) Array.Copy(px, ((y * 4) * W + x * 4) * 4, t, (y * tw + x) * 4, 4);
            // 出現位置の目印（地上物=赤, 隠し=黄, 要塞=紫）
            foreach (var e in areas[i].events)
            {
                if (!e.IsGround && e.kind != SpawnKind.Fortress) continue;
                int ex = (int)(e.x / 4), ey = (int)((e.kind == SpawnKind.Fortress ? e.at + 200 : e.at) / 4);
                byte r = 255, g = 40, b = 40; if (e.kind == SpawnKind.Obelisk || e.kind == SpawnKind.Banner) { r = 255; g = 230; b = 0; } if (e.kind == SpawnKind.Fortress) { r = 200; g = 60; b = 255; }
                for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) { int xx = ex + dx, yy = ey + dy; if (xx < 0 || yy < 0 || xx >= tw || yy >= th) continue; int k = (yy * tw + xx) * 4; t[k] = r; t[k + 1] = g; t[k + 2] = b; }
            }
            thumbs.Add(t);
        }
        int TW = W / 4, TH = Hh / 4, gap = 4; int allW = (TW + gap) * 16; var all = new byte[allW * TH * 4];
        for (int i = 0; i < 16; i++) for (int y = 0; y < TH; y++) Array.Copy(thumbs[i], y * TW * 4, all, (y * allW + i * (TW + gap)) * 4, TW * 4);
        WritePng(Path.Combine(outDir, "areas-overview.png"), allW, TH, all);

        // 2) ボットで遊んだ場面のスナップショット
        var snaps = new StringBuilder("[");
        var s = new Sim(T, areas, Difficulty.Standard, new AssistSettings(), 0, 99);
        var rnd = new Rng(5); int frame = 0; bool first = true;
        int[] takeAt = { 60 * 20, 60 * 47, 60 * 70 };
        // 要塞戦の場面も撮るため、エリア 3（要塞あり）から別に回す
        var sf = new Sim(T, areas, Difficulty.Practice, new AssistSettings(), 2, 7);
        void Snap(Sim sim, string tag)
        {
            if (!first) snaps.Append(","); first = false;
            int wy0 = (int)Math.Floor(sim.Scroll);
            var px = TerrainPainter.Paint(sim.Area, wy0, 288 + 8, areas[(sim.AreaIndex + 1) % areas.Count]);
            string png = $"{tag}-terrain.png"; WritePng(Path.Combine(outDir, png), 224, 288 + 8, px);
            var inv = System.Globalization.CultureInfo.InvariantCulture;
            string F(float v) => v.ToString("0.0", inv);
            snaps.Append($"{{\"tag\":\"{tag}\",\"terrain\":\"{png}\",\"scrollFrac\":{F(sim.Scroll - wy0)},\"score\":{sim.Score},\"lives\":{sim.Lives},\"area\":{sim.AreaIndex + 1},");
            snaps.Append($"\"player\":[{F(sim.Player.x)},{F(sim.Player.y)}],\"sight\":[{F(sim.Sight.x)},{F(sim.Sight.y)}],\"hint\":{(sim.SightHint ? 1 : 0)},\"lock\":{(sim.SightLock ? 1 : 0)},");
            snaps.Append("\"air\":[" + string.Join(",", sim.Air.Select(a => $"[\"{a.kind.ToString().ToLower()}\",{F(a.pos.x)},{F(a.pos.y)},{F(a.spin)}]")) + "],");
            snaps.Append("\"ground\":[" + string.Join(",", sim.Ground.Where(g => g.state != GroundState.Hidden).Select(g => $"[\"{g.kind.ToString().ToLower()}\",{F(g.x)},{F(g.worldY - sim.Scroll)},{(g.state == GroundState.Destroyed ? 1 : 0)},{(g.fortress != null && g.fortress.coreOpen ? 1 : 0)}]")) + "],");
            snaps.Append("\"forts\":[" + string.Join(",", sim.Forts.Select(f => $"[{F(f.x)},{F(f.worldY - sim.Scroll)},{(f.destroyed ? 1 : 0)}]")) + "],");
            snaps.Append("\"shots\":[" + string.Join(",", sim.Shots.Select(b => $"[{F(b.pos.x)},{F(b.pos.y)}]")) + "],");
            snaps.Append("\"bombs\":[" + string.Join(",", sim.Bombs.Select(b => { var p = sim.BombScreenPos(b); return $"[{F(p.x)},{F(p.y)}]"; })) + "],");
            snaps.Append("\"bullets\":[" + string.Join(",", sim.Bullets.Select(b => $"[{F(b.pos.x)},{F(b.pos.y)}]")) + "]}");
        }
        int snapIdx = 0;
        while (frame < 60 * 600)
        {
            s.Step(BotProxy(s, rnd)); frame++;
            if (frame >= takeAt[snapIdx] && s.State == SimState.Playing && s.Air.Count(a => a.pos.y < 270 && a.pos.y > 20) >= 3 && s.Bullets.Count >= 1) { Snap(s, $"play{frame / 60}s"); snapIdx++; if (snapIdx >= takeAt.Length) break; }
        }
        bool took = false; int guard = 0;
        while (!took && guard++ < 60 * 200)
        {
            sf.Step(BotProxy(sf, rnd)); if (sf.State == SimState.Dying) { }
            if (sf.Forts.Count > 0 && sf.Forts[0].phase == 1 && sf.Forts[0].coreOpen && sf.Forts[0].t > 3) { Snap(sf, "fortress"); took = true; }
        }
        snaps.Append("]");
        File.WriteAllText(Path.Combine(outDir, "snapshots.json"), snaps.ToString());
        Console.WriteLine("preview written to " + outDir);
    }
    public static Func<Sim, Rng, InputFrame> BotProxy;
}
