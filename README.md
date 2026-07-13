# 🏁 Engine Simulator

直列3気筒（I3）から直列12気筒（I12）までのエンジン音を、ブラウザ上でリアルタイムに合成するシミュレーターです。

**Astro** で開発し、**Cloudflare Workers** へデプロイできます。サウンド合成には Web Audio API の `AudioWorklet` を使用しています。

## 特徴

- **直列3〜12気筒**をワンタップで切り替え
- 各レイアウト固有のアイドリング回転数・レッドライン・慣性・点火順序を再現
- スロットル操作でリアルタイムに回転数と排気音が変化（スペースキーでブリッピングも可能）
- タコメーター、ピストン、点火のビジュアライゼーション
- サーバー不要のクライアントサイド音声合成（`AudioWorklet`）

## 仕組み

4ストロークエンジンは 720°（クランク2回転）ごとに各気筒が1回点火します。
N 気筒の等間隔点火では点火間隔は `720 / N` 度です。

`public/engine-processor.js`（AudioWorklet）が、現在の回転数に応じてクランク角を
サンプル単位で進め、点火のたびに減衰する「燃焼パルス」をボイスプールへ注入します。
低回転では「ドッ・ドッ・ドッ」という単発の鼓動が、高回転では点火頻度が上がって
連続した咆哮へと変化します。回転数の上昇/下降は `src/engine/simulator.ts` の
慣性モデルで滑らかに補間しています。

## 開発

```bash
npm install
npm run dev      # http://localhost:4321
```

## ビルド

```bash
npm run build    # dist/ に Cloudflare Workers 用の出力を生成
```

## Cloudflare Workers へのデプロイ

[Wrangler](https://developers.cloudflare.com/workers/wrangler/) の設定は
`wrangler.jsonc` にあります。

```bash
npm run deploy   # astro build && wrangler deploy
```

初回はログインが必要です:

```bash
npx wrangler login
```

ローカルで Workers ランタイムを使ってプレビュー:

```bash
npm run build
npm run preview  # wrangler dev
```

## 技術スタック

| 項目 | 使用技術 |
| --- | --- |
| フレームワーク | [Astro](https://astro.build/) |
| 音声合成 | Web Audio API (`AudioWorklet`) |
| デプロイ | [Cloudflare Workers](https://workers.cloudflare.com/) (`@astrojs/cloudflare`) |

## ライセンス

MIT
