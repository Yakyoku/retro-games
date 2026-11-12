// Unity Test Framework（EditMode）。Unity 上でデータ一式と共通ロジックを確認する。
//   Unity -batchmode -projectPath unity/SkywardRuins -runTests -testPlatform EditMode -testResults results.xml
using System.Linq;
using NUnit.Framework;
using SkywardRuins.Core;
using SkywardRuins.EditorTools;
using UnityEditor;

namespace SkywardRuins.Tests
{
    public class SkywardEditorTests
    {
        [Test] public void ProjectIsValid()
        {
            var errors = ProjectBuilder.Validate();
            Assert.IsEmpty(errors, string.Join("\n", errors));
        }

        [Test] public void DatabaseHas16DistinctAreas()
        {
            var db = AssetDatabase.LoadAssetAtPath<GameDatabase>(ProjectBuilder.Root + "/Resources/GameDatabase.asset");
            Assert.NotNull(db);
            Assert.AreEqual(16, db.areas.Length);
            Assert.AreEqual(16, db.areas.Select(a => a.data.profile.name).Distinct().Count());
        }

        [Test] public void EveryAudioEventHasClip()
        {
            var db = AssetDatabase.LoadAssetAtPath<GameDatabase>(ProjectBuilder.Root + "/Resources/GameDatabase.asset");
            foreach (var e in db.audioEvents.Where(e => !string.IsNullOrEmpty(e.cue)))
                Assert.NotNull(db.Audio(e.cue)?.clip, e.ev + " → " + e.cue);
        }

        [Test] public void SimIsDeterministicWithDatabaseAreas()
        {
            var db = AssetDatabase.LoadAssetAtPath<GameDatabase>(ProjectBuilder.Root + "/Resources/GameDatabase.asset");
            var a = new Sim(db.tuning, db.AreaList(), Difficulty.Standard, new AssistSettings(), 0, 7);
            var b = new Sim(db.tuning, db.AreaList(), Difficulty.Standard, new AssistSettings(), 0, 7);
            var r = new Rng(3);
            for (int i = 0; i < 3600; i++)
            {
                var f = new InputFrame { mx = r.Range(-1, 1), my = r.Range(-1, 1), air = r.Chance(0.6f), ground = r.Chance(0.3f) };
                a.Step(f); b.Step(f);
            }
            Assert.AreEqual(a.StateHash(), b.StateHash());
        }

        [Test] public void BombLandsWhereSightWas()
        {
            var db = AssetDatabase.LoadAssetAtPath<GameDatabase>(ProjectBuilder.Root + "/Resources/GameDatabase.asset");
            var s = new Sim(db.tuning, db.AreaList(), Difficulty.Standard, new AssistSettings(), 0, 1);
            s.Step(new InputFrame { ground = true });
            var bomb = s.Bombs[0]; float wy = bomb.tworldY, x = bomb.tx;
            for (int i = 0; i < 30; i++)
            {
                s.Step(new InputFrame { mx = 1, my = 1 });
                foreach (var e in s.Events) if (e.type == EvType.BombLand) { Assert.AreEqual(x, e.x, 1e-3); Assert.AreEqual(wy, e.y + s.Scroll, 1e-3); return; }
            }
            Assert.Fail("bomb did not land");
        }
    }
}
