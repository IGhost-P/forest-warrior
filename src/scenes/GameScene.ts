import Phaser from 'phaser';
import { ENDLESS_TINT, GAME_H, GAME_W, KOR_FONT, STAGE_TINTS, TITLE_FONT } from '../config';
import { Hero } from '../entities/Hero';
import { Monster, type MonsterCtx } from '../entities/Monster';
import { Bullet, EnemyBullet } from '../entities/Weapon';
import { HERO, STAGES, pierceCount, type DamageRoll } from '../systems/balance';
import { bossDirector, type CombatStats } from '../systems/director';
import { stageSpawns, waveSpawns, type SpawnOrder } from '../systems/WaveSpawner';
import { submitScore } from '../systems/rankClient';

interface GameData {
	nick: string;
}

interface VPad {
	left: boolean;
	right: boolean;
	jump: boolean;
	attack: boolean;
	ult: boolean;
}

const MAX_MONSTERS = 25;

export class GameScene extends Phaser.Scene {
	hero!: Hero;

	private nick = '';
	private score = 0;
	private phase: 'stage' | 'endless' = 'stage';
	private stageIdx = 0;
	private wave = 0;
	private spawnComplete = false;
	private transitioning = true;
	private pendingSpawns = 0;
	private gameOver = false;
	private hitStopActive = false;
	private ultCharge = 0;
	private prevUltHeld = false;

	// AI 디렉터용 전투 통계 (구간 = 스테이지/웨이브)
	private statShots = 0;
	private statHits = 0;
	private statDamageTaken = 0;
	private statUltUsed = 0;
	private segmentStartAt = 0;
	private lastHeroHp = 0;

	private monsters!: Phaser.GameObjects.Group;
	private bullets!: Phaser.Physics.Arcade.Group;
	private enemyBullets!: Phaser.Physics.Arcade.Group;
	private monsterCtx!: MonsterCtx;
	private bgFar!: Phaser.GameObjects.TileSprite;
	private bgNear!: Phaser.GameObjects.TileSprite;
	private bgScale = 1;
	private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
	private bannerText!: Phaser.GameObjects.Text;
	private subBannerText!: Phaser.GameObjects.Text;
	private bgm?: Phaser.Sound.BaseSound;

	private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
	private keyX!: Phaser.Input.Keyboard.Key;
	private keyZ!: Phaser.Input.Keyboard.Key;
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
		this.pendingSpawns = 0;
		this.gameOver = false;
		this.hitStopActive = false;
		this.ultCharge = 0;
		this.prevUltHeld = false;
		this.statShots = 0;
		this.statHits = 0;
		this.statDamageTaken = 0;
		this.statUltUsed = 0;
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
			onHpChange: (hp, max) => {
				if (hp < this.lastHeroHp) this.statDamageTaken += this.lastHeroHp - hp;
				this.lastHeroHp = hp;
				this.events.emit('e-hp', hp, max);
			},
			onExpChange: (exp, next, level) => this.events.emit('e-exp', exp, next, level),
			onLevelUp: level => this.onLevelUp(level),
			onDied: () => this.endGame(),
		});
		this.lastHeroHp = this.hero.hp;

		const cam = this.cameras.main;
		cam.startFollow(this.hero, true, 0.15, 0);
		cam.setDeadzone(280, GAME_H);
		cam.followOffset.set(-180, 0);

		// 그룹
		this.monsters = this.add.group();
		this.bullets = this.physics.add.group({ classType: Bullet, maxSize: 24, runChildUpdate: false });
		this.enemyBullets = this.physics.add.group({ classType: EnemyBullet, maxSize: 24, runChildUpdate: false });

		// 몬스터 상호작용 훅
		this.monsterCtx = {
			onDeath: m => this.onMonsterDeath(m),
			fireEnemyBullet: (x, y, dir, damage) => {
				const b = this.enemyBullets.get() as EnemyBullet | null;
				b?.fire(x, y, dir, damage);
			},
			summon: x => this.summonMinions(x),
		};

		this.physics.add.overlap(this.bullets, this.monsters, (a, b) => {
			const bullet = (a instanceof Bullet ? a : b) as Bullet;
			const monster = (a instanceof Monster ? a : b) as Monster;
			this.onBulletHit(bullet, monster);
		});
		this.physics.add.overlap(this.hero, this.monsters, (_h, m) => {
			this.onHeroTouch(m as Monster);
		});
		this.physics.add.overlap(this.hero, this.enemyBullets, (_h, b) => {
			const eb = b as EnemyBullet;
			if (!eb.active) return;
			if (this.hero.alive && !this.hero.invulnerable) this.hero.takeDamage(eb.damage);
			eb.kill();
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
		this.bannerText = this.add.text(GAME_W / 2, 250, '', {
			fontFamily: TITLE_FONT, fontSize: '64px', color: '#ffd54f', stroke: '#332200', strokeThickness: 10,
		}).setOrigin(0.5).setScrollFactor(0).setDepth(100).setAlpha(0);
		this.subBannerText = this.add.text(GAME_W / 2, 330, '', {
			fontFamily: KOR_FONT, fontSize: '26px', color: '#ffffff', stroke: '#101420', strokeThickness: 6,
		}).setOrigin(0.5).setScrollFactor(0).setDepth(100).setAlpha(0);

		// 입력
		this.cursors = this.input.keyboard!.createCursorKeys();
		this.keyX = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.X);
		this.keyZ = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
		this.keySpace = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

		// HUD
		this.registry.set('vpad', { left: false, right: false, jump: false, attack: false, ult: false });
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

		const vpad = this.registry.get('vpad') as VPad;
		this.hero.update({
			left: this.cursors.left.isDown || vpad.left,
			right: this.cursors.right.isDown || vpad.right,
			jump: this.cursors.up.isDown || this.keySpace.isDown || vpad.jump,
			attack: this.keyX.isDown || vpad.attack,
		});

		// 궁극기 (엣지 트리거)
		const ultHeld = this.keyZ.isDown || vpad.ult;
		if (ultHeld && !this.prevUltHeld) this.tryUlt();
		this.prevUltHeld = ultHeld;

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

	private resetSegmentStats(): void {
		this.statShots = 0;
		this.statHits = 0;
		this.statDamageTaken = 0;
		this.statUltUsed = 0;
		this.segmentStartAt = this.time.now;
	}

	private snapshotStats(): CombatStats {
		return {
			segmentMs: this.time.now - this.segmentStartAt,
			damageTaken: this.statDamageTaken,
			accuracy: this.statShots > 0 ? this.statHits / this.statShots : 0.4,
			ultUsed: this.statUltUsed,
		};
	}

	private startStage(idx: number): void {
		this.stageIdx = idx;
		this.transitioning = true;
		this.spawnComplete = false;
		this.resetSegmentStats();
		this.applyTint(STAGE_TINTS[idx]);
		this.banner(`STAGE ${idx + 1}`);
		this.events.emit('e-stage', `STAGE ${idx + 1}`);
		this.time.delayedCall(1400, () => this.placeSpawns(stageSpawns(idx)));
	}

	private startWave(n: number): void {
		this.wave = n;
		this.transitioning = true;
		this.spawnComplete = false;
		this.resetSegmentStats();
		this.applyTint(ENDLESS_TINT);
		this.banner(`WAVE ${n}`);
		this.events.emit('e-stage', `WAVE ${n}`);
		this.time.delayedCall(1000, () => this.placeSpawns(waveSpawns(n)));
	}

	/** 스폰 오더를 각자의 지연·방향에 맞춰 시간차 투입. 보스는 AI 디렉터를 거친다 */
	private placeSpawns(orders: SpawnOrder[]): void {
		if (this.gameOver) return;
		this.pendingSpawns = orders.length;
		for (const order of orders) {
			this.time.delayedCall(order.delayMs, () => {
				if (this.gameOver) return;
				if (order.spec.kind === 'boss') {
					// 이 구간의 플레이 데이터를 보고 보스 성향·난이도 결정
					bossDirector(this.snapshotStats()).then(mod => {
						if (this.gameOver || !this.scene.isActive()) return;
						const spec = { ...order.spec, bossMod: mod, hp: Math.round(order.spec.hp * mod.hpMult) };
						this.monsters.add(new Monster(this, this.spawnX(order), spec, this.monsterCtx));
						if (mod.note) this.subBanner(mod.note);
						this.spawnPlaced();
					});
				} else {
					this.monsters.add(new Monster(this, this.spawnX(order), order.spec, this.monsterCtx));
					this.spawnPlaced();
				}
			});
		}
	}

	/** 화면 가장자리 바로 밖에서 스폰 — 시간차는 delayMs가 담당하므로 거리는 짧게 */
	private spawnX(order: SpawnOrder): number {
		const cam = this.cameras.main;
		return order.side === 1
			? cam.scrollX + GAME_W + 100 + order.offset
			: cam.scrollX - 100 - order.offset;
	}

	private spawnPlaced(): void {
		this.pendingSpawns--;
		if (this.pendingSpawns === 0) {
			this.spawnComplete = true;
			this.transitioning = false;
		}
	}

	/** 보스 소환 패턴: 현재 스테이지 몹의 축소판 2마리. 화면 과밀 시 스킵 */
	private summonMinions(x: number): void {
		if (this.gameOver) return;
		const aliveCount = (this.monsters.getChildren() as Monster[]).filter(m => !m.dying).length;
		if (aliveCount >= MAX_MONSTERS) return;
		const base = STAGES[Math.min(this.stageIdx, STAGES.length - 1)].mob;
		for (const dx of [-150, 150]) {
			const spec = {
				...base,
				hp: Math.round(base.hp * 0.6),
				score: Math.round(base.score * 0.5),
				exp: Math.round(base.exp * 0.5),
			};
			this.monsters.add(new Monster(this, x + dx, spec, this.monsterCtx));
			this.sparks.setParticleTint(0xc9d6ef);
			this.sparks.explode(8, x + dx, this.hero.y - 40);
		}
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
		this.statShots++;
		const pierce = pierceCount(this.hero.level);
		this.spawnArrow(x, y, dir, roll, pierce);

		// Lv7+: 후방 견제 화살 (60% 데미지)
		if (this.hero.level >= HERO.backshotLevel) {
			const backRoll: DamageRoll = {
				amount: Math.max(1, Math.round(roll.amount * HERO.backshotDamageRatio)),
				crit: roll.crit,
			};
			this.spawnArrow(this.hero.x - dir * 50, y, dir === 1 ? -1 : 1, backRoll, pierce);
		}
	}

	private spawnArrow(x: number, y: number, dir: 1 | -1, roll: DamageRoll, pierce: number): void {
		const bullet = this.bullets.get() as Bullet | null;
		bullet?.fire(x, y, dir, roll, pierce);
	}

	private onBulletHit(bullet: Bullet, monster: Monster): void {
		if (!bullet.active || monster.dying || bullet.alreadyHit(monster)) return;
		bullet.registerHit(monster);
		this.statHits++;
		if (this.cache.audio.exists('sfx_monster_hit')) this.sound.play('sfx_monster_hit', { volume: 0.3 });

		this.popup(monster.body.center.x, monster.body.y - 20, String(bullet.roll.amount), bullet.roll.crit ? '#ff9f43' : '#ffffff', bullet.roll.crit);
		monster.takeDamage(bullet.roll.amount, bullet.dir);
		this.hitStop(45);
		this.cameras.main.shake(60, 0.002);
	}

	private onHeroTouch(monster: Monster): void {
		if (monster.dying || !this.hero.alive || this.hero.invulnerable) return;

		if (monster.spec.kind === 'charger') {
			this.hero.takeDamage(monster.spec.damage);
			monster.explode();
			this.cameras.main.shake(120, 0.006);
			this.sparks.setParticleTint(0xff6b6b);
			this.sparks.explode(14, monster.body.center.x, monster.body.center.y);
			return;
		}
		if (monster.spec.kind === 'hopper') {
			// 도약 해골은 부딪혀도 죽지 않고 튕겨난다
			this.hero.takeDamage(monster.spec.damage);
			monster.x -= Math.sign(this.hero.x - monster.x) * 80;
			this.cameras.main.shake(90, 0.004);
			return;
		}
		if (monster.spec.kind === 'boss' && monster.charging) {
			this.hero.takeDamage(monster.spec.damage);
			this.cameras.main.shake(160, 0.008);
		}
	}

	private onMonsterDeath(monster: Monster): void {
		// 사망 이후의 처치(날아가던 화살 등)는 제출된 점수와 어긋나므로 가산하지 않는다
		if (this.gameOver) return;
		this.score += monster.spec.score;
		this.events.emit('e-score', this.score);
		this.hero.gainExp(monster.spec.exp);
		this.addUltCharge(HERO.ultPerKill);

		this.popup(monster.body.center.x, monster.body.y - 46, `+${monster.spec.score}`, '#8ee08a', false);
		const isBoss = monster.spec.kind === 'boss';
		this.cameras.main.shake(isBoss ? 220 : 90, isBoss ? 0.009 : 0.003);
		this.sparks.setParticleTint(monster.spec.tint !== 0xffffff ? monster.spec.tint : 0xdfe6f5);
		this.sparks.explode(isBoss ? 28 : 12, monster.body.center.x, monster.body.center.y);
	}

	// ── 궁극기 ────────────────────────────────────────────

	private addUltCharge(amount: number): void {
		this.ultCharge = Math.min(HERO.ultMax, this.ultCharge + amount);
		this.events.emit('e-ultcharge', this.ultCharge, HERO.ultMax);
	}

	/** 해골 폭풍: 화면 안팎 ±400px 모든 몹에게 공격력 × 6. 대상이 없으면 게이지 보존 */
	private tryUlt(): void {
		if (this.gameOver || !this.hero.alive || this.ultCharge < HERO.ultMax) return;

		const view = this.cameras.main.worldView;
		const targets = (this.monsters.getChildren() as Monster[]).filter(m =>
			!m.dying && m.body.center.x >= view.left - 400 && m.body.center.x <= view.right + 400,
		);
		if (targets.length === 0) {
			this.subBanner('궁극기: 사거리에 적이 없다!');
			return;
		}

		this.ultCharge = 0;
		this.statUltUsed++;
		this.events.emit('e-ultcharge', 0, HERO.ultMax);

		this.cameras.main.flash(250, 255, 240, 180);
		this.cameras.main.shake(300, 0.01);
		this.hitStop(80);
		if (this.cache.audio.exists('sfx_hero_attack')) this.sound.play('sfx_hero_attack', { volume: 0.8 });

		const damage = this.hero.attackBase * HERO.ultDamageMult;
		for (const m of targets) {
			const dir: 1 | -1 = m.body.center.x >= this.hero.x ? 1 : -1;
			this.popup(m.body.center.x, m.body.y - 20, String(damage), '#ffd54f', true);
			m.takeDamage(damage, dir);
		}
	}

	private onLevelUp(level: number): void {
		const fx = this.add.sprite(this.hero.x, this.hero.y, 'levelup_fx').setOrigin(0.5, 1).setDepth(52);
		fx.play('levelup_fx');
		fx.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => fx.destroy());
		this.popup(this.hero.x, this.hero.y - 110, 'LEVEL UP!', '#ffd54f', true);
		this.events.emit('e-levelup', level);

		// 능력 해금 안내
		if (level === HERO.pierceLevel) this.subBanner('관통 화살 해금! 화살이 적을 꿰뚫는다');
		if (level === HERO.backshotLevel) this.subBanner('후방 화살 해금! 등 뒤도 지킨다');
		if (level === HERO.pierce2Level) this.subBanner('관통 강화! 2마리까지 꿰뚫는다');
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

	private subBanner(text: string): void {
		this.subBannerText.setText(text).setAlpha(0);
		this.tweens.add({
			targets: this.subBannerText,
			alpha: 1,
			duration: 220,
			onComplete: () => {
				this.tweens.add({ targets: this.subBannerText, alpha: 0, delay: 2400, duration: 400 });
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
