import Phaser from 'phaser';
import { GROUND_Y } from '../config';
import type { MonsterSpec } from '../systems/balance';
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

export class Monster extends Phaser.Physics.Arcade.Sprite {
	declare body: Phaser.Physics.Arcade.Body;

	spec: MonsterSpec;
	hp: number;
	dying = false;

	private attacking = false;
	private nextAttackAt = 0;
	private hpBg: Phaser.GameObjects.Rectangle;
	private hpFill: Phaser.GameObjects.Rectangle;
	private onDeath: (m: Monster) => void;

	constructor(scene: Phaser.Scene, x: number, spec: MonsterSpec, onDeath: (m: Monster) => void) {
		super(scene, x, GROUND_Y, spec.texture === 'skel' ? 'skel_run' : 'boss_walk', 0);
		this.spec = spec;
		this.hp = spec.hp;
		this.onDeath = onDeath;

		scene.add.existing(this);
		scene.physics.add.existing(this);
		this.setOrigin(0.5, 1);
		this.setScale(spec.scale);
		if (spec.tint !== 0xffffff) this.setTint(spec.tint);
		if (spec.alpha !== undefined) this.setAlpha(spec.alpha);
		this.setDepth(spec.kind === 'boss' ? 45 : 40);
		this.body.setAllowGravity(false);
		this.body.setImmovable(true);

		this.play(ANIMS[spec.texture].run);
		this.anims.timeScale = spec.animRate ?? 1;
		this.syncBodyToArt();

		// 머리 위 HP 바
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

	/** 매 프레임 호출 — 추적/공격 AI */
	updateAI(hero: Hero, time: number): void {
		if (this.dying) return;

		// HP 바는 히트박스(=아트) 중심을 따라간다
		this.hpBg.setPosition(this.body.center.x, this.body.y - 12);
		this.hpFill.setPosition(this.body.center.x, this.body.y - 12);

		if (!hero.alive) {
			this.setVelocityX(0);
			this.play(ANIMS[this.spec.texture].run, true);
			return;
		}

		const dx = hero.x - this.body.center.x;
		this.setFlipX(dx > 0); // 원본 시트는 왼쪽을 본다

		if (this.spec.kind === 'charger') {
			// 돌진형: 멈추지 않고 달려든다 (접촉 데미지는 GameScene overlap에서)
			this.setVelocityX(Math.sign(dx) * this.spec.speed);
			return;
		}

		if (this.attacking) {
			this.setVelocityX(0);
			return;
		}

		if (Math.abs(dx) > this.spec.attackRange) {
			this.setVelocityX(Math.sign(dx) * this.spec.speed);
			this.play(ANIMS[this.spec.texture].run, true);
			this.anims.timeScale = this.spec.animRate ?? 1;
		} else {
			this.setVelocityX(0);
			if (time >= this.nextAttackAt) this.startAttack(hero);
		}
	}

	private startAttack(hero: Hero): void {
		const animKey = ANIMS[this.spec.texture].attack;
		this.attacking = true;
		this.play(animKey);
		this.anims.timeScale = this.spec.animRate ?? 1;

		// 공격 모션 중반에 타격 판정 (원작의 wait(0.5) 계승)
		this.scene.time.delayedCall(450, () => {
			if (this.dying || !this.active || !hero.alive) return;
			if (Math.abs(hero.x - this.body.center.x) <= this.spec.attackRange + 40) {
				hero.takeDamage(this.spec.damage);
				if (this.scene.cache.audio.exists('sfx_monster_attack')) {
					this.scene.sound.play('sfx_monster_attack', { volume: 0.35 });
				}
			}
		});

		this.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + animKey, () => {
			if (this.dying || !this.active) return;
			this.attacking = false;
			this.nextAttackAt = this.scene.time.now + 700;
			this.play(ANIMS[this.spec.texture].run, true);
			this.anims.timeScale = this.spec.animRate ?? 1;
		});
	}

	/** @returns 죽었으면 true */
	takeDamage(amount: number, knockbackDir: 1 | -1): boolean {
		if (this.dying) return false;
		this.hp = Math.max(0, this.hp - amount);
		this.hpFill.width = Math.max(0, (this.hpBg.width - 2) * (this.hp / this.spec.hp));

		// 피격 플래시 + 넉백
		this.setTintFill(0xffffff);
		this.scene.time.delayedCall(60, () => {
			if (!this.active) return;
			this.spec.tint !== 0xffffff ? this.setTint(this.spec.tint) : this.clearTint();
		});
		this.x += knockbackDir * (this.spec.kind === 'boss' ? 5 : 16);

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
		this.setVelocityX(0);
		this.body.enable = false;
		this.hpBg.destroy();
		this.hpFill.destroy();

		if (giveReward) this.onDeath(this);
		if (this.scene.cache.audio.exists('sfx_monster_dead')) {
			this.scene.sound.play('sfx_monster_dead', { volume: 0.35 });
		}

		this.play(ANIMS[this.spec.texture].dead);
		this.scene.tweens.add({ targets: this, alpha: 0, duration: 900, delay: 300 });
		this.scene.time.delayedCall(1200, () => this.destroy());
	}
}
