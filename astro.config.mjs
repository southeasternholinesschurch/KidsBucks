// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

/** KidsBucks. Server-rendered: every page depends on who is signed in and on
 *  numbers that change while people are looking at them. */
export default defineConfig({
  output: 'server',
  adapter: cloudflare({ platformProxy: { enabled: true } }),
  devToolbar: { enabled: false },
});
