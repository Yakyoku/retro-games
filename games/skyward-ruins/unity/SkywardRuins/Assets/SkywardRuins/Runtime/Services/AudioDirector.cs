// 音の再生をまとめる。AudioSource を事前に確保して使い回し、同じ音の重複・発音数・優先度・音量を管理する。
// Web 版の Unity では AudioMixer と DSP エフェクトに依存しない（音量は各 AudioSource で掛け合わせる）。
using System.Collections.Generic;
using SkywardRuins.Core;
using UnityEngine;

namespace SkywardRuins
{
    public class AudioDirector : MonoBehaviour
    {
        public static AudioDirector Instance { get; private set; }

        const int Voices2D = 14, Voices3D = 8, MaxTotal = 12;
        class Voice { public AudioSource src; public AudioEntry entry; public float startedAt; }
        readonly List<Voice> voices2D = new List<Voice>(), voices3D = new List<Voice>();
        AudioSource bgmA, bgmB; AudioSource bgmCur; string bgmName; float bgmFade = 1f;
        readonly Dictionary<string, float> lastPlayed = new Dictionary<string, float>();
        readonly Dictionary<EvType, AudioEventEntry> eventMap = new Dictionary<EvType, AudioEventEntry>();
        GameDatabase db;
        public bool Spatial3D { get; set; }      // VR/3D では敵・爆発を空間音響で鳴らす

        void Awake()
        {
            if (Instance != null && Instance != this) { Destroy(gameObject); return; }
            Instance = this;
            db = GameDatabase.Instance;
            for (int i = 0; i < Voices2D; i++) voices2D.Add(new Voice { src = NewSource("sfx2d_" + i, 0f) });
            for (int i = 0; i < Voices3D; i++) voices3D.Add(new Voice { src = NewSource("sfx3d_" + i, 1f) });
            bgmA = NewSource("bgmA", 0f); bgmB = NewSource("bgmB", 0f);
            bgmA.loop = bgmB.loop = true; bgmA.priority = bgmB.priority = 0;
            if (db != null && db.audioEvents != null) foreach (var e in db.audioEvents) eventMap[e.ev] = e;
        }

        AudioSource NewSource(string n, float spatial)
        {
            var go = new GameObject(n); go.transform.SetParent(transform, false);
            var s = go.AddComponent<AudioSource>(); s.playOnAwake = false; s.spatialBlend = spatial;
            s.rolloffMode = AudioRolloffMode.Linear; s.minDistance = 0.5f; s.maxDistance = 30f; s.dopplerLevel = 0f;
            return s;
        }

        static Settings S => SaveService.Settings;
        float SfxVol => S.mute ? 0f : S.master * S.sfx;
        float BgmVol => S.mute ? 0f : S.master * S.bgm;

        /// <summary>音を鳴らす。worldPos を渡すと 3D 発音（Spatial3D のときだけ）。重要音（優先度 9 以上）は常に 2D で聞きやすく。</summary>
        public void Play(string cue, Vector3? worldPos = null, float gainMul = 1f)
        {
            if (db == null || string.IsNullOrEmpty(cue)) return;
            var e = db.Audio(cue); if (e == null || e.clip == null) return;
            float now = Time.unscaledTime;
            if (lastPlayed.TryGetValue(cue, out var t) && now - t < e.cooldown) return;   // 同じイベントの重複発音を防ぐ
            bool spatial = Spatial3D && worldPos.HasValue && e.spatial && e.priority < 9;
            var pool = spatial ? voices3D : voices2D;
            int sameCount = 0, active = 0;
            foreach (var v in voices2D) if (v.src.isPlaying) { active++; if (v.entry == e) sameCount++; }
            foreach (var v in voices3D) if (v.src.isPlaying) { active++; if (v.entry == e) sameCount++; }
            Voice pick = null;
            if (sameCount >= e.maxVoices)
            {
                // 同じ音の最も古い発音を止めて差し替える
                foreach (var v in pool) if (v.src.isPlaying && v.entry == e && (pick == null || v.startedAt < pick.startedAt)) pick = v;
                if (pick == null) return;
            }
            if (pick == null) foreach (var v in pool) if (!v.src.isPlaying) { pick = v; break; }
            if (pick == null || active >= MaxTotal)
            {
                // 空きがなければ、優先度の低い音から奪う（自分より低いものだけ）
                Voice low = null;
                foreach (var v in pool) if (v.entry != null && v.entry.priority <= e.priority && (low == null || v.entry.priority < low.entry.priority || (v.entry.priority == low.entry.priority && v.startedAt < low.startedAt))) low = v;
                if (low == null) return;
                pick = low;
            }
            lastPlayed[cue] = now;
            var src = pick.src; src.Stop(); src.clip = e.clip; src.loop = false;
            // 同時発音が多いほど少し下げて音割れを防ぐ
            float duck = active > 6 ? 0.8f : 1f;
            src.volume = Mathf.Clamp01(e.gain * gainMul * SfxVol * duck);
            src.priority = 128 - e.priority * 10;
            if (spatial) src.transform.position = worldPos.Value;
            pick.entry = e; pick.startedAt = now;
            src.Play();
        }

        public void PlayEvent(in SimEvent ev, Vector3? worldPos)
        {
            if (!eventMap.TryGetValue(ev.type, out var m)) return;
            if (!string.IsNullOrEmpty(m.cue)) Play(m.cue, worldPos);
            if (!string.IsNullOrEmpty(m.bgm)) PlayBgm(m.bgm == "-" ? null : m.bgm);
        }

        /// <summary>曲を切り替える。同じ曲なら何もしない（モード切替・リトライで二重に鳴らない）。null で停止。</summary>
        public void PlayBgm(string name, bool restart = false)
        {
            if (name == bgmName && !restart && bgmCur != null && bgmCur.isPlaying) return;
            var next = bgmCur == bgmA ? bgmB : bgmA;
            if (bgmCur != null) { var old = bgmCur; StartCoroutine(FadeOut(old)); }
            bgmName = name; bgmCur = null;
            if (string.IsNullOrEmpty(name)) return;
            var e = db != null ? db.Audio(name) : null; if (e == null || e.clip == null) return;
            next.Stop(); next.clip = e.clip; next.loop = e.loop; next.volume = e.gain * BgmVol; next.Play();
            bgmCur = next; bgmFade = 1f;
        }

        public void PlayJingleThenBgm(string jingle, string bgm)
        {
            PlayBgm(null);
            var e = db != null ? db.Audio(jingle) : null;
            Play(jingle);
            if (!string.IsNullOrEmpty(bgm)) StartCoroutine(After(e != null && e.clip != null ? e.clip.length : 0f, () => PlayBgm(bgm)));
        }
        System.Collections.IEnumerator After(float s, System.Action a) { yield return new WaitForSecondsRealtime(s); a(); }

        System.Collections.IEnumerator FadeOut(AudioSource s)
        {
            float v0 = s.volume;
            for (float t = 0; t < 0.4f; t += Time.unscaledDeltaTime) { s.volume = v0 * (1 - t / 0.4f); yield return null; }
            s.Stop();
        }

        public void PauseBgm(bool paused) { if (bgmCur == null) return; if (paused) bgmCur.Pause(); else bgmCur.UnPause(); }

        public void StopAllSfx() { foreach (var v in voices2D) v.src.Stop(); foreach (var v in voices3D) v.src.Stop(); }

        /// <summary>設定画面で音量を変えたとき、鳴っている曲にもすぐ反映する。</summary>
        public void ApplyVolumes()
        {
            if (bgmCur != null && db != null) { var e = db.Audio(bgmName); if (e != null) bgmCur.volume = e.gain * BgmVol * bgmFade; }
        }

        public string CurrentBgm => bgmName;
    }
}
