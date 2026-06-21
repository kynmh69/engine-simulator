// @ts-check
import { defineConfig } from 'astro/config';

// 完全にクライアントサイドで動作するため静的サイトとしてビルドし、
// Cloudflare Workers の Static Assets で配信する。
// https://astro.build/config
export default defineConfig({
  output: 'static',
});
