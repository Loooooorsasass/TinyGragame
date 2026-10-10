import assert from 'node:assert/strict';
import {
  STUN_RULES,
  getStunChance,
  getStunResetWindow,
  nextMissCount,
  shouldResetStunChain,
  getStageStars,
  getStageGoldReward,
  POTION_RULES,
  canBuyPotion,
  PARRY_RULES,
  canParryWithCooldown,
  DIAMOND_RULES,
  canBuyDiamondPack,
} from '../progression_rules.js';

// 1. Stun & Combo window tests
assert.equal(getStunResetWindow('short'), 4500);
assert.equal(getStunResetWindow('medium'), 5000);
assert.equal(getStunResetWindow('long'), 5500);
assert.equal(getStunChance(1, 'short'), 0.03);
assert.equal(getStunChance(6, 'short'), 0.18);
assert.equal(getStunChance(6, 'medium'), 0.24);
assert.equal(getStunChance(6, 'long'), 0.30);
assert.equal(STUN_RULES.durationMs, 165);
assert.equal(nextMissCount(0, false), 1);
assert.equal(nextMissCount(1, false), 2);
assert.equal(nextMissCount(2, false), 2);
assert.equal(nextMissCount(1, true), 0);
assert.equal(shouldResetStunChain(1), false);
assert.equal(shouldResetStunChain(2), true);

// 2. Parry Anti-Spam / Cooldown tests (EXP-01 fix)
assert.equal(PARRY_RULES.windowMs, 185);
assert.equal(PARRY_RULES.cooldownMs, 400);
assert.equal(canParryWithCooldown(1000, 500, 400), true); // 500ms elapsed >= 400ms -> allowed
assert.equal(canParryWithCooldown(1200, 1000, 400), false); // 200ms elapsed < 400ms -> prevented (spam)
assert.equal(canParryWithCooldown(1400, 1000, 400), true); // 400ms elapsed == 400ms -> allowed

// 3. Potion Economy tests (BUG-01 fix)
assert.equal(POTION_RULES.goldCost, 150);
assert.equal(POTION_RULES.healAmount, 70);
assert.equal(POTION_RULES.barrelDropRate, 0.20);
assert.equal(canBuyPotion(100, 0), false); // not enough gold
assert.equal(canBuyPotion(150, 0), true); // exact gold
assert.equal(canBuyPotion(500, 99), false); // inventory full

// 4. Diamond Economy tests (BUG-02 fix)
assert.equal(DIAMOND_RULES.potionsPackCost, 5);
assert.equal(DIAMOND_RULES.respecCost, 15);
assert.equal(canBuyDiamondPack(4, 5), false);
assert.equal(canBuyDiamondPack(5, 5), true);
assert.equal(canBuyDiamondPack(20, 15), true);

// 5. Stage Stars & Anti-farm reward tests
assert.equal(getStageStars(10, 100), 3); // 10% lost < 20% -> 3 stars
assert.equal(getStageStars(35, 100), 2); // 35% lost <= 40% -> 2 stars
assert.equal(getStageStars(60, 100), 1); // 60% lost > 40% -> 1 star
assert.equal(getStageGoldReward(1, 3, false), 50); // chapter 1, 3 stars, normal
assert.equal(getStageGoldReward(1, 3, true), 25); // anti-farm cuts 50%
assert.equal(getStageGoldReward(3, 3, false), 200);

console.log('All progression, parry-cooldown, potion, and economy smoke tests passed.');