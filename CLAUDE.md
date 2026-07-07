# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

直列3〜12気筒のエンジン音をブラウザ上でリアルタイム合成する Web アプリ。Astro で静的ビルドし、Cloudflare Workers (Static Assets) で配信する。サウンドは音声ファイルを使わず Web Audio API で完全に合成している。

## Commands

```bash
npm run dev      # 開発サーバー (http://localhost:4321)
npm run build    # dist/ へ静的ビルド
npm run check    # astro check による型チェック（PR前に実行）
npm run preview  # astro build → wrangler dev でローカル配信確認
npm run deploy   # astro build → wrangler deploy (要 npx wrangler login)
```

テストフレームワークは未導入。動作確認は `npm run check` と `npm run build`、ブラウザでの目視確認で行う。

## Architecture

完全にクライアントサイドで動作するため、Astro は `output: 'static'`（アダプター無し）。サーバーサイドロジックは存在しない。

中核は3つのライブラリと1つのページに集約される:

- **`src/lib/engineSound.ts`** — `EngineSimulator` クラス。Web Audio API のノードグラフ全体を管理する。サウンドの物理モデルはこのファイル冒頭のコメントに記載: 4ストロークでは点火周波数 `f = (RPM/60) × (気筒数/2)`。グラフは4レイヤー（排気パルス列のカスタム周期波 + サイン波の低音ボディ + 点火同期で脈動するバンドパスノイズ + デチューンによる回転ムラ）を lowpass → compressor → analyser → master で合成する。パラメータにはマフラー種別 `exhaust`（stock/sport/straight — 倍音構成・フィルター開度・ノイズ量が変わる）と `volume` を含む。`backfire()` はアクセルオフ時のアフターファイア音（ノイズバースト、lowpass を迂回して compressor へ直結）。`getSpectrum()` / `getWaveform()` がビジュアライザー用データを返す。パラメータ変更は全て `AudioParam.setTargetAtTime` で平滑化しクリックノイズを防ぐ。`start()` は必ずユーザー操作後に呼ぶ（AudioContext の制約）。

- **`src/lib/engineSpecs.ts`** — 気筒数(3〜12)ごとの `EngineSpec`（レイアウト名・レッドライン・アイドル・点火順序・説明・代表車種）。レッドラインとアイドルは UI のスライダー範囲やタコメーター描画の上限を決めるため、サウンドモデルと密結合している。

- **`src/lib/gearbox.ts`** — 6速シーケンシャルギアの計算ヘルパー（ギア比・最終減速比・車速換算 `speedKmh`・変速後回転数 `rpmAfterShift`）。gear は 0 = ニュートラル。

- **`src/pages/index.astro`** — UI とクライアントスクリプト（`<script>` 内に全て記述、Astro が TS をバンドル）。`requestAnimationFrame` の物理ループが状態 (`rpm` / `throttle` / `gear` / `crankAngle`) を時間で更新し、毎フレーム `engine.update()` を呼びつつ Canvas でタコメーター（中央にギア・速度表示）・クランク機構（コンロッド機構学でピストン位置を計算）・オーディオビジュアライザーを描画する。アクセルは「押している間だけ redline へ吹け上がり、離すとスライダー値へ戻る」イージング方式。シフト（↑/W・↓/S・画面ボタン）は 150ms のスロットルカットを挟み `rpmAfterShift` で回転を合わせる。レッドライン到達でレブリミッター（60ms 周期の燃料カット）、高回転からのアクセルオフで確率的に `backfire()` を発火。レッドライン付近では画面ビネットとシフトライトLEDが点灯する。

データの流れ: スライダー/アクセル/ギア/気筒/マフラーボタン → index.astro の状態 → 物理ループ → `EngineSimulator.update()` → Web Audio ノードグラフ。気筒数を変えると `engineSpecs` のレッドライン/アイドルが UI とサウンド両方の挙動を変える。

## Deployment

`wrangler.jsonc` がビルド成果物 `dist/` を Static Assets として配信する（`main` ワーカースクリプトは無し、純粋な静的配信）。`not_found_handling: "404-page"` で `404.html` を返す。設定変更後は `npx wrangler deploy --dry-run` で検証できる（認証不要）。
