// Boot シーン：永続サービスを 1 度だけ用意してタイトルへ。
using UnityEngine;

namespace SkywardRuins
{
    public class BootLoader : MonoBehaviour
    {
        void Start()
        {
            Services.EnsureBooted();
            Services.LoadScene("Title");
        }
    }
}
