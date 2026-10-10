// Pure progression/combat rules shared by the game and smoke tests.
export const STUN_RULES = Object.freeze({
  short: Object.freeze({ perHit: 0.03, cap: 0.18, resetWindowMs: 4500 }),
  medium: Object.freeze({ perHit: 0.04, cap: 0.24, resetWindowMs: 5000 }),
  long: Object.freeze({ perHit: 0.05, cap: 0.30, resetWindowMs: 5500 }),
  durationMs: 165
});
 
export function getStageStars(damageTaken, maxHp) {
  const ratio = Math.max(0, Number(damageTaken) || 0) / Math.max(1, Number(maxHp) || 1);
  if (ratio < 0.20) return 3;
  if (ratio <= 0.40) return 2;
  return 1;
}
 
export function getStunChance(consecutiveHits, weaponClass = 'medium') {
  const hits = Math.max(1, Math.floor(Number(consecutiveHits) || 1));
  const rule = STUN_RULES[weaponClass] || STUN_RULES.medium;
  return Math.min(rule.cap, hits * rule.perHit);
}
 
export function getStunResetWindow(weaponClass = 'medium') {
  return (STUN_RULES[weaponClass] || STUN_RULES.medium).resetWindowMs;
}
 
// A combo is reset after two consecutive attacks that miss, are dodged, or are parried.
export function nextMissCount(currentMisses, didHit) {
  return didHit ? 0 : Math.min(2, Math.max(0, Math.floor(Number(currentMisses) || 0)) + 1);
}
 
export function shouldResetStunChain(missCount) {
  return Math.max(0, Math.floor(Number(missCount) || 0)) >= 2;
}
 
// Chapter progression determines which maximum equipment tier is available to both sides.
export function getBuildCeiling(chapterUnlocked, gearValues = []) {
  const chapter = Math.max(1, Math.min(3, Math.floor(Number(chapterUnlocked) || 1)));
  const maxTier = chapter;
  const available = gearValues.filter(item => (item.tier || 0) <= maxTier);
  const bestWeaponBonus = Math.max(0, ...available.filter(item => item.slot === 'weapon').map(item => item.atk || 0));
  const bestArmor = available.filter(item => item.slot === 'armor');
  const bestArmorHp = Math.max(0, ...bestArmor.map(item => item.hpPct || 0));
  const bestArmorDef = Math.max(0, ...bestArmor.map(item => item.def || 0));
  const bestShieldDef = Math.max(0, ...available.filter(item => item.slot === 'shield').map(item => item.def || 0));
  const bestBootDef = Math.max(0, ...available.filter(item => item.slot === 'boots').map(item => item.def || 0));
  // Include max micro-stat ranks: +10 attack and +60 HP, then strongest gear in each slot.
  const maxAtk = Math.round((8 + 10 + bestWeaponBonus) * 1.1);
  const maxHp = Math.round((100 + 5 * 12) * (1 + bestArmorHp) * 1.1);
  const maxDef = Math.round((bestArmorDef + bestShieldDef + bestBootDef) * 1.1);
  return { tier: maxTier, maxAtk, maxHp, maxDef };
}
 
export function chooseChestReward(groups, random = Math.random) {
  if (!Array.isArray(groups) || groups.length === 0) throw new Error('Chest must contain at least one reward category.');
  const r = Math.max(0, Math.min(0.999999999, Number(random()) || 0));
  const category = groups[Math.min(groups.length - 1, Math.floor(r * groups.length))];
  if (!Array.isArray(category) || category.length === 0) throw new Error('Reward category must contain at least one item.');
  if (category.length === 1) return category[0];
  const inner = Math.max(0, Math.min(0.999999999, Number(random()) || 0));
  return category[Math.min(category.length - 1, Math.floor(inner * category.length))];
}
 
export function getStageGoldReward(chapter, stars, antiFarm = false) {
  const rewards = { 1: { 3: 50, 2: 30, 1: 15 }, 2: { 3: 100, 2: 60, 1: 30 }, 3: { 3: 200, 2: 120, 1: 60 } };
  const amount = rewards[Math.max(1, Math.min(3, Math.floor(chapter) || 1))][Math.max(1, Math.min(3, Math.floor(stars) || 1))];
  return Math.floor(amount * (antiFarm ? 0.5 : 1));
}
 
export function canBuyChest(chest, chapterUnlocked, starBalance, gold, method) {
  if (!chest || chapterUnlocked < chest.chapterRequired) return false;
  if (method === 'stars') return starBalance >= chest.starCost;
  if (method === 'gold') return gold >= chest.goldCost;
  return false;
}

export const POTION_RULES = Object.freeze({
  goldCost: 150,
  healAmount: 70,
  barrelDropRate: 0.20,
  maxPotions: 99
});

export function canBuyPotion(gold, currentPotions = 0, cost = POTION_RULES.goldCost) {
  return (Number(gold) || 0) >= cost && (Number(currentPotions) || 0) < POTION_RULES.maxPotions;
}

export const PARRY_RULES = Object.freeze({
  windowMs: 185,
  cooldownMs: 400
});

export function canParryWithCooldown(nowMs, lastParryAttemptMs, cooldownMs = PARRY_RULES.cooldownMs) {
  const now = Number(nowMs) || 0;
  const last = Number(lastParryAttemptMs) || 0;
  return (now - last) >= cooldownMs;
}

export const DIAMOND_RULES = Object.freeze({
  potionsPackCost: 5,
  potionsPackCount: 3,
  respecCost: 15
});

export function canBuyDiamondPack(diamonds, cost = DIAMOND_RULES.potionsPackCost) {
  return (Number(diamonds) || 0) >= cost;
}

 