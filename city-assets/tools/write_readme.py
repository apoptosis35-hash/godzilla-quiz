# Writes README.md from models.json (run after make_models.py).
import json, os
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
ms = json.load(open(os.path.join(ROOT, 'models.json')))
rows = "\n".join(f"| {m['jp']} | `{m['name']}.glb` | {m['category']} | {' × '.join(str(v) for v in m['size_m'])} | {m['tris']} |" for m in ms)
open(os.path.join(ROOT, 'README.md'), 'w').write(f"""# 大都会3Dモデル集(city-assets)

超高層ビルが並ぶ大都会の街並みを組むためのモデル集です(全{len(ms)}種)。すべて Blender の Python スクリプトで作ったオリジナルで、実在のビルや会社・お店のデザイン、ロゴは使っていません。

![組み立て例](demo.jpg)

- 一覧と3Dプレビュー: `city-assets/index.html`(GitHub Pages なら `https://<ユーザー名>.github.io/godzilla-quiz/city-assets/`)
  - カードを押すとモデルを3Dで回して見られます。「街を組んでみる」で、大通りと交差点のまわりにビルや車を並べた街をその場で組み立てます。
- `demo.jpg` は、モデルを並べてBlenderで描いた夕方のビル街です(`--demo` で作り直せます)。

## 組み立て方

- 大きさは1単位 = 1mの実寸です。Y軸が上、原点は足元の中央、正面は +Z です。
- **道路**: `road_straight` は幅14m(片側2車線)・長さ20m、`road_crossing` は14m四方の交差点です。交差点の中心から17m、37m…の位置に直線をつなぎます。横向きの道は Y軸まわりに90°回します。
- **歩道**: `sidewalk` は幅4m・長さ20mで、縁石が -X 側にあります。車道の中心から9mの位置に、縁石を車道側に向けて置きます。
- **高架**: `highway`(道路)と `rail_viaduct`(鉄道)は長さ40mで、橋脚ごと地面に置きます。40mごとにつなげられます。
- **建物**: そのまま地面に置きます。1階には店舗が並び、屋上には空調設備や航空障害灯があります。屋上に `helipad`・`rooftop_billboard`・`rooftop_hvac` を追加で置けます。
- **大型ビジョン** `big_screen` は壁に付ける物で、原点が壁との接点です。
- 外壁・店先・広告・標識は画像テクスチャ(`textures/`)で、GLBに入っています。外壁の画像は窓4列 × 4階分(12m × 14.4m)で繰り返します。
- 広告画面・店先・街灯・信号・航空障害灯は自分で光ります(emissive)。夜景ではブルームをかけると雰囲気が出ます。

## モデル一覧

| 名前 | ファイル | 分類 | 幅 × 高さ × 奥行 (m) | 三角形 |
|---|---|---|---|---|
{rows}

`models.json` にも同じ情報(と使っているマテリアル、ファイルサイズ)が入っています。

## 作り直す・追加する

```
pip install bpy pillow
python3 tools/make_textures.py             # 外壁・店先・道路・広告・標識の画像
python3 tools/make_models.py --render      # 全モデル(glb/、preview/、models.json、tools/city.blend)
python3 tools/make_models.py --render --demo   # さらに組み立て例 demo.jpg を描く(CPUで数分)
python3 tools/write_readme.py              # このREADMEのモデル一覧を更新
```

- 部品を作る関数(箱・円柱・テクスチャ付きの箱など)は、城砦街モデル集(`../kowloon-assets/tools/make_models.py`)と田舎モデル集(`../inaka-assets/tools/make_models.py`)のものを共通で使っています。
- モデルを追加するときは、`tools/make_models.py` に `@K.model('名前', '日本語名', '分類')` をつけた関数を書きます。ビルの外壁は `facade('glass_blue', サイズ, 位置)` で貼れます。
- 広告や看板の言葉は、架空のもの(「新発売」「SALE」「シティ中央駅」など)だけです。
""")
print('README written')
