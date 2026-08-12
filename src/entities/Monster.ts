import Phaser from 'phaser';
import { GROUND_Y } from '../config';
import { DEFAULT_BOSS_MOD, type MonsterSpec } from '../systems/balance';
import type { Hero } from './Hero';

const ANIMS: Record<MonsterSpec['texture'], { run: string; attack: string; dead: string }> = {
	skel: { run: 'skel_run', attack: 'skel_attack', dead: 'skel_dead' },
	boss: { run: 'boss_walk', attack: 'boss_attack', dead: 'boss_dead' },
};

/**
 * 시트 프레임 안에서 실제 아트가 차지하는 영역 (프레임 좌표, 왼쪽 보기 기준).
 * 스켈레톤은 왼쪽, 보스는 오른쪽에 치우쳐 있어 프레임 중앙 히트박스가 어긋난다.
 */
const ART: Record<MonsterSpec['texture'], { cx: number; w: number; h: number }> = {
	skel: { cx: 38, w: 42, h: 64 },
	boss: { cx: 196, w: 96, h: 168 },
};

/** GameScene이 주입하는 상호작용 훅 */
export interface MonsterCtx {
	onDeath: (m: Monster) => void;
	fireEnemyBullet: (x: number, y: number, dir: 1 | -1, damage: number) => void;
	summon: (x: number) => void;
}

export class Monster extends Phaser.Physics.Arcade.Sprite {
	declare body: Phaser.Physics.Arcade.Body;

	spec: MonsterSpec;
	hp: number;
	dying = false;
	/** 보스 돌진 중 — 접촉 데미지 판정에 사용 */
	charging = false;

	private ctx: MonsterCtx;
	private attacking = false;
	private nextAttackAt = 0;
	private hpBg: Phaser.GameObjects.Rectangle;
	private hpFill: Phaser.GameObjects.Rectangle;

	// hopper 상태
	private nextHopAt = 0;
	private hopping = false;

	// shooter 상태
	private nextShotAt = 0;

	// boss 상태
	private nextPatternAt = 0;
	private enraged = false;
	private busyUntil = 0;

	constructor(scene: Phaser.Scene, x: number, spec: MonsterSpec, ctx: MonsterCtx) {
		super(scene, x, GROUND_Y, spec.texture === 'skel' ? 'skel_run' : 'boss_walk', 0);
		this.spec = spec;
		this.hp = spec.hp;
		this.ctx = ctx;

		scene.add.existing(this);
		scene.physics.add.existing(this);
		this.setOrigin(0.5, 1);
		this.setScale(spec.scale);
		if (spec.tint !== 0xffffff) this.setTint(spec.tint);
		if (spec.alpha !== undefined) this.setAlpha(spec.alpha);
		this.setDepth(spec.kind === 'boss' ? 45 : 40);
		// 도약 해골만 중력을 받는다
		this.body.setAllowGravity(spec.kind === 'hopper');
		this.body.setImmovable(true);

		this.play(ANIMS[spec.texture].run);
		this.anims.timeScale = spec.animRate ?? 1;
		this.syncBodyToArt();

		const barW = spec.kind === 'boss' ? 120 : 54 * Math.max(1, spec.scale * 0.9);
		this.hpBg = scene.add.rectangle(x, 0, barW, 8, 0x270721).setDepth(60);
		this.hpFill = scene.add.rectangle(x, 0, barW - 2, 6, 0x7d0f1f).setDepth(61);
	}

	/** 히트박스를 프레임 중앙이 아닌 실제 아트 위치(flip 반영)에 맞춘다 */
	private syncBodyToArt(): void {
		const art = ART[this.spec.texture];
		const fw = this.frame.realWidth;
		const fh = this.frame.realHeight;
		const cx = this.flipX ? fw - art.cx : art.cx;
		this.body.setSize(art.w, art.h);
		this.body.setOffset(cx - art.w / 2, fh - art.h);
	}

	setFlipX(value: boolean): this {
		const changed = this.flipX !== value;
		super.setFlipX(value);
		if (changed && this.body) this.syncBodyToArt();
		return this;
	}

	private playRun(): void {
		this.play(ANIMS[this.spec.texture].run, true);
		this.anims.timeScale = this.spec.animRate ?? 1;
	}

	/** 매 프레임 호출 — 종류별 AI */
	updateAI(hero: Hero, time: number): void {
		if (this.dying) return;

		this.hpBg.setPosition(this.body.center.x, this.body.y - 12);
		this.hpFill.setPosition(this.body.center.x, this.body.y - 12);

		if (!hero.alive) {
			this.setVelocityX(0);
			if (this.spec.kind !== 'hopper' || !this.hopping) this.playRun();
			return;
		}

		const dx = hero.x - this.body.center.x;

		switch (this.spec.kind) {
			case 'charger':
				this.setFlipX(dx > 0);
				this.setVelocityX(Math.sign(dx) * this.spec.speed);
				return;
			case 'hopper':
				this.updateHopper(dx, time);
				return;
			case 'shooter':
				this.updateShooter(hero, dx, time);
				return;
			case 'boss':
				this.updateBoss(hero, dx, time);
				return;
			default:
				this.updateWalker(hero, dx, time);
		}
	}

	// ── 워커 (기본 근접) ─────────────────────────────────

	private updateWalker(hero: Hero, dx: number, time: number): void {
		this.setFlipX(dx > 0);
		if (this.attacking) {
			this.setVelocityX(0);
			return;
		}
		if (Math.abs(dx) > this.spec.attackRange) {
			this.setVelocityX(Math.sign(dx) * this.spec.speed);
			this.playRun();
		} else {
			this.setVelocityX(0);
			if (time >= this.nextAttackAt) this.startMelee(hero);
		}
	}

	private startMelee(hero: Hero, damageMult = 1): void {
		const animKey = ANIMS[this.spec.texture].attack;
		this.attacking = true;
		this.play(animKey);
		this.anims.timeScale = this.spec.animRate ?? 1;

		this.scene.time.delayedCall(450, () => {
			if (this.dying || !this.active || !hero.alive) return;
			if (Math.abs(hero.x - this.body.center.x) <= this.spec.attackRange + 40) {
				hero.takeDamage(Math.round(this.spec.damage * damageMult));
				if (this.scene.cache.audio.exists('sfx_monster_attack')) {
					this.scene.sound.play('sfx_monster_attack', { volume: 0.35 });
				}
			}
		});

		this.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + animKey, () => {
			if (this.dying || !this.active) return;
			this.attacking = false;
			this.nextAttackAt = this.scene.time.now + 700;
			this.playRun();
		});
	}

	// ── 도약 해골 ────────────────────────────────────────

	private updateHopper(dx: number, time: number): void {
		if (this.hopping) {
			// 착지 판정
			if (this.body.velocity.y >= 0 && this.y >= GROUND_Y) {
				this.y = GROUND_Y;
				this.setVelocity(0, 0);
				this.hopping = false;
				this.nextHopAt = time + 450 + Math.random() * 450;
			}
			return;
		}
		this.setFlipX(dx > 0);
		// 대기 중에는 중력 누적을 상쇄해 바닥 뚫림 방지
		this.setVelocity(0, 0);
		this.y = GROUND_Y;
		if (time >= this.nextHopAt) {
			this.hopping = true;
			this.setVelocity(Math.sign(dx) * this.spec.speed, -620);
		}
	}

	// ── 저격 해골 ────────────────────────────────────────

	private updateShooter(hero: Hero, dx: number, time: number): void {
		this.setFlipX(dx > 0);
		const dist = Math.abs(dx);
		if (dist > this.spec.attackRange) {
			this.setVelocityX(Math.sign(dx) * this.spec.speed);
			this.playRun();
			return;
		}
		this.setVelocityX(0);
		if (time >= this.nextShotAt) {
			this.nextShotAt = time + 1600;
			const animKey = ANIMS.skel.attack;
			this.play(animKey);
			this.scene.time.delayedCall(300, () => {
				if (this.dying || !this.active || !hero.alive) return;
				const dir: 1 | -1 = hero.x >= this.body.center.x ? 1 : -1;
				this.ctx.fireEnemyBullet(this.body.center.x + dir * 30, this.body.center.y - 8, dir, this.spec.damage);
			});
			this.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + animKey, () => {
				if (!this.dying && this.active) this.playRun();
			});
		}
	}

	// ── 보스: 근접 + 소환 + 돌진 + 분노 ──────────────────

	private updateBoss(hero: Hero, dx: number, time: number): void {
		const mod = this.spec.bossMod ?? DEFAULT_BOSS_MOD;

		// 분노 모드: HP 30% 이하에서 1회 발동
		if (!this.enraged && this.hp <= this.spec.hp * 0.3) {
			this.enraged = true;
			this.setTint(0xff9a7a);
			this.spec = { ...this.spec, speed: Math.round(this.spec.speed * 1.5), animRate: (this.spec.animRate ?? 1) + 0.6 };
			this.scene.cameras.main.shake(200, 0.006);
		}

		if (this.charging) {
			// 돌진 중에는 방향 고정, busyUntil에 종료
			if (time >= this.busyUntil) {
				this.charging = false;
				this.setVelocityX(0);
			}
			return;
		}
		if (this.attacking || time < this.busyUntil) {
			this.setVelocityX(0);
			return;
		}

		this.setFlipX(dx > 0);

		// 패턴 추첨 주기 (공격성이 높을수록 짧다)
		if (time >= this.nextPatternAt) {
			const cooldown = 5600 - mod.aggression * 800; // 1→4800, 2→4000, 3→3200
			this.nextPatternAt = time + cooldown;

			const roll = Math.random() * (2 + mod.summonBias + mod.chargeBias);
			if (roll < mod.summonBias) {
				this.doSummon();
				return;
			}
			if (roll < mod.summonBias + mod.chargeBias) {
				this.doCharge(dx);
				return;
			}
			// 나머지는 기본 행동(접근/근접)으로
		}

		if (Math.abs(dx) > this.spec.attackRange) {
			this.setVelocityX(Math.sign(dx) * this.spec.speed);
			this.playRun();
		} else {
			this.setVelocityX(0);
			if (time >= this.nextAttackAt) this.startMelee(hero);
		}
	}

	/** 소환: 공격 모션과 함께 부하 해골 2마리 */
	private doSummon(): void {
		this.busyUntil = this.scene.time.now + 900;
		this.setVelocityX(0);
		const animKey = ANIMS.boss.attack;
		this.play(animKey);
		this.scene.time.delayedCall(400, () => {
			if (this.dying || !this.active) return;
			this.ctx.summon(this.body.center.x);
		});
		this.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + animKey, () => {
			if (!this.dying && this.active) this.playRun();
		});
	}

	/** 돌진: 0.5초 점멸 예고 후 빠르게 대시 (접촉 데미지는 GameScene에서) */
	private doCharge(dx: number): void {
		const now = this.scene.time.now;
		this.busyUntil = now + 500;
		this.setVelocityX(0);
		// 예고 점멸
		this.scene.tweens.add({ targets: this, alpha: 0.4, duration: 120, yoyo: true, repeat: 1 });
		this.scene.time.delayedCall(500, () => {
			if (this.dying || !this.active) return;
			this.charging = true;
			this.busyUntil = this.scene.time.now + 1100;
			this.setVelocityX(Math.sign(dx) * this.spec.speed * 5);
			this.playRun();
		});
	}

	// ── 공통 ─────────────────────────────────────────────

	/** @returns 죽었으면 true */
	takeDamage(amount: number, knockbackDir: 1 | -1): boolean {
		if (this.dying) return false;
		this.hp = Math.max(0, this.hp - amount);
		this.hpFill.width = Math.max(0, (this.hpBg.width - 2) * (this.hp / this.spec.hp));

		this.setTintFill(0xffffff);
		this.scene.time.delayedCall(60, () => {
			if (!this.active) return;
			const tint = this.enraged ? 0xff9a7a : this.spec.tint;
			tint !== 0xffffff ? this.setTint(tint) : this.clearTint();
		});
		if (!this.charging) {
			this.x += knockbackDir * (this.spec.kind === 'boss' ? 5 : 16);
		}

		if (this.hp <= 0) {
			this.die();
			return true;
		}
		return false;
	}

	/** 돌진형 자폭 (점수 없음) */
	explode(): void {
		if (this.dying) return;
		this.die(false);
	}

	private die(giveReward = true): void {
		this.dying = true;
		this.attacking = false;
		this.charging = false;
		this.setVelocity(0, 0);
		this.body.enable = false;
		this.hpBg.destroy();
		this.hpFill.destroy();

		if (giveReward) this.ctx.onDeath(this);
		if (this.scene.cache.audio.exists('sfx_monster_dead')) {
			this.scene.sound.play('sfx_monster_dead', { volume: 0.35 });
		}

		this.play(ANIMS[this.spec.texture].dead);
		this.scene.tweens.add({ targets: this, alpha: 0, duration: 900, delay: 300 });
		this.scene.time.delayedCall(1200, () => this.destroy());
	}
}
