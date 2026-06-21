# 🔧 エンジンシミュレーター (Engine Simulator)

直列 **3気筒〜12気筒** のレシプロエンジンの音とメカニズムを、ブラウザ上でリアルタイムにシミュレーションする Web アプリです。

[Astro](https://astro.build/) で開発し、[Cloudflare Workers (Static Assets)](https://developers.cloudflare.com/workers/static-assets/) にデプロイします。

## ✨ 機能

- **気筒数の切り替え (3〜12気筒)** — レイアウトごとにサウンドの鼓動・音程・滑らかさが変化します。
- **リアルタイム音響合成** — [Web Audio API](https://developer.mozilla.org/ja/docs/Web/API/Web_Audio_API) で点火パルス・低音ボディ・メカニカルノイズを合成。音声ファイルは一切使用していません。
- **アクセル操作** — ボタン長押し / スペースキーで吹け上がり（ブリッピング）を体験できます。
- **タコメーター** — レッドゾーン付きの回転計をリアルタイム描画。
- **ピストン可視化** — 気筒数ぶんのピストンの上下動と燃焼タイミングをアニメーション表示。
- **エンジン情報** — 各レイアウトの点火順序・レッドライン・代表車種などを表示。

## 🔬 音響モデル

4ストロークエンジンでは、各シリンダーがクランク2回転に1回燃焼します。

```
1回転あたりの燃焼回数 = 気筒数 / 2
点火（燃焼）周波数 f = (RPM / 60) × (気筒数 / 2)  [Hz]
```

直列等間隔点火のエンジンでは点火が等間隔に並ぶため、排気音の基本周波数は点火周波数 `f` に一致します。気筒数が多いほど `f` が高くなり滑らかで高い音に、少ないほど低く歯切れの良い「ドコドコ」としたサウンドになります。

合成は以下のレイヤーで構成しています（`src/lib/engineSound.ts`）。

1. **排気パルス列** — 倍音を持たせたカスタム周期波（点火周波数）
2. **低音ボディ** — サイン波の唸り
3. **メカニカルノイズ** — 点火に同期して脈動するフィルター済みノイズ
4. **回転ムラ** — 気筒数に応じた微小なピッチ揺らぎ

## 🚀 開発

```bash
npm install      # 依存関係のインストール
npm run dev      # 開発サーバー (http://localhost:4321)
npm run build    # dist/ へ静的ビルド
npm run preview  # ビルドして wrangler でローカル配信
```

## ☁️ Cloudflare Workers へのデプロイ

[Wrangler](https://developers.cloudflare.com/workers/wrangler/) を使ってデプロイします。設定は `wrangler.jsonc` を参照してください（ビルド成果物 `dist/` を Static Assets として配信）。

```bash
npm run deploy   # astro build && wrangler deploy
```

初回はログインが必要です。

```bash
npx wrangler login
```

## 🛠 技術スタック

| 項目 | 内容 |
| --- | --- |
| フレームワーク | Astro (static output) |
| 音響 | Web Audio API |
| 描画 | Canvas 2D |
| デプロイ | Cloudflare Workers (Static Assets) + Wrangler |

## 📁 構成

```
src/
  layouts/Layout.astro      共通レイアウト
  pages/index.astro         メインUI + クライアントスクリプト
  pages/404.astro           404ページ
  lib/engineSound.ts        Web Audio によるエンジン音合成
  lib/engineSpecs.ts        気筒数ごとのエンジン仕様データ
public/favicon.svg
astro.config.mjs
wrangler.jsonc              Cloudflare Workers 設定
```
