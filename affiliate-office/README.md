# AIアフィリエイト事務所 🏢

6人のAI社員（Claude）がアフィリエイト記事を **調査 → 企画 → 執筆 → 校閲 → 公開 → 分析** の流れで作り、
その働きぶりを **仮想オフィス**（`index.html`）でリアルタイムに眺められるシステムです。

| 社員 | 担当 | やること |
|---|---|---|
| ミナト | トレンド調査 | ジャンルと商品から「買う直前の検索意図」を持つ記事ネタを洗い出す |
| サクラ | キーワード戦略 | ネタの優先順位を決め、タイトル・狙うKW・見出し構成を作る（既存記事とは重複させない） |
| ハル | ライター | 構成案から記事を執筆。体験していないことは書かない・デメリットも書く |
| リン | 校閲・法務 | 誇大表現（「絶対」「最安」「No.1」など）や価格表記を修正、景表法・ステマ規制の観点でチェック |
| ソラ | パブリッシャー | HTML化、Amazon/楽天/A8 のアフィリエイトリンク設置、PR表記、トップページ・sitemap.xml 更新 |
| ケイ | アナリスト | `data/performance.csv` の成果を集計し、次回の企画にフィードバック |

## 使い方

```bash
cd affiliate-office
npm install

# 1. 設定: config.json にジャンル・読者・商品・アフィリエイトIDを書く
# 2. 実行（Claude APIで本番の記事を書く）
export ANTHROPIC_API_KEY=sk-ant-...
npm run run            # = node engine/run.js

# APIキーなしで流れだけ試す（テンプレート記事になります）
npm run run:offline

# 3. 仮想オフィスを見る（別ターミナルで）
npm run serve          # → http://localhost:8787/  記事サイトは /site/
```

`run` 実行中にオフィスを開いておくと、社員が席で作業し、原稿を持って次の担当に歩いて渡し、朝会・終礼で会議テーブルに集まる様子が見られます。
業務が終わった後に開いたときは、最後に実行した業務の**実際のログ**を1回再生し、その後は席で待機します（「▶ 最新の業務を見る」でもう一度見られます）。作り物のデモは流しません。

## 実際に収益化するまでの手順

このシステムは「記事を作って載せる」ところまでを自動化します。お金が発生するには以下が必要です。

1. **ASPに登録**: Amazonアソシエイト、楽天アフィリエイト、A8.net など。審査があります（記事が一定数あるサイトが必要なことが多い）。
2. **IDを設定**: `config.json` の `affiliate.amazonTag` / `rakutenId`、商品ごとの `asin`・`a8Tag` を埋める。
   `YOUR-...` のままだとアフィリエイトタグは付きません。
   - **A8.net**: 管理画面で広告主と提携 → 「広告リンク作成」→ テキストリンクのコードをコピーし、商品の `a8Tag` にそのまま貼る（`<a href="https://px.a8.net/...">…</a><img src="https://www….a8.net/0.gif?...">` の形）。
     リンクとインプレッション計測用の画像は自動で取り出されます。家電レンタルやサブスクなど Amazon/楽天 で買えないものは `"a8Only": true`。
3. **公開**: `site/` を GitHub Pages や独自ドメインで公開し、`config.json` の `siteUrl` を合わせて Google Search Console に `sitemap.xml` を登録。
4. **定期実行**: cron や GitHub Actions で `npm run run` を回して記事を増やす。
5. **成果を戻す**: ASP管理画面の数字を `data/performance.csv`（`date,article,clicks,conversions,revenue_jpy`）に貼る → アナリストが次の企画に反映。

### 注意（大事）
- **収益は保証されません。** 検索流入が育つまで数か月かかるのが普通です。
- **AIの量産記事はそのままだと評価されにくい**ので、公開前に人が読んで、実際に使った感想・写真・独自の比較を足すのが一番効きます。
- 2023年10月からの**ステマ規制**により広告であることの表示が必要です（各ページ冒頭に【PR】表記を自動で入れています）。
- Amazonアソシエイトの規約上、**価格を静的に書かない**ようにしています（校閲担当が自動で削除）。
- 「Amazonのアソシエイトとして…」の表記は `amazonTag` を設定したときだけ表示されます。

## 毎日自動で働かせる（GitHub Actions）

`.github/workflows/affiliate-office.yml` が毎朝 6:47（日本時間）に業務を実行し、記事と業務ログをコミットします。

1. リポジトリの **Settings → Secrets and variables → Actions** に `ANTHROPIC_API_KEY` を登録
2. このブランチを `main` にマージ（定期実行は既定ブランチでしか動きません）
3. **Settings → Pages** が `main` から公開されていれば、`https://<ユーザー名>.github.io/<リポジトリ名>/affiliate-office/` がスマホで見られるオフィスになります
4. すぐ試すなら Actions タブ → affiliate office → Run workflow

キーが未登録の日はお休みします（テンプレート記事を量産しないため）。

## ファイル構成

```
affiliate-office/
  index.html / office.js / office.css   仮想オフィス
  config.json                           ジャンル・商品・アフィリエイトID
  engine/run.js                         1日分の業務を実行
  engine/agents.js                      6人のAI社員の仕事内容
  engine/llm.js                         Claude API 呼び出し（モデルは AFFILIATE_MODEL で変更可）
  engine/bus.js                         業務ログ → data/state.json（オフィスが読む）
  engine/serve.js                       ローカル確認用サーバー
  data/performance.csv                  ASPの成果を貼る場所
  site/                                 生成されるアフィリエイトサイト（同梱分はオフラインモードのサンプル）
```
