import Phaser from 'phaser';
import { GAME_H, GAME_W, GRAVITY_Y } from './config';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { GameScene } from './scenes/GameScene';
import { HudScene } from './scenes/HudScene';

declare global {
	interface Window {
		__fw?: Phaser.Game;
	}
}

if (window.__fw) {
	console.warn('[FW] 중복 부트 시도 감지 — 무시함');
	throw new Error('duplicate boot');
}

window.__fw = new Phaser.Game({
	type: Phaser.AUTO,
	parent: 'app',
	width: GAME_W,
	height: GAME_H,
	backgroundColor: '#0b0f1a',
	render: { pixelArt: true },
	physics: {
		default: 'arcade',
		arcade: { gravity: { x: 0, y: GRAVITY_Y }, debug: false },
	},
	scale: {
		mode: Phaser.Scale.FIT,
		autoCenter: Phaser.Scale.CENTER_BOTH,
	},
	dom: { createContainer: true },
	input: { activePointers: 4 },
	scene: [BootScene, TitleScene, GameScene, HudScene],
});

// PWA 서비스워커 (프로덕션 빌드에서만)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
	window.addEventListener('load', () => {
		navigator.serviceWorker.register('/sw.js').catch(() => {
			/* SW 실패해도 게임은 정상 동작 */
		});
	});
}
