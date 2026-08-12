import Phaser from 'phaser';
import { HERO, type DamageRoll } from '../systems/balance';

/** 히어로 투사체 — GameScene의 풀 그룹에서 재사용된다.
 * Image가 아닌 Sprite 상속: Sprite만 UpdateList에 올라 preUpdate가 호출된다. */
export class Bullet extends Phaser.Physics.Arcade.Sprite {
	declare body: Phaser.Physics.Arcade.Body;

	roll: DamageRoll = { amount: 0, crit: false };
	dir: 1 | -1 = 1;
	/** 남은 관통 횟수 */
	private pierceLeft = 0;
	/** 이미 맞힌 몬스터 (관통 시 중복 타격 방지) */
	private hitTargets = new Set<unknown>();

	constructor(scene: Phaser.Scene, x: number, y: number) {
		super(scene, x, y, 'bullet');
		this.setScale(1.6);
		this.setDepth(48);
	}

	fire(x: number, y: number, dir: 1 | -1, roll: DamageRoll, pierce = 0): void {
		this.enableBody(true, x, y, true, true);
		this.body.setAllowGravity(false);
		this.roll = roll;
		this.dir = dir;
		this.pierceLeft = pierce;
		this.hitTargets.clear();
		this.setFlipX(dir === -1);
		// 히트박스는 화살촉 끝 부분만 — 몸통에 닿기 전에 사라지는 느낌 방지
		this.body.setSize(15, 10);
		this.body.setOffset(dir === 1 ? 25 : 0, 0);
		this.setVelocityX(dir * HERO.bulletSpeed);
		// 관통 화살은 살짝 커 보이게
		this.setScale(pierce > 0 ? 1.9 : 1.6);
	}

	/** 이 몬스터를 이미 맞혔는가 */
	alreadyHit(target: unknown): boolean {
		return this.hitTargets.has(target);
	}

	/** 타격 처리 — 관통이 남았으면 계속 날아가고, 아니면 소멸. @returns 소멸했으면 true */
	registerHit(target: unknown): boolean {
		this.hitTargets.add(target);
		if (this.pierceLeft > 0) {
			this.pierceLeft--;
			return false;
		}
		this.kill();
		return true;
	}

	kill(): void {
		this.disableBody(true, true);
	}

	preUpdate(time: number, delta: number): void {
		super.preUpdate(time, delta);
		if (!this.active) return;
		const view = this.scene.cameras.main.worldView;
		if (this.x < view.left - 100 || this.x > view.right + 100) this.kill();
	}
}

/** 저격 해골의 뼈화살 — 히어로를 향해 일직선으로 날아온다 */
export class EnemyBullet extends Phaser.Physics.Arcade.Sprite {
	declare body: Phaser.Physics.Arcade.Body;

	damage = 0;

	constructor(scene: Phaser.Scene, x: number, y: number) {
		super(scene, x, y, 'bullet');
		this.setScale(1.5);
		this.setDepth(47);
		this.setTint(0xff5566);
	}

	fire(x: number, y: number, dir: 1 | -1, damage: number): void {
		this.enableBody(true, x, y, true, true);
		this.body.setAllowGravity(false);
		this.damage = damage;
		this.setTint(0xff5566);
		this.setFlipX(dir === -1);
		this.body.setSize(15, 10);
		this.body.setOffset(dir === 1 ? 25 : 0, 0);
		this.setVelocityX(dir * 520);
	}

	kill(): void {
		this.disableBody(true, true);
	}

	preUpdate(time: number, delta: number): void {
		super.preUpdate(time, delta);
		if (!this.active) return;
		const view = this.scene.cameras.main.worldView;
		if (this.x < view.left - 100 || this.x > view.right + 100) this.kill();
	}
}
