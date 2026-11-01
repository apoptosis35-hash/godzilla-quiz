# SNS用ショート動画

[huashu-motion](https://github.com/alchaincyf/huashu-motion)（MIT）で作った、記事紹介の縦長ショート動画です。1本 = 1フォルダで、`index.html` が動画の本体です（HTML + GSAP）。

| フォルダ | 元の記事 | 長さ | 書き出し |
|---|---|---|---|
| `noise-cancel-short/` | 在宅ワークにノイズキャンセリングイヤホンは必要？ | 15.5秒・1080×1920 | `out/noise-cancel-short-v2.mp4` |

- 冒頭から最後まで左上に【PR】を表示しています（ステマ規制対応）。投稿文にも「#PR」を入れてください。
- 商品写真は使っていません（権利の問題を避けるため）。文字・図形・効果音とBGM（ローカルで合成）だけです。
- 最後の1.2秒、右下に小さく「Made with huashu-motion」が入ります。消すなら `index.html` の `<html>` に `data-om-signature="off"` を付けて書き出し直します。
- フォントは Noto Sans JP（SIL OFL、`assets/fonts/OFL-NotoSansJP.txt`）を、動画で使う文字の分だけ同梱しています。

## 書き出し直すとき
```bash
git clone --depth 1 https://github.com/alchaincyf/huashu-motion /tmp/huashu-motion
node /tmp/huashu-motion/cli/om.js render affiliate-office/videos/noise-cancel-short   # Chrome と FFmpeg が必要
```
文字を変えたいときは `index.html` 冒頭の `data-composition-variables` の `default` を書き換えます。
