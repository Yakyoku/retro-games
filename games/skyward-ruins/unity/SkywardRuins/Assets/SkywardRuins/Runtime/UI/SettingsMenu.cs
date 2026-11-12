// 設定画面（タイトルと一時停止の両方から開く）。音量・ミュート・支援設定・振動・利き手・点滅抑制・視点・VR の大きさ・
// 周辺減光・レーダー・キー再割当・音のプレビュー。変更はすぐ保存する。
using System;
using UnityEngine;

namespace SkywardRuins
{
    public static class SettingsMenu
    {
        static Settings S => SaveService.Settings;
        static void Save() { SaveService.SaveSettings(); if (AudioDirector.Instance != null) AudioDirector.Instance.ApplyVolumes(); }
        static string Pct(float v) => Mathf.RoundToInt(v * 100) + "%";
        static float Step(float v, int d, float step = 0.1f, float min = 0, float max = 1) => Mathf.Clamp(Mathf.Round((v + d * step) * 100) / 100f, min, max);
        static string OnOff(bool b) => b ? "ON" : "OFF";

        public static MenuPage Build(bool vr, bool show3D)
        {
            var p = new MenuPage { title = "設定", onCancel = () => UIRoot.Instance.menu.Back() };
            p.Add(new MenuItem(() => "全体の音量  " + Pct(S.master), null, d => { S.master = Step(S.master, d); Save(); PreviewTick(); }));
            p.Add(new MenuItem(() => "BGM  " + Pct(S.bgm), null, d => { S.bgm = Step(S.bgm, d); Save(); }));
            p.Add(new MenuItem(() => "効果音  " + Pct(S.sfx), null, d => { S.sfx = Step(S.sfx, d); Save(); PreviewTick(); }));
            p.Add(new MenuItem(() => "ミュート  " + OnOff(S.mute), () => { S.mute = !S.mute; Save(); }, d => { S.mute = !S.mute; Save(); }));
            p.Add(new MenuItem(() => "音のプレビュー", () => UIRoot.Instance.menu.Show(SoundPreview(), true)));
            p.Add(new MenuItem(() => "対空の自動連射  " + OnOff(S.autoAir), () => { S.autoAir = !S.autoAir; Save(); }, d => { S.autoAir = !S.autoAir; Save(); }));
            p.Add(new MenuItem(() => "長押しで自動爆撃  " + OnOff(S.holdAutoBomb), () => { S.holdAutoBomb = !S.holdAutoBomb; Save(); }, d => { S.holdAutoBomb = !S.holdAutoBomb; Save(); }));
            p.Add(new MenuItem(() => "強い点滅を抑える  " + OnOff(S.reduceFlash), () => { S.reduceFlash = !S.reduceFlash; Save(); }, d => { S.reduceFlash = !S.reduceFlash; Save(); }));
            p.Add(new MenuItem(() => "画面振動  " + OnOff(S.screenShake), () => { S.screenShake = !S.screenShake; Save(); }, d => { S.screenShake = !S.screenShake; Save(); }));
            p.Add(new MenuItem(() => "振動の強さ（対応機器のみ）  " + Pct(S.vibration), null, d => { S.vibration = Step(S.vibration, d); Save(); if (XRBridge.Instance != null) XRBridge.Instance.Pulse(true, 0.6f, 60); }));
            p.Add(new MenuItem(() => "3D の視点  " + (S.view3D == 0 ? "斜め見下ろし" : "コックピット"), () => { S.view3D = 1 - S.view3D; Save(); }, d => { S.view3D = 1 - S.view3D; Save(); }, () => show3D));
            p.Add(new MenuItem(() => "VR 盤面の大きさ  " + Pct(S.vrScale), null, d => { S.vrScale = Step(S.vrScale, d, 0.1f, 0.6f, 1.6f); Save(); }, () => show3D));
            p.Add(new MenuItem(() => "VR 周辺減光  " + Pct(S.vignette), null, d => { S.vignette = Step(S.vignette, d); Save(); }, () => show3D));
            p.Add(new MenuItem(() => "VR 補助レーダー  " + OnOff(S.radar), () => { S.radar = !S.radar; Save(); }, d => { S.radar = !S.radar; Save(); }, () => show3D));
            p.Add(new MenuItem(() => "利き手（VR）  " + (S.leftHanded ? "左" : "右"), () => { S.leftHanded = !S.leftHanded; Save(); }, d => { S.leftHanded = !S.leftHanded; Save(); }));
            p.Add(new MenuItem(() => "操作の割当", () => UIRoot.Instance.menu.Show(Controls(vr), true)));
            p.Add(new MenuItem(() => "もどる", () => UIRoot.Instance.menu.Back()));
            return p;
        }

        static float lastPreview;
        static void PreviewTick() { if (Time.unscaledTime - lastPreview > 0.25f && AudioDirector.Instance != null) { AudioDirector.Instance.Play("air_kill"); lastPreview = Time.unscaledTime; } }

        static MenuPage SoundPreview()
        {
            var p = new MenuPage { title = "音のプレビュー", footer = () => "選ぶと鳴ります（曲はもう一度選ぶと停止）", onCancel = () => { if (AudioDirector.Instance != null) AudioDirector.Instance.PlayBgm(null); UIRoot.Instance.menu.Back(); } };
            (string cue, string label, bool bgm)[] list =
            {
                ("bgm_play", "曲：プレイ中", true), ("bgm_fortress", "曲：要塞戦", true), ("jingle_start", "開始", false), ("air_fire", "対空発射", false), ("ground_fire", "対地発射", false),
                ("bomb_land", "着弾", false), ("air_kill", "空中敵撃破", false), ("ground_kill", "地上物撃破", false), ("player_hit", "自機被弾", false), ("fortress_warn", "要塞接近", false),
                ("fortress_destroyed", "要塞撃破", false), ("obelisk_reveal", "隠し対象の発見", false), ("extend", "残機追加", false), ("jingle_gameover", "ゲームオーバー", false),
            };
            foreach (var it in list)
            {
                var c = it;
                p.Add(new MenuItem(() => c.label, () =>
                {
                    var a = AudioDirector.Instance; if (a == null) return;
                    if (c.bgm) a.PlayBgm(a.CurrentBgm == c.cue ? null : c.cue); else a.Play(c.cue);
                }));
            }
            p.Add(new MenuItem(() => "もどる", () => p.onCancel()));
            return p;
        }

        static MenuPage Controls(bool vr)
        {
            var p = new MenuPage { title = "操作の割当", header = () => InputRouter.Instance != null ? InputRouter.Instance.BindingSummary(vr) : "", onCancel = () => UIRoot.Instance.menu.Back() };
            for (int i = 0; i < 7; i++)
            {
                int k = i;
                p.Add(new MenuItem(() => $"{InputRouter.KeyActionNames[k]}: " + (InputRouter.Instance != null && InputRouter.Instance.WaitingRebind && waiting == k ? "（キーを押してください）" : InputRouter.Instance?.KeyName(k)),
                    () => { waiting = k; InputRouter.Instance?.BeginRebind(k, _ => waiting = -1); }));
            }
            p.Add(new MenuItem(() => "ゲームパッド: " + (S.swapPadButtons ? "West=対空 / South=対地" : "South=対空 / West=対地"), () => { S.swapPadButtons = !S.swapPadButtons; Save(); }, d => { S.swapPadButtons = !S.swapPadButtons; Save(); }));
            p.Add(new MenuItem(() => "キー割当を初期値に戻す", () => { S.keys = Settings.KeyDefaults(); Save(); InputRouter.Instance?.LoadKeys(); }));
            p.Add(new MenuItem(() => "もどる", () => UIRoot.Instance.menu.Back()));
            return p;
        }
        static int waiting = -1;
    }
}
