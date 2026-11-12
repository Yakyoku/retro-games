// Sky Climber VR — VR 直接操作の移動解法。
// 「手を保持点に固定したまま、コントローラーを引いた分だけ rig（プレイヤーの基準座標）を動かす」。
// 両手保持でも 1 つの解（各手の項の平均）で調停し、移動量は 2 倍にならない。
// 項は「つかんだ瞬間の rig 位置 G」と「つかんだ瞬間のコントローラー（rig 内）位置 L0」から絶対値で計算するので、
// rig の移動が手の移動へ再加算されることはない。保持の組合せが変わる瞬間は偏り（bias）で連続にし、0.18 秒で戻す。
// 追跡の跳び（1 フレームで 0.3m 超）や追跡喪失から戻ったときは、その手をつかみ直した扱いにして移動量に使わない。
export const DIRECT = { glitch: 0.30, biasTau: 0.18, wallFade: 0.14 };

export class DirectSolver {
  constructor(offset = { x: 0, y: 0, z: 0.45 }) {
    this.offset = { ...offset };
    this.pull = 1;                 // 引いた量に対する移動の倍率（座位の補助など。1＝現実どおり）
    this.hands = { L: this.blank(), R: this.blank() };
    this.bias = { x: 0, y: 0 };
  }
  blank() { return { held: false, hold: null, G: null, L0: null, prev: null, valid: false }; }
  term(h) { return { x: h.G.x - this.pull * (h.prev.x - h.L0.x), y: h.G.y - this.pull * (h.prev.y - h.L0.y) }; }
  avgTerms() {
    let n = 0, x = 0, y = 0;
    for (const s of ['L', 'R']) { const h = this.hands[s]; if (h.held) { const t = this.term(h); x += t.x; y += t.y; n++; } }
    return n ? { x: x / n, y: y / n } : null;
  }
  rebias() { const a = this.avgTerms(); if (a) this.bias = { x: this.offset.x - a.x, y: this.offset.y - a.y }; else this.bias = { x: 0, y: 0 }; }
  // ワールド座標でのコントローラー位置
  world(local) { return { x: this.offset.x + local.x, y: this.offset.y + local.y, z: this.offset.z + local.z }; }
  grab(side, holdId, local) {
    const h = this.hands[side];
    h.held = true; h.valid = true; h.hold = holdId; h.G = { x: this.offset.x, y: this.offset.y }; h.L0 = { x: local.x, y: local.y }; h.prev = { x: local.x, y: local.y };
    this.rebias();
  }
  release(side) { const h = this.hands[side]; if (!h.held) return false; h.held = false; h.hold = null; this.rebias(); return true; }
  // その手を、今の位置でつかみ直したことにする（項の値は変えない）
  reanchor(h, local) { const t = this.term(h); h.G = { x: t.x, y: t.y }; h.L0 = { x: local.x, y: local.y }; h.prev = { x: local.x, y: local.y }; }
  // controllers = { L: {x,y,z, valid}, R: ... }（rig 内の座標）。戻り値: 適用した移動量
  update(dt, controllers) {
    for (const s of ['L', 'R']) {
      const c = controllers[s], h = this.hands[s];
      if (!c || !c.valid) { h.valid = false; continue; }            // 追跡喪失中は項を凍結
      if (h.held) {
        const jump = h.prev ? Math.hypot(c.x - h.prev.x, c.y - h.prev.y) : 0;
        if (!h.valid || jump > DIRECT.glitch) this.reanchor(h, c); // 復帰・跳びは移動量に使わない
        else h.prev = { x: c.x, y: c.y };
      }
      h.valid = true;
    }
    const a = this.avgTerms();
    const k = Math.exp(-dt / DIRECT.biasTau);
    this.bias.x *= k; this.bias.y *= k;
    if (!a) return { x: 0, y: 0 };
    const nx = a.x + this.bias.x, ny = a.y + this.bias.y;
    const d = { x: nx - this.offset.x, y: ny - this.offset.y };
    this.offset.x = nx; this.offset.y = ny; // z は固定（壁の裏や遠方へ行かない）
    return d;
  }
  // 外から rig を動かす（地面で止める・復帰）。保持中の項もずらして連続にする
  shift(dx, dy) {
    this.offset.x += dx; this.offset.y += dy;
    for (const s of ['L', 'R']) { const h = this.hands[s]; if (h.held) { h.G.x += dx; h.G.y += dy; } }
  }
  teleport(x, y) { this.offset.x = x; this.offset.y = y; this.hands.L = this.blank(); this.hands.R = this.blank(); this.bias = { x: 0, y: 0 }; }
  // 頭が壁に近すぎるときの暗転量（0〜1）。頭の姿勢は上書きしない
  wallFade(headWorldZ) { return Math.max(0, Math.min(1, (DIRECT.wallFade - headWorldZ) / 0.08)); }
}
