# おべんとうポン！ ストア版アプリ

App Store / Google Play で配る版です。家族版（`../bento/`）とは別のフォルダで、家族版には手を入れていません。

| | 家族版 `bento/` | ストア版 `obento-app/` |
|---|---|---|
| 家族の写真 | 入っている | **入っていない**（写真は各自が端末で選べる） |
| レアキャラ | 写真 | 金のおにぎり（オリジナル） |
| 広告・課金 | なし | ゲームの合間に広告、「広告を消す」300円 |
| 共有ボタン | あり | ストアのページができるまで隠す |

## フォルダ

- `web/` … ゲーム本体（家族版から写真を抜き、広告・課金を足したもの）
- `app.config.json` … アプリID、バージョン、広告ID、商品ID、リンク。**ここだけ書きかえれば済む**ようにしてある
- `build.mjs` … `web/` → `www/` を作り、Android / iOS の設定（バージョン、AdMobのID、アイコン、起動画面）を書きこむ
- `android/`, `ios/` … Capacitor のアプリ本体
- `site/` … プライバシーポリシーとサポートのページ（GitHub Pages で公開される）
- `store/` … ストア掲載用の文章（`listing.md`）と画像

## 作る

```sh
npm ci
npm test          # ゲームのロジックのテスト
npm run sync      # www/ を作って android/ ios/ に反映
```

- Android：GitHub の Actions →「obento android」が、`main` に変更が入るたびに自動で組み立てる。
  できた `obento-pon-android`（テスト用APKと、ストア用の .aab）は、その実行ページの下からダウンロードできる。
- iPhone：Mac で `npx cap open ios` → Xcode で Archive → App Store Connect にアップロード。

ブラウザでの確認：`npx http-server -p 8126 web` → `node web/tests/e2e.mjs http://localhost:8126/`

## 公開までの手順（あなたがやること）

### 1. Google Play（先にこちら）
1. Google Play Console に登録（25ドル、本人確認あり）
2. アップロード鍵を作る（1回だけ。**この鍵をなくすと更新できなくなるので、2か所以上に保存**）
   ```sh
   keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
   base64 -w0 upload.jks   # 出てきた文字列を下の ANDROID_KEYSTORE_BASE64 に
   ```
3. GitHub のリポジトリ → Settings → Secrets and variables → Actions に4つ登録
   `ANDROID_KEYSTORE_BASE64` / `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_ALIAS`（上の例なら `upload`）/ `ANDROID_KEY_PASSWORD`
4. AdMob に登録 → アプリを2つ（Android / iOS）追加 → それぞれ「インタースティシャル」広告ユニットを作る
5. `app.config.json` の `ads` を本物のIDにして、`"testing": false` にする（それまでは Google のテスト広告が出る）
6. Play Console でアプリを作成 → `store/listing.md` の内容を入力 → 「広告を消す」（`remove_ads`）を作る
7. Actions で作った .aab を「クローズドテスト」に出し、**12人以上に14日間**テストしてもらう（個人の新規アカウントの決まり）
8. 本番に公開を申請

### 2. App Store（あとから）
1. Apple Developer Program に登録（年99ドル）
2. Mac と Xcode で `ios/` を開き、チーム（自分のアカウント）を選んで Archive
3. App Store Connect で `store/listing.md` の内容と「Appのプライバシー」を入力、`remove_ads` を作って審査に出す

## 公開前に残っていること

- `site/support.html` の問い合わせ先（`id="contact"`）に、公開してよいメールアドレスを入れる
- アイコン（`web/icons/`）の元の絵を、売るアプリで使ってよいか確認する
- ネット対戦の中継は PeerJS の無料サーバーを使っている。利用者が増えたら自前のサーバーに切りかえる
