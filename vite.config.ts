import { defineConfig } from 'vite';

export default defineConfig({
	build: {
		outDir: 'dist',
		assetsInlineLimit: 0,
		chunkSizeWarningLimit: 1600,
	},
	server: {
		port: 5173,
		proxy: {
			// 로컬에서 wrangler dev(8787)와 함께 띄우면 랭킹 API도 동작한다
			'/api': 'http://localhost:8787',
		},
	},
});
