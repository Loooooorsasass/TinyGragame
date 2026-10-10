
# Tiny Gladiators — Integrated Progression & Economy

Phaser 3 + Vite + Capacitor 8 game project. The build emphasizes lightweight combat, clear progression, and data-driven economy rules.

## Run

```bash
npm install
npm run test:progression
npm run dev
```

Build the browser bundle:

```bash
npm run build
```

Android (after installing Android Studio/SDK):

```bash
npx cap add android   # once
npm run build
npx cap sync android
npx cap run android
```

## Updated campaign structure

- 3 chapters, 6 stages per chapter (1-1 through 3-6).
- Each chapter's Stage 6 is the boss. Defeating it unlocks the next chapter.
- Defeating Chapter 3 Stage 6 completes the current campaign; the player can still replay stages.
- Stage rating uses total damage taken divided by the stage-start maximum HP: below 20% = 3 stars, 20–40% inclusive = 2, above 40% = 1 star.
- Replaying a stage only increases lifetime stars and spendable stars when the rating improves.

## Chest economy

| Chest | Unlock chapter | Price alternative A | Price alternative B | Sell value |
|---|---:|---:|---:|---:|
| Wooden Chest | 1 | 15 stars | 1,000 gold | 300 gold |
| Iron Chest | 2, after clearing 1-6 | 30 stars | 2,500 gold | 750 gold |
| Steel Chest | 3, after clearing 2-6 | 45 stars | 5,000 gold | 1,500 gold |

- Star purchases consume spendable stars, while lifetime total stars remain recorded.
- Chests can be purchased repeatedly if the player can pay and has unlocked the chapter tier.
- Drops use equal probability across reward categories; the wooden category represents the wooden sword/stick option, plus shield and grass shoes. The fifth Iron reward category is chainmail/leather boots.
- Non-equipped chest gear can be sold for 30% of its chest's gold price. Starter gear cannot be sold, and equipped gear must be unequipped first.

## Gold economy and anti-farm

Stage-clear gold rewards:

| Chapter | 3 stars | 2 stars | 1 star |
|---|---:|---:|---:|
| 1 | 50 | 30 | 15 |
| 2 | 100 | 60 | 30 |
| 3 | 200 | 120 | 60 |

After a later chapter has been unlocked, gold earned from an earlier chapter is halved. This applies to stage-clear gold, enemy kill gold, and barrel gold. The listed stage-clear award is separate from combat pickups.

## Weapon-range hitstun

Hitstun duration is short (165 ms) and applies to player and enemies. Consecutive-hit chance is weapon-class specific:

| Weapon class | Chance per consecutive hit | Maximum |
|---|---:|---:|
| Short range / fast | +3 percentage points | 18% |
| Medium range | +4 percentage points | 24% |
| Long range / slow | +5 percentage points | 30% |

The chance starts at the per-hit increment on the first consecutive hit. The chain resets after no further damage is received during the weapon-specific reset window:

| Weapon class | Reset window without another hit |
|---|---:|
| Short range / fast | 4.5 seconds |
| Medium range | 5.0 seconds |
| Long range / slow | 5.5 seconds |

Two consecutive missed attacks reset the attacker's stun combo to zero. Misses include attacks that whiff, are dodged, or are successfully parried/blocked by the opponent. A successful hit clears the attacker's consecutive-miss counter. The same logic applies to the player and AI. For ranged enemies, projectile misses are tracked against the projectile's originating enemy. A parry counts as one miss; it does not independently clear the combo unless it is the second consecutive miss. Stun duration is fixed at 165 ms.

## AI cap and performance notes

- Enemy HP/damage caps and combo proficiency are derived from the strongest gear tier available at the player's current chapter milestone, with a 1.1 multiplier in the shared progression rules.
- Rendering retains pooled particles, simple atlas art, low-power settings and no heavy camera shake/flash.
- Save schema 4 stores lifetime/spendable stars, chapter unlock, chest purchase counts, and gear source chest. Earlier save schemas are accepted and old 3-stage chapter indices are mapped to the expanded 6-stage structure.

## Validation status

Run `npm run check` for syntax checks plus deterministic rule smoke tests, or `npm run test:progression` for the rule tests alone. JavaScript syntax checks and progression/economy/hitstun smoke tests passed during this update. A full Vite production build and real browser/Android playtest still require installing the npm dependencies and testing in a development environment.
