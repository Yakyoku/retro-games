// 作品のデータ一式（調整値・16 エリア・スプライト・メッシュ・音源・音のイベント対応・マテリアル・フォント）。
// エディタ処理 ProjectBuilder が生成して Assets/SkywardRuins/Resources/GameDatabase.asset に保存する。
using System;
using System.Collections.Generic;
using SkywardRuins.Core;
using UnityEngine;

namespace SkywardRuins
{
    [CreateAssetMenu(menuName = "Skyward Ruins/Area")]
    public class AreaAsset : ScriptableObject
    {
        public AreaData data;
    }

    [Serializable] public class SpriteSet { public string name; public Sprite[] frames; public float fps; }
    [Serializable] public class MeshEntry { public string name; public Mesh mesh; }
    [Serializable]
    public class AudioEntry
    {
        public string name; public AudioClip clip; public bool loop; public float gain = 1f; public int priority = 5;
        public int maxVoices = 2; public float cooldown = 0.03f; public bool spatial; public string description;
    }
    /// <summary>ゲームのイベント → 鳴らす音の対応（データで管理）。bgm を指定するとその曲へ切り替える。</summary>
    [Serializable] public class AudioEventEntry { public EvType ev; public string cue; public string bgm; }

    [CreateAssetMenu(menuName = "Skyward Ruins/Game Database")]
    public class GameDatabase : ScriptableObject
    {
        public Tuning tuning = new Tuning();
        public AreaAsset[] areas;
        public SpriteSet[] sprites;
        public MeshEntry[] meshes;
        public AudioEntry[] audio;
        public AudioEventEntry[] audioEvents;
        public Font font;
        public Material spriteMaterial, litMaterial, terrainMaterial, unlitTransparent, uiMaterial;
        public Texture2D softCircle, vignette;

        Dictionary<string, SpriteSet> spriteMap; Dictionary<string, Mesh> meshMap; Dictionary<string, AudioEntry> audioMap;

        static GameDatabase instance;
        public static GameDatabase Instance
        {
            get
            {
                if (instance == null) instance = Resources.Load<GameDatabase>("GameDatabase");
                if (instance == null) Debug.LogError("[SkywardRuins] Resources/GameDatabase.asset が見つかりません（ProjectBuilder を実行してください）");
                return instance;
            }
        }

        public List<AreaData> AreaList()
        {
            var l = new List<AreaData>();
            foreach (var a in areas) l.Add(a.data);
            return l;
        }

        public SpriteSet Sprite(string n)
        {
            if (spriteMap == null) { spriteMap = new Dictionary<string, SpriteSet>(); foreach (var s in sprites) spriteMap[s.name] = s; }
            spriteMap.TryGetValue(n, out var r); return r;
        }
        public Mesh Mesh(string n)
        {
            if (meshMap == null) { meshMap = new Dictionary<string, Mesh>(); foreach (var m in meshes) meshMap[m.name] = m.mesh; }
            meshMap.TryGetValue(n, out var r); return r;
        }
        public AudioEntry Audio(string n)
        {
            if (audioMap == null) { audioMap = new Dictionary<string, AudioEntry>(); foreach (var a in audio) audioMap[a.name] = a; }
            audioMap.TryGetValue(n, out var r); return r;
        }
    }
}
