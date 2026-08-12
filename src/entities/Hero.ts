import Phaser from 'phaser';
import { GROUND_Y } from '../config';
import { HERO, attackDamage, expToNext, maxHp, rollDamage, type DamageRoll } from '../systems/balance';

export interface HeroInput {
	left: boolean;
	right: boolean;
	jump: boolean;
	attack: boolean;
}

export interface HeroEvents {
	onFire: (x: number, y: number, dir: 1 | -1, roll: DamageRoll) => void;
	onHpChange: (hp: number, max: number) => void;
	onExpChange: (exp: number, next: number, level: number) => void;
	onLevelUp: (level: number) => void;
	onDied: () => void;
}

const BODY_W = 44;
const BODY_H = 72;

export class Hero extends Phaser.Physics.Arcade.Sprite {
	declare body: Phaser.Physics.Arcade.Body;

	level: number;
	hp: number;
	hpMax: number;
	exp = 0;
	expNext: number;
	alive = true;

	private events2: HeroEvents;
	private invulnUntil = 0;
	private lastFireAt = 0;
	private airborne = false;
	private prevJumpHeld = false;
	private walkSnd?: Phaser.Sound.BaseSound;

	constructor(scene: Phaser.Scene, x: number, level: number, events: HeroEvents) {
		super(scene, x, GROUND_Y, 'hero_idle', 0);
		this.level = level;
		this.hpMax = maxHp(level);
		this.hp = this.hpMax;
		this.expNext = expToNext(level);
		this.events2 = events;

		scene.add.existing(this);
		scene.physics.add.existing(this);
		this.setOrigin(0.5, 1);
		this.setDepth(50);
		this.syncBody();

		if (scene.cache.audio.exists('sfx_hero_walk')) {
			this.walkSnd = scene.sound.add('sfx_hero_walk', { loop: true, volume: 0.25, rate: 1.5 });
		}
	}

	/** 프레임 크기가 애니메이션마다 달라서(80/115/…) 몸통 박스를 발 중심으로 재정렬 */
	private syncBody(): void {
		this.body.setSize(BODY_W, BODY_H);
		this.body.setOffset((this.frame.realWidth - BODY_W) / 2, this.frame.realHeight - BODY_H);
	}

	private playAnim(key: string, ignoreIfPlaying = true): void {
		this.play(key, ignoreIfPlaying);
		this.syncBody();
	}

	private sfx(key: string, volume = 0.5): void {
		if (this.scene.cache.audio.exists(key)) this.scene.sound.play(key, { volume });
	}

	get attackBase(): number {
		return attackDamage(this.level);
	}

	get invulnerable(): boolean {
		return this.scene.time.now < this.invulnUntil;
	}

	update(input: HeroInput): void {
		if (!this.alive) return;
		const time = this.scene.time.now;

		// 좌우 이동
		if (input.left && !input.right) {
			this.setVelocityX(-HERO.speed);
			this.setFlipX(true);
			if (this.x < 50) this.x = 50;
		} else if (input.right && !input.left) {
			this.setVelocityX(HERO.speed);
			this.setFlipX(false);
		} else {
			this.setVelocityX(0);
		}
		const moving = this.body.velocity.x !== 0;

		// 점프 (엣지 트리거)
		if (input.jump && !this.prevJumpHeld && !this.airborne) {
			this.airborne = true;
			this.setVelocityY(HERO.jumpVelocity);
			this.playAnim('hero_jump');
			this.sfx('sfx_hero_jump');
		}
		this.prevJumpHeld = input.jump;

		// 착지: 하강 중 지면에 닿으면 고정
		if (this.airborne && this.body.velocity.y >= 0 && this.y >= GROUND_Y) {
			this.airborne = false;
			this.y = GROUND_Y;
			this.setVelocityY(0);
			this.sfx('sfx_hero_jump_land', 0.4);
		}

		// 지면 위에서는 중력 누적을 매 프레임 상쇄 (바닥 뚫림 방지)
		if (!this.airborne) {
			this.y = GROUND_Y;
			if (this.body.velocity.y > 0) this.setVelocityY(0);
		}
		const onGround = !this.airborne;

		// 공격 (쿨다운)
		if (input.attack && time > this.lastFireAt + HERO.fireCooldownMs) {
			this.lastFireAt = time;
			const dir: 1 | -1 = this.flipX ? -1 : 1;
			const roll = rollDamage(this.attackBase);
			this.playAnim('hero_attack', false);
			this.sfx('sfx_hero_attack', 0.4);
			this.events2.onFire(this.x + dir * 50, this.y - 45, dir, roll);
		}

		// 모션 우선순위: 공격 재생 중 > 점프 > 달리기 > 대기
		const current = this.anims.currentAnim?.key;
		const attackPlaying = current === 'hero_attack' && this.anims.isPlaying;
		if (!attackPlaying) {
			if (!onGround) {
				if (current !== 'hero_jump') this.playAnim('hero_jump');
			} else if (moving) {
				this.playAnim('hero_run');
			} else {
				this.playAnim('hero_idle');
			}
		}

		// 발소리
		if (this.walkSnd) {
			if (onGround && moving && !this.walkSnd.isPlaying) this.walkSnd.play();
			else if ((!moving || !onGround) && this.walkSnd.isPlaying) this.walkSnd.stop();
		}
	}

	takeDamage(amount: number): void {
		if (!this.alive || this.invulnerable) return;
		this.hp = Math.max(0, this.hp - amount);
		this.invulnUntil = this.scene.time.now + HERO.invulnMs;
		this.events2.onHpChange(this.hp, this.hpMax);
		this.sfx('sfx_hero_hit');

		// 피격 점멸
		this.scene.tweens.add({
			targets: this,
			alpha: 0.3,
			duration: 100,
			yoyo: true,
			repeat: 3,
			onComplete: () => this.setAlpha(1),
		});

		if (this.hp <= 0) this.die();
	}

	private die(): void {
		this.alive = false;
		this.walkSnd?.stop();
		this.setVelocity(0, 0);
		this.playAnim('hero_die');
		this.sfx('sfx_hero_dead', 0.6);
		this.events2.onDied();
	}

	gainExp(amount: number): void {
		if (!this.alive) return;
		this.exp += amount;
		while (this.exp >= this.expNext) {
			this.exp -= this.expNext;
			this.level += 1;
			this.expNext = expToNext(this.level);
			this.hpMax = maxHp(this.level);
			this.hp = this.hpMax; // 레벨업 = 완전 회복
			this.events2.onHpChange(this.hp, this.hpMax);
			this.events2.onLevelUp(this.level);
		}
		this.events2.onExpChange(this.exp, this.expNext, this.level);
	}
}
