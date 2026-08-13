import Phaser from 'phaser';
import { GAME_H, GAME_W, KOR_FONT } from '../config';
import type { Hero } from '../entities/Hero';

interface HudData {
	nick: string;
	hero: Hero;
}

interface VPad {
	left: boolean;
	right: boolean;
	jump: boolean;
	attack: boolean;
	ult: boolean;
}

const BAR_X = 24;
const BAR_W = 260;

/** HP/EXP/궁극기 게이지 + 점수 + 가상 버튼 오버레이 */
export class HudScene extends Phaser.Scene {
	private bars!: Phaser.GameObjects.Graphics;
	private levelText!: Phaser.GameObjects.Text;
	private scoreText!: Phaser.GameObjects.Text;
	private stageText!: Phaser.GameObjects.Text;
	private ultReadyText!: Phaser.GameObjects.Text;
	private monsterText!: Phaser.GameObjects.Text;
	private leftIndicator!: Phaser.GameObjects.Text;
	private rightIndicator!: Phaser.GameObjects.Text;

	private hp = 1;
	private hpMax = 1;
	private exp = 0;
	private expNext = 1;
	private ult = 0;
	private ultMax = 100;

	private vpad: VPad = { left: false, right: false, jump: false, attack: false, ult: false };

	constructor() {
		super('hud');
	}

	create(data: HudData): void {
		this.hp = data.hero.hp;
		this.hpMax = data.hero.hpMax;
		this.exp = data.hero.exp;
		this.expNext = data.hero.expNext;
		this.ult = 0;

		this.add.text(BAR_X, 12, data.nick, { fontFamily: KOR_FONT, fontSize: '22px', color: '#ffffff', stroke: '#101420', strokeThickness: 4 });
		this.levelText = this.add.text(BAR_X + 150, 12, `Lv.${data.hero.level}`, { fontFamily: KOR_FONT, fontSize: '22px', color: '#ffd54f', stroke: '#101420', strokeThickness: 4 });
		this.scoreText = this.add.text(GAME_W - 80, 14, '0', { fontFamily: KOR_FONT, fontSize: '26px', color: '#ffe9b3', stroke: '#101420', strokeThickness: 4 }).setOrigin(1, 0);
		this.stageText = this.add.text(GAME_W / 2, 20, '', { fontFamily: KOR_FONT, fontSize: '22px', color: '#c9d6ef', stroke: '#101420', strokeThickness: 4 }).setOrigin(0.5, 0);
		this.monsterText = this.add.text(GAME_W / 2, 50, '', { fontFamily: KOR_FONT, fontSize: '17px', color: '#ffb3ba', stroke: '#101420', strokeThickness: 4 }).setOrigin(0.5, 0);
		// 화면 밖 몬스터 방향 안내 (좌/우 가장자리)
		const indStyle = { fontFamily: KOR_FONT, fontSize: '24px', color: '#ffb3ba', stroke: '#101420', strokeThickness: 5 };
		this.leftIndicator = this.add.text(14, GAME_H / 2 - 60, '', indStyle).setOrigin(0, 0.5).setAlpha(0.9);
		this.rightIndicator = this.add.text(GAME_W - 14, GAME_H / 2 - 60, '', indStyle).setOrigin(1, 0.5).setAlpha(0.9);
		this.ultReadyText = this.add.text(BAR_X + BAR_W + 12, 84, '', { fontFamily: KOR_FONT, fontSize: '15px', color: '#ffd54f', stroke: '#101420', strokeThickness: 3 }).setOrigin(0, 0.5);

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
		const onUlt = (charge: number, max: number) => {
			this.ult = charge; this.ultMax = max;
			this.ultReadyText.setText(charge >= max ? 'Z 궁극기!' : '');
			this.redrawBars();
		};
		const onMonsters = (remaining: number, offLeft: number, offRight: number) => {
			this.monsterText.setText(remaining > 0 ? `남은 몬스터 ${remaining}` : '');
			this.leftIndicator.setText(offLeft > 0 ? `◀ ${offLeft}` : '');
			this.rightIndicator.setText(offRight > 0 ? `${offRight} ▶` : '');
		};

		gs.events.on('e-hp', onHp);
		gs.events.on('e-exp', onExp);
		gs.events.on('e-score', onScore);
		gs.events.on('e-stage', onStage);
		gs.events.on('e-levelup', onLevelUp);
		gs.events.on('e-ultcharge', onUlt);
		gs.events.on('e-monsters', onMonsters);

		this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
			gs.events.off('e-hp', onHp);
			gs.events.off('e-exp', onExp);
			gs.events.off('e-score', onScore);
			gs.events.off('e-stage', onStage);
			gs.events.off('e-levelup', onLevelUp);
			gs.events.off('e-ultcharge', onUlt);
			gs.events.off('e-monsters', onMonsters);
			this.vpad.left = this.vpad.right = this.vpad.jump = this.vpad.attack = this.vpad.ult = false;
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
		// 궁극기 게이지
		g.fillStyle(0x101826, 0.85).fillRoundedRect(BAR_X, 82, BAR_W, 8, 3);
		const ultRatio = Phaser.Math.Clamp(this.ult / this.ultMax, 0, 1);
		if (ultRatio > 0) {
			g.fillStyle(ultRatio >= 1 ? 0xffd54f : 0xb89a3a, 1).fillRoundedRect(BAR_X + 2, 84, (BAR_W - 4) * ultRatio, 4, 2);
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
			this.add.text(x, y, label, { fontFamily: KOR_FONT, fontSize: r > 55 ? '28px' : '22px', color: '#ffffff' })
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
		mk(1152, 486, 42, '궁', 'ult');
	}
}
