import Phaser from 'phaser';
import { ENDLESS_TINT, GAME_H, GAME_W, STAGE_TINTS } from '../config';
import { Hero } from '../entities/Hero';
import { Monster } from '../entities/Monster';
import { Bullet } from '../entities/Weapon';
import type { DamageRoll } from '../systems/balance';
import { stageSpawns, waveSpawns, type SpawnOrder } from '../systems/WaveSpawner';
import { submitScore } from '../systems/rankClient';

const KOR_FONT = '"PFStardust", "Malgun Gothic", sans-serif';
const TITLE_FONT = '"LuckiestGuy", Impact, sans-serif';

interface GameData {
	nick: string;
}

export class GameScene extends Phaser.Scene {
	hero!: Hero;

	private nick = '';
	private score = 0;
	private phase: 'stage' | 'endless' = 'stage';
	private stageIdx = 0;
	private wave = 0;
	private spawnComplete = false;
	private transitioning = true;
	private gameOver = false;
	private hitStopActive = false;

	private monsters!: Phaser.GameObjects.Group;
	private bullets!: Phaser.Physics.Arcade.Group;
	private bgFar!: Phaser.GameObjects.TileSprite;
	private bgNear!: Phaser.GameObjects.TileSprite;
	private bgScale = 1;
	private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
	private bannerText!: Phaser.GameObjects.Text;
	private bgm?: Phaser.Sound.BaseSound;

	private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
	private keyX!: Phaser.Input.Keyboard.Key;
	private keySpace!: Phaser.Input.Keyboard.Key;

	constructor() {
		super('game');
	}

	init(data: GameData): void {
		this.nick = data.nick || localStorage.getItem('fw_nick') || 'HERO';
		this.score = 0;
		this.phase = 'stage';
		this.stageIdx = 0;
		this.wave = 0;
		this.spawnComplete = false;
		this.transitioning = true;
		this.gameOver = false;
		this.hitStopActive = false;
	}

	create(): void {
		this.physics.world.setBounds(0, 0, 10_000_000, GAME_H);
		this.cameras.main.setBounds(0, 0, 10_000_000, GAME_H);

		// 배경 두 겹 (원경/근경) — 무한 타일 스크롤
		this.bgScale = GAME_H / 1024;
		this.bgFar = this.add.tileSprite(0, 0, GAME_W, GAME_H, 'bg_far').setOrigin(0).setScrollFactor(0).setDepth(0);
		this.bgNear = this.add.tileSprite(0, 0, GAME_W, GAME_H, 'bg_near').setOrigin(0).setScrollFactor(0).setDepth(1);
		this.bgFar.setTileScale(this.bgScale);
		this.bgNear.setTileScale(this.bgScale);

		// 히어로
		this.hero = new Hero(this, 200, 1, {
			onFire: (x, y, dir, roll) => this.fireBullet(x, y, dir, roll),
			onHpChange: (hp, max) => this.events.emit('e-hp', hp, max),
			onExpChange: (exp, next, level) => this.events.emit('e-exp', exp, next, level),
			onLevelUp: level => this.onLevelUp(level),
			onDied: () => this.endGame(),
		});

		const cam = this.cameras.main;
		cam.startFollow(this.hero, true, 0.15, 0);
		cam.setDeadzone(280, GAME_H);
		cam.followOffset.set(-180, 0);

		// 그룹
		this.monsters = this.add.group();
		this.bullets = this.physics.add.group({ classType: Bullet, maxSize: 16, runChildUpdate: false });

		this.physics.add.overlap(this.bullets, this.monsters, (a, b) => {
			const bullet = (a instanceof Bullet ? a : b) as Bullet;
			const monster = (a instanceof Monster ? a : b) as Monster;
			this.onBulletHit(bullet, monster);
		});
		this.physics.add.overlap(this.hero, this.monsters, (_h, m) => {
			this.onHeroTouch(m as Monster);
		});

		// 파티클
		this.sparks = this.add.particles(0, 0, 'spark', {
			speed: { min: 120, max: 340 },
			angle: { min: 200, max: 340 },
			lifespan: 550,
			gravityY: 1000,
			scale: { start: 1.3, end: 0 },
			emitting: false,
		}).setDepth(55);

		// 배너
		this.bannerText = this.add.text(GAME_W / 2, 260, '', {
			fontFamily: TITLE_FONT, fontSize: '64px', color: '#ffd54f', stroke: '#332200', strokeThickness: 10,
		}).setOrigin(0.5).setScrollFactor(0).setDepth(100).setAlpha(0);

		// 입력
		this.cursors = this.input.keyboard!.createCursorKeys();
		this.keyX = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.X);
		this.keySpace = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

		// HUD
		if (!this.registry.has('vpad')) {
			this.registry.set('vpad', { left: false, right: false, jump: false, attack: false });
		}
		this.scene.launch('hud', { nick: this.nick, hero: this.hero });

		// BGM
		this.bgm = this.sound.add('bgm_battle', { loop: true, volume: 0.3 });
		if (!this.sound.locked) this.bgm.play();
		else this.sound.once(Phaser.Sound.Events.UNLOCKED, () => this.bgm?.play());

		this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
			this.bgm?.stop();
			this.scene.stop('hud');
		});

		this.startStage(0);
	}

	update(): void {
		if (!this.hero) return;

		const vpad = this.registry.get('vpad') as { left: boolean; right: boolean; jump: boolean; attack: boolean };
		this.hero.update({
			left: this.cursors.left.isDown || vpad.left,
			right: this.cursors.right.isDown || vpad.right,
			jump: this.cursors.up.isDown || this.keySpace.isDown || vpad.jump,
			attack: this.keyX.isDown || vpad.attack,
		});

		const time = this.time.now;
		for (const child of this.monsters.getChildren() as Monster[]) {
			child.updateAI(this.hero, time);
		}

		// 파랄랙스
		const scrollX = this.cameras.main.scrollX;
		this.bgFar.tilePositionX = (scrollX * 0.25) / this.bgScale;
		this.bgNear.tilePositionX = scrollX / this.bgScale;

		this.checkClear();
	}

	// ── 스테이지/웨이브 흐름 ──────────────────────────────

	private startStage(idx: number): void {
		this.stageIdx = idx;
		this.transitioning = true;
		this.spawnComplete = false;
		this.applyTint(STAGE_TINTS[idx]);
		this.banner(`STAGE ${idx + 1}`);
		this.events.emit('e-stage', `STAGE ${idx + 1}`);
		this.time.delayedCall(1400, () => this.placeSpawns(stageSpawns(idx)));
	}

	private startWave(n: number): void {
		this.wave = n;
		this.transitioning = true;
		this.spawnComplete = false;
		this.applyTint(ENDLESS_TINT);
		this.banner(`WAVE ${n}`);
		this.events.emit('e-stage', `WAVE ${n}`);
		this.time.delayedCall(1000, () => this.placeSpawns(waveSpawns(n)));
	}

	private placeSpawns(orders: SpawnOrder[]): void {
		if (this.gameOver) return;
		const line = Math.max(this.hero.x, this.cameras.main.scrollX) + GAME_W + 120;
		for (const order of orders) {
			this.monsters.add(new Monster(this, line + order.offset, order.spec, m => this.onMonsterDeath(m)));
		}
		this.spawnComplete = true;
		this.transitioning = false;
	}

	private checkClear(): void {
		if (this.gameOver || this.transitioning || !this.spawnComplete) return;
		const aliveCount = (this.monsters.getChildren() as Monster[]).filter(m => !m.dying).length;
		if (aliveCount > 0) return;

		this.transitioning = true;
		if (this.phase === 'stage') {
			if (this.stageIdx + 1 < STAGE_TINTS.length) {
				this.banner('CLEAR!');
				this.time.delayedCall(2000, () => this.startStage(this.stageIdx + 1));
			} else {
				this.phase = 'endless';
				this.banner('숲의 심연으로...');
				this.time.delayedCall(2200, () => this.startWave(1));
			}
		} else {
			this.time.delayedCall(1200, () => this.startWave(this.wave + 1));
		}
	}

	private applyTint([far, near]: [number, number]): void {
		this.bgFar.setTint(far);
		this.bgNear.setTint(near);
	}

	// ── 전투 ──────────────────────────────────────────────

	private fireBullet(x: number, y: number, dir: 1 | -1, roll: DamageRoll): void {
		const bullet = this.bullets.get() as Bullet | null;
		bullet?.fire(x, y, dir, roll);
	}

	private onBulletHit(bullet: Bullet, monster: Monster): void {
		if (!bullet.active || monster.dying) return;
		bullet.kill();
		if (this.cache.audio.exists('sfx_monster_hit')) this.sound.play('sfx_monster_hit', { volume: 0.3 });

		this.popup(monster.x, monster.y - monster.displayHeight - 20, String(bullet.roll.amount), bullet.roll.crit ? '#ff9f43' : '#ffffff', bullet.roll.crit);
		monster.takeDamage(bullet.roll.amount, bullet.dir);
		this.hitStop(45);
		this.cameras.main.shake(60, 0.002);
	}

	private onHeroTouch(monster: Monster): void {
		if (monster.spec.kind !== 'charger' || monster.dying || !this.hero.alive || this.hero.invulnerable) return;
		this.hero.takeDamage(monster.spec.damage);
		monster.explode();
		this.cameras.main.shake(120, 0.006);
		this.sparks.setParticleTint(0xff6b6b);
		this.sparks.explode(14, monster.x, monster.y - monster.displayHeight / 2);
	}

	private onMonsterDeath(monster: Monster): void {
		// 사망 이후의 처치(날아가던 화살 등)는 제출된 점수와 어긋나므로 가산하지 않는다
		if (this.gameOver) return;
		this.score += monster.spec.score;
		this.events.emit('e-score', this.score);
		this.hero.gainExp(monster.spec.exp);

		this.popup(monster.x, monster.y - monster.displayHeight - 46, `+${monster.spec.score}`, '#8ee08a', false);
		const isBoss = monster.spec.kind === 'boss';
		this.cameras.main.shake(isBoss ? 220 : 90, isBoss ? 0.009 : 0.003);
		this.sparks.setParticleTint(monster.spec.tint !== 0xffffff ? monster.spec.tint : 0xdfe6f5);
		this.sparks.explode(isBoss ? 28 : 12, monster.x, monster.y - monster.displayHeight / 2);
	}

	private onLevelUp(level: number): void {
		const fx = this.add.sprite(this.hero.x, this.hero.y, 'levelup_fx').setOrigin(0.5, 1).setDepth(52);
		fx.play('levelup_fx');
		fx.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => fx.destroy());
		this.popup(this.hero.x, this.hero.y - 110, 'LEVEL UP!', '#ffd54f', true);
		this.events.emit('e-levelup', level);
	}

	/** 명중 순간 물리 일시정지 → 타격감 */
	private hitStop(ms: number): void {
		if (this.hitStopActive || this.gameOver) return;
		this.hitStopActive = true;
		this.physics.pause();
		this.time.delayedCall(ms, () => {
			this.hitStopActive = false;
			if (!this.gameOver) this.physics.resume();
		});
	}

	private popup(x: number, y: number, text: string, color: string, big: boolean): void {
		const t = this.add.text(x + Phaser.Math.Between(-14, 14), y, text, {
			fontFamily: KOR_FONT,
			fontSize: big ? '34px' : '24px',
			color,
			stroke: '#101420',
			strokeThickness: 5,
		}).setOrigin(0.5).setDepth(90);
		this.tweens.add({
			targets: t,
			y: y - 56,
			alpha: 0,
			duration: 650,
			ease: 'cubic.out',
			onComplete: () => t.destroy(),
		});
	}

	private banner(text: string): void {
		this.bannerText.setText(text).setAlpha(0).setScale(1.6);
		this.tweens.add({
			targets: this.bannerText,
			alpha: 1,
			scale: 1,
			duration: 260,
			ease: 'back.out',
			onComplete: () => {
				this.tweens.add({ targets: this.bannerText, alpha: 0, delay: 1000, duration: 350 });
			},
		});
	}

	// ── 게임 오버 ─────────────────────────────────────────

	private endGame(): void {
		if (this.gameOver) return;
		this.gameOver = true;
		this.bgm?.stop();

		const waveReached = this.phase === 'endless' ? this.wave : 0;
		const submitted = submitScore(this.nick, this.score, waveReached);

		this.time.delayedCall(1100, () => this.showEndOverlay(submitted, waveReached));
	}

	private showEndOverlay(submitted: Promise<{ rank: number | null; offline: boolean }>, waveReached: number): void {
		const cx = GAME_W / 2;
		const dim = this.add.rectangle(cx, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.55).setScrollFactor(0).setDepth(200);
		dim.setInteractive(); // 아래 오브젝트 클릭 차단

		const panel = this.add.image(cx, GAME_H / 2, 'ui_modal').setScrollFactor(0).setDepth(201);
		panel.setDisplaySize(560, 480);

		const mk = (dy: number, text: string, size: number, color: string) =>
			this.add.text(cx, GAME_H / 2 + dy, text, { fontFamily: KOR_FONT, fontSize: `${size}px`, color, align: 'center' })
				.setOrigin(0.5).setScrollFactor(0).setDepth(202);

		mk(-180, 'GAME OVER', 44, '#ff8fa3');
		mk(-118, this.nick, 30, '#ffffff');
		mk(-64, `점수  ${this.score.toLocaleString()}`, 28, '#ffd54f');
		const stageLabel = waveReached > 0 ? `엔드리스 WAVE ${waveReached}` : `STAGE ${this.stageIdx + 1}`;
		mk(-22, `${stageLabel} · Lv.${this.hero.level}`, 20, '#c9d6ef');
		const rankLine = mk(20, '순위 확인 중...', 22, '#9fb3d9');

		submitted.then(({ rank, offline }) => {
			if (!this.scene.isActive()) return;
			if (offline) rankLine.setText('오프라인 — 기기에 저장됨').setColor('#9fb3d9');
			else if (rank === null) rankLine.setText('TOP 100 진입 실패...').setColor('#9fb3d9');
			else rankLine.setText(`전체 ${rank}위!`).setColor('#8ee08a');
		});

		const makeBtn = (dx: number, label: string, onClick: () => void) => {
			const img = this.add.image(0, 0, 'ui_btn');
			img.setDisplaySize(200, 60);
			const txt = this.add.text(0, -2, label, { fontFamily: KOR_FONT, fontSize: '24px', color: '#ffe9b3' }).setOrigin(0.5);
			const c = this.add.container(cx + dx, GAME_H / 2 + 150, [img, txt]).setScrollFactor(0).setDepth(202);
			c.setSize(200, 60);
			c.setInteractive({ useHandCursor: true });
			c.on('pointerdown', onClick);
			return c;
		};
		makeBtn(-115, '다시 하기', () => this.scene.restart({ nick: this.nick }));
		makeBtn(115, '홈으로', () => this.scene.start('title'));
	}
}
