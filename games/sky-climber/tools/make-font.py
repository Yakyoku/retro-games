# Sky Climber VR — 日本語フォントの生成（ゲームで使う文字だけを抜き出した Noto Sans JP）。
# 元: @fontsource/noto-sans-jp 5.3.1（SIL Open Font License 1.1）の分割 woff2。npm pack で取得して展開した場所を引数に渡す。
#   npm pack @fontsource/noto-sans-jp@5.3.1 && tar xzf fontsource-noto-sans-jp-5.3.1.tgz
#   python3 -I tools/make-font.py <展開先>/package/files
# 使う文字は index.html・*.html・src/**/*.js から集める（文言を変えたら作り直す）。出力: fonts/noto-sans-jp-{500,800}.woff2 と fonts/fonts.css
import sys, os, glob, re
from fontTools.ttLib import TTFont
from fontTools import subset
from fontTools.merge import Merger

here = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
src_dir = sys.argv[1]
text = ''
for pat in ['*.html', 'src/**/*.js', 'experiments/**/*.html']:
    for f in glob.glob(os.path.join(here, pat), recursive=True):
        text += open(f, encoding='utf-8').read()
# 数字・英字・記号は全部入れる。かなは全部入れる（動的な文言に備える）
chars = set(c for c in text if ord(c) > 0x7f)
chars |= set(chr(c) for c in range(0x20, 0x7f))
chars |= set(chr(c) for c in range(0x3040, 0x30ff + 1))
chars |= set('０１２３４５６７８９　、。・ー「」『』（）！？：×÷♥★〜…→←↑↓')
unicodes = sorted(ord(c) for c in chars)
print('文字数', len(unicodes))
os.makedirs(os.path.join(here, 'fonts'), exist_ok=True)
css = ['/* Noto Sans JP（SIL OFL 1.1）を Sky Climber VR で使う文字だけに絞ったもの。tools/make-font.py で生成 */']
for w in (500, 800):
    files = sorted(glob.glob(os.path.join(src_dir, f'noto-sans-jp-*-{w}-normal.woff2')))
    parts = []
    for f in files:
        ft = TTFont(f)
        cmap = ft.getBestCmap()
        need = [u for u in unicodes if u in cmap]
        if not need: continue
        opts = subset.Options(); opts.flavor = None; opts.layout_features = ['*']; opts.notdef_outline = True
        sub = subset.Subsetter(opts); sub.populate(unicodes=need); sub.subset(ft)
        tmp = os.path.join('/tmp' if not os.environ.get('TMPDIR') else os.environ['TMPDIR'], f'part-{w}-{len(parts)}.ttf')
        ft.flavor = None; ft.save(tmp); parts.append(tmp)
    print(w, '使う分割ファイル', len(parts))
    merged = Merger().merge(parts)
    merged.flavor = 'woff2'
    out = os.path.join(here, 'fonts', f'noto-sans-jp-{w}.woff2')
    merged.save(out)
    print(out, os.path.getsize(out))
    css.append(f"@font-face {{ font-family: 'Noto Sans JP'; font-style: normal; font-weight: {w - 100} {w + 199 if w == 500 else 900}; font-display: swap; src: url('noto-sans-jp-{w}.woff2') format('woff2'); }}")
open(os.path.join(here, 'fonts', 'fonts.css'), 'w').write('\n'.join(css) + '\n')
