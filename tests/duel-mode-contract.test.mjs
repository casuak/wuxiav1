import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const modeSource = await readFile(
  new URL("../app/game/duelInnGame.ts", import.meta.url),
  "utf8",
);
const combatSource = await readFile(
  new URL("../app/game/duelCombatScene.ts", import.meta.url),
  "utf8",
);
const innSource = await readFile(
  new URL("../app/game/deckInnGame.ts", import.meta.url),
  "utf8",
);
const swordsmanAtlas = await readFile(
  new URL("../public/assets/combat/swordsman-turn-poses.png", import.meta.url),
);
const boxerAtlas = await readFile(
  new URL("../public/assets/combat/boxer-turn-poses.png", import.meta.url),
);
const swordsmanUpAtlas = await readFile(
  new URL("../public/assets/combat/swordsman-turn-poses-up.png", import.meta.url),
);
const boxerDownAtlas = await readFile(
  new URL("../public/assets/combat/boxer-turn-poses-down.png", import.meta.url),
);
const courtyardBackground = await readFile(
  new URL("../public/assets/combat/duel-courtyard-bg.png", import.meta.url),
);

const pngSize = (buffer) => ({
  width: buffer.readUInt32BE(16),
  height: buffer.readUInt32BE(20),
});

test("the inn mode remains available beside the rebuilt turn duel", () => {
  assert.match(modeSource, /export class InnModeSelectScene/);
  assert.match(combatSource, /export class DuelInnScene/);
  assert.match(modeSource, /this\.scene\.start\("inn-deckbuilder"\)/);
  assert.match(modeSource, /this\.scene\.start\("inn-duel"\)/);
  assert.match(modeSource, /label: "回合制"/);
  assert.match(modeSource, /双职业卡池 · 相对距离 · 公开博弈 · 三绝式/);
  assert.match(innSource, /scene: \[InnModeSelectScene, DeckInnScene, DuelInnScene\]/);
});

test("combat runs through explicit planning resolving review and ended phases", () => {
  assert.match(combatSource, /type BattlePhase = "intro" \| "planning" \| "resolving" \| "review" \| "ended"/);
  assert.match(combatSource, /private async startResolution\(\)/);
  assert.match(combatSource, /this\.phase = "resolving"/);
  assert.match(combatSource, /await this\.resolveBeat\(beat, token\)/);
  assert.match(combatSource, /this\.phase = "review"/);
  assert.match(combatSource, /private async nextRound\(\)/);
  assert.match(combatSource, /this\.phase = "ended"/);
});

test("each round reveals exactly two enemy intents before the player commits", () => {
  assert.match(combatSource, /const PLAN_LIMIT = 2/);
  assert.match(combatSource, /private chooseEnemyPlan\(\): ActionId\[\]/);
  assert.match(combatSource, /this\.enemyPlan = this\.chooseEnemyPlan\(\)/);
  assert.match(combatSource, /this\.text\(204, 130, "敌招\\n意图"/);
  assert.match(combatSource, /this\.enemyPlan\.forEach\(\(actionId, index\)/);
  assert.match(combatSource, /敌招已明/);
});

test("every revealed enemy action opens a concrete effect inspector", () => {
  assert.match(combatSource, /this\.add\.rectangle\(204, 130, 50, 34/);
  assert.match(combatSource, /private openIntentIndex: number \| null = null/);
  assert.match(combatSource, /body\.on\("pointerup", \(\) => \{[\s\S]*?this\.showEnemyIntentDetail\(index\)/);
  assert.match(combatSource, /private renderIntentDetail\(\)/);
  assert.match(combatSource, /`第\$\{this\.openIntentIndex \+ 1\}拍 · \$\{action\.title\}`/);
  assert.match(combatSource, /description = this\.text\([\s\S]*?action\.description/);
  assert.match(combatSource, /"收起"/);
});

test("opening role choice swaps the complete boxer or swordsman combat kit instead of buffs", () => {
  assert.match(combatSource, /type PlayerProfessionId = FighterId/);
  assert.match(combatSource, /const PLAYER_PROFESSIONS: Record<PlayerProfessionId, ProfessionDef>/);
  assert.match(combatSource, /boxer: \{[\s\S]*?fighterId: "boxer"[\s\S]*?portraitTexture: "duel-boxer-down"/);
  assert.match(combatSource, /swordsman: \{[\s\S]*?fighterId: "swordsman"[\s\S]*?portraitTexture: "duel-swordsman-down"/);
  assert.match(combatSource, /label: "拳师"/);
  assert.match(combatSource, /label: "剑客"/);
  assert.doesNotMatch(combatSource, /label: "护院"|label: "游侠"|passive:/);
  assert.match(combatSource, /private applyProfessionChoice\(professionId: PlayerProfessionId\)/);
  assert.match(combatSource, /this\.player\.id = profession\.fighterId/);
  assert.match(combatSource, /this\.player\.rig\.setArchetype\(profession\.fighterId, "up", fighterTexture\(profession\.fighterId, "up"\)\)/);
  assert.match(combatSource, /this\.enemy\.rig\.setArchetype\(rival\.fighterId, "down", fighterTexture\(rival\.fighterId, "down"\)\)/);
  assert.match(combatSource, /this\.player\.maxHp = profession\.maxHp/);
  assert.match(combatSource, /人物、动作、牌库与三门绝式都会改变/);
  assert.match(combatSource, /this\.add\.image\(94, y, definition\.portraitTexture, 0\)/);
});

test("advance and retreat are permanent ordered actions outside the draw pile", () => {
  assert.match(combatSource, /const FIXED_ADVANCE_UID = -1/);
  assert.match(combatSource, /const FIXED_RETREAT_UID = -2/);
  assert.match(combatSource, /const FIXED_ACTIONS = new Map<number, ActionId>/);
  assert.match(combatSource, /this\.selectPlanChoice\(choice\.uid\)/);
  assert.match(combatSource, /const fixed = FIXED_ACTIONS\.get\(uid\)/);
  assert.match(combatSource, /if \(fixed\) return fixed/);
  assert.match(combatSource, /this\.playerPlan = this\.selectedIds[\s\S]*?\.map\(\(uid\) => this\.actionIdForChoice\(uid\)\)/);
  assert.match(combatSource, /const used = this\.hand\.filter\(\(card\) => this\.selectedIds\.includes\(card\.uid\)\)/);
  assert.match(combatSource, /"常驻"/);
});

test("the player always chooses two ordered cards from a compact four-card hand", () => {
  assert.match(combatSource, /const HAND_LIMIT = 4/);
  assert.match(combatSource, /while \(this\.hand\.length < HAND_LIMIT\)/);
  assert.match(combatSource, /candidateIds\.length < PLAN_LIMIT/);
  assert.match(combatSource, /candidateIds\.shift\(\)/);
  assert.match(combatSource, /candidateIds\.push\(uid\)/);
  assert.match(combatSource, /this\.selectedIds\.length === PLAN_LIMIT/);
  assert.match(combatSource, /this\.discard\.push\(\.\.\.used\)/);
  assert.match(combatSource, /Phaser\.Utils\.Array\.Shuffle\(this\.discard\.splice\(0\)\)/);
  assert.doesNotMatch(combatSource, /actionPoints|energyCost|cardCost/);
});

test("card order creates concrete two-beat schools instead of a flat card queue", () => {
  assert.match(combatSource, /function comboFor\(first: ActionDef, second: ActionDef\): ComboKind/);
  assert.match(combatSource, /first\.id === "advance" && isAttack\(second\).*?"press"/s);
  assert.match(combatSource, /first\.type === "guard" && isAttack\(second\).*?"counter"/s);
  assert.match(combatSource, /first\.id === "retreat" && isAttack\(second\).*?"bait"/s);
  assert.match(combatSource, /first\.type === "parry" && isAttack\(second\).*?"borrow"/s);
  assert.match(combatSource, /isAttack\(first\) && isAttack\(second\).*?"chain"/s);
  assert.match(combatSource, /强入破门/);
  assert.match(combatSource, /守中反打/);
  assert.match(combatSource, /引空回击/);
  assert.match(combatSource, /借力打力/);
});

test("distance is a discrete battlefield fact shared by movement and attack ranges", () => {
  assert.match(combatSource, /const MIN_DISTANCE = 1/);
  assert.match(combatSource, /const MAX_DISTANCE = 4/);
  assert.match(combatSource, /distanceDelta: -1/);
  assert.match(combatSource, /distanceDelta: 1/);
  assert.match(combatSource, /minRange: 1,[\s\S]*?maxRange: 1/);
  assert.match(combatSource, /"enemy-thrust"[\s\S]*?minRange: 2,[\s\S]*?maxRange: 3/);
  assert.match(combatSource, /const inRange = this\.distance >= minRange && this\.distance <= maxRange/);
  assert.match(combatSource, /距离\$\{this\.distance\}步/);
});

test("each beat resolves by visible speed and can interrupt a later action", () => {
  assert.match(combatSource, /type ActionDef = \{[\s\S]*?speed: 1 \| 2 \| 3 \| 4/);
  assert.match(combatSource, /const playerFirst = playerAction\.speed > enemyAction\.speed/);
  assert.match(combatSource, /playerAction\.speed === enemyAction\.speed && this\.round % 2 === 1/);
  assert.match(combatSource, /actor\.staggeredBeat === beat/);
  assert.match(combatSource, /target\.staggeredBeat = beat \+ 1/);
  assert.match(combatSource, /后一招被震散/);
});

test("guard damage health and momentum all change concrete on-screen state", () => {
  assert.match(combatSource, /actor\.guard \+= \(action\.guard \?\? 0\) \+ bonus/);
  assert.match(combatSource, /const broken = action\.pierceGuard \? target\.guard : Math\.min\(target\.guard, guardBreak\)/);
  assert.match(combatSource, /const blocked = action\.pierceGuard \? 0 : Math\.min\(target\.guard, damage\)/);
  assert.match(combatSource, /target\.hp = Math\.max\(0, target\.hp - hpDamage\)/);
  assert.match(combatSource, /this\.player\.momentum = Math\.min\(MAX_MOMENTUM, this\.player\.momentum \+ gain\)/);
  assert.match(combatSource, /this\.playerHud\.formTexts\.forEach/);
  assert.match(combatSource, /hud\.hpFill, displayWidth/);
  assert.match(combatSource, /this\.spawnFloat\(target\.rig\.root\.x[\s\S]*?`-\$\{hpDamage\}`/);
});

test("the two roles own different decks while all six ultimates stay outside the draw pile", () => {
  assert.match(combatSource, /boxer: \{[\s\S]*?ultimates: \["boxer-ultimate", "boxer-lock-ultimate", "boxer-counter-ultimate"\][\s\S]*?deck: \["guard", "guard", "parry", "parry", "punch", "punch", "elbow", "intercept", "break"\]/);
  assert.match(combatSource, /swordsman: \{[\s\S]*?ultimates: \["sword-ultimate", "sword-stars-ultimate", "sword-counter-ultimate"\][\s\S]*?deck: \["sword-guard", "sword-guard", "sword-parry", "sword-probe", "sword-probe", "sword-thrust", "sword-thrust", "sword-sweep", "sword-sheathe"\]/);
  assert.match(combatSource, /const FIXED_ULTIMATE_UIDS = \[-11, -12, -13\] as const/);
  assert.match(combatSource, /return this\.playerProfession\.ultimates\[ultimateIndex\]/);
  assert.doesNotMatch(combatSource, /findIndex\(\(card\) => ACTIONS\[card\.actionId\]\.ultimate\)/);
});

test("successful cards keep a compact form pool while ultimates span fast advanced and heavy thresholds", () => {
  assert.match(combatSource, /private formTrail: FormGlyph\[\] = \[\]/);
  assert.match(combatSource, /requiresForms: \["架", "化", "冲"\][\s\S]*?requiresMomentum: 4/);
  assert.match(combatSource, /requiresForms: \["探", "封", "刺"\][\s\S]*?requiresMomentum: 4/);
  assert.equal((combatSource.match(/ultimate: true/g) ?? []).length, 6);
  assert.match(combatSource, /requiresForms: \["截", "肘"\][\s\S]*?requiresMomentum: 3/);
  assert.match(combatSource, /requiresForms: \["架", "化"\][\s\S]*?requiresMomentum: 2/);
  assert.match(combatSource, /requiresForms: \["藏", "刺"\][\s\S]*?requiresMomentum: 3/);
  assert.match(combatSource, /requiresForms: \["封", "化"\][\s\S]*?requiresMomentum: 2/);
  assert.match(combatSource, /function ultimateTier\(action: ActionDef\)/);
  assert.match(combatSource, /return "重绝"[\s\S]*?return "进阶"[\s\S]*?return "速绝"/);
  assert.match(combatSource, /`\$\{tier\}·\$\{recipe\}·\$\{action\.requiresMomentum\}势`/);
  assert.match(combatSource, /private projectedTrailBefore\(plan: ActionId\[\], index: number\)/);
  assert.match(combatSource, /private projectedMomentumBefore\(plan: ActionId\[\], index: number\)/);
  assert.match(combatSource, /private projectedDistanceBefore\(plan: ActionId\[\], index: number\)/);
  assert.match(combatSource, /this\.formTrail = this\.formTrail\.slice\(-3\)/);
  assert.match(combatSource, /const missing = required\.filter\(\(glyph\) => !trail\.includes\(glyph\)\)/);
  assert.doesNotMatch(combatSource, /suffix\[index\] !== glyph/);
  assert.match(combatSource, /顺序不限/);
  assert.match(combatSource, /this\.actionLockReason\(action, this\.formTrail, actor\.momentum, this\.distance\)/);
  assert.match(combatSource, /未成式：\$\{reason\}/);
});

test("new cards create intent counterplay rather than only larger numbers", () => {
  assert.match(combatSource, /title: "截步拦门"[\s\S]*?interceptsMove: true/);
  assert.match(combatSource, /opposingAction\?\.type === "move"[\s\S]*?target\.staggeredBeat = beat/);
  assert.match(combatSource, /title: "点剑问路"[\s\S]*?punishesGuard: 8/);
  assert.match(combatSource, /action\.punishesGuard && target\.guard > 0/);
  assert.match(combatSource, /action\.bonusAfterForm && this\.formTrail\.at\(-1\) === action\.bonusAfterForm/);
  assert.match(combatSource, /if \(this\.enemy\.id === "boxer"\)/);
});

test("each class ultimate consumes its built state and plays a staged multi-hit finisher", () => {
  assert.match(combatSource, /title: "六合·炮捶"[\s\S]*?multiHit: \[6, 7, 13\]/);
  assert.match(combatSource, /title: "一剑·天门开"[\s\S]*?multiHit: \[5, 7, 12\]/);
  assert.match(combatSource, /actor\.momentum = Math\.max\(0, actor\.momentum - \(action\.consumeMomentum \?\? 0\)\)/);
  assert.match(combatSource, /private async animateUltimateCharge/);
  assert.match(combatSource, /for \(let index = 0; index < action\.multiHit\.length; index \+= 1\)/);
  assert.match(combatSource, /this\.cameras\.main\.flash/);
});

test("ultimate details explain the full concrete settlement and stay open until an outside tap", () => {
  assert.match(combatSource, /function ultimateEffectLines\(action: ActionDef\)/);
  assert.match(combatSource, /消耗｜发动时扣除\$\{action\.consumeMomentum \?\? 0\}势，并清空全部已存招式/);
  assert.match(combatSource, /反击｜直接回敬\$\{action\.counterDamage\}点生命伤害，不经过护架/);
  assert.match(combatSource, /护架｜先清空全部护架，且本击伤害不被护架抵消/);
  assert.match(combatSource, /封招｜造成生命伤害后，封掉对手下一手/);
  assert.match(combatSource, /流血｜命中后施加\$\{action\.bleed\}层/);
  assert.match(combatSource, /private openUltimateIndex: number \| null = null/);
  assert.match(combatSource, /private renderUltimateDetail\(\)/);
  assert.match(combatSource, /"完整结算"/);
  assert.match(combatSource, /"点面板外收起"/);
  assert.match(combatSource, /this\.input\.on\("pointerup", this\.handleScenePointerUp, this\)/);
  assert.match(combatSource, /this\.ultimateDetailPanel\?\.getBounds\(\)\.contains\(pointer\.worldX, pointer\.worldY\)/);
  assert.match(combatSource, /if \(!tappedUltimate\) this\.hideUltimateDetail\(\)/);
  const persistentPanel = combatSource.match(
    /private renderUltimateDetail\(\) \{([\s\S]*?)\n  private handleScenePointerUp/,
  )?.[1] ?? "";
  assert.doesNotMatch(persistentPanel, /delayedCall|tweens\.add|showCallout/);
});

test("retreat parry and counter rewards are resolved rather than merely described", () => {
  assert.match(combatSource, /actor\.evadeBeat = beat/);
  assert.match(combatSource, /const dodged = target\.evadeBeat === beat && action\.speed < 4/);
  assert.match(combatSource, /actor\.parryReady = true/);
  assert.match(combatSource, /if \(target\.parryReady\)/);
  assert.match(combatSource, /target\.momentum = Math\.min\(MAX_MOMENTUM, target\.momentum \+ 2\)/);
  assert.match(combatSource, /this\.roundEvents\.playerParried = true/);
  assert.match(combatSource, /this\.roundEvents\.enemyMissed = true/);
});

test("combat uses four directional pose sheets instead of mirroring one orientation", () => {
  assert.deepEqual(pngSize(swordsmanAtlas), { width: 1024, height: 1024 });
  assert.deepEqual(pngSize(boxerAtlas), { width: 1024, height: 1024 });
  assert.deepEqual(pngSize(swordsmanUpAtlas), { width: 1024, height: 1024 });
  assert.deepEqual(pngSize(boxerDownAtlas), { width: 1024, height: 1024 });
  assert.match(combatSource, /"duel-swordsman-down"/);
  assert.match(combatSource, /"duel-swordsman-up"/);
  assert.match(combatSource, /"duel-boxer-down"/);
  assert.match(combatSource, /"duel-boxer-up"/);
  assert.match(combatSource, /type Facing = "up" \| "down"/);
  assert.match(combatSource, /fighterTexture\(rival\.fighterId, "down"\)/);
  assert.match(combatSource, /fighterTexture\(profession\.fighterId, "up"\)/);
  assert.match(combatSource, /frameWidth: 512, frameHeight: 512/);
  assert.match(combatSource, /class PoseFighter/);
  assert.match(combatSource, /setPose\(frame: 0 \| 1 \| 2 \| 3\)/);
  assert.match(combatSource, /this\.sprite[\s\S]*?\.setFrame\(frame\)[\s\S]*?\.setDisplaySize\(FIGHTER_DISPLAY_SIZE, FIGHTER_DISPLAY_SIZE\)/);
  assert.doesNotMatch(combatSource, /class JointFighter|this\.joint\(|setRotation\(Math\.PI\)/);
});

test("mobile combat layout keeps every pose bounded and preserves a readable arena gap", () => {
  assert.match(combatSource, /const FIGHTER_DISPLAY_SIZE = 104/);
  assert.match(combatSource, /private applyPoseFrame\(frame: 0 \| 1 \| 2 \| 3\)/);
  assert.match(combatSource, /const CONTACT_SEPARATION = 94/);
  assert.match(combatSource, /const DISTANCE_STEP_PIXELS = 22/);
  assert.match(combatSource, /return CONTACT_SEPARATION \+ \(clampDistance\(distance\) - 1\) \* DISTANCE_STEP_PIXELS/);
  assert.match(combatSource, /this\.root\.setScale\(1\)\.setRotation\(0\)/);
  assert.doesNotMatch(combatSource, /this\.sprite\.setPosition\(0, 0\)\.setRotation\(0\)\.setScale\(1\)/);
  assert.match(combatSource, /this\.add\.rectangle\(380, beatY, 56, 23/);
  assert.match(combatSource, /this\.add\.rectangle\(215, 778, 390, 98/);
});

test("fighter shadows follow per-pose foot anchors instead of one guessed offset", () => {
  assert.match(combatSource, /const POSE_METRICS: Record<`\$\{FighterId\}-\$\{Facing\}`/);
  assert.match(combatSource, /"swordsman-up": \[[\s\S]*?footX: 281, footY: 493/);
  assert.match(combatSource, /"boxer-down": \[[\s\S]*?footX: 270, footY: 467/);
  assert.match(combatSource, /this\.spriteBaseY = \(256 - metric\.footY\) \* sourceScale/);
  assert.match(combatSource, /this\.shadow\.setPosition\(0, 0\)\.setDisplaySize\(metric\.shadowWidth, metric\.shadowHeight\)/);
  assert.match(combatSource, /metric\.shadowWidth \+ 14/);
  assert.match(combatSource, /get groundY\(\)/);
  assert.match(combatSource, /return this\.root\.y/);
});

test("combat labels and cards keep dedicated non-overlapping mobile bands", () => {
  assert.match(combatSource, /setFixedSize\(294, 14\)/);
  assert.match(combatSource, /fillRoundedRect\(14, 646, 402, 58, 7\)/);
  assert.match(combatSource, /"职业绝式 · 固定行动"/);
  assert.match(combatSource, /fillRoundedRect\(14, 706, 402, 21, 5\)/);
  assert.match(combatSource, /const y = selected \? 775 : 779/);
  assert.match(combatSource, /this\.add\.rectangle\(0, 0, 94, 98/);
  assert.match(combatSource, /this\.add\.rectangle\(204, 130, 50, 34/);
  assert.match(combatSource, /const x = 270 \+ index \* 82/);
});

test("visual distance stays symmetrically locked to the vertical center of the arena", () => {
  assert.match(combatSource, /const ARENA_CENTER_Y = \(ARENA_TOP \+ ARENA_BOTTOM\) \/ 2/);
  assert.match(combatSource, /ARENA_CENTER_Y - separation \/ 2,[\s\S]*?ARENA_CENTER_Y \+ separation \/ 2/);
  assert.match(combatSource, /Math\.abs\(this\.player\.rig\.homePosition\.y - this\.enemy\.rig\.homePosition\.y\)/);
  assert.match(combatSource, /const \[enemyY, playerY\] = this\.positionsForDistance\(requested\)/);
  assert.match(combatSource, /await Promise\.all\(\[[\s\S]*?actor\.rig\.root,[\s\S]*?other\.rig\.root/);
  assert.match(combatSource, /this\.distance = requested/);
  assert.match(combatSource, /this\.distanceText\.setY\(ARENA_CENTER_Y\)/);
  assert.match(combatSource, /this\.arenaCenterMarker\?\.setY\(ARENA_CENTER_Y\)/);
  assert.doesNotMatch(combatSource, /relativeCenterY|ARENA_INITIAL_CENTER_Y|MIN_GROUND_Y|MAX_GROUND_Y/);
});

test("combat callouts stay in the arena top-left instead of covering the relative center", () => {
  assert.match(combatSource, /const CALLOUT_X = 26/);
  assert.match(combatSource, /const CALLOUT_Y = 190/);
  assert.match(combatSource, /this\.arenaCallout = this\.text\(CALLOUT_X, CALLOUT_Y/);
  assert.match(combatSource, /align: "left"/);
  assert.match(combatSource, /\.setOrigin\(0, 0\)\.setDepth\(160\)/);
  assert.match(combatSource, /\.setPosition\(CALLOUT_X, CALLOUT_Y\)/);
  assert.doesNotMatch(combatSource, /this\.arenaCallout\?\.setY\(relativeCenter\)/);
});

test("generated courtyard art and concrete fixed-ultimate mechanisms are wired into combat", () => {
  assert.deepEqual(pngSize(courtyardBackground), { width: 1206, height: 1002 });
  assert.match(combatSource, /this\.load\.image\("duel-courtyard"/);
  assert.match(combatSource, /this\.add\.image\(215, \(ARENA_TOP \+ ARENA_BOTTOM\) \/ 2, "duel-courtyard"\)/);
  assert.match(combatSource, /title: "擒龙·锁脉"[\s\S]*?suppressActions: 1/);
  assert.match(combatSource, /actor\.sealedActions > 0/);
  assert.match(combatSource, /title: "金刚·反震"[\s\S]*?counterDamage: 14/);
  assert.match(combatSource, /title: "七星·连珠"[\s\S]*?bleed: 3/);
  assert.match(combatSource, /title: "回光·燕返"[\s\S]*?counterDamage: 16/);
  assert.match(combatSource, /fighter\.hp = Math\.max\(0, fighter\.hp - bleedDamage\)/);
});

test("guard stance uses a restrained gradient veil and separately stroked broken arcs", () => {
  assert.match(combatSource, /const GUARD_VEIL_TEXTURE = "duel-guard-veil"/);
  assert.match(combatSource, /context\.createRadialGradient/);
  assert.match(combatSource, /this\.guardVeil = scene\.add\.image/);
  assert.match(combatSource, /this\.guardArc = scene\.add\.graphics/);
  assert.match(combatSource, /this\.guardArc\.arc\(0, 0, 44, -2\.82, -2\.06/);
  assert.match(combatSource, /this\.guardArc\.strokePath\(\);\n\s*this\.guardArc\.beginPath\(\);/);
  assert.match(combatSource, /this\.guardArc\.postFX\.addGlow\(TEAL, 0\.9/);
  assert.match(combatSource, /this\.root\.add\(\[[\s\S]*?this\.guardVeil,[\s\S]*?this\.sprite,[\s\S]*?this\.guardArc/);
  assert.match(combatSource, /private spawnGuardImpact/);
  assert.match(combatSource, /const moteAngles = \[-2\.52, -1\.86, -0\.48, 0\.24, 1\.24\]/);
  assert.match(combatSource, /target\.rig\.pulseShield\(\)/);
  assert.doesNotMatch(combatSource, /guardBubbleFill|guardBubbleRim|guardBubbleGlint/);
  assert.doesNotMatch(combatSource, /\.add\.shader\(|BaseShader|GameObjects\.Shader/);
  assert.match(combatSource, /fighter\.rig\.setGuarded\(fighter\.guard > 0\)/);
});

test("sword and fist hit geometry uses transparent-safe glow post effects", () => {
  assert.match(combatSource, /if \(actor\.id === "swordsman"\)/);
  assert.match(combatSource, /g\.fillStyle\(accent, 0\.22\)\.fillEllipse/);
  assert.match(combatSource, /g\.postFX\.addGlow\(/);
  assert.match(combatSource, /action\.ultimate \? 3\.1 : 1\.55/);
  assert.match(combatSource, /\.setPosition\(target\.rig\.root\.x, target\.rig\.root\.y - 48\)/);
  assert.doesNotMatch(combatSource, /SWORD_STRIKE_FRAGMENT_SHADER|FIST_IMPACT_FRAGMENT_SHADER|spawnAttackShader/);
});

test("combat effects use body and contact anchors with mobile-readable contrast", () => {
  assert.match(combatSource, /\.setPosition\(actor\.rig\.root\.x, actor\.rig\.root\.y - 48\)/);
  assert.match(combatSource, /const chargeY = actor\.rig\.root\.y - 48/);
  assert.match(combatSource, /target\.rig\.root\.y - 48, 24, TEAL, 0\.14/);
  assert.match(combatSource, /this\.guardArc\.lineStyle\(3\.4, INK, 0\.24\)/);
  assert.match(combatSource, /\.setAlpha\(0\.76 \+ breath \* 0\.055 \+ impact \* 0\.2\)/);
  assert.match(combatSource, /ripple\.lineStyle\(3, TEAL, 0\.98\)/);
  assert.match(combatSource, /g\.lineStyle\(2\.8, accent, 0\.64\)/);
});

test("enemy intents expose colored damage defense movement and control tokens", () => {
  assert.match(combatSource, /function intentEffectTokens\(action: ActionDef\)/);
  assert.match(combatSource, /label: `伤\$\{action\.damage\}`, color: RED/);
  assert.match(combatSource, /label: `护\$\{action\.guard\}`, color: DEFENSE_BROWN/);
  assert.match(combatSource, /action\.distanceDelta < 0 \? "↓1" : "↑1"/);
  assert.match(combatSource, /label: `破\$\{action\.guardBreak\}`, color: DEFENSE_BROWN/);
  assert.match(combatSource, /if \(action\.stagger\) tokens\.push\(\{ label: "断", color: RED \}\)/);
  assert.match(combatSource, /const pill = this\.add\.rectangle\(tokenX, 141, width, 12/);
});

test("animated resolution makes movement misses blocks parries and hits legible", () => {
  assert.match(combatSource, /private async animateDistanceChange/);
  assert.match(combatSource, /private async animateGuard/);
  assert.match(combatSource, /private async animateParry/);
  assert.match(combatSource, /private async animateMiss/);
  assert.match(combatSource, /private async animateParriedStrike/);
  assert.match(combatSource, /private async animateImpact/);
  assert.match(combatSource, /this\.cameras\.main\.shake/);
  assert.match(combatSource, /this\.spawnStrike\(actor, target, action, accent\)/);
  assert.match(combatSource, /private spawnActionFocus/);
  assert.match(combatSource, /private spawnMotionStreaks/);
  assert.match(combatSource, /const actorHome = actor\.rig\.homePosition/);
  assert.match(combatSource, /target\.rig\.root,[\s\S]*?recoilDirection \* recoil/);
});

test("each beat presents and completes one action before starting the next", () => {
  assert.match(combatSource, /for \(let actionIndex = 0; actionIndex < order\.length; actionIndex \+= 1\)/);
  assert.match(combatSource, /await this\.presentActionCue\(actor, action, index, actionIndex, token\)/);
  assert.match(combatSource, /await this\.executeAction\(actor, target, action, index, record, token\)/);
  assert.match(combatSource, /await this\.wait\(MOTION_ENABLED \? 180 : 1, token\)/);
  assert.match(combatSource, /`\$\{beat \+ 1\}拍 · \$\{actionIndex \+ 1\}手/);
});

test("the finished round stays open for selectable beat-by-beat review", () => {
  assert.match(combatSource, /type BeatRecord = \{/);
  assert.match(combatSource, /this\.records\[index\] = record/);
  assert.match(combatSource, /if \(this\.phase === "review" && this\.records\[index\]\)/);
  assert.match(combatSource, /this\.renderReviewPanel\(this\.activeBeat < 0 \? 0 : this\.activeBeat\)/);
  assert.match(combatSource, /"回合复盘 · 点上方拍位切换"/);
  assert.match(combatSource, /this\.confirmText\.setText\("下一回合"\)/);
});

test("defeat and victory create immediate restartable result states", () => {
  assert.match(combatSource, /if \(this\.player\.hp <= 0 \|\| this\.enemy\.hp <= 0\)/);
  assert.match(combatSource, /this\.finishBattle\(this\.enemy\.hp <= 0\)/);
  assert.match(combatSource, /if \(this\.phase === "ended"\) return/);
  assert.match(combatSource, /if \(this\.resultOverlay\) return/);
  assert.match(combatSource, /"再战一局"[\s\S]*?this\.scene\.restart\(\)/);
  assert.match(combatSource, /private resetRuntimeState\(\)/);
  assert.match(combatSource, /this\.resolutionToken \+= 1/);
});

test("high-density text and the paper shader preserve sharp mobile rendering", () => {
  assert.match(combatSource, /const TEXT_RESOLUTION = Math\.max\(2, RENDER_SCALE\)/);
  assert.match(combatSource, /\.setResolution\(TEXT_RESOLUTION\)/);
  assert.equal((combatSource.match(/texture2D\(uMainSampler, outTexCoord\)/g) ?? []).length, 1);
  assert.match(combatSource, /postPipelineClasses\.has\("DuelCombatPostFX"\)/);
  assert.match(combatSource, /this\.cameras\.main\.setPostPipeline\("DuelCombatPostFX"\)/);
  assert.doesNotMatch(combatSource, /fontSize: "[1-7]px"/);
});
