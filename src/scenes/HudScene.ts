import Phaser from 'phaser';
import { GAME_W } from '../config';
import type { Hero } from '../entities/Hero';

const KOR_FONT = '"PFStardust", "Malgun Gothic", sans-serif';

interface HudData {
	nick: string;
	hero: Hero;
}

interface VPad {
	left: boolean;
	right: boolean;
	jump: boolean;
	attack: boolean;
}

const BAR_X = 24;
const BAR_W = 260;

/** HP/EXP/점수 + 가상 버튼 오버레이 */
export class HudScene extends Phaser.Scene {
	private bars!: Phaser.GameObjects.Graphics;
	private levelText!: Phaser.GameObjects.Text;
	private scoreText!: Phaser.GameObjects.Text;
	private stageText!: Phaser.GameObjects.Text;

	private hp = 1;
	private hpMax = 1;
	private exp = 0;
	private expNext = 1;

	private vpad: VPad = { left: false, right: false, jump: false, attack: false };

	constructor() {
		super('hud');
	}

	create(data: HudData): void {
		this.hp = data.hero.hp;
		this.hpMax = data.hero.hpMax;
		this.exp = data.hero.exp;
		this.expNext = data.hero.expNext;

		this.add.text(BAR_X, 12, data.nick, { fontFamily: KOR_FONT, fontSize: '22px', color: '#ffffff', stroke: '#101420', strokeThickness: 4 });
		this.levelText = this.add.text(BAR_X + 150, 12, `Lv.${data.hero.level}`, { fontFamily: KOR_FONT, fontSize: '22px', color: '#ffd54f', stroke: '#101420', strokeThickness: 4 });
		this.scoreText = this.add.text(GAME_W - 80, 14, '0', { fontFamily: KOR_FONT, fontSize: '26px', color: '#ffe9b3', stroke: '#101420', strokeThickness: 4 }).setOrigin(1, 0);
		this.stageText = this.add.text(GAME_W / 2, 20, '', { fontFamily: KOR_FONT, fontSize: '22px', color: '#c9d6ef', stroke: '#101420', strokeThickness: 4 }).setOrigin(0.5, 0);

		this.bars = this.add.graphics();
		this.redrawBars();

		this.buildMuteButton();

		// 가상 패드 (터치 기기에서만)
		this.registry.set('vpad', this.vpad);
		if (this.sys.game.device.input.touch) this.buildVirtualPad();

		// GameScene 이벤트 구독
		const gs = this.scene.get('game');
		const onHp = (hp: number, max: number) => { this.hp = hp; this.hpMax = max; this.redrawBars(); };
		const onExp = (exp: number, next: number, level: number) => {
			this.exp = exp; this.expNext = next;
			this.levelText.setText(`Lv.${level}`);
			this.redrawBars();
		};
		const onScore = (score: number) => this.scoreText.setText(score.toLocaleString());
		const onStage = (label: string) => this.stageText.setText(label);
		const onLevelUp = () => {
			this.tweens.add({ targets: this.levelText, scale: 1.5, duration: 140, yoyo: true });
		};

		gs.events.on('e-hp', onHp);
		gs.events.on('e-exp', onExp);
		gs.events.on('e-score', onScore);
		gs.events.on('e-stage', onStage);
		gs.events.on('e-levelup', onLevelUp);

		this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
			gs.events.off('e-hp', onHp);
			gs.events.off('e-exp', onExp);
			gs.events.off('e-score', onScore);
			gs.events.off('e-stage', onStage);
			gs.events.off('e-levelup', onLevelUp);
			this.vpad.left = this.vpad.right = this.vpad.jump = this.vpad.attack = false;
		});
	}

	private redrawBars(): void {
		const g = this.bars;
		g.clear();
		// HP
		g.fillStyle(0x101826, 0.85).fillRoundedRect(BAR_X, 44, BAR_W, 18, 6);
		const hpRatio = Phaser.Math.Clamp(this.hp / this.hpMax, 0, 1);
		if (hpRatio > 0) {
			g.fillStyle(hpRatio > 0.3 ? 0xe4485f : 0xff2e4d, 1).fillRoundedRect(BAR_X + 2, 46, (BAR_W - 4) * hpRatio, 14, 5);
		}
		g.lineStyle(2, 0x36415c, 1).strokeRoundedRect(BAR_X, 44, BAR_W, 18, 6);
		// EXP
		g.fillStyle(0x101826, 0.85).fillRoundedRect(BAR_X, 68, BAR_W, 10, 4);
		const expRatio = Phaser.Math.Clamp(this.exp / this.expNext, 0, 1);
		if (expRatio > 0) {
			g.fillStyle(0x6ee7a0, 1).fillRoundedRect(BAR_X + 2, 70, (BAR_W - 4) * expRatio, 6, 3);
		}
	}

	private buildMuteButton(): void {
		const btn = this.add.text(GAME_W - 34, 60, this.sound.mute ? '🔇' : '🔊', { fontSize: '28px' })
			.setOrigin(0.5)
			.setInteractive({ useHandCursor: true });
		btn.on('pointerdown', () => {
			this.sound.mute = !this.sound.mute;
			localStorage.setItem('fw_muted', this.sound.mute ? '1' : '0');
			btn.setText(this.sound.mute ? '🔇' : '🔊');
		});
	}

	private buildVirtualPad(): void {
		const mk = (x: number, y: number, r: number, label: string, flag: keyof VPad) => {
			const circle = this.add.circle(x, y, r, 0xffffff, 0.14).setStrokeStyle(2, 0xffffff, 0.35).setDepth(150);
			circle.setInteractive(new Phaser.Geom.Circle(r, r, r + 14), Phaser.Geom.Circle.Contains);
			this.add.text(x, y, label, { fontFamily: KOR_FONT, fontSize: r > 55 ? '30px' : '26px', color: '#ffffff' })
				.setOrigin(0.5).setAlpha(0.75).setDepth(151);

			const press = () => { this.vpad[flag] = true; circle.setFillStyle(0xffffff, 0.32); };
			const release = () => { this.vpad[flag] = false; circle.setFillStyle(0xffffff, 0.14); };
			circle.on('pointerdown', press);
			circle.on('pointerup', release);
			circle.on('pointerout', release);
		};

		mk(110, 610, 56, '◀', 'left');
		mk(248, 610, 56, '▶', 'right');
		mk(1032, 626, 50, '점프', 'jump');
		mk(1170, 600, 62, '공격', 'attack');
	}
}
