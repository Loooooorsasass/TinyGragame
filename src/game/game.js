import Phaser from 'phaser';
import { getStageStars, getStunChance, getBuildCeiling, chooseChestReward, getStageGoldReward, STUN_RULES, getStunResetWindow, nextMissCount, shouldResetStunChain, POTION_RULES, canBuyPotion, PARRY_RULES, canParryWithCooldown, DIAMOND_RULES, canBuyDiamondPack } from './progression_rules.js';
 
window.Phaser = Phaser;
 
 
'use strict';
 
// ============================================================================
// 1. EVENT BUS — small synchronous Pub/Sub layer; no DOM or Phaser dependency.
// ============================================================================
class EventBus {
  constructor(){ this.listeners = new Map(); }
  on(name, fn){ if(!this.listeners.has(name)) this.listeners.set(name,new Set()); this.listeners.get(name).add(fn); return ()=>this.off(name,fn); }
  off(name, fn){ this.listeners.get(name)?.delete(fn); }
  emit(name, data){ const set=this.listeners.get(name); if(!set) return; [...set].forEach(fn=>{ try{fn(data);}catch(err){console.error(`[EventBus:${name}]`,err);} }); }
}
const bus = new EventBus();
 
// ============================================================================
// 2. PURE-JS DOMAIN: stats, behavior-tree primitives, stage data, game state.
// ============================================================================
const StatModType = Object.freeze({Flat:100, PercentAdd:200, PercentMult:300});
class StatModifier {
  constructor(value,type,source){this.value=value;this.type=type;this.source=source;}
}
class CharacterStat {
  constructor(baseValue){this.baseValue=baseValue;this.modifiers=[];this.isDirty=true;this._value=baseValue;}
  get value(){if(this.isDirty){this._value=this.calculateFinalValue();this.isDirty=false;}return this._value;}
  addModifier(mod){this.modifiers.push(mod);this.modifiers.sort((a,b)=>a.type-b.type);this.isDirty=true;}
  removeModifiersFromSource(source){this.modifiers=this.modifiers.filter(m=>m.source!==source);this.isDirty=true;}
  calculateFinalValue(){let value=this.baseValue,percentAdd=0;for(let i=0;i<this.modifiers.length;i++){const m=this.modifiers[i];if(m.type===StatModType.Flat)value+=m.value;else if(m.type===StatModType.PercentAdd){percentAdd+=m.value;const next=this.modifiers[i+1];if(!next||next.type!==StatModType.PercentAdd){value*=1+percentAdd;percentAdd=0;}}else if(m.type===StatModType.PercentMult)value*=1+m.value;}return Math.max(0,Math.round(value));}
}
const NodeState=Object.freeze({SUCCESS:'SUCCESS',FAILURE:'FAILURE',RUNNING:'RUNNING'});
class SequenceNode {constructor(children=[]){this.children=children;}evaluate(ctx,dt){let running=false;for(const c of this.children){const s=c.evaluate(ctx,dt);if(s===NodeState.FAILURE)return NodeState.FAILURE;if(s===NodeState.RUNNING)running=true;}return running?NodeState.RUNNING:NodeState.SUCCESS;}}
class SelectorNode {constructor(children=[]){this.children=children;}evaluate(ctx,dt){for(const c of this.children){const s=c.evaluate(ctx,dt);if(s===NodeState.SUCCESS||s===NodeState.RUNNING)return s;}return NodeState.FAILURE;}}
class ActionNode {constructor(action){this.action=action;}evaluate(ctx,dt){return this.action(ctx,dt);}}
class ConditionNode {constructor(predicate){this.predicate=predicate;}evaluate(ctx){return this.predicate(ctx)?NodeState.SUCCESS:NodeState.FAILURE;}}
 
const GEAR = Object.freeze({
  'wooden-stick':{id:'wooden-stick',name:'Crude Wooden Stick',slot:'weapon',material:'Wood',tier:1,rangeClass:'medium',atk:3,def:0,hpPct:0,crit:0,speed:0,desc:'A rough stick. Low damage, but better than bare hands.'},
  'wooden-sword':{id:'wooden-sword',name:'Wooden Sword',slot:'weapon',material:'Wood',tier:1,rangeClass:'short',atk:7,def:0,hpPct:0,crit:0,speed:0,desc:'Light wooden blade · +7 ATK'},
  'wooden-shield':{id:'wooden-shield',name:'Light Wooden Shield',slot:'shield',material:'Wood',tier:1,atk:0,def:3,hpPct:0,crit:0,speed:-5,desc:'Simple wooden shield · +3 DEF, slightly slower'},
  'grass-shoes':{id:'grass-shoes',name:'Worn Grass Shoes',slot:'boots',material:'Grass',tier:1,atk:0,def:0,hpPct:0,crit:0,speed:2,desc:'Worn woven shoes · +2 movement'},
  'iron-short-sword':{id:'iron-short-sword',name:'Short Iron Sword',slot:'weapon',material:'Iron',tier:2,rangeClass:'short',atk:13,def:0,hpPct:0,crit:.01,speed:0,desc:'Short iron sword · +13 ATK'},
  'iron-long-blade':{id:'iron-long-blade',name:'Long Blade',slot:'weapon',material:'Iron',tier:2,rangeClass:'medium',atk:15,def:0,hpPct:0,crit:0,speed:-3,desc:'Long, weighty blade · +15 ATK, slightly slower'},
  'iron-spear':{id:'iron-spear',name:'Iron Spear',slot:'weapon',material:'Iron',tier:2,rangeClass:'long',atk:12,def:0,hpPct:0,crit:.02,speed:1,desc:'Reach-focused spear · +12 ATK'},
  'reinforced-iron-shield':{id:'reinforced-iron-shield',name:'Reinforced Iron Shield',slot:'shield',material:'Iron',tier:2,atk:0,def:8,hpPct:0,crit:0,speed:-8,desc:'Heavy shield · +8 DEF, slower movement'},
  'chainmail':{id:'chainmail',name:'Chainmail',slot:'armor',material:'Iron',tier:2,atk:0,def:7,hpPct:.08,crit:0,speed:-5,desc:'Linked iron rings · +7 DEF, +8% HP'},
  'leather-boots':{id:'leather-boots',name:'Leather Boots',slot:'boots',material:'Iron',tier:2,atk:0,def:1,hpPct:0,crit:0,speed:5,desc:'Tough leather boots · +1 DEF, +5 movement'},
  'steel-dual-daggers':{id:'steel-dual-daggers',name:'Dual Steel Daggers',slot:'weapon',material:'Steel',tier:3,rangeClass:'short',atk:20,def:0,hpPct:0,crit:.08,speed:8,desc:'Fast paired blades · +20 ATK, +8% crit, +8 movement'},
  'war-chain':{id:'war-chain',name:'Warrior Chain Weapon',slot:'weapon',material:'Steel',tier:3,rangeClass:'long',atk:23,def:0,hpPct:0,crit:.03,speed:-2,desc:'Weighted chain weapon · +23 ATK'},
  'steel-long-spear':{id:'steel-long-spear',name:'Long Steel Spear',slot:'weapon',material:'Steel',tier:3,rangeClass:'long',atk:22,def:0,hpPct:0,crit:.04,speed:2,desc:'Long steel spear · +22 ATK'},
  'full-plate':{id:'full-plate',name:'Full Plate Armor',slot:'armor',material:'Steel',tier:3,atk:0,def:15,hpPct:.20,crit:0,speed:-12,desc:'Full steel plate · +15 DEF, +20% HP, slower movement'},
  'steel-boots':{id:'steel-boots',name:'Steel Boots',slot:'boots',material:'Steel',tier:3,atk:0,def:3,hpPct:0,crit:0,speed:1,desc:'Reinforced boots · +3 DEF'}
});
const CHESTS = Object.freeze({
  wood:{id:'wood',name:'Wooden Chest',starCost:15,goldCost:1000,chapterRequired:1,items:[['wooden-sword','wooden-stick'],['wooden-shield'],['grass-shoes']]},
  iron:{id:'iron',name:'Iron Chest',starCost:30,goldCost:2500,chapterRequired:2,items:[['iron-short-sword'],['iron-long-blade'],['iron-spear'],['reinforced-iron-shield'],['chainmail','leather-boots']]},
  steel:{id:'steel',name:'Steel Chest',starCost:45,goldCost:5000,chapterRequired:3,items:[['steel-dual-daggers'],['war-chain'],['steel-long-spear'],['full-plate'],['steel-boots']]}
});
const CHEST_SELL_VALUE=Object.freeze({wood:300,iron:750,steel:1500});
 
function makeStarterGear(){return [
  {uid:'starter-stick',templateId:'wooden-stick'},
  {uid:'starter-grass-shoes',templateId:'grass-shoes'}
];}
function stageDefinition(stageIndex){
  const chapter=Math.floor(stageIndex/6)+1,slot=stageIndex%6,scale=1+(chapter-1)*.17;
  const definitions=[
    {name:'Arena Outskirts',kind:'NORMAL',waves:[['minion'],['archer']],description:'Defeat the arena raider and prove your worth.'},
    {name:'Broken Gate',kind:'NORMAL',waves:[['minion'],['tank']],description:'Ranged attackers and armored guards defend the broken gate.'},
    {name:'Dust Road',kind:'ELITE',waves:[['archer'],['mage']],description:'Hold the road against disciplined arena fighters.'},
    {name:'Old Barracks',kind:'NORMAL',waves:[['tank'],['mage']],description:'Push through the abandoned barracks.'},
    {name:'Champion Gate',kind:'ELITE',waves:[['tank'],['archer']],description:'The champion guards the final approach.'},
    {name:'Chapter Warden',kind:'BOSS',waves:[['boss']],description:'Defeat the chapter boss to unlock the next chapter.'}
  ];
  const d=definitions[slot];
  return {index:stageIndex,id:`${chapter}-${slot+1}`,chapter,name:d.name,kind:d.kind,scale:scale*(d.kind==='BOSS'?1.16:d.kind==='ELITE'?1.08:1),waves:d.waves.map(w=>[...w]),description:d.description};
}
 
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
const cloneJSON=value=>JSON.parse(JSON.stringify(value));
 
 
class GameCoreManager {
  constructor(){
    this.state={gold:0,diamond:0,level:1,xp:0,kills:0,stageIndex:0,waveIndex:0,enemiesRemaining:0,runStatus:'ready',potions:0,skillLevels:{power:0,vitality:0,whirlwind:0,crit:0},ownedGear:makeStarterGear(),equipped:{weapon:'starter-stick',armor:null,shield:null,boots:'starter-grass-shoes'},bestStageIndex:0,stageStars:{},totalStars:0,starBalance:0,highestChapterUnlocked:1,openedChests:[],chestCounts:{wood:0,iron:0,steel:0},stageDamageTaken:0,stageStartHp:100,stageStartGold:0,stageStartXp:0,stageStartLevel:1,stageStartKills:0,comboHits:0,enemyComboHits:0};
    this.player={currentHp:100,energy:100};
    this.recalculateStats();
  }
  currentStage(){return stageDefinition(this.state.stageIndex);}
  gearFor(slot){
    const uid=this.state.equipped[slot];
    const item=this.state.ownedGear.find(g=>g.uid===uid);
    return item?GEAR[item.templateId]:null;
  }
  recalculateStats(){
    const weapon=this.gearFor('weapon'),armor=this.gearFor('armor'),shield=this.gearFor('shield'),boots=this.gearFor('boots'),skills=this.state.skillLevels;
    const hp=new CharacterStat(100+(this.state.level-1)*8+skills.vitality*12);
    const atk=new CharacterStat(8+(this.state.level-1)+skills.power*2);
    const def=new CharacterStat(0);
    for(const [item,source] of [[weapon,'weapon'],[armor,'armor'],[shield,'shield'],[boots,'boots']]){
      if(!item)continue;
      if(item.atk)atk.addModifier(new StatModifier(item.atk,StatModType.Flat,source));
      if(item.def)def.addModifier(new StatModifier(item.def,StatModType.Flat,source));
      if(item.hpPct)hp.addModifier(new StatModifier(item.hpPct,StatModType.PercentMult,source));
    }
    this.stats={maxHp:hp.value,atk:atk.value,def:def.value,crit:clamp(.03+skills.crit*.01+(weapon?.crit||0)+(armor?.crit||0),0,.55),critMult:1.65,moveSpeed:clamp(250+(boots?.speed||0)+(armor?.speed||0)+(shield?.speed||0)+(weapon?.speed||0),170,285)};
    this.player.currentHp=clamp(this.player.currentHp,0,this.stats.maxHp);this.player.energy=clamp(this.player.energy,0,100);
    this.emitStateChange();
  }
  getSnapshot(){
    const stage=this.currentStage(),weapon=this.gearFor('weapon'),armor=this.gearFor('armor'),shield=this.gearFor('shield'),boots=this.gearFor('boots');
    return {gold:this.state.gold,diamond:this.state.diamond,level:this.state.level,xp:this.state.xp,xpToNext:100+(this.state.level-1)*35,kills:this.state.kills,stageIndex:this.state.stageIndex,stageId:stage.id,stageName:stage.name,stageKind:stage.kind,chapter:stage.chapter,stageDescription:stage.description,waveIndex:this.state.waveIndex,waveCount:stage.waves.length,enemiesRemaining:this.state.enemiesRemaining,runStatus:this.state.runStatus,potions:this.state.potions,currentHp:this.player.currentHp,maxHp:this.stats.maxHp,energy:this.player.energy,atk:this.stats.atk,def:this.stats.def,crit:this.stats.crit,critMult:this.stats.critMult,moveSpeed:this.stats.moveSpeed,weapon:weapon?{...weapon,uid:this.state.equipped.weapon}:null,armor:armor?{...armor,uid:this.state.equipped.armor}:null,shield:shield?{...shield,uid:this.state.equipped.shield}:null,boots:boots?{...boots,uid:this.state.equipped.boots}:null,ownedGear:this.state.ownedGear.map(g=>({...g,...GEAR[g.templateId]})),equipped:{...this.state.equipped},skills:{...this.state.skillLevels},bestStageIndex:this.state.bestStageIndex,stageStars:{...this.state.stageStars},totalStars:this.state.totalStars,starBalance:this.state.starBalance,highestChapterUnlocked:this.state.highestChapterUnlocked,openedChests:[...this.state.openedChests],chestCounts:{...this.state.chestCounts},chests:Object.values(CHESTS).map(c=>({...c,chapterUnlocked:this.state.highestChapterUnlocked>=c.chapterRequired,canPayStars:this.state.starBalance>=c.starCost,canPayGold:this.state.gold>=c.goldCost,openedCount:this.state.chestCounts[c.id]||0,items:c.items})),stageDamageTaken:this.state.stageDamageTaken};
  }
  emitStateChange(){bus.emit('core:state-changed',this.getSnapshot());}
  beginCurrentWave(){
    const stage=this.currentStage();this.state.waveIndex=clamp(this.state.waveIndex,0,stage.waves.length-1);const types=stage.waves[this.state.waveIndex];
    if(this.state.waveIndex===0){this.state.stageDamageTaken=0;this.state.stageStartHp=this.stats.maxHp;this.state.stageStartGold=this.state.gold;this.state.stageStartXp=this.state.xp;this.state.stageStartLevel=this.state.level;this.state.stageStartKills=this.state.kills;}
    this.state.runStatus='combat';this.state.enemiesRemaining=types.length;
    bus.emit('stage:changed',{stage,waveIndex:this.state.waveIndex,waveCount:stage.waves.length});
    this.emitStateChange();bus.emit('combat:spawn-wave',{stage,waveIndex:this.state.waveIndex,waveTypes:[...types]});
  }
  goldMultiplier(){return this.currentStage().chapter<this.state.highestChapterUnlocked ? 0.5 : 1;}
  continueRun(){
    if(this.state.runStatus!=='wave-cleared'&&this.state.runStatus!=='stage-cleared'){bus.emit('ui:toast',{message:'Defeat the current wave before continuing.'});return;}
    const stage=this.currentStage();
    if(this.state.runStatus==='wave-cleared'&&this.state.waveIndex+1<stage.waves.length){this.state.waveIndex++;this.beginCurrentWave();bus.emit('audio:mode','arena');return;}
    if(stage.chapter===3&&stage.kind==='BOSS'){
      this.state.runStatus='campaign-cleared';
      bus.emit('ui:modal',{title:'CAMPAIGN COMPLETE',subtitle:'Chapter 3 · Stage 3-6',message:'You defeated the final chapter boss. Replay stages to improve ratings, earn gold, buy more chests and test different builds.',action:'close',actionLabel:'Return to arena'});
      this.emitStateChange();return;
    }
    this.state.stageIndex++;this.state.waveIndex=0;this.state.bestStageIndex=Math.max(this.state.bestStageIndex,this.state.stageIndex);this.player.currentHp=Math.min(this.stats.maxHp,this.player.currentHp+Math.round(this.stats.maxHp*.28));
    this.beginCurrentWave();bus.emit('audio:mode','arena');bus.emit('combat:log',{message:`Advanced to Stage ${this.currentStage().id}.`});
  }
  onEnemyKilled(kind){
    if(this.state.runStatus!=='combat')return;
    const boss=kind==='boss',reward=boss?320:(kind==='tank'?115:kind==='mage'?105:kind==='archer'?95:80);
    const actualReward=Math.floor(reward*this.goldMultiplier());this.state.gold+=actualReward;this.state.kills++;this.addXP(boss?100:24);this.player.energy=clamp(this.player.energy+(boss?18:8),0,100);
    if(boss){
      this.state.potions=Math.min(POTION_RULES.maxPotions,this.state.potions+1);
      bus.emit('combat:log',{message:'Boss defeat reward: +1 Healing Potion!'});
    }
    this.state.enemiesRemaining=Math.max(0,this.state.enemiesRemaining-1);bus.emit('audio:sfx',boss?'victory':'coin');bus.emit('combat:log',{message:`${kind.toUpperCase()} defeated · +${actualReward} gold${actualReward<reward?' (anti-farm -50%)':''}.`});
    this.emitStateChange();
    if(this.state.enemiesRemaining===0){
      const stage=this.currentStage(),lastWave=this.state.waveIndex===stage.waves.length-1;
      this.state.runStatus=lastWave?'stage-cleared':'wave-cleared';
      if(lastWave){
        const lossRatio=this.state.stageDamageTaken/Math.max(1,this.state.stageStartHp);
        const stars=getStageStars(this.state.stageDamageTaken,this.state.stageStartHp);
        const previous=this.state.stageStars[stage.id]||0;
        if(stars>previous){const delta=stars-previous;this.state.totalStars+=delta;this.state.starBalance+=delta;this.state.stageStars[stage.id]=stars;}
        const wasFarmStage=stage.chapter<this.state.highestChapterUnlocked;
        if(stage.kind==='BOSS'){this.state.diamond+=12;if(stage.chapter<3)this.state.highestChapterUnlocked=Math.max(this.state.highestChapterUnlocked,stage.chapter+1);}
        const stageReward=getStageGoldReward(stage.chapter,stars,wasFarmStage);this.state.gold+=stageReward;
        const farmNote=wasFarmStage?' Older chapter reward reduced by 50%.':'';
        bus.emit('ui:modal',{title:stage.kind==='BOSS'?'BOSS DEFEATED':'STAGE CLEARED',subtitle:`Stage ${stage.id} · ${'★'.repeat(stars)}${'☆'.repeat(3-stars)} · ${Math.round(lossRatio*100)}% HP damage taken`,message:`Stage rating: ${stars} star${stars===1?'':'s'}. Total stars earned: ${this.state.totalStars}; available stars: ${this.state.starBalance}. Stage reward: ${stageReward} gold.${stage.kind==='BOSS'?` Boss reward: +12 gems, +1 potion.`:''}${farmNote}${stage.kind==='BOSS'&&stage.chapter<3?` Chapter ${stage.chapter+1} unlocked!`:''}`,action:'continue',actionLabel:stage.chapter===3&&stage.kind==='BOSS'?'Finish campaign':'Next stage'});
      }
      else bus.emit('ui:modal',{title:'WAVE CLEARED',subtitle:`Stage ${stage.id} · Wave ${this.state.waveIndex+1}/${stage.waves.length}`,message:'The arena is quiet for a moment. Prepare for the next enemy formation.',action:'continue',actionLabel:'Next wave'});
      bus.emit('combat:wave-cleared',{stageId:stage.id,waveIndex:this.state.waveIndex,lastWave});this.emitStateChange();
    }
  }
  addXP(amount){this.state.xp+=amount;let needed=100+(this.state.level-1)*35;while(this.state.xp>=needed){this.state.xp-=needed;this.state.level++;this.player.currentHp+=25;this.player.energy=100;bus.emit('ui:toast',{message:`Level up! You reached level ${this.state.level}.`});bus.emit('audio:sfx','parry');needed=100+(this.state.level-1)*35;}this.recalculateStats();}
  takeDamage(raw,sourceX,{blocked=false}={}){let damage=Math.max(2,Math.round(raw-this.stats.def*.42));if(blocked)damage=Math.max(1,Math.round(damage*.45));this.player.currentHp=Math.max(0,this.player.currentHp-damage);this.state.stageDamageTaken+=damage;bus.emit('player:damaged',{damage,currentHp:this.player.currentHp,blocked});bus.emit('haptics:damage',{heavy:damage>=22});this.emitStateChange();if(this.player.currentHp<=0){this.state.runStatus='defeat';bus.emit('ui:modal',{title:'GLADIATOR DOWN',subtitle:'The arena has claimed another fighter.',message:'Retry the current stage with full health. Gold, gear and upgrades are kept.',action:'retry',actionLabel:'Retry stage'});}return damage;}
  restoreAfterGuard(){this.player.energy=clamp(this.player.energy+5,0,100);this.emitStateChange();}
  gainEnergy(amount){this.player.energy=clamp(this.player.energy+amount,0,100);this.emitStateChange();}
  spendEnergy(amount){if(this.player.energy<amount)return false;this.player.energy-=amount;this.emitStateChange();return true;}
  usePotion(){if(this.state.potions<=0){bus.emit('ui:toast',{message:'No healing potions left. Buy potions in Inventory.'});return false;}if(this.player.currentHp>=this.stats.maxHp){bus.emit('ui:toast',{message:'Your HP is already full.'});return false;}this.state.potions--;const healed=Math.min(POTION_RULES.healAmount,this.stats.maxHp-this.player.currentHp);this.player.currentHp+=healed;bus.emit('audio:sfx','magic');bus.emit('combat:log',{message:`Healing potion used · +${healed} HP.`});this.emitStateChange();return true;}
  buyPotion(count=1){const cost=POTION_RULES.goldCost*count;if(this.state.gold<cost){bus.emit('ui:toast',{message:`Need ${cost} gold for ${count} potion${count>1?'s':''}.`});return false;}if(this.state.potions>=POTION_RULES.maxPotions){bus.emit('ui:toast',{message:'Potion belt is full.'});return false;}this.state.gold-=cost;this.state.potions=Math.min(POTION_RULES.maxPotions,this.state.potions+count);this.emitStateChange();bus.emit('audio:sfx','coin');bus.emit('ui:toast',{message:`Bought ${count} healing potion · ${this.state.potions} total.`});return true;}
  buyDiamondPack(type){
    if(type==='potions'){
      const cost=DIAMOND_RULES.potionsPackCost;
      if(this.state.diamond<cost){bus.emit('ui:toast',{message:`Need ${cost} gems for Alchemist Pouch.`});return false;}
      this.state.diamond-=cost;
      this.state.potions=Math.min(POTION_RULES.maxPotions,this.state.potions+DIAMOND_RULES.potionsPackCount);
      this.emitStateChange();bus.emit('audio:sfx','magic');bus.emit('ui:toast',{message:`Alchemist Pouch: +${DIAMOND_RULES.potionsPackCount} Potions!`});return true;
    }
    if(type==='respec'){
      const cost=DIAMOND_RULES.respecCost;
      if(this.state.diamond<cost){bus.emit('ui:toast',{message:`Need ${cost} gems for Skill Respec.`});return false;}
      const costs={power:280,vitality:280,whirlwind:400,crit:460};let refund=0;
      for(const [k,lvl] of Object.entries(this.state.skillLevels)){for(let i=1;i<=lvl;i++)refund+=costs[k]*i;}
      if(refund===0){bus.emit('ui:toast',{message:'No skill points have been invested.'});return false;}
      this.state.diamond-=cost;this.state.gold+=refund;this.state.skillLevels={power:0,vitality:0,whirlwind:0,crit:0};
      this.recalculateStats();bus.emit('audio:sfx','victory');
      bus.emit('ui:modal',{title:'SKILL RESPEC COMPLETE',subtitle:`Refunded ${refund.toLocaleString()} gold`,message:'All micro-stats have been reset to Rank 0. Your invested gold was fully returned so you can adapt your build.',action:'close',actionLabel:'Continue'});
      return true;
    }
    return false;
  }
  restartStage(){this.state.waveIndex=0;this.state.runStatus='ready';this.state.gold=this.state.stageStartGold;this.state.xp=this.state.stageStartXp;this.state.level=this.state.stageStartLevel;this.state.kills=this.state.stageStartKills;this.recalculateStats();this.player.currentHp=this.stats.maxHp;this.player.energy=100;bus.emit('combat:reset-props');this.beginCurrentWave();bus.emit('ui:toast',{message:`Stage ${this.currentStage().id} restarted. Resources from this attempt were rolled back.`});}
  upgrade(skill){const cost={power:280,vitality:280,whirlwind:400,crit:460},max={power:5,vitality:5,whirlwind:5,crit:5};if(!cost[skill]||this.state.skillLevels[skill]>=max[skill]){bus.emit('ui:toast',{message:'That micro-stat has reached its cap.'});return false;}const price=cost[skill]*(this.state.skillLevels[skill]+1);if(this.state.gold<price){bus.emit('ui:toast',{message:`Need ${price} gold for this micro-stat.`});return false;}this.state.gold-=price;this.state.skillLevels[skill]++;this.recalculateStats();bus.emit('audio:sfx','coin');bus.emit('ui:toast',{message:`Micro-stat improved: ${skill}.`});return true;}
  summon(){bus.emit('ui:toast',{message:'Random summons are removed. Earn stars and open milestone chests instead.'});return null;}
  equip(uid){
    const item=this.state.ownedGear.find(g=>g.uid===uid);if(!item||!GEAR[item.templateId])return false;
    const template=GEAR[item.templateId];this.state.equipped[template.slot]=uid;this.recalculateStats();
    bus.emit('audio:sfx','coin');bus.emit('ui:toast',{message:`Equipped ${template.name}.`});return true;
  }
  openChest(chestId,method='gold'){
    const chest=CHESTS[chestId];
    if(!chest){bus.emit('ui:toast',{message:'Unknown chest.'});return null;}
    if(this.state.highestChapterUnlocked<chest.chapterRequired){bus.emit('ui:toast',{message:`${chest.name} is locked until Chapter ${chest.chapterRequired}.`});return null;}
    if(method==='stars'){
      if(this.state.starBalance<chest.starCost){bus.emit('ui:toast',{message:`Need ${chest.starCost} available stars.`});return null;}
      this.state.starBalance-=chest.starCost;
    }else if(method==='gold'){
      if(this.state.gold<chest.goldCost){bus.emit('ui:toast',{message:`Need ${chest.goldCost} gold.`});return null;}
      this.state.gold-=chest.goldCost;
    }else return null;
    const templateId=chooseChestReward(chest.items);
    const template=GEAR[templateId];
    const item={uid:`gear-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`,templateId,sourceChest:chestId};
    this.state.ownedGear.push(item);this.state.openedChests.push(chestId);this.state.chestCounts[chestId]=(this.state.chestCounts[chestId]||0)+1;
    this.emitStateChange();bus.emit('audio:sfx','victory');
    bus.emit('ui:modal',{title:`${chest.name} OPENED`,subtitle:`Paid with ${method==='stars'?'stars':'gold'}`,message:`You received ${template.name}. ${template.desc} Sell value: ${CHEST_SELL_VALUE[chestId]} gold (30% of chest price).`,action:'close',actionLabel:'Claim reward'});
    return item;
  }
  sellGear(uid){
    const item=this.state.ownedGear.find(g=>g.uid===uid);
    if(!item){bus.emit('ui:toast',{message:'Item not found.'});return false;}
    if(Object.values(this.state.equipped).includes(uid)){bus.emit('ui:toast',{message:'Unequip this item before selling it.'});return false;}
    if(!item.sourceChest||!CHEST_SELL_VALUE[item.sourceChest]){bus.emit('ui:toast',{message:'Starter gear cannot be sold.'});return false;}
    const value=CHEST_SELL_VALUE[item.sourceChest];this.state.gold+=value;this.state.ownedGear=this.state.ownedGear.filter(g=>g.uid!==uid);this.emitStateChange();
    bus.emit('ui:toast',{message:`Sold ${GEAR[item.templateId].name} for ${value} gold.`});bus.emit('audio:sfx','coin');return true;
  }
 
  serialize(){return {schema:4,savedAt:new Date().toISOString(),account:{gold:this.state.gold,diamond:this.state.diamond,level:this.state.level,xp:this.state.xp,kills:this.state.kills,stageIndex:this.state.stageIndex,waveIndex:this.state.waveIndex,potions:this.state.potions,skillLevels:{...this.state.skillLevels},ownedGear:cloneJSON(this.state.ownedGear),equipped:{...this.state.equipped},bestStageIndex:this.state.bestStageIndex,stageStars:{...this.state.stageStars},totalStars:this.state.totalStars,starBalance:this.state.starBalance,highestChapterUnlocked:this.state.highestChapterUnlocked,openedChests:[...this.state.openedChests],chestCounts:{...this.state.chestCounts}},player:{currentHp:this.player.currentHp,energy:this.player.energy}};}
  restoreSave(payload){
    if(!payload||![2,3,4].includes(payload.schema)||!payload.account||!payload.player)throw new Error('Unsupported or malformed save schema.');
    const a=payload.account;if(!Array.isArray(a.ownedGear)||a.ownedGear.length>200)throw new Error('Invalid equipment collection.');
    const allowedGear=a.ownedGear.filter(g=>g&&typeof g.uid==='string'&&g.uid.length<100&&GEAR[g.templateId]).map(g=>({uid:g.uid,templateId:g.templateId,...(Object.hasOwn(CHESTS,g.sourceChest)?{sourceChest:g.sourceChest}:{})}));
    if(!allowedGear.some(g=>g.uid==='starter-stick'))allowedGear.push({uid:'starter-stick',templateId:'wooden-stick'});
    if(!allowedGear.some(g=>g.uid==='starter-grass-shoes'))allowedGear.push({uid:'starter-grass-shoes',templateId:'grass-shoes'});
    this.state.gold=clamp(Number.isFinite(a.gold)?Math.floor(a.gold):0,0,999999999);this.state.diamond=clamp(Number.isFinite(a.diamond)?Math.floor(a.diamond):0,0,9999999);this.state.level=clamp(Number.isFinite(a.level)?Math.floor(a.level):1,1,999);this.state.xp=clamp(Number.isFinite(a.xp)?Math.floor(a.xp):0,0,100000000);this.state.kills=clamp(Number.isFinite(a.kills)?Math.floor(a.kills):0,0,100000000);const rawStageIndex=Math.max(0,Number.isFinite(a.stageIndex)?Math.floor(a.stageIndex):0);
    this.state.stageIndex=clamp(payload.schema<4?Math.floor(rawStageIndex/3)*6+[0,2,5][rawStageIndex%3]:rawStageIndex,0,17);this.state.waveIndex=clamp(Number.isFinite(a.waveIndex)?Math.floor(a.waveIndex):0,0,2);this.state.potions=clamp(Number.isFinite(a.potions)?Math.floor(a.potions):0,0,99);this.state.bestStageIndex=clamp(Number.isFinite(a.bestStageIndex)?Math.floor(a.bestStageIndex):0,0,9999);this.state.skillLevels={power:0,vitality:0,whirlwind:0,crit:0};for(const k of Object.keys(this.state.skillLevels))this.state.skillLevels[k]=clamp(Number.isFinite(a.skillLevels?.[k])?Math.floor(a.skillLevels[k]):0,0,5);
    this.state.ownedGear=allowedGear;
    this.state.stageStars={};for(const [id,stars] of Object.entries(a.stageStars||{})){if(typeof id==='string'&&Number.isFinite(stars))this.state.stageStars[id]=clamp(Math.floor(stars),0,3);}
    this.state.totalStars=Object.values(this.state.stageStars).reduce((sum,n)=>sum+n,0);
    this.state.starBalance=clamp(Number.isFinite(a.starBalance)?Math.floor(a.starBalance):this.state.totalStars,0,9999);
    this.state.highestChapterUnlocked=clamp(Number.isFinite(a.highestChapterUnlocked)?Math.floor(a.highestChapterUnlocked):Math.min(3,Math.floor(this.state.stageIndex/6)+1),1,3);
    this.state.openedChests=Array.isArray(a.openedChests)?a.openedChests.filter(id=>Object.hasOwn(CHESTS,id)):[];
    this.state.chestCounts={wood:0,iron:0,steel:0};for(const id of Object.keys(this.state.chestCounts))this.state.chestCounts[id]=clamp(Number.isFinite(a.chestCounts?.[id])?Math.floor(a.chestCounts[id]):(this.state.openedChests.includes(id)?1:0),0,9999);
    const equipped=a.equipped||{};
    this.state.equipped={weapon:null,armor:null,shield:null,boots:null};
    for(const slot of Object.keys(this.state.equipped)){
      const found=allowedGear.find(g=>g.uid===equipped[slot]&&GEAR[g.templateId].slot===slot);
      this.state.equipped[slot]=found?found.uid:null;
    }
    if(!this.state.equipped.weapon)this.state.equipped.weapon='starter-stick';
    if(!this.state.equipped.boots)this.state.equipped.boots='starter-grass-shoes';
    const stageChapter=Math.floor(this.state.stageIndex/6)+1;if(this.state.highestChapterUnlocked<stageChapter)this.state.highestChapterUnlocked=Math.min(3,stageChapter);if(this.state.starBalance>this.state.totalStars)this.state.starBalance=this.state.totalStars;
    this.state.runStatus='ready';this.recalculateStats();this.player.currentHp=clamp(Number.isFinite(payload.player.currentHp)?Math.floor(payload.player.currentHp):this.stats.maxHp,1,this.stats.maxHp);this.player.energy=clamp(Number.isFinite(payload.player.energy)?Math.floor(payload.player.energy):100,0,100);this.state.stageStartGold=this.state.gold;this.state.stageStartXp=this.state.xp;this.state.stageStartLevel=this.state.level;this.state.stageStartKills=this.state.kills;this.beginCurrentWave();bus.emit('combat:log',{message:'Save loaded and validated.'});this.emitStateChange();
  }
}
 
// ============================================================================
// 3. ENCRYPTED SAVE: AES-256-GCM + HMAC-SHA256. Local anti-tamper is not server security.
// ============================================================================
class SecureSaveSystem {
  static SAVE_KEY='tiny_gladiators_save_v2';static MASTER_KEY='tiny_gladiators_install_key_v2';static FILE_NAME='tiny-gladiators-save.json';
  static requireCrypto(){if(!globalThis.crypto?.subtle||!globalThis.crypto?.getRandomValues)throw new Error('Web Crypto is unavailable. Open this page on HTTPS or localhost.');}
  static bytesToB64(bytes){let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+0x8000,bytes.length)));return btoa(binary);}
  static b64ToBytes(s){const binary=atob(s);const out=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)out[i]=binary.charCodeAt(i);return out;}
  static concat(...arrays){const size=arrays.reduce((n,a)=>n+a.length,0),out=new Uint8Array(size);let offset=0;for(const a of arrays){out.set(a,offset);offset+=a.length;}return out;}
  static async masterBytes(){this.requireCrypto();let stored=localStorage.getItem(this.MASTER_KEY);if(stored){try{const b=this.b64ToBytes(stored);if(b.length===32)return b;}catch{}}
    const key=crypto.getRandomValues(new Uint8Array(32));localStorage.setItem(this.MASTER_KEY,this.bytesToB64(key));return key;}
  static async deriveKeys(master,salt){const material=await crypto.subtle.importKey('raw',master,'HKDF',false,['deriveKey']);const aes=await crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt,info:new TextEncoder().encode('tiny-gladiators/aes-gcm/v2')},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);const mac=await crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt,info:new TextEncoder().encode('tiny-gladiators/hmac/v2')},material,{name:'HMAC',hash:'SHA-256',length:256},false,['sign','verify']);return {aes,mac};}
  static async saveData(data){this.requireCrypto();const master=await this.masterBytes(),salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),keys=await this.deriveKeys(master,salt);const plain=new TextEncoder().encode(JSON.stringify(data));const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode('tiny-gladiators-save-v2')},keys.aes,plain));const authenticated=this.concat(salt,iv,encrypted);const mac=new Uint8Array(await crypto.subtle.sign('HMAC',keys.mac,authenticated));const envelope=JSON.stringify({v:2,salt:this.bytesToB64(salt),iv:this.bytesToB64(iv),ciphertext:this.bytesToB64(encrypted),mac:this.bytesToB64(mac)});localStorage.setItem(this.SAVE_KEY,envelope);await this.writeNative(envelope);return {savedAt:data.savedAt,native:!!(window.Capacitor?.isNativePlatform?.())};}
  static async writeNative(contents){const fs=window.CapacitorPlugins?.Filesystem||window.Capacitor?.Plugins?.Filesystem||window.Filesystem;try{if(window.Capacitor?.isNativePlatform?.()&&fs?.writeFile){await fs.writeFile({path:this.FILE_NAME,data:contents,directory:'DATA',encoding:'utf8'});}}catch(err){console.warn('Capacitor Filesystem write failed; browser storage remains available.',err);}}
  static async readStored(){const fs=window.CapacitorPlugins?.Filesystem||window.Capacitor?.Plugins?.Filesystem||window.Filesystem;try{if(window.Capacitor?.isNativePlatform?.()&&fs?.readFile){const result=await fs.readFile({path:this.FILE_NAME,directory:'DATA',encoding:'utf8'});if(result?.data)return result.data;}}catch(err){console.info('Native save missing/unreadable; checking localStorage.',err);}const raw=localStorage.getItem(this.SAVE_KEY);if(!raw)throw new Error('No saved game was found on this device.');return raw;}
  static async loadData(){this.requireCrypto();const raw=await this.readStored(),e=JSON.parse(raw);if(e.v!==2||typeof e.salt!=='string'||typeof e.iv!=='string'||typeof e.ciphertext!=='string'||typeof e.mac!=='string')throw new Error('Save envelope is invalid.');const salt=this.b64ToBytes(e.salt),iv=this.b64ToBytes(e.iv),ciphertext=this.b64ToBytes(e.ciphertext),mac=this.b64ToBytes(e.mac);if(salt.length!==16||iv.length!==12||mac.length!==32||ciphertext.length>2_000_000)throw new Error('Save payload size or metadata is invalid.');const keys=await this.deriveKeys(await this.masterBytes(),salt),authenticated=this.concat(salt,iv,ciphertext);const ok=await crypto.subtle.verify('HMAC',keys.mac,mac,authenticated);if(!ok)throw new Error('HMAC integrity check failed. The save may have been modified.');const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode('tiny-gladiators-save-v2')},keys.aes,ciphertext);return JSON.parse(new TextDecoder().decode(plain));}
}
 
// ============================================================================
// 4. PROCEDURAL AUDIO: event-driven SFX and lightweight synthesized arena music.
// ============================================================================
class AudioEngine {
  constructor(){this.ctx=null;this.master=null;this.muted=false;this.musicMode='arena';this.musicTimer=null;this.musicTick=0;this.unlocked=false;bus.on('audio:sfx',name=>this.playSound(name));bus.on('audio:mode',mode=>{this.musicMode=mode;if(this.unlocked&&!this.muted)this.startMusic(mode);});bus.on('audio:unlock',()=>this.unlock());}
  init(){if(this.ctx)return;const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return;this.ctx=new Ctx();this.master=this.ctx.createGain();this.master.gain.value=.48;this.master.connect(this.ctx.destination);}
  async unlock(){this.init();if(!this.ctx)return;try{if(this.ctx.state==='suspended')await this.ctx.resume();this.unlocked=true;if(!this.muted)this.startMusic(this.musicMode);}catch(err){console.warn('Audio unlock postponed.',err);}}
  tone(freq,duration=.12,wave='sine',volume=.14,endFreq=null,delay=0){if(this.muted)return;this.init();if(!this.ctx||!this.master)return;const now=this.ctx.currentTime+delay,osc=this.ctx.createOscillator(),gain=this.ctx.createGain();osc.type=wave;osc.frequency.setValueAtTime(Math.max(20,freq),now);if(endFreq)osc.frequency.exponentialRampToValueAtTime(Math.max(20,endFreq),now+duration);gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(Math.max(.0002,volume),now+.008);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);osc.connect(gain);gain.connect(this.master);osc.start(now);osc.stop(now+duration+.015);}
  playSound(name){if(this.muted)return;switch(name){case'slash':this.tone(310,.13,'sawtooth',.12,70);break;case'hit':this.tone(125,.14,'square',.14,42);this.tone(74,.09,'triangle',.08,38,.025);break;case'crit':this.tone(520,.15,'sawtooth',.15,95);this.tone(850,.12,'sine',.08,350,.035);break;case'parry':this.tone(740,.22,'sine',.13,1450);this.tone(1180,.17,'triangle',.08,1750,.04);break;case'coin':this.tone(880,.11,'sine',.1,990);this.tone(1320,.17,'sine',.08,1540,.07);break;case'magic':this.tone(420,.22,'triangle',.11,1050);this.tone(680,.25,'sine',.07,1440,.06);break;case'victory':[523,659,784,1047].forEach((n,i)=>this.tone(n,.24,'triangle',.09,n*1.02,i*.09));break;case'death':this.tone(160,.4,'sawtooth',.13,42);break;}}
  startMusic(mode='arena'){this.musicMode=mode;if(this.musicTimer){clearInterval(this.musicTimer);this.musicTimer=null;}if(this.muted||!this.ctx)return;this.musicTick=0;this.musicTimer=setInterval(()=>this.musicStep(),230);}
  musicStep(){if(this.muted||!this.ctx||this.ctx.state!=='running')return;const arena=[110,0,146.83,0,164.81,0,146.83,0,98,0,130.81,0,146.83,0,130.81,0],shop=[146.83,0,174.61,0,196,0,174.61,0,130.81,0,164.81,0,196,0,164.81,0];const notes=this.musicMode==='shop'?shop:arena;const n=notes[this.musicTick%notes.length];if(n)this.tone(n,.25,'triangle',this.musicMode==='shop'?.025:.035,n*.98);if(this.musicTick%4===0){const bass=this.musicMode==='shop'?73.42:(this.musicTick%8===0?55:65.41);this.tone(bass,.19,'sine',.055,bass*.65);}if(this.musicMode==='arena'&&this.musicTick%4===2)this.tone(68,.07,'square',.022,38);this.musicTick++;}
  toggle(){this.muted=!this.muted;if(this.muted){if(this.musicTimer)clearInterval(this.musicTimer);this.musicTimer=null;}else{this.unlock();this.startMusic(this.musicMode);}return this.muted;}
  suspend(){if(this.ctx&&this.ctx.state==='running')this.ctx.suspend();}
  resume(){if(this.ctx&&this.unlocked&&this.ctx.state==='suspended')this.ctx.resume();}
  destroy(){if(this.musicTimer)clearInterval(this.musicTimer);this.ctx?.close();}
}
 
// ============================================================================
// 5. PRESENTATION: one generated texture atlas, Phaser Arcade Physics, pooled FX.
// ============================================================================
function roundedRect(ctx,x,y,w,h,r){const rr=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+rr,y);ctx.arcTo(x+w,y,x+w,y+h,rr);ctx.arcTo(x+w,y+h,x,y+h,rr);ctx.arcTo(x,y+h,x,y,rr);ctx.arcTo(x,y,x+w,y,rr);ctx.closePath();}
function drawCharacter(ctx,kind,state,x,y,w,h){
  const palettes={hero:['#7773ff','#bfc5ff','#f1cfaa','#303a75','#d8e1ff'],minion:['#d34c67','#ff9a8b','#d9ae8c','#62213e','#ffd8b6'],archer:['#a96a36','#e8b46b','#d9b18c','#563d33','#ffdf9e'],mage:['#6a5ccc','#b7a8ff','#c6a5a0','#2b285d','#69e6ed'],tank:['#8496a9','#cad4e1','#d6b99c','#344253','#e9f0fa'],boss:['#a82c4b','#ff8b9a','#dfb39e','#45152d','#ffc3c8']};const [main,light,skin,dark,metal]=palettes[kind];ctx.save();ctx.translate(x,y);const running=state.startsWith('run'),attacking=state==='attack',hit=state==='hit',step=state==='run1'?7:state==='run0'?-7:0;ctx.globalAlpha=.28;ctx.fillStyle='#02040a';ctx.beginPath();ctx.ellipse(w*.5,h*.93,w*.31,5,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
  ctx.fillStyle=dark;roundedRect(ctx,w*.28,h*.62,w*.17,h*.25,5);ctx.fill();roundedRect(ctx,w*.53,h*.62,w*.17,h*.25,5);ctx.fill();ctx.fillStyle=main;roundedRect(ctx,w*.25,h*.58+step*.22,w*.2,h*.24,4);ctx.fill();roundedRect(ctx,w*.52,h*.58-step*.22,w*.2,h*.24,4);ctx.fill();ctx.fillStyle=light;ctx.fillRect(w*.29,h*.59+step*.22,w*.12,3);ctx.fillRect(w*.56,h*.59-step*.22,w*.12,3);
  ctx.fillStyle=main;roundedRect(ctx,w*.23,h*.34,w*.54,h*.34,8);ctx.fill();ctx.fillStyle=light;roundedRect(ctx,w*.3,h*.39,w*.4,h*.08,3);ctx.fill();ctx.fillStyle=dark;ctx.fillRect(w*.29,h*.52,w*.42,3);
  ctx.strokeStyle=skin;ctx.lineWidth=7;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(w*.27,h*.4);ctx.lineTo(w*.15,h*.56+(attacking?-12:0));ctx.moveTo(w*.73,h*.4);ctx.lineTo(w*.84,h*.53+(attacking?-20:0));ctx.stroke();
  ctx.fillStyle=skin;ctx.beginPath();ctx.arc(w*.5,h*.23,w*.17,0,Math.PI*2);ctx.fill();ctx.fillStyle=main;ctx.beginPath();ctx.moveTo(w*.31,h*.22);ctx.lineTo(w*.34,h*.08);ctx.lineTo(w*.47,h*.035);ctx.lineTo(w*.65,h*.08);ctx.lineTo(w*.69,h*.22);ctx.closePath();ctx.fill();ctx.fillStyle=light;ctx.fillRect(w*.34,h*.15,w*.31,5);ctx.fillStyle='#101626';ctx.fillRect(w*.39,h*.21,5,3);ctx.fillRect(w*.57,h*.21,5,3);
  if(kind==='tank'||kind==='boss'){ctx.fillStyle=metal;roundedRect(ctx,w*.04,h*.37,w*.23,h*.3,5);ctx.fill();ctx.strokeStyle=dark;ctx.lineWidth=2;ctx.strokeRect(w*.08,h*.41,w*.15,h*.21);}
  if(kind==='archer'){ctx.strokeStyle=metal;ctx.lineWidth=2;ctx.beginPath();ctx.arc(w*.86,h*.44,13,-Math.PI*.65,Math.PI*.65);ctx.stroke();ctx.beginPath();ctx.moveTo(w*.86,h*.31);ctx.lineTo(w*.86,h*.57);ctx.stroke();}
  else if(kind==='mage'){ctx.strokeStyle=metal;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(w*.84,h*.29);ctx.lineTo(w*.91,h*.72);ctx.stroke();ctx.fillStyle='#74f0ff';ctx.beginPath();ctx.arc(w*.81,h*.25,6,0,Math.PI*2);ctx.fill();}
  else{ctx.save();ctx.translate(attacking?w*.81:w*.86,h*.52);ctx.rotate(attacking?-.8:-.25);ctx.fillStyle=metal;roundedRect(ctx,-3,-29,6,34,2);ctx.fill();ctx.fillStyle='#f2f6ff';ctx.beginPath();ctx.moveTo(-3,-29);ctx.lineTo(0,-42);ctx.lineTo(3,-29);ctx.closePath();ctx.fill();ctx.restore();}
  if(kind==='boss'){ctx.fillStyle='#5e132d';ctx.beginPath();ctx.moveTo(w*.33,h*.12);ctx.lineTo(w*.24,h*.0);ctx.lineTo(w*.43,h*.08);ctx.lineTo(w*.5,h*.015);ctx.lineTo(w*.59,h*.08);ctx.lineTo(w*.77,h*.0);ctx.lineTo(w*.66,h*.15);ctx.closePath();ctx.fill();ctx.fillStyle='#fff2bd';ctx.fillRect(w*.39,h*.21,6,4);ctx.fillRect(w*.56,h*.21,6,4);}
  if(hit){ctx.globalAlpha=.35;ctx.fillStyle='#ffffff';ctx.fillRect(w*.18,h*.08,w*.64,h*.72);}
  ctx.restore();
}
function buildRuntimeAtlas(scene){
  const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=2048;const ctx=canvas.getContext('2d');const frameDefs={};
  const kinds=['hero','minion','archer','mage','tank','boss'],states=['idle0','idle1','run0','run1','attack','hit'];let index=0;
  for(const kind of kinds)for(const state of states){const x=(index%8)*80,y=Math.floor(index/8)*100;ctx.clearRect(x,y,80,100);drawCharacter(ctx,kind,state,x,y,80,100);frameDefs[`${kind}_${state}`]={x,y,w:80,h:100};index++;}
  // Lightweight flat background layers: retain atlas keys without decorative path loops.
  {const x=0,y=520,w=1600,h=540;ctx.fillStyle='#18233d';ctx.fillRect(x,y,w,h);ctx.fillStyle='#101a30';ctx.fillRect(x,y+390,w,150);frameDefs.bg_far={x,y,w,h};}
  {const x=0,y=1065,w=1600,h=400;ctx.clearRect(x,y,w,h);ctx.fillStyle='#202c45';ctx.fillRect(x,y+330,w,70);for(let i=0;i<8;i++){const px=55+i*205;ctx.fillStyle='#293650';ctx.fillRect(px,y+120,18,210);ctx.fillRect(px-7,y+112,32,10);}frameDefs.bg_mid={x,y,w,h};}
  {const x=0,y=1470,w=256,h=96;ctx.fillStyle='#252f43';ctx.fillRect(x,y,w,h);ctx.fillStyle='#35425b';ctx.fillRect(x,y,w,3);ctx.fillRect(x,y+32,w,2);ctx.fillRect(x,y+64,w,2);frameDefs.ground={x,y,w,h};}
  // Breakable barrel.
  {const x=300,y=1470,w=56,h=64;ctx.fillStyle='#80502d';roundedRect(ctx,x+7,y+5,w-14,h-7,8);ctx.fill();ctx.fillStyle='#b67a3e';roundedRect(ctx,x+12,y+9,w-24,h-15,5);ctx.fill();ctx.fillStyle='#4a2c22';ctx.fillRect(x+6,y+16,w-12,5);ctx.fillRect(x+6,y+43,w-12,5);ctx.fillStyle='#d9a15b';ctx.fillRect(x+17,y+9,3,h-18);ctx.fillRect(x+34,y+9,3,h-18);frameDefs.barrel={x,y,w,h};}
  {const x=370,y=1470,w=72,h=42;ctx.fillStyle='#a9c4dd';ctx.beginPath();ctx.moveTo(x,y+h);ctx.lineTo(x+12,y+6);ctx.lineTo(x+23,y+h);ctx.lineTo(x+36,y+1);ctx.lineTo(x+48,y+h);ctx.lineTo(x+60,y+5);ctx.lineTo(x+w,y+h);ctx.closePath();ctx.fill();ctx.fillStyle='#e8f4ff';ctx.beginPath();ctx.moveTo(x+12,y+6);ctx.lineTo(x+16,y+31);ctx.lineTo(x+12,y+h);ctx.lineTo(x+23,y+h);ctx.closePath();ctx.fill();frameDefs.spike={x,y,w,h};}
  {const x=450,y=1470,w=36,h=36;const g=ctx.createRadialGradient(x+18,y+18,2,x+18,y+18,18);g.addColorStop(0,'#ecffff');g.addColorStop(.35,'#66f1ff');g.addColorStop(1,'#2773ff');ctx.fillStyle=g;ctx.beginPath();ctx.arc(x+18,y+18,17,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#d5ffff';ctx.lineWidth=2;ctx.stroke();frameDefs.orb={x,y,w,h};}
  {const x=500,y=1470,w=128,h=100;ctx.save();ctx.translate(x,y);ctx.strokeStyle='#aab8ff';ctx.lineWidth=7;ctx.lineCap='round';ctx.beginPath();ctx.arc(63,52,35,-1.05,.96);ctx.stroke();ctx.strokeStyle='#f0f3ff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(63,52,43,-.95,.8);ctx.stroke();ctx.restore();frameDefs.slash={x,y,w,h};}
  const tex=scene.textures.addCanvas('runtime-atlas',canvas);for(const [name,f] of Object.entries(frameDefs))tex.add(name,0,f.x,f.y,f.w,f.h);tex.refresh();
}
 
class CombatScene extends Phaser.Scene {
  constructor(){super('CombatScene');this.bus=bus;this.core=null;this.moveAxis=0;this.playerFacing=1;this.guardHeld=false;this.parryUntil=0;this.lastParryAttemptTime=-9999;this.attackRemaining=0;this.attackCooldown=0;this.attackHitSet=new Set();this.attackHitAny=false;this.playerMisses=0;this.skillCooldown=0;this.playerAnim='idle';this.projectileComboHits=0;this.projectileComboAt=0;this.animTimer=0;this.frameToggle=0;this.poolCounter=0;this.projectilePool=[];this.particlePool=[];this.floatPool=[];this.slashPool=[];this.enemies=[];this.barrels=[];this.spikes=[];this.attackTime=0;this.invulnerableMs=0;this.bossSprite=null;this.lastStageIndex=-1;this.autoPause=false;}
  preload(){this.core=window.gameCore;}
  create(){
    buildRuntimeAtlas(this);this.physics.world.setBounds(0,0,1600,540);this.cameras.main.setBounds(0,0,1600,540);this.cameras.main.setBackgroundColor('#090f1c');
    // Parallax layers move at distinct camera factors for depth without external textures.
    this.bgFar=this.add.image(800,270,'runtime-atlas','bg_far').setDepth(-30).setScrollFactor(.12,0);this.bgMid=this.add.image(800,340,'runtime-atlas','bg_mid').setDepth(-20).setScrollFactor(.34,0);
    this.groundTile=this.add.tileSprite(800,493,1600,96,'runtime-atlas','ground').setDepth(2);this.groundBody=this.add.rectangle(800,480,1600,80,0x000000,0);this.physics.add.existing(this.groundBody,true);
    this.player=this.physics.add.sprite(120,397,'runtime-atlas','hero_idle0').setDepth(6);this.player.setDisplaySize(65,82);this.player.body.setSize(31,60);this.player.body.setOffset(24,30);this.player.setCollideWorldBounds(true);this.player.body.setGravityY(1050);this.player.body.setMaxVelocity(330,700);this.physics.add.collider(this.player,this.groundBody);
    this.enemyGroup=this.physics.add.group({runChildUpdate:false});this.physics.add.collider(this.enemyGroup,this.groundBody);
    this.cameras.main.startFollow(this.player,true,.08,.04);this.cameras.main.setDeadzone(260,80);this.cameras.main.setLerp(.08,.05);
    this.createPools();this.createArenaProps();this.createInput();this.bindBus();this.createBTInspector();window.gameScene=this;
    this.core.beginCurrentWave();bus.emit('audio:mode','arena');bus.emit('combat:log',{message:'Arena loaded. Hold guard to block; time the first 185 ms for a parry.'});
    this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{this.bus.off('combat:spawn-wave',this.onSpawnWave);this.bus.off('combat:reset-props',this.onResetProps);this.bus.off('input:move',this.onMove);this.bus.off('input:jump',this.onJump);this.bus.off('input:attack',this.onAttack);this.bus.off('input:skill',this.onSkill);this.bus.off('input:guard-start',this.onGuardStart);this.bus.off('input:guard-end',this.onGuardEnd);});
  }
  createInput(){const kb=this.input.keyboard;this.keys={left:kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),right:kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),leftArrow:kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),rightArrow:kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),space:kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),j:kb.addKey(Phaser.Input.Keyboard.KeyCodes.J),k:kb.addKey(Phaser.Input.Keyboard.KeyCodes.K),l:kb.addKey(Phaser.Input.Keyboard.KeyCodes.L)};}
  bindBus(){this.onSpawnWave=data=>this.spawnEnemyWave(data);this.onMove=axis=>{this.moveAxis=clamp(Number(axis)||0,-1,1);};this.onJump=()=>this.jump();this.onAttack=()=>this.playerAttack();this.onSkill=()=>this.playerWhirlwind();this.onGuardStart=()=>this.startGuard();this.onGuardEnd=()=>{this.guardHeld=false;this.stopGuardVisual();};this.onResetProps=()=>this.resetArenaProps();this.bus.on('combat:reset-props',this.onResetProps);this.bus.on('combat:spawn-wave',this.onSpawnWave);this.bus.on('input:move',this.onMove);this.bus.on('input:jump',this.onJump);this.bus.on('input:attack',this.onAttack);this.bus.on('input:skill',this.onSkill);this.bus.on('input:guard-start',this.onGuardStart);this.bus.on('input:guard-end',this.onGuardEnd);}
  createPools(){
    for(let i=0;i<24;i++){const p=this.add.circle(-100,-100,2,0xffffff,.9).setActive(false).setVisible(false).setDepth(12);p.life=0;p.vx=0;p.vy=0;p.startLife=1;p.startAlpha=1;this.particlePool.push(p);}
    for(let i=0;i<12;i++){const t=this.add.text(-100,-100,'',{fontFamily:'system-ui',fontSize:'16px',fontStyle:'bold',color:'#ffffff',stroke:'#05070d',strokeThickness:4}).setOrigin(.5).setActive(false).setVisible(false).setDepth(20);t.life=0;this.floatPool.push(t);}
    for(let i=0;i<32;i++){const p=this.physics.add.image(-100,-100,'runtime-atlas','orb').setActive(false).setVisible(false).setDepth(8);p.body.setAllowGravity(false);p.body.enable=false;p.setDisplaySize(23,23);p.life=0;p.damage=10;p.owner='enemy';p.speed=0;this.projectilePool.push(p);}
    for(let i=0;i<6;i++){const s=this.add.image(-100,-100,'runtime-atlas','slash').setActive(false).setVisible(false).setDepth(10);s.life=0;s.baseScale=1;this.slashPool.push(s);}
  }
  createArenaProps(){
    for(const x of [390,965,1375]){const barrel=this.physics.add.sprite(x,405,'runtime-atlas','barrel').setDepth(5).setDisplaySize(43,50);barrel.body.setAllowGravity(false);barrel.body.setImmovable(true);barrel.body.setSize(36,45);barrel.isBroken=false;this.physics.add.collider(this.player,barrel);this.barrels.push(barrel);}
    for(const x of [590,1135]){const spike=this.add.image(x,428,'runtime-atlas','spike').setDepth(4).setDisplaySize(68,40);spike.hazardX=x;this.spikes.push(spike);}this.hazardCooldown=0;
  }
  createBTInspector(){const self=this;this.bt=new SelectorNode([new SequenceNode([new ConditionNode(ctx=>ctx.hpRatio<.25),new ActionNode(ctx=>{ctx.status='ENRAGED';return NodeState.SUCCESS;})]),new SequenceNode([new ConditionNode(ctx=>ctx.distance<ctx.range),new ActionNode(ctx=>{ctx.status='ATTACK';return NodeState.SUCCESS;})]),new SequenceNode([new ConditionNode(ctx=>ctx.distance<ctx.sight),new ActionNode(ctx=>{ctx.status='PURSUIT';return NodeState.RUNNING;})]),new ActionNode(ctx=>{ctx.status='GUARD';return NodeState.SUCCESS;})]);}
  spawnEnemyWave(data){
    if(!data)return;this.enemyGroup.clear(true,true);this.enemies=[];this.clearProjectiles();this.bossSprite=null;
    if(this.lastStageIndex!==data.stage.index){this.resetArenaProps();this.lastStageIndex=data.stage.index;this.bgFar.setTint([0xffffff,0xe4d9ff,0xffd5dc,0xd5eaff][data.stage.index%4]);this.bgMid.setTint([0xffffff,0xc9bbff,0xffc7d5,0xc3e7ff][data.stage.index%4]);}
    const count=data.waveTypes.length;let baseX=Math.max(650,this.player.x+430);baseX=Math.min(baseX,980);
    data.waveTypes.forEach((kind,i)=>{const x=Math.min(1440,baseX+i*105);const enemy=this.physics.add.sprite(x,397,'runtime-atlas',`${kind}_idle0`).setDepth(6);const sizes={minion:[59,77],archer:[62,79],mage:[62,80],tank:[72,89],boss:[108,132]};enemy.setDisplaySize(...sizes[kind]||[62,78]);enemy.body.setSize(kind==='boss'?48:31,kind==='boss'?84:59);enemy.body.setOffset(kind==='boss'?16:24,kind==='boss'?22:30);enemy.setCollideWorldBounds(true);enemy.body.setGravityY(1050);enemy.body.setMaxVelocity(220,450);enemy.body.setBounce(0);const ceiling=getBuildCeiling(this.core.state.highestChapterUnlocked,Object.values(GEAR));const rawHp=Math.round(({minion:72,archer:65,mage:62,tank:180,boss:620}[kind]||70)*data.stage.scale);enemy.hpMax=rawHp;enemy.hp=enemy.hpMax;enemy.kind=kind;enemy.weaponClass=kind==='boss'||kind==='tank'?'long':kind==='archer'||kind==='mage'?'long':'medium';enemy.enemyId=`e-${++this.poolCounter}`;enemy.attackCooldown=700+Math.random()*600;enemy.windup=0;enemy.aiTimer=0;enemy.stateName='idle';enemy.hitFlash=0;enemy.stun=0;enemy.phase=1;enemy.moveSpeed=({minion:104,archer:82,mage:72,tank:56,boss:75}[kind]||90)*(1+Math.max(0,data.stage.chapter-1)*.04);enemy.attackRange=kind==='boss'?118:kind==='tank'?78:kind==='minion'?58:kind==='archer'?355:310;enemy.sightRange=kind==='minion'?620:kind==='tank'?540:600;enemy.scaleFactor=data.stage.scale;enemy.comboHits=0;enemy.lastComboAt=0;enemy.missedAttacks=0;enemy.aiComboHits=0;enemy.lastAiComboAt=0;enemy.aiProficiency=clamp(.35+(this.core.state.highestChapterUnlocked-1)*.2,.35,.9);enemy.attackDamageCap=ceiling.maxAtk;enemy.attackCooldown/=1+enemy.aiProficiency*.12;enemy.aiTree=this.buildEnemyTree(enemy);this.enemyGroup.add(enemy);this.enemies.push(enemy);if(kind==='boss')this.bossSprite=enemy;});
    this.player.setPosition(Math.min(Math.max(120,this.player.x),350),397);this.player.setVelocity(0,0);bus.emit('combat:log',{message:`${data.stage.kind} · Stage ${data.stage.id}, wave ${data.waveIndex+1}: ${data.waveTypes.join(', ')}.`});if(this.bossSprite)bus.emit('enemy:boss-state',{visible:true,name:'THE IRON WARDEN',hp:100,max:100,phase:1});else bus.emit('enemy:boss-state',{visible:false});
  }
  buildEnemyTree(enemy){return new SelectorNode([
    new SequenceNode([
      new ConditionNode(ctx=>ctx.kind==='boss'&&ctx.hpRatio<=.5),
      new ActionNode(ctx=>{
        ctx.intent=`BOSS P${ctx.enemy.phase}`;
        const e=ctx.enemy;
        if(ctx.distance>ctx.range*.72)e.setVelocityX(Math.sign(ctx.dx)*e.moveSpeed*(e.phase===3?1.55:1));
        else e.setVelocityX(0);
        if(e.attackCooldown<=0){
          e.windup=e.phase===2?360:260;
          e.attackCooldown=e.phase===2?1100:770;
        }
        return NodeState.SUCCESS;
      })
    ]),
    new SequenceNode([
      new ConditionNode(ctx=>ctx.distance<=ctx.range),
      new ActionNode(ctx=>{
        ctx.intent='ATTACK';
        const e=ctx.enemy;
        e.setVelocityX(0);
        if(e.attackCooldown<=0){
          if(e.kind==='archer'||e.kind==='mage'){e.windup=e.kind==='mage'?510:390;e.attackCooldown=e.kind==='mage'?1950:1500;}
          else if(e.kind==='tank'){e.windup=620;e.attackCooldown=1550;}
          else if(e.kind==='boss'){e.windup=520;e.attackCooldown=1450;}
          else{e.windup=360;e.attackCooldown=1100;}
        }
        return NodeState.SUCCESS;
      })
    ]),
    new SequenceNode([
      new ConditionNode(ctx=>ctx.distance<=ctx.sight),
      new ActionNode(ctx=>{
        ctx.intent='PURSUIT';
        const e=ctx.enemy;
        if(e.kind==='archer'||e.kind==='mage'){
          if(ctx.distance<e.attackRange*.6)e.setVelocityX(-Math.sign(ctx.dx)*e.moveSpeed*.8);
          else e.setVelocityX(Math.sign(ctx.dx)*e.moveSpeed*.8);
          if(e.attackCooldown<=0){e.windup=e.kind==='mage'?510:390;e.attackCooldown=e.kind==='mage'?1950:1500;}
        } else {
          e.setVelocityX(Math.sign(ctx.dx)*e.moveSpeed);
        }
        return NodeState.RUNNING;
      })
    ]),
    new ActionNode(ctx=>{
      ctx.intent='GUARD';
      ctx.enemy.setVelocityX(0);
      return NodeState.SUCCESS;
    })
  ]);}
  resetArenaProps(){for(const b of this.barrels){b.isBroken=false;b.setActive(true).setVisible(true);if(b.body)b.body.enable=true;}this.hazardCooldown=0;}
  clearProjectiles(){for(const p of this.projectilePool){p.setActive(false).setVisible(false);if(p.body)p.body.enable=false;p.life=0;}}
  jump(){if(!this.player?.active||this.core.state.runStatus!=='combat')return;if(this.player.body.blocked.down||this.player.body.touching.down){this.player.setVelocityY(-478);this.emitDust(this.player.x,this.player.y+37,9);bus.emit('audio:sfx','slash');}}
  startGuard(){
    if(!this.player?.active||this.core.state.runStatus!=='combat')return;
    const now=this.time.now;
    this.guardHeld=true;
    if(canParryWithCooldown(now,this.lastParryAttemptTime,PARRY_RULES.cooldownMs)){
      this.parryUntil=now+PARRY_RULES.windowMs;
      this.lastParryAttemptTime=now;
      this.player.setTint(0x9ceaff);
    } else {
      this.parryUntil=0; // Cooldown prevents parry spam; standard 55% block remains active
      this.player.setTint(0x7ea8d4);
    }
    this.playerGuardStarted=now;
  }
  stopGuardVisual(){if(this.player?.active)this.player.clearTint();}
  playerAttack(){if(!this.player?.active||this.core.state.runStatus!=='combat'||this.attackCooldown>0)return;this.attackCooldown=300;this.attackRemaining=145;this.attackHitSet.clear();this.attackHitAny=false;this.playerAnim='attack';this.emitSlash(this.player.x+this.playerFacing*40,this.player.y-3,this.playerFacing);bus.emit('audio:sfx','slash');}
  playerWhirlwind(){if(!this.player?.active||this.core.state.runStatus!=='combat'||this.skillCooldown>0)return;const cost=30;if(!this.core.spendEnergy(cost)){bus.emit('ui:toast',{message:'Need 30 energy for Whirlwind.'});return;}this.skillCooldown=9000-Math.min(3000,this.core.state.skillLevels.whirlwind*650);this.playerAnim='attack';this.emitSlash(this.player.x,this.player.y,0,0x62e8ff,1.6);bus.emit('audio:sfx','magic');this.cameras.main.shake(100,.0025);const range=145+this.core.state.skillLevels.whirlwind*10;for(const e of [...this.enemies])if(e.active&&Math.abs(e.x-this.player.x)<range&&Math.abs(e.y-this.player.y)<90)this.damageEnemy(e,this.core.stats.atk*(1.05+this.core.state.skillLevels.whirlwind*.1),true);for(const b of this.barrels)if(b.active&&!b.isBroken&&Math.abs(b.x-this.player.x)<range&&Math.abs(b.y-this.player.y)<80)this.breakBarrel(b);this.emitDust(this.player.x,this.player.y,22,0x63e7ff);}
  update(time,delta){if(!this.player?.active)return;const dt=delta/1000;this.attackCooldown=Math.max(0,this.attackCooldown-delta);const attackWasActive=this.attackRemaining>0;this.attackRemaining=Math.max(0,this.attackRemaining-delta);if(attackWasActive&&this.attackRemaining<=0){this.playerMisses=nextMissCount(this.playerMisses,this.attackHitAny);if(shouldResetStunChain(this.playerMisses)){for(const enemy of this.enemies){enemy.comboHits=0;enemy.lastComboAt=0;}bus.emit('combat:log',{message:'Two consecutive attacks missed: stun combo reset.'});this.playerMisses=0;}this.attackHitAny=false;}this.skillCooldown=Math.max(0,this.skillCooldown-delta);this.invulnerableMs=Math.max(0,this.invulnerableMs-delta);this.hazardCooldown=Math.max(0,this.hazardCooldown-delta);this.animTimer+=delta;
    const keyAxis=((this.keys.right.isDown||this.keys.rightArrow.isDown)?1:0)-((this.keys.left.isDown||this.keys.leftArrow.isDown)?1:0);const axis=keyAxis||this.moveAxis;const frozen=this.core.state.runStatus!=='combat';if(frozen){this.player.setVelocityX(0);}else if(this.player.stunMs>0){this.player.stunMs=Math.max(0,this.player.stunMs-delta);this.player.setVelocityX(this.player.body.velocity.x*.95);}else{const speed=this.core.stats.moveSpeed||250;if(axis!==0){this.playerFacing=Math.sign(axis);this.player.setFlipX(this.playerFacing<0);this.player.setVelocityX(axis*speed);if(this.attackRemaining<=0)this.playerAnim='run';}else{this.player.setVelocityX(this.player.body.velocity.x*.78);if(Math.abs(this.player.body.velocity.x)<8)this.player.setVelocityX(0);if(this.attackRemaining<=0)this.playerAnim=this.guardHeld?'guard':'idle';}}
    if(Phaser.Input.Keyboard.JustDown(this.keys.space))this.jump();if(Phaser.Input.Keyboard.JustDown(this.keys.j))this.playerAttack();if(Phaser.Input.Keyboard.JustDown(this.keys.k))this.playerWhirlwind();if(Phaser.Input.Keyboard.JustDown(this.keys.l)){this.startGuard();this.time.delayedCall(360,()=>{this.guardHeld=false;this.stopGuardVisual();});}
    if(!this.guardHeld&&this.player.tintTopLeft!==0xffffff)this.stopGuardVisual();
    if(this.core.state.runStatus==='combat'){if(this.projectileComboHits>0&&this.time.now-this.projectileComboAt>getStunResetWindow('long'))this.projectileComboHits=0;this.updateAttackHitboxes();this.updateEnemies(delta);this.updateProjectiles(dt);this.updateHazards();this.core.player.energy=clamp(this.core.player.energy+dt*2.5,0,100);if(Math.floor(time/500)!==this.energyTick){this.energyTick=Math.floor(time/500);this.core.emitStateChange();}}
    this.updatePools(dt);this.animatePlayer(delta);this.animateEnemies(delta);
  }
  animatePlayer(delta){if(this.animTimer>100){this.animTimer=0;this.frameToggle^=1;}const state=this.playerAnim==='attack'&&this.attackRemaining>0?'attack':this.playerAnim==='hit'?'hit':this.guardHeld?'idle':Math.abs(this.player.body.velocity.x)>20?'run':'idle';const frame=state==='run'?`${state}${this.frameToggle}`:`${state}${state==='idle'?this.frameToggle: ''}`;const key=`hero_${frame}`;if(this.player.texture.key==='runtime-atlas'&&this.player.frame.name!==key){try{this.player.setTexture('runtime-atlas',key);}catch{this.player.setTexture('runtime-atlas','hero_idle0');}}if(this.player.body.velocity.y<-30)this.player.setAngle(this.playerFacing*4);else this.player.setAngle(0);}
  animateEnemies(delta){for(const e of this.enemies){if(!e.active)continue;e.animTimer=(e.animTimer||0)+delta;if(e.animTimer>155){e.animTimer=0;e.animFlip=!e.animFlip;}let state=e.hitFlash>0?'hit':e.windup>0?'attack':Math.abs(e.body.velocity.x)>15?'run':'idle';const frame=state==='run'?`${state}${e.animFlip?1:0}`:`${state}${state==='idle'?(e.animFlip?1:0):''}`;const key=`${e.kind}_${frame}`;if(e.texture.key==='runtime-atlas'&&e.frame.name!==key){try{e.setTexture('runtime-atlas',key);}catch{}}}}
  updateAttackHitboxes(){if(this.attackRemaining<=0)return;for(const e of [...this.enemies]){if(!e.active||this.attackHitSet.has(e.enemyId))continue;const dx=e.x-this.player.x,dy=Math.abs(e.y-this.player.y);if(dx*this.playerFacing>-28&&dx*this.playerFacing<105&&dy<78){this.attackHitSet.add(e.enemyId);this.attackHitAny=true;this.playerMisses=0;const crit=Math.random()<this.core.stats.crit,damage=this.core.stats.atk*(crit?this.core.stats.critMult:1);this.damageEnemy(e,damage,crit);if(e.active){const now=this.time.now,weaponClass=this.core.gearFor('weapon')?.rangeClass||'medium';if(now-(e.lastComboAt||0)>getStunResetWindow(weaponClass))e.comboHits=0;e.comboHits=(e.comboHits||0)+1;e.lastComboAt=now;const stunChance=getStunChance(e.comboHits,weaponClass);if(Math.random()<stunChance){e.stun=Math.max(e.stun||0,STUN_RULES.durationMs);bus.emit('combat:log',{message:`Hitstun proc ${Math.round(stunChance*100)}% · enemy interrupted.`});}e.setVelocityX(this.playerFacing*(crit?125:90));e.setVelocityY(-28);}this.core.gainEnergy(crit?10:6);}}
    for(const b of this.barrels)if(b.active&&!b.isBroken){const dx=b.x-this.player.x;if(dx*this.playerFacing>-25&&dx*this.playerFacing<95&&Math.abs(b.y-this.player.y)<75)this.breakBarrel(b);}}
  damageEnemy(enemy,raw,crit=false){if(!enemy?.active)return;const damage=Math.max(1,Math.round(raw));enemy.hp-=damage;enemy.hitFlash=100;enemy.setTintFill(crit?0xffdc83:0xffffff);this.time.delayedCall(75,()=>{if(enemy.active)enemy.clearTint();});this.showFloat(enemy.x,enemy.y-48,crit?`CRIT ${damage}`:`-${damage}`,crit?'#ffc45f':'#edf4ff');this.emitDust(enemy.x,enemy.y+20,crit?11:6,crit?0xffc45f:0xd9e4ff);bus.emit('audio:sfx',crit?'crit':'hit');if(enemy.kind==='boss'){const phase=enemy.hp/enemy.hpMax<=.25?3:enemy.hp/enemy.hpMax<=.5?2:1;if(phase!==enemy.phase){enemy.phase=phase;bus.emit('combat:log',{message:`The Iron Warden enters phase ${phase}. Its attack pattern changes.`});bus.emit('audio:sfx','parry');}bus.emit('enemy:boss-state',{visible:true,name:'THE IRON WARDEN',hp:Math.max(0,enemy.hp),max:enemy.hpMax,phase:enemy.phase});}
    if(enemy.hp<=0){const kind=enemy.kind;enemy.body.enable=false;enemy.setActive(false).setVisible(false);this.enemyGroup.remove(enemy,true,true);this.enemies=this.enemies.filter(e=>e!==enemy);if(this.bossSprite===enemy)this.bossSprite=null;this.emitDust(enemy.x,enemy.y,24,kind==='boss'?0xff718a:0xf9e1b4);this.core.onEnemyKilled(kind);if(kind==='boss')bus.emit('enemy:boss-state',{visible:false});}}
  breakBarrel(barrel){
    if(barrel.isBroken)return;
    barrel.isBroken=true;barrel.body.enable=false;barrel.setActive(false).setVisible(false);
    const barrelGold=Math.floor(35*this.core.goldMultiplier());
    this.core.state.gold+=barrelGold;
    if(Math.random()<POTION_RULES.barrelDropRate){
      this.core.state.potions=Math.min(POTION_RULES.maxPotions,this.core.state.potions+1);
      this.showFloat(barrel.x,barrel.y-48,'+1 POTION','#6eeaff');
      bus.emit('combat:log',{message:'Breakable barrel contained a Healing Potion!'});
    }
    this.core.emitStateChange();
    this.showFloat(barrel.x,barrel.y-30,`+${barrelGold} GOLD`,'#ffc65c');
    this.emitDust(barrel.x,barrel.y,18,0xc98b55);
    bus.emit('audio:sfx','coin');
    bus.emit('combat:log',{message:`Breakable barrel opened · +${barrelGold} gold${this.core.goldMultiplier()<1?' (anti-farm -50%)':''}.`});
  }
  updateEnemies(delta){
    for(const e of [...this.enemies]){
      if(!e.active)continue;
      const now=this.time.now,playerWeaponClass=this.core.gearFor('weapon')?.rangeClass||'medium';
      if((e.comboHits||0)>0&&now-(e.lastComboAt||0)>getStunResetWindow(playerWeaponClass)){e.comboHits=0;e.lastComboAt=0;}
      if((e.aiComboHits||0)>0&&now-(e.lastAiComboAt||0)>getStunResetWindow(e.weaponClass||'medium')){e.aiComboHits=0;e.lastAiComboAt=0;}
      if(e.hitFlash>0)e.hitFlash=Math.max(0,e.hitFlash-delta);
      if(e.stun>0){e.stun=Math.max(0,e.stun-delta);e.setVelocityX(e.body.velocity.x*.94);continue;}
      e.attackCooldown-=delta;
      if(e.windup>0){e.windup-=delta;if(e.windup<=0)this.performEnemyAttack(e);e.setVelocityX(e.body.velocity.x*.4);continue;}
      const dx=this.player.x-e.x,dy=Math.abs(this.player.y-e.y),dist=Math.hypot(dx,dy);
      e.setFlipX(dx<0);
      const hpRatio=e.hp/e.hpMax;
      const ctx={enemy:e,kind:e.kind,hpRatio,distance:dist,dx,dy,range:e.attackRange,sight:e.sightRange,intent:'GUARD'};
      e.aiTree?.evaluate(ctx,delta);
      const aiText=e.kind==='boss'?`BOSS P${e.phase}`:ctx.intent;
      if(aiText!==this.lastAIStatus){this.lastAIStatus=aiText;bus.emit('ai:status-changed',{text:aiText});}
      if(e.kind==='boss'&&e.hp/e.hpMax<=.5&&e.phase===1)e.phase=2;
      if(e.kind==='boss'&&e.hp/e.hpMax<=.25&&e.phase===2)e.phase=3;
    }
  }
  performEnemyAttack(e){if(!e.active||this.core.state.runStatus!=='combat')return;const dx=this.player.x-e.x,dy=Math.abs(this.player.y-e.y),dist=Math.hypot(dx,dy);e.setVelocityX(0);if(e.kind==='archer'||e.kind==='mage'){if(dist<e.sightRange){this.spawnProjectile(e.x+(dx>0?28:-28),e.y-8,dx, this.player.y-e.y,e.kind==='mage'?18:13,e.kind==='mage'?205:300,e.kind==='mage'?'#73ecff':'#ffbd70',0,e);bus.emit('audio:sfx','magic');}return;}
    if(e.kind==='boss'){if(e.phase===1){if(dist<160&&dy<90)this.hitPlayerFromEnemy(e,30*e.scaleFactor);else this.registerEnemyMiss(e,'missed');this.emitSlash(e.x+(dx>0?50:-50),e.y,Math.sign(dx),0xff557d,1.5);}else if(e.phase===2){if(dist<210&&dy<100)this.hitPlayerFromEnemy(e,37*e.scaleFactor);this.emitDust(e.x,e.y+25,24,0xff567a);for(let i=-1;i<=1;i++)this.spawnProjectile(e.x,e.y,dx,dy+Math.abs(i)*70,17*e.scaleFactor,220,'#ff5c83',i*42,e);}else{if(dist<240&&dy<115)this.hitPlayerFromEnemy(e,40*e.scaleFactor);for(let i=-2;i<=2;i++)this.spawnProjectile(e.x,e.y,dx,dy,15*e.scaleFactor,250,'#ff4c9b',i*18,e);this.emitDust(e.x,e.y,20,0xff70a6);}return;}
    const range=e.kind==='tank'?95:76;if(dist<range&&dy<84){e.missedAttacks=0;const raw=(e.kind==='tank'?28:e.kind==='minion'?18:22)*e.scaleFactor;this.hitPlayerFromEnemy(e,raw);this.emitSlash(this.player.x,this.player.y-5,-Math.sign(dx),e.kind==='tank'?0xffb86b:0xff7288,1.1);}else{this.registerEnemyMiss(e,'missed');if(e.kind==='tank')e.setVelocityX(Math.sign(dx)*e.moveSpeed*1.6);}}
  registerEnemyMiss(enemy,reason='missed'){if(!enemy)return;enemy.missedAttacks=nextMissCount(enemy.missedAttacks,false);if(shouldResetStunChain(enemy.missedAttacks)){enemy.aiComboHits=0;enemy.lastAiComboAt=0;enemy.missedAttacks=0;bus.emit('combat:log',{message:`Enemy ${reason} twice: stun combo reset.`});}}
  hitPlayerFromEnemy(enemy,raw){if(this.invulnerableMs>0){this.registerEnemyMiss(enemy,'attack dodged');return;}const facesPlayer=(this.playerFacing===Math.sign(enemy.x-this.player.x));const perfect=this.guardHeld&&this.time.now<=this.parryUntil&&facesPlayer;const blocking=this.guardHeld&&facesPlayer;if(perfect){this.registerEnemyMiss(enemy,'parried');const parryDamage=Math.max(16,Math.round(this.core.stats.atk*.65));enemy.stun=0;this.damageEnemy(enemy,parryDamage,false);if(enemy.active){enemy.stun=1050;enemy.setVelocityX(Math.sign(enemy.x-this.player.x)*170);}this.showFloat(this.player.x,this.player.y-52,'PERFECT PARRY!','#6eeaff');this.emitDust(enemy.x,enemy.y,14,0x64eaff);bus.emit('audio:sfx','parry');this.core.restoreAfterGuard();bus.emit('haptics:parry',{});return;}const now=this.time.now;if(now-(enemy.lastAiComboAt||0)>getStunResetWindow(enemy.weaponClass||'medium'))enemy.aiComboHits=0;enemy.aiComboHits=(enemy.aiComboHits||0)+1;enemy.missedAttacks=0;enemy.lastAiComboAt=now;const comboChance=getStunChance(enemy.aiComboHits,enemy.weaponClass||'medium');const damage=this.core.takeDamage(Math.min(raw,enemy.attackDamageCap||raw),enemy.x,{blocked:blocking});if(Math.random()<comboChance){this.player.stunMs=Math.max(this.player.stunMs||0,STUN_RULES.durationMs);bus.emit('combat:log',{message:`Enemy combo hitstun ${Math.round(comboChance*100)}%. Parry resets the pressure.`});}this.invulnerableMs=470;this.player.setTint(0xff8290);this.time.delayedCall(115,()=>{if(this.player?.active&&!this.guardHeld)this.player.clearTint();});this.player.setVelocityX(this.player.x<enemy.x?-105:105);this.playerAnim='hit';this.showFloat(this.player.x,this.player.y-50,blocking?`BLOCK -${damage}`:`-${damage}`,blocking?'#8fdcff':'#ff6b83');bus.emit('audio:sfx','hit');}
  spawnProjectile(x,y,dx,dy,damage,speed,color='#70eaff',angleOffset=0,attacker=null){let p=this.projectilePool.find(v=>!v.active);if(!p){p=this.projectilePool.reduce((oldest,curr)=>curr.life<oldest.life?curr:oldest,this.projectilePool[0]);}if(!p)return;p.setActive(true).setVisible(true).setPosition(x,y).setTint(Phaser.Display.Color.HexStringToColor(color).color);p.body.enable=true;p.body.reset(x,y);const length=Math.max(1,Math.hypot(dx,dy)),angle=Math.atan2(dy,dx)+angleOffset*Math.PI/180;p.vx=Math.cos(angle)*speed;p.vy=Math.sin(angle)*speed;p.damage=Math.min(damage,getBuildCeiling(this.core.state.highestChapterUnlocked,Object.values(GEAR)).maxAtk);p.life=3.8;p.owner='enemy';p.attacker=attacker||null;p.weaponClass=attacker?.weaponClass||'long';p.body.setAllowGravity(false);p.setRotation(angle);}
  updateProjectiles(dt){for(const p of this.projectilePool){if(!p.active)continue;p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.body?.updateFromGameObject();if(p.life<=0||p.x<-50||p.x>1650||p.y>560||p.y< -30){if(p.owner==='enemy'&&p.attacker?.active)this.registerEnemyMiss(p.attacker,'projectile missed');p.setActive(false).setVisible(false);if(p.body)p.body.enable=false;continue;}if(Math.hypot(p.x-this.player.x,p.y-this.player.y)<31&&this.core.state.runStatus==='combat'){if(this.invulnerableMs>0){if(p.attacker?.active)this.registerEnemyMiss(p.attacker,'attack dodged');p.setActive(false).setVisible(false);p.body.enable=false;continue;}const facesProjectile=this.playerFacing===Math.sign(p.x-this.player.x);const perfect=this.guardHeld&&this.time.now<=this.parryUntil&&facesProjectile;const blocked=this.guardHeld&&facesProjectile;if(perfect){if(p.attacker?.active)this.registerEnemyMiss(p.attacker,'parried');this.showFloat(this.player.x,this.player.y-52,'PERFECT PARRY!','#6eeaff');this.emitDust(this.player.x,this.player.y,14,0x64eaff);bus.emit('audio:sfx','parry');this.core.restoreAfterGuard();bus.emit('haptics:parry',{});if(p.attacker?.active)p.attacker.stun=Math.max(p.attacker.stun||0,1050);this.invulnerableMs=470;}else if(blocked){if(p.attacker?.active)this.registerEnemyMiss(p.attacker,'projectile parried');this.showFloat(this.player.x,this.player.y-45,'BLOCKED','#9deaff');bus.emit('audio:sfx','parry');this.invulnerableMs=120;}else{if(p.attacker)p.attacker.missedAttacks=0;const damage=this.core.takeDamage(Math.min(p.damage,getBuildCeiling(this.core.state.highestChapterUnlocked,Object.values(GEAR)).maxAtk),p.x);const now=this.time.now;let comboHits,weaponClass=p.weaponClass||'long';if(p.attacker?.active){if(now-(p.attacker.lastAiComboAt||0)>getStunResetWindow(weaponClass))p.attacker.aiComboHits=0;p.attacker.aiComboHits=(p.attacker.aiComboHits||0)+1;p.attacker.lastAiComboAt=now;comboHits=p.attacker.aiComboHits;}else{if(now-this.projectileComboAt>getStunResetWindow(weaponClass))this.projectileComboHits=0;this.projectileComboHits++;this.projectileComboAt=now;comboHits=this.projectileComboHits;}const stunChance=getStunChance(comboHits,weaponClass);if(Math.random()<stunChance){this.player.stunMs=Math.max(this.player.stunMs||0,STUN_RULES.durationMs);bus.emit('combat:log',{message:`Ranged combo hitstun ${Math.round(stunChance*100)}%.`});}this.invulnerableMs=300;this.showFloat(this.player.x,this.player.y-45,`-${damage}`,'#ff6a81');}p.setActive(false).setVisible(false);p.body.enable=false;}}}
  updateHazards(){if(this.hazardCooldown>0)return;for(const s of this.spikes){if(Math.abs(this.player.x-s.hazardX)<25&&this.player.y>367){this.hazardCooldown=800;const damage=this.core.takeDamage(14,s.x);this.player.setVelocityY(-180);this.showFloat(this.player.x,this.player.y-46,`SPIKES -${damage}`,'#ff7087');this.emitDust(s.x,s.y,10,0xff7087);return;}}}
  emitDust(x,y,count=4,color=0xdbe6ff){count=Math.min(count,4);for(let i=0;i<count;i++){const p=this.particlePool.find(v=>!v.active);if(!p)break;p.setActive(true).setVisible(true).setPosition(x,y);p.setFillStyle(color,1);p.setScale(.6+Math.random()*.9);p.life=.28+Math.random()*.48;p.startLife=p.life;p.vx=(Math.random()-.5)*170;p.vy=-30-Math.random()*135;p.startAlpha=.9;}}
  emitSlash(x,y,direction=1,color=0xadb0ff,scale=1){const s=this.slashPool.find(v=>!v.active);if(!s)return;s.setActive(true).setVisible(true).setPosition(x,y).setTint(color).setAlpha(.95).setScale(.38*scale,.46*scale);s.rotation=direction<0?Math.PI:direction===0?Math.random()*Math.PI:0;s.life=.22;s.baseScale=scale;}
  showFloat(x,y,text,color='#ffffff'){const t=this.floatPool.find(v=>!v.active);if(!t)return;t.setActive(true).setVisible(true).setPosition(x,y).setText(String(text)).setColor(color).setAlpha(1).setScale(1);t.life=.68;t.vx=(Math.random()-.5)*18;t.vy=-40;}
  updatePools(dt){for(const p of this.particlePool){if(!p.active)continue;p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=240*dt;p.setAlpha(Math.max(0,p.life/p.startLife)*p.startAlpha);if(p.life<=0)p.setActive(false).setVisible(false);}for(const t of this.floatPool){if(!t.active)continue;t.life-=dt;t.x+=t.vx*dt;t.y+=t.vy*dt;t.vy-=10*dt;t.setAlpha(clamp(t.life/.25,0,1));if(t.life<=0)t.setActive(false).setVisible(false);}for(const s of this.slashPool){if(!s.active)continue;s.life-=dt;const p=1-s.life/.22;s.setAlpha(Math.max(0,s.life/.22));s.setScale(.38*s.baseScale+p*.65,.46*s.baseScale+p*.65);if(s.life<=0)s.setActive(false).setVisible(false);}}
}
 
// ============================================================================
// 6. UI CONTROLLER: DOM is a view/command adapter; it does not own game rules.
// ============================================================================
function escapeHTML(value){return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
class UIController {
  constructor(core,audio){this.core=core;this.audio=audio;this.modalAction='close';this.toastTimer=null;this.panelKind='inventory';this.bindEvents();this.bindButtons();this.render(core.getSnapshot());}
  el(id){
    const elem=document.getElementById(id);
    if(elem)return elem;
    return {style:{},classList:{add(){},remove(){},toggle(){},contains(){return false;}},textContent:'',innerHTML:'',disabled:false,children:[],addEventListener(){},removeEventListener(){},setAttribute(){},removeAttribute(){},setPointerCapture(){},getBoundingClientRect(){return {left:0,top:0,width:0,height:0};},prepend(){},appendChild(){}};
  }
  bindEvents(){bus.on('core:state-changed',s=>this.render(s));bus.on('ui:modal',data=>this.showSystemModal(data));bus.on('ui:toast',data=>this.showToast(data?.message||''));bus.on('combat:log',data=>this.addLog(data?.message||''));bus.on('ai:status-changed',data=>{if(!data)return;this.el('ai-status-badge').textContent=data.text;this.el('ai-description').textContent=data.text==='ATTACK'?'Attack wind-up detected. Guard or parry the strike.':data.text==='PURSUIT'?'Target visible: close distance and approach the player.':data.text.startsWith('BOSS')?'Boss phase changes its wind-up and projectile pattern.':'Waiting, guarding, or checking attack range.';this.el('ai-meter').style.width=data.text==='ATTACK'?'88%':data.text==='PURSUIT'?'65%':data.text.startsWith('BOSS')?'100%':'28%';});bus.on('stage:changed',data=>this.renderStage(data));bus.on('enemy:boss-state',data=>{this.el('boss-bar').style.display=data?.visible?'block':'none';if(data?.visible){this.el('boss-name').textContent=`${data.name} · PHASE ${['I','II','III'][Math.max(1,data.phase)-1]||'III'}`;this.el('boss-hp-fill').style.width=`${clamp(data.hp/data.max*100,0,100)}%`;}});bus.on('player:damaged',data=>{if(data?.blocked)this.showToast(`Guard absorbed part of the hit · ${data.damage} damage.`);});bus.on('haptics:damage',data=>window.nativeBridge?.impact(data?.heavy?'heavy':'medium'));bus.on('haptics:parry',()=>window.nativeBridge?.impact('medium'));}
  bindButtons(){
    this.el('btn-inventory').addEventListener('click',()=>this.openPanel('inventory'));this.el('btn-skills').addEventListener('click',()=>this.openPanel('skills'));this.el('btn-summon').addEventListener('click',()=>this.openPanel('chests'));
    this.el('btn-save').addEventListener('click',async()=>{try{await SecureSaveSystem.saveData(this.core.serialize());this.showSystemModal({title:'SAVE SECURED',subtitle:'AES-256-GCM + HMAC-SHA256',message:'Your account state was encrypted and saved to this device. This detects casual save-file edits; client-side storage cannot provide authoritative anti-cheat against a determined device owner.',action:'close',actionLabel:'Done'});}catch(err){this.showSystemModal({title:'SAVE FAILED',subtitle:'Secure storage unavailable',message:err.message||'The game could not encrypt your save.',action:'close',actionLabel:'Close'});}});
    this.el('btn-load').addEventListener('click',async()=>{try{const payload=await SecureSaveSystem.loadData();this.core.restoreSave(payload);this.showSystemModal({title:'SAVE VERIFIED',subtitle:'Integrity checks passed',message:'HMAC-SHA256 validation and AES-GCM decryption succeeded. The saved stage was restarted with the saved progression.',action:'close',actionLabel:'Return to arena'});}catch(err){this.showSystemModal({title:'LOAD FAILED',subtitle:'Save could not be verified',message:err.message||'The save could not be loaded.',action:'close',actionLabel:'Close'});}});
    this.el('btn-sound').addEventListener('click',()=>{const muted=this.audio.toggle();this.el('btn-sound').textContent=muted?'🔇 Muted':'♫ Sound';bus.emit('audio:unlock');});
    this.el('btn-next-wave').addEventListener('click',()=>this.core.continueRun());this.el('btn-reset').addEventListener('click',()=>this.core.restartStage());this.el('btn-potion').addEventListener('click',()=>this.core.usePotion());
    this.el('slot-weapon').addEventListener('click',()=>this.openPanel('inventory','weapon'));this.el('slot-armor').addEventListener('click',()=>this.openPanel('inventory','armor'));this.el('slot-shield').addEventListener('click',()=>this.openPanel('inventory','shield'));this.el('slot-boots').addEventListener('click',()=>this.openPanel('inventory','boots'));
    this.el('system-modal-close').addEventListener('click',()=>this.closeSystemModal());this.el('system-modal-secondary').addEventListener('click',()=>this.closeSystemModal());this.el('system-modal-primary').addEventListener('click',()=>this.handleModalAction());this.el('panel-modal-close').addEventListener('click',()=>this.closePanel());
    this.el('panel-modal-content').addEventListener('click',e=>{const btn=e.target.closest('[data-action]');if(!btn)return;const action=btn.dataset.action;if(action==='equip'){if(this.core.equip(btn.dataset.uid))this.openPanel('inventory');}else if(action==='upgrade'){if(this.core.upgrade(btn.dataset.skill))this.openPanel('skills');}else if(action==='summon'){this.openPanel('chests');}else if(action==='open-chest'){this.core.openChest(btn.dataset.chest,btn.dataset.method);this.openPanel('chests');}else if(action==='sell-gear'){this.core.sellGear(btn.dataset.uid);this.openPanel('inventory');}else if(action==='potion'){this.core.usePotion();this.openPanel('inventory');}else if(action==='buy-potion'){this.core.buyPotion(1);this.openPanel('inventory');}else if(action==='buy-diamond-pack'){this.core.buyDiamondPack(btn.dataset.pack);this.openPanel('skills');}});
    this.bindActionControl('btn-attack','input:attack');this.bindActionControl('btn-skill','input:skill');this.bindActionControl('btn-jump','input:jump');
    const guard=this.el('btn-guard');guard.addEventListener('pointerdown',e=>{e.preventDefault();bus.emit('audio:unlock');bus.emit('input:guard-start');try{guard.setPointerCapture(e.pointerId);}catch{}});const release=e=>{if(e)e.preventDefault();bus.emit('input:guard-end');};['pointerup','pointercancel','lostpointercapture'].forEach(ev=>guard.addEventListener(ev,release));guard.addEventListener('contextmenu',e=>e.preventDefault());
    this.bindJoystick();document.addEventListener('keydown',()=>bus.emit('audio:unlock'),{once:true});document.addEventListener('pointerdown',()=>bus.emit('audio:unlock'),{once:true});
  }
  bindActionControl(id,eventName){const el=this.el(id);el.addEventListener('pointerdown',e=>{e.preventDefault();bus.emit('audio:unlock');bus.emit(eventName);try{el.setPointerCapture(e.pointerId);}catch{}});el.addEventListener('contextmenu',e=>e.preventDefault());el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();bus.emit(eventName);}});}
  bindJoystick(){const pad=this.el('joystick'),knob=this.el('joystick-knob');let pointer=null;const move=e=>{if(pointer!==e.pointerId)return;const rect=pad.getBoundingClientRect(),cx=rect.left+rect.width/2,cy=rect.top+rect.height/2,dx=e.clientX-cx,dy=e.clientY-cy,max=rect.width*.31,dist=Math.max(1,Math.hypot(dx,dy)),scale=Math.min(1,max/dist),kx=dx*scale,ky=dy*scale;knob.style.transform=`translate(${kx}px,${ky}px)`;bus.emit('input:move',clamp(kx/max,-1,1));};const stop=e=>{if(pointer!==null&&(!e||e.pointerId===pointer)){pointer=null;knob.style.transform='translate(0,0)';bus.emit('input:move',0);}};pad.addEventListener('pointerdown',e=>{e.preventDefault();bus.emit('audio:unlock');pointer=e.pointerId;try{pad.setPointerCapture(e.pointerId);}catch{}move(e);});pad.addEventListener('pointermove',move);['pointerup','pointercancel','lostpointercapture'].forEach(ev=>pad.addEventListener(ev,stop));pad.addEventListener('contextmenu',e=>e.preventDefault());}
  render(s){this.el('gold-display').textContent=s.gold.toLocaleString();this.el('diamond-display').textContent=s.diamond.toLocaleString();this.el('hero-level').textContent=`LV ${s.level}`;this.el('stat-hp').textContent=`${s.currentHp} / ${s.maxHp}`;this.el('hp-fill').style.width=`${clamp(s.currentHp/s.maxHp*100,0,100)}%`;this.el('energy-value').textContent=`${Math.floor(s.energy)} / 100`;this.el('energy-fill').style.width=`${clamp(s.energy,0,100)}%`;this.el('xp-value').textContent=`${s.xp} / ${s.xpToNext}`;this.el('xp-fill').style.width=`${clamp(s.xp/s.xpToNext*100,0,100)}%`;this.el('stat-atk').textContent=s.atk;this.el('stat-def').textContent=s.def;this.el('stat-crit').textContent=`${Math.round(s.crit*100)}%`;this.el('kills-value').textContent=s.kills.toLocaleString();this.el('potion-count').textContent=`${s.potions} potions`;this.el('btn-potion').disabled=s.potions<=0||s.currentHp>=s.maxHp;this.el('btn-potion').style.opacity=this.el('btn-potion').disabled?'.45':'1';
    if(s.weapon){this.el('weapon-title').textContent=s.weapon.name;this.el('weapon-bonus').textContent=s.weapon.desc;this.el('weapon-rarity').textContent=(s.weapon.material||'STARTER').toUpperCase();}else{this.el('weapon-title').textContent='Empty-handed';this.el('weapon-bonus').textContent='No weapon equipped';this.el('weapon-rarity').textContent='EMPTY';}if(s.armor){this.el('armor-title').textContent=s.armor.name;this.el('armor-bonus').textContent=s.armor.desc;this.el('armor-rarity').textContent=(s.armor.material||'STARTER').toUpperCase();}else{this.el('armor-title').textContent='No armor';this.el('armor-bonus').textContent='No armor equipped';this.el('armor-rarity').textContent='EMPTY';}if(s.shield){this.el('shield-title').textContent=s.shield.name;this.el('shield-bonus').textContent=s.shield.desc;this.el('shield-material').textContent=(s.shield.material||'STARTER').toUpperCase();}else{this.el('shield-title').textContent='No shield';this.el('shield-bonus').textContent='No shield equipped';this.el('shield-material').textContent='EMPTY';}if(s.boots){this.el('boots-title').textContent=s.boots.name;this.el('boots-bonus').textContent=s.boots.desc;this.el('boots-material').textContent=(s.boots.material||'STARTER').toUpperCase();}else{this.el('boots-title').textContent='No boots';this.el('boots-bonus').textContent='No boots equipped';this.el('boots-material').textContent='EMPTY';}
    this.el('stage-number').textContent=s.stageId;this.el('total-stars-display').textContent=`${s.totalStars} ★`;this.el('chapter-label').textContent=`CHAPTER ${s.chapter}`;this.el('stage-title').textContent=`STAGE ${s.stageId} · ${s.stageName.toUpperCase()}`;this.el('stage-subtitle').textContent=s.stageDescription;this.el('stage-kind').textContent=s.stageKind;this.el('wave-text').textContent=`Wave ${s.waveIndex+1} / ${s.waveCount}`;this.el('enemies-left').textContent=`${s.enemiesRemaining} enemy${s.enemiesRemaining===1?'':'ies'} remaining`;this.el('wave-indicators').innerHTML=Array.from({length:s.waveCount},(_,i)=>`<span class="wave-dot ${i<s.waveIndex?'done':i===s.waveIndex?'current':''}"></span>`).join('');const canContinue=s.runStatus==='wave-cleared'||s.runStatus==='stage-cleared';this.el('btn-next-wave').disabled=!canContinue;this.el('btn-next-wave').textContent=s.runStatus==='stage-cleared'?'Next stage →':s.runStatus==='wave-cleared'?'Next wave →':s.runStatus==='defeat'?'Retry stage':'Clear current wave';this.el('combat-status').textContent=s.runStatus==='combat'?'COMBAT LIVE':s.runStatus==='wave-cleared'?'WAVE CLEARED':s.runStatus==='stage-cleared'?'STAGE CLEARED':s.runStatus==='defeat'?'DEFEATED':'READY';this.el('combat-status').style.color=s.runStatus==='defeat'?'#ff8297':canContinue?'#85efbd':'#8bdff0';this.el('combat-status').style.background=s.runStatus==='defeat'?'#371522':canContinue?'#172d2a':'#122b39';this.el('skill-label').textContent='SPIN';
  }
  renderStage(data){if(!data)return;this.el('stage-title').textContent=`STAGE ${data.stage.id} · ${data.stage.name.toUpperCase()}`;this.el('stage-subtitle').textContent=data.stage.description;}
  addLog(message){const log=this.el('combat-log'),item=document.createElement('div');item.className='log-entry';item.textContent=message;log.prepend(item);while(log.children.length>8)log.lastElementChild.remove();}
  showSystemModal(data){this.modalAction=data?.action||'close';this.el('system-modal-title').textContent=data?.title||'Arena Notice';this.el('system-modal-copy').textContent=[data?.subtitle||'',data?.message||''].filter(Boolean).join('\n\n');const action=this.el('system-modal-primary');action.textContent=data?.actionLabel||'Close';action.style.display=this.modalAction==='close'&&!data?.actionLabel?'none':'';this.el('system-modal').classList.add('open');}
  handleModalAction(){const action=this.modalAction;this.closeSystemModal();if(action==='continue')this.core.continueRun();else if(action==='retry')this.core.restartStage();}
  closeSystemModal(){this.el('system-modal').classList.remove('open');}
  showToast(message){const toast=this.el('toast');toast.textContent=message;toast.classList.add('show');if(this.toastTimer)clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>toast.classList.remove('show'),2400);}
  openPanel(kind,slotFilter=null){this.panelKind=kind;const s=this.core.getSnapshot(),content=this.el('panel-modal-content');this.el('panel-modal-title').textContent=kind==='inventory'?'Inventory & Equipment':kind==='skills'?'Skill Tree & Gem Exchange':'Star Milestone Chests';bus.emit('audio:mode','arena');
    if(kind==='inventory'){
      const items=s.ownedGear.filter(item=>!slotFilter||item.slot===slotFilter).sort((a,b)=>(b.tier||0)-(a.tier||0));
      content.innerHTML=`<p class="modal-copy" style="margin:0 0 12px">Equip owned gear or sell non-equipped chest gear for 30% of its chest price. Starter gear cannot be sold.</p><div class="panel-grid">${items.map(item=>{const equipped=s.equipped[item.slot]===item.uid;return `<article class="item-card"><span class="tag">${escapeHTML(item.material||'Starter')} · ${escapeHTML(item.slot)}</span><h3>${escapeHTML(item.name)} ${equipped?'✓':''}</h3><p>${escapeHTML(item.desc||'Equipment bonus')}</p><button class="${equipped?'secondary-btn':'top-btn primary'}" data-action="equip" data-uid="${escapeHTML(item.uid)}" ${equipped?'disabled':''}>${equipped?'Equipped':'Equip item'}</button><button class="secondary-btn" data-action="sell-gear" data-uid="${escapeHTML(item.uid)}" ${equipped||!item.sourceChest?'disabled':''}>${!item.sourceChest?'Starter gear · cannot sell':`Sell · ${CHEST_SELL_VALUE[item.sourceChest]||0} gold`}</button></article>`;}).join('')}</div><div class="card" style="margin-top:10px"><div class="row"><strong style="font-size:11px">Healing potions</strong><span class="gear-tag">${s.potions} / 99 remaining</span></div><p class="small-note">Restore up to 70 HP instantly in combat. Buy with gold or find in arena barrels and boss rewards.</p><div style="display:flex;gap:6px;margin-top:6px"><button class="top-btn primary" data-action="buy-potion" style="flex:1" ${s.gold<POTION_RULES.goldCost||s.potions>=POTION_RULES.maxPotions?'disabled':''}>Buy potion · ${POTION_RULES.goldCost} gold</button><button class="secondary-btn" data-action="potion" style="flex:1" ${s.potions<=0||s.currentHp>=s.maxHp?'disabled':''}>Use potion</button></div></div>`;
    }else if(kind==='skills'){
      const config=[['power','Power Training','Increase attack by +2 per rank.',280],['vitality','Vitality','Increase max HP by +12 per rank.',280],['whirlwind','Whirlwind Mastery','Increase spin damage and reduce cooldown.',400],['crit','Critical Edge','Increase critical chance by 1 percentage point per rank.',460]];
      content.innerHTML=`<div class="card" style="margin-bottom:12px"><div class="row"><strong style="font-size:12px">💎 Gem Exchange & Reset</strong><span class="currency gems"><b>${s.diamond} gems</b></span></div><p class="small-note" style="margin:4px 0 8px">Defeat chapter bosses to earn gems. Use gems to reset skills with 100% gold refund or buy emergency potion pouches.</p><div style="display:flex;gap:8px"><button class="secondary-btn" data-action="buy-diamond-pack" data-pack="potions" style="flex:1" ${s.diamond<DIAMOND_RULES.potionsPackCost?'disabled':''}>Alchemist Pouch (+3 Potions) · ${DIAMOND_RULES.potionsPackCost} 💎</button><button class="secondary-btn" data-action="buy-diamond-pack" data-pack="respec" style="flex:1" ${s.diamond<DIAMOND_RULES.respecCost?'disabled':''}>Skill Respec (100% Refund) · ${DIAMOND_RULES.respecCost} 💎</button></div></div><p class="modal-copy" style="margin:0 0 10px">Gold: <b style="color:var(--gold)">${s.gold.toLocaleString()}</b>. Permanent micro-stats saved with your profile.</p><div class="panel-grid">${config.map(([id,name,desc,base])=>{const level=s.skills[id],cost=base*(level+1);return `<article class="item-card"><span class="tag">RANK ${level} / 5</span><h3>${name}</h3><p>${desc}</p><button class="top-btn primary" data-action="upgrade" data-skill="${id}" ${level>=5||s.gold<cost?'disabled':''}>${level>=5?'MAX RANK':`Upgrade · ${cost} gold`}</button></article>`;}).join('')}</div>`;
    }else{
      const chestCards=s.chests.map(chest=>{
        const rewardText=chest.id==='wood'?'Wooden sword/stick · light wooden shield · woven grass shoes':chest.id==='iron'?'Short iron sword · long blade · iron spear · reinforced shield · chainmail/leather boots':'Dual steel daggers · warrior chain · long steel spear · full plate · steel boots';
        const locked=!chest.chapterUnlocked;
        return `<article class="item-card"><span class="tag">${locked?`CHAPTER ${chest.chapterRequired} LOCKED`:`AVAILABLE · OWNED ${chest.openedCount}`}</span><h3>${escapeHTML(chest.name)}</h3><p>${rewardText}. Equal odds across ${chest.items.length} reward categories. Price: ${chest.starCost} stars or ${chest.goldCost} gold.</p><button class="top-btn primary" data-action="open-chest" data-method="stars" data-chest="${chest.id}" ${locked||!chest.canPayStars?'disabled':''}>Buy with ${chest.starCost} ★</button><button class="secondary-btn" style="margin-top:6px" data-action="open-chest" data-method="gold" data-chest="${chest.id}" ${locked||!chest.canPayGold?'disabled':''}>Buy with ${chest.goldCost.toLocaleString()} gold</button></article>`;
      }).join('');
      content.innerHTML=`<div class="card" style="margin-bottom:10px"><div class="row"><strong style="font-size:12px">Star economy</strong><span class="currency"><b>${s.totalStars} earned ★</b></span></div><p class="small-note" style="margin:6px 0 0">Available stars: <b>${s.starBalance}</b> · Gold: <b>${s.gold.toLocaleString()}</b> · Unlocked through Chapter ${s.highestChapterUnlocked}. Stars spent on chests are deducted from the available balance but remain in lifetime progress. Replay gold rewards in older chapters are reduced by 50% after unlocking a later chapter.</p></div><div class="panel-grid">${chestCards}</div>`;
    }
    this.el('panel-modal').classList.add('open');
  }
  closePanel(){this.el('panel-modal').classList.remove('open');bus.emit('audio:mode','arena');}
}
 
// ============================================================================
// 7. OPTIONAL CAPACITOR BRIDGE — safely no-ops in a normal browser.
// Plugin modules can be exposed as window.CapacitorPlugins by a small app bootstrap;
// Capacitor 8 ESM exports are not guaranteed to exist on window by default.
// ============================================================================
const ImpactStyle={Heavy:'heavy',Medium:'medium'};
window.nativeBridge={
  async impact(style='medium'){try{const H=window.CapacitorPlugins?.Haptics||window.Capacitor?.Plugins?.Haptics||window.Haptics;if(H?.impact)await H.impact({style:style==='heavy'?ImpactStyle.Heavy:ImpactStyle.Medium});else if(navigator.vibrate)navigator.vibrate(style==='heavy'?55:22);}catch(err){console.info('Haptics unavailable.',err);}},
  initAppLifecycle(){try{const App=window.CapacitorPlugins?.App||window.Capacitor?.Plugins?.App||window.App;if(App?.addListener)App.addListener('appStateChange',({isActive})=>{const scene=window.gameScene;if(!scene)return;if(isActive){scene.scene.resume();window.audioEngine?.resume();}else{scene.scene.pause();window.audioEngine?.suspend();}});}catch(err){console.info('Capacitor App lifecycle listener unavailable.',err);}}
};
document.addEventListener('visibilitychange',()=>{const scene=window.gameScene;if(!scene)return;if(document.hidden){scene.scene.pause();window.audioEngine?.suspend();}else{scene.scene.resume();window.audioEngine?.resume();}});
 
// ============================================================================
// 8. BOOTSTRAP.
// ============================================================================
function bootGame(){
  if(window.__gameBooted) return;
  window.__gameBooted = true;
  if(!window.Phaser){document.getElementById('system-modal-title').textContent='Phaser failed to load';document.getElementById('system-modal-copy').textContent='Phaser 3 could not be loaded.';document.getElementById('system-modal').classList.add('open');return;}
  window.gameCore=new GameCoreManager();window.audioEngine=new AudioEngine();window.uiController=new UIController(window.gameCore,window.audioEngine);
  const config={type:Phaser.AUTO,width:960,height:540,parent:'game-container',backgroundColor:'#0b1020',physics:{default:'arcade',arcade:{gravity:{y:0},debug:false}},scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH},render:{antialias:false,roundPixels:true,powerPreference:'low-power'},fps:{target:60,forceSetTimeOut:false},scene:[CombatScene]};
  try{window.game=new Phaser.Game(config);window.nativeBridge.initAppLifecycle();}catch(err){console.error(err);document.getElementById('system-modal-title').textContent='Game initialization failed';document.getElementById('system-modal-copy').textContent=err.message||String(err);document.getElementById('system-modal').classList.add('open');}
}
if(document.readyState==='loading'){
  window.addEventListener('DOMContentLoaded',bootGame);
  window.addEventListener('load',bootGame);
}else{
  bootGame();
}
 