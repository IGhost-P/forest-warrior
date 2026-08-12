import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../config';
import { fetchTop, localTop } from '../systems/rankClient';

const KOR_FONT = '"PFStardust", "Malgun Gothic", sans-serif';
const TITLE_FONT = '"LuckiestGuy", Impact, sans-serif';

export class TitleScene extends Phaser.Scene {
	private bgm?: Phaser.Sound.BaseSound;
	private startBtn!: Phaser.GameObjects.Container;
	private inputEl!: HTMLInputElement;

	constructor() {
		super('title');
	}

	create(): void {
		// 배경 (540x462 → cover)
		const bg = this.add.image(GAME_W / 2, GAME_H / 2, 'title_bg');
		const cover = Math.max(GAME_W / bg.width, GAME_H / bg.height);
		bg.setScale(cover);

		this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.25);

		// 타이틀
		this.add.text(400, 130, 'WARRIOR', { fontFamily: TITLE_FONT, fontSize: '84px', color: '#eaf5e2', stroke: '#1c2b1a', strokeThickness: 10 }).setOrigin(0.5);
		const t2 = this.add.text(400, 220, 'of the FOREST', { fontFamily: TITLE_FONT, fontSize: '52px', color: '#8ee08a', stroke: '#1c2b1a', strokeThickness: 8 }).setOrigin(0.5);
		this.tweens.add({ targets: t2, y: 214, duration: 1400, yoyo: true, repeat: -1, ease: 'sine.inout' });

		// 대기 중인 히어로
		this.add.sprite(400, 560, 'hero_idle').setScale(2.4).play('hero_idle');

		// 닉네임 입력 (DOM)
		const saved = localStorage.getItem('fw_nick') ?? '';
		const dom = this.add.dom(400, 330, 'input', [
			'width: 300px', 'padding: 12px 16px', 'font-size: 22px', 'text-align: center',
			`font-family: ${KOR_FONT}`, 'color: #fff', 'background: rgba(10,16,28,.75)',
			'border: 2px solid #6ee7a0', 'border-radius: 10px', 'outline: none',
		].join(';'));
		this.inputEl = dom.node as HTMLInputElement;
		this.inputEl.maxLength = 12;
		this.inputEl.placeholder = '닉네임 (1~12자)';
		this.inputEl.value = saved;
		this.inputEl.addEventListener('input', () => this.refreshStartBtn());
		this.inputEl.addEventListener('keydown', e => {
			if (e.key === 'Enter') this.tryStart();
			e.stopPropagation();
		});

		// 시작 버튼
		const btnImg = this.add.image(0, 0, 'ui_btn');
		btnImg.setDisplaySize(280, 74);
		const btnText = this.add.text(0, -2, '게임 시작', { fontFamily: KOR_FONT, fontSize: '30px', color: '#ffe9b3' }).setOrigin(0.5);
		this.startBtn = this.add.container(400, 425, [btnImg, btnText]);
		this.startBtn.setSize(280, 74);
		this.startBtn.setInteractive({ useHandCursor: true });
		this.startBtn.on('pointerdown', () => this.tryStart());
		this.refreshStartBtn();

		this.buildRankPanel();
		this.buildMuteButton();

		// 조작 안내
		this.add.text(400, 480, 'PC: ← → 이동 · ↑ 점프 · X 공격', { fontFamily: KOR_FONT, fontSize: '17px', color: '#c9d6ef' }).setOrigin(0.5);

		// 로비 BGM (오디오 잠금 해제 대응)
		this.bgm = this.sound.add('bgm_lobby', { loop: true, volume: 0.35 });
		if (this.sound.locked) {
			this.sound.once(Phaser.Sound.Events.UNLOCKED, () => this.bgm?.play());
		} else {
			this.bgm.play();
		}

		this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.bgm?.stop());
	}

	private refreshStartBtn(): void {
		const ok = this.inputEl.value.trim().length > 0;
		this.startBtn.setAlpha(ok ? 1 : 0.45);
	}

	private tryStart(): void {
		const nick = this.inputEl.value.trim().slice(0, 12);
		if (!nick) return;
		localStorage.setItem('fw_nick', nick);
		this.scene.start('game', { nick });
	}

	private buildRankPanel(): void {
		const cx = 1000;
		const panel = this.add.image(cx, 390, 'ui_modal');
		panel.setDisplaySize(440, 540);

		this.add.text(cx, 160, 'TOP 10', { fontFamily: TITLE_FONT, fontSize: '36px', color: '#ffd54f', stroke: '#332200', strokeThickness: 6 }).setOrigin(0.5);
		const status = this.add.text(cx, 200, '불러오는 중...', { fontFamily: KOR_FONT, fontSize: '16px', color: '#9fb3d9' }).setOrigin(0.5);
		const listText = this.add.text(cx - 175, 230, '', {
			fontFamily: KOR_FONT, fontSize: '20px', color: '#e8eefc', lineSpacing: 12,
		});

		fetchTop(10).then(({ entries, offline }) => {
			if (!this.scene.isActive()) return;
			status.setText(offline ? '오프라인 — 내 기기 기록' : '');
			if (entries.length === 0) {
				listText.setText('아직 기록이 없습니다.\n1등의 주인공이 되어보세요!');
				return;
			}
			listText.setText(entries.map((e, i) => {
				const rank = String(i + 1).padStart(2, ' ');
				const name = e.name.length > 8 ? e.name.slice(0, 8) + '…' : e.name;
				return `${rank}. ${name.padEnd(9, ' ')} ${e.score.toLocaleString()}`;
			}).join('\n'));
		});

		const best = localTop(1)[0];
		if (best) {
			this.add.text(cx, 622, `내 최고: ${best.score.toLocaleString()}`, { fontFamily: KOR_FONT, fontSize: '18px', color: '#8ee08a' }).setOrigin(0.5);
		}
	}

	private buildMuteButton(): void {
		const btn = this.add.text(GAME_W - 30, 28, this.sound.mute ? '🔇' : '🔊', { fontSize: '34px' })
			.setOrigin(0.5)
			.setInteractive({ useHandCursor: true });
		btn.on('pointerdown', () => {
			this.sound.mute = !this.sound.mute;
			localStorage.setItem('fw_muted', this.sound.mute ? '1' : '0');
			btn.setText(this.sound.mute ? '🔇' : '🔊');
		});
	}
}
