import * as Phaser from "phaser";

const WIDTH = 430;
const HEIGHT = 860;
const FONT = '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif';
const RENDER_SCALE = typeof window === "undefined"
  ? 1
  : Math.min(3, Math.max(1, Math.ceil(window.devicePixelRatio || 1)));
const TEXT_RESOLUTION = Math.max(2, RENDER_SCALE);
const MOTION_ENABLED = typeof window === "undefined"
  || !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const PAPER = 0xfff1bc;
const PAPER_LIGHT = 0xfff8d5;
const INK = 0x242219;
const RED = 0xb84336;
const TEAL = 0x367d73;
const OCHRE = 0xc58a35;
const DEFENSE_BROWN = 0x96612f;
const BOXER_ACCENT = 0xa94a35;
const SWORD_ACCENT = 0x2e7774;
const THIEF_ACCENT = 0x7d3f32;
const ARENA_TOP = 158;
const ARENA_BOTTOM = 492;
const ARENA_CENTER_Y = (ARENA_TOP + ARENA_BOTTOM) / 2;
const FIGHTER_X = 250;
const FIGHTER_DISPLAY_SIZE = 104;
const CONTACT_SEPARATION = 94;
const DISTANCE_STEP_PIXELS = 22;
const CALLOUT_X = 26;
const CALLOUT_Y = 190;
const MAX_MOMENTUM = 6;
const MAX_RETREAT = 2;
const HAND_LIMIT = 4;
const PLAN_LIMIT = 2;
const MIN_DISTANCE = 1;
const MAX_DISTANCE = 4;
const GUARD_VEIL_TEXTURE = "duel-guard-veil";

const DUEL_COMBAT_FRAGMENT_SHADER = [
  "#define SHADER_NAME TEN_DAY_INN_TURN_DUEL",
  "precision mediump float;",
  "uniform sampler2D uMainSampler;",
  "uniform vec2 uResolution;",
  "uniform float uTime;",
  "varying vec2 outTexCoord;",
  "float hash(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }",
  "void main() {",
  "  vec4 source = texture2D(uMainSampler, outTexCoord);",
  "  vec3 color = source.rgb;",
  "  float luminance = dot(color, vec3(0.299, 0.587, 0.114));",
  "  color = mix(vec3(luminance), color, 1.045);",
  "  color = (color - 0.5) * 1.04 + 0.5;",
  "  vec2 cell = floor(outTexCoord * uResolution * 0.5);",
  "  float grain = (hash(cell) - 0.5) * 0.011;",
  "  float breath = sin(uTime * 0.42) * 0.0015;",
  "  color += vec3(grain + breath, grain + breath * 0.72, grain * 0.58);",
  "  vec2 center = (outTexCoord - 0.5) * vec2(0.84, 1.0);",
  "  color *= 1.0 - smoothstep(0.47, 0.76, length(center)) * 0.06;",
  "  gl_FragColor = vec4(clamp(color, 0.0, 1.0), source.a);",
  "}",
].join("\n");

class DuelCombatPostFX extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game: Phaser.Game) {
    super({
      game,
      name: "DuelCombatPostFX",
      renderTarget: true,
      fragShader: DUEL_COMBAT_FRAGMENT_SHADER,
    });
  }

  onPreRender() {
    this.set2f("uResolution", this.renderer.width, this.renderer.height);
    this.set1f("uTime", this.game.loop.time / 1000);
  }
}

type FighterId = "boxer" | "swordsman" | "thief";
type Facing = "up" | "down";
type BattlePhase = "intro" | "planning" | "resolving" | "review" | "ended";
type ActionType = "move" | "guard" | "parry" | "attack";
type ComboKind = "press" | "counter" | "bait" | "borrow" | "chain" | "cover" | "probe" | "draw" | "ultimate" | "steady";
type FormGlyph = "架" | "化" | "冲" | "肘" | "崩" | "截" | "探" | "封" | "刺" | "斩" | "藏" | "伏" | "诈" | "刃" | "锁" | "夺" | "绝";
type ActionId =
  | "advance"
  | "retreat"
  | "guard"
  | "parry"
  | "punch"
  | "elbow"
  | "break"
  | "intercept"
  | "boxer-ultimate"
  | "boxer-lock-ultimate"
  | "boxer-counter-ultimate"
  | "sword-guard"
  | "sword-parry"
  | "sword-probe"
  | "sword-thrust"
  | "sword-sweep"
  | "sword-sheathe"
  | "sword-ultimate"
  | "sword-stars-ultimate"
  | "sword-counter-ultimate"
  | "thief-step"
  | "thief-retreat"
  | "thief-feint"
  | "thief-slash"
  | "thief-hook"
  | "thief-plunder"
  | "thief-break"
  | "thief-ultimate";

type PlayerProfessionId = "boxer" | "swordsman";
const DEFAULT_PLAYER_PROFESSION: PlayerProfessionId = "swordsman";
type EnemyTrigger = "move" | "guard" | "parry" | "attack";

type ActionDef = {
  id: ActionId;
  owner: FighterId | "universal";
  title: string;
  glyph: string;
  type: ActionType;
  speed: 1 | 2 | 3 | 4;
  description: string;
  distanceDelta?: -1 | 1;
  guard?: number;
  damage?: number;
  guardBreak?: number;
  minRange?: number;
  maxRange?: number;
  stagger?: boolean;
  knockback?: boolean;
  form?: FormGlyph;
  requiresForms?: readonly FormGlyph[];
  requiresMomentum?: number;
  consumeMomentum?: number;
  ultimate?: boolean;
  pierceGuard?: boolean;
  momentumGain?: number;
  interceptsMove?: boolean;
  punishesGuard?: number;
  bonusAfterForm?: FormGlyph;
  bonusDamage?: number;
  multiHit?: readonly number[];
  suppressActions?: number;
  counterDamage?: number;
  counterRetreat?: boolean;
  counterRetreatSelf?: boolean;
  bleed?: number;
  stealMomentum?: number;
  scatterForm?: number;
  punishesParry?: number;
};

type EnemyIntentPlan = {
  first: ActionId;
  defaultSecond: ActionId;
  branch?: {
    trigger: EnemyTrigger;
    action: ActionId;
    label: string;
  };
};

type IntentEffectToken = {
  label: string;
  color: number;
};

type CardInstance = {
  uid: number;
  actionId: ActionId;
};

type FighterState = {
  id: FighterId;
  name: string;
  subtitle: string;
  hp: number;
  maxHp: number;
  guard: number;
  momentum: number;
  retreat: number;
  parryReady: boolean;
  evadeBeat: number;
  staggeredBeat: number;
  sealedActions: number;
  counterDamage: number;
  counterRetreat: boolean;
  counterRetreatSelf: boolean;
  bleed: number;
  rig: PoseFighter;
};

type FighterHud = {
  rail: Phaser.GameObjects.Rectangle;
  nameText: Phaser.GameObjects.Text;
  subtitleText: Phaser.GameObjects.Text;
  hpFill: Phaser.GameObjects.Rectangle;
  hpText: Phaser.GameObjects.Text;
  guardText: Phaser.GameObjects.Text;
  statusText: Phaser.GameObjects.Text;
  momentumDots: Phaser.GameObjects.Arc[];
  formTexts: Phaser.GameObjects.Text[];
};

type PlanSlot = {
  body: Phaser.GameObjects.Rectangle;
  indexText: Phaser.GameObjects.Text;
  actionText: Phaser.GameObjects.Text;
};

type FixedActionControl = {
  uid: number;
  body: Phaser.GameObjects.Rectangle;
  labelText: Phaser.GameObjects.Text;
  hintText: Phaser.GameObjects.Text;
};

type UltimateActionControl = {
  uid: number;
  body: Phaser.GameObjects.Rectangle;
  glyphText: Phaser.GameObjects.Text;
  titleText: Phaser.GameObjects.Text;
  stateText: Phaser.GameObjects.Text;
};

type ProfessionDef = {
  id: PlayerProfessionId;
  label: string;
  fighterId: FighterId;
  portraitTexture: string;
  fighterName: string;
  subtitle: string;
  style: string;
  recipe: readonly FormGlyph[];
  ultimates: readonly [ActionId, ActionId, ActionId];
  maxHp: number;
  startingMomentum: number;
  accent: number;
  deck: ActionId[];
};

type EnemyDef = {
  label: string;
  fighterId: "thief";
  fighterName: string;
  subtitle: string;
  maxHp: number;
  accent: number;
};

type BeatRecord = {
  heading: string;
  playerAction: string;
  enemyAction: string;
  lines: string[];
};

type RoundEvents = {
  playerBlocked: boolean;
  playerParried: boolean;
  enemyMissed: boolean;
};

const ACTIONS: Record<ActionId, ActionDef> = {
  advance: {
    id: "advance",
    owner: "universal",
    title: "踏步进身",
    glyph: "进",
    type: "move",
    speed: 4,
    distanceDelta: -1,
    description: "抢近1步并恢复1点退路；接攻击可破护架。",
  },
  retreat: {
    id: "retreat",
    owner: "universal",
    title: "撤步引空",
    glyph: "退",
    type: "move",
    speed: 4,
    distanceDelta: 1,
    description: "消耗1点退路拉远1步；本拍闪开较慢攻击。",
  },
  guard: {
    id: "guard",
    owner: "boxer",
    title: "架肘听劲",
    glyph: "架",
    type: "guard",
    speed: 3,
    guard: 9,
    form: "架",
    momentumGain: 1,
    description: "架9护架、落“架”式并蓄1势。",
  },
  parry: {
    id: "parry",
    owner: "boxer",
    title: "云手化劲",
    glyph: "化",
    type: "parry",
    speed: 4,
    form: "化",
    momentumGain: 1,
    description: "化去下一击、打断后一招，并落“化”式。",
  },
  punch: {
    id: "punch",
    owner: "boxer",
    title: "冲拳探门",
    glyph: "冲",
    type: "attack",
    speed: 3,
    damage: 7,
    minRange: 1,
    maxRange: 1,
    form: "冲",
    momentumGain: 1,
    description: "贴身7伤，落“冲”式；是炮捶最后一手。",
  },
  elbow: {
    id: "elbow",
    owner: "boxer",
    title: "拗步顶肘",
    glyph: "肘",
    type: "attack",
    speed: 2,
    damage: 9,
    minRange: 1,
    maxRange: 1,
    stagger: true,
    form: "肘",
    bonusAfterForm: "冲",
    bonusDamage: 4,
    description: "贴身9伤；前式为“冲”则+4并打断后一招。",
  },
  break: {
    id: "break",
    owner: "boxer",
    title: "崩拳破架",
    glyph: "崩",
    type: "attack",
    speed: 1,
    damage: 12,
    guardBreak: 7,
    minRange: 1,
    maxRange: 1,
    knockback: true,
    form: "崩",
    description: "慢招12伤；先破7护架，再震退1步。",
  },
  intercept: {
    id: "intercept",
    owner: "boxer",
    title: "截步拦门",
    glyph: "截",
    type: "attack",
    speed: 4,
    damage: 5,
    minRange: 1,
    maxRange: 2,
    form: "截",
    interceptsMove: true,
    bonusDamage: 6,
    description: "快打5伤；撞上敌方步法时+6并当拍截停。",
  },
  "boxer-ultimate": {
    id: "boxer-ultimate",
    owner: "boxer",
    title: "六合·炮捶",
    glyph: "绝",
    type: "attack",
    speed: 3,
    damage: 26,
    guardBreak: 99,
    minRange: 1,
    maxRange: 1,
    stagger: true,
    knockback: true,
    form: "绝",
    requiresForms: ["架", "化", "冲"],
    requiresMomentum: 4,
    consumeMomentum: 4,
    ultimate: true,
    pierceGuard: true,
    multiHit: [6, 7, 13],
    description: "重绝：架、化、冲三式任意序，耗4势贴身打出三段贯甲炮捶。",
  },
  "boxer-lock-ultimate": {
    id: "boxer-lock-ultimate",
    owner: "boxer",
    title: "擒龙·锁脉",
    glyph: "擒",
    type: "attack",
    speed: 4,
    damage: 15,
    guardBreak: 6,
    minRange: 1,
    maxRange: 2,
    form: "绝",
    requiresForms: ["截", "肘"],
    requiresMomentum: 3,
    consumeMomentum: 3,
    ultimate: true,
    suppressActions: 1,
    description: "进阶：截、肘任意先后成式；耗3势擒脉，封掉对手下一手。",
  },
  "boxer-counter-ultimate": {
    id: "boxer-counter-ultimate",
    owner: "boxer",
    title: "金刚·反震",
    glyph: "震",
    type: "parry",
    speed: 4,
    minRange: 1,
    maxRange: 2,
    form: "绝",
    requiresForms: ["架", "化"],
    requiresMomentum: 2,
    consumeMomentum: 2,
    ultimate: true,
    counterDamage: 14,
    counterRetreat: true,
    description: "速绝：架、化任意先后成式；耗2势化去下一击，反震并退敌。",
  },
  "sword-guard": {
    id: "sword-guard",
    owner: "swordsman",
    title: "横剑封门",
    glyph: "封",
    type: "guard",
    speed: 3,
    guard: 8,
    form: "封",
    momentumGain: 1,
    description: "架8护架、落“封”式并蓄1剑势。",
  },
  "sword-parry": {
    id: "sword-parry",
    owner: "swordsman",
    title: "粘剑卸锋",
    glyph: "化",
    type: "parry",
    speed: 4,
    form: "化",
    momentumGain: 1,
    description: "卸去下一击、打断后一招，并落“化”式。",
  },
  "sword-probe": {
    id: "sword-probe",
    owner: "swordsman",
    title: "点剑问路",
    glyph: "探",
    type: "attack",
    speed: 4,
    damage: 5,
    minRange: 2,
    maxRange: 3,
    form: "探",
    punishesGuard: 8,
    momentumGain: 1,
    description: "二至三步5伤；若对方已架起护架，额外破8。",
  },
  "sword-thrust": {
    id: "sword-thrust",
    owner: "swordsman",
    title: "青锋递进",
    glyph: "刺",
    type: "attack",
    speed: 3,
    damage: 9,
    minRange: 2,
    maxRange: 3,
    form: "刺",
    bonusAfterForm: "探",
    bonusDamage: 4,
    momentumGain: 1,
    description: "二至三步9伤；前式为“探”则+4伤。",
  },
  "sword-sweep": {
    id: "sword-sweep",
    owner: "swordsman",
    title: "回风落雁",
    glyph: "斩",
    type: "attack",
    speed: 2,
    damage: 11,
    guardBreak: 4,
    minRange: 1,
    maxRange: 2,
    form: "斩",
    knockback: true,
    description: "一至二步11伤，破4护架并逼退1步。",
  },
  "sword-sheathe": {
    id: "sword-sheathe",
    owner: "swordsman",
    title: "藏锋养意",
    glyph: "藏",
    type: "guard",
    speed: 2,
    guard: 4,
    form: "藏",
    momentumGain: 2,
    description: "架4护架、落“藏”式并直接蓄2剑势。",
  },
  "sword-ultimate": {
    id: "sword-ultimate",
    owner: "swordsman",
    title: "一剑·天门开",
    glyph: "绝",
    type: "attack",
    speed: 4,
    damage: 24,
    guardBreak: 99,
    minRange: 2,
    maxRange: 3,
    stagger: true,
    form: "绝",
    requiresForms: ["探", "封", "刺"],
    requiresMomentum: 4,
    consumeMomentum: 4,
    ultimate: true,
    pierceGuard: true,
    multiHit: [5, 7, 12],
    description: "重绝：探、封、刺三式任意序，耗4势在二至三步三剑破门。",
  },
  "sword-stars-ultimate": {
    id: "sword-stars-ultimate",
    owner: "swordsman",
    title: "七星·连珠",
    glyph: "星",
    type: "attack",
    speed: 3,
    damage: 22,
    guardBreak: 6,
    minRange: 3,
    maxRange: 4,
    form: "绝",
    requiresForms: ["藏", "刺"],
    requiresMomentum: 3,
    consumeMomentum: 3,
    ultimate: true,
    multiHit: [3, 4, 4, 5, 6],
    bleed: 3,
    description: "进阶：藏、刺任意先后成式；耗3势五剑连珠，并留下3点流血。",
  },
  "sword-counter-ultimate": {
    id: "sword-counter-ultimate",
    owner: "swordsman",
    title: "回光·燕返",
    glyph: "返",
    type: "parry",
    speed: 4,
    minRange: 1,
    maxRange: 2,
    form: "绝",
    requiresForms: ["封", "化"],
    requiresMomentum: 2,
    consumeMomentum: 2,
    ultimate: true,
    counterDamage: 16,
    counterRetreat: true,
    counterRetreatSelf: true,
    description: "速绝：封、化任意先后成式；耗2势避击燕返，并退开一步。",
  },
  "thief-step": {
    id: "thief-step",
    owner: "thief",
    title: "伏身摸近",
    glyph: "伏",
    type: "move",
    speed: 4,
    distanceDelta: -1,
    form: "伏",
    momentumGain: 1,
    description: "贴地抢近1步，落“伏”式并积1势；逼近可恢复1点退路。",
  },
  "thief-retreat": {
    id: "thief-retreat",
    owner: "thief",
    title: "翻墙抽身",
    glyph: "遁",
    type: "move",
    speed: 4,
    distanceDelta: 1,
    description: "消耗1点退路后拉远1步，并闪开较慢攻击。",
  },
  "thief-feint": {
    id: "thief-feint",
    owner: "thief",
    title: "抛沙诈手",
    glyph: "诈",
    type: "guard",
    speed: 4,
    guard: 4,
    form: "诈",
    momentumGain: 1,
    punishesParry: 5,
    scatterForm: 1,
    description: "佯攻后架4护架、落“诈”式并积1势；若对手正在化劲，则穿过空门造成5伤并震散最新一式。",
  },
  "thief-slash": {
    id: "thief-slash",
    owner: "thief",
    title: "短刃割喉",
    glyph: "刃",
    type: "attack",
    speed: 4,
    damage: 7,
    minRange: 1,
    maxRange: 2,
    form: "刃",
    momentumGain: 1,
    description: "一至二步快斩7伤，落“刃”式并积1势。",
  },
  "thief-hook": {
    id: "thief-hook",
    owner: "thief",
    title: "钩索封步",
    glyph: "锁",
    type: "attack",
    speed: 3,
    damage: 6,
    minRange: 1,
    maxRange: 3,
    form: "锁",
    momentumGain: 1,
    interceptsMove: true,
    bonusDamage: 6,
    description: "一至三步6伤；撞上对手步法时额外+6并截停当拍。",
  },
  "thief-plunder": {
    id: "thief-plunder",
    owner: "thief",
    title: "探囊夺势",
    glyph: "夺",
    type: "attack",
    speed: 3,
    damage: 8,
    minRange: 1,
    maxRange: 2,
    form: "夺",
    momentumGain: 1,
    stealMomentum: 1,
    scatterForm: 1,
    description: "一至二步8伤；命中后夺1势，并震散对手最新一式。",
  },
  "thief-break": {
    id: "thief-break",
    owner: "thief",
    title: "开山短斩",
    glyph: "斩",
    type: "attack",
    speed: 1,
    damage: 14,
    guardBreak: 8,
    minRange: 1,
    maxRange: 1,
    knockback: true,
    form: "斩",
    description: "贴身重斩14伤；先破8护架，再把对手逼退1步。",
  },
  "thief-ultimate": {
    id: "thief-ultimate",
    owner: "thief",
    title: "夜枭·三闪夺命",
    glyph: "枭",
    type: "attack",
    speed: 4,
    damage: 24,
    guardBreak: 99,
    minRange: 1,
    maxRange: 2,
    stagger: true,
    form: "绝",
    requiresForms: ["伏", "诈", "刃"],
    requiresMomentum: 4,
    consumeMomentum: 4,
    ultimate: true,
    pierceGuard: true,
    multiHit: [5, 7, 12],
    bleed: 2,
    description: "盗贼重绝：伏、诈、刃齐备且有4势时，在一至二步发动三段贯甲快斩并留下流血。",
  },
};

const FIXED_ADVANCE_UID = -1;
const FIXED_RETREAT_UID = -2;
const FIXED_ULTIMATE_UIDS = [-11, -12, -13] as const;
const FIXED_ACTIONS = new Map<number, ActionId>([
  [FIXED_ADVANCE_UID, "advance"],
  [FIXED_RETREAT_UID, "retreat"],
]);

const PLAYER_PROFESSIONS: Record<PlayerProfessionId, ProfessionDef> = {
  boxer: {
    id: "boxer",
    label: "拳师",
    fighterId: "boxer",
    portraitTexture: "duel-boxer-down",
    fighterName: "拳师 · 石开",
    subtitle: "短打 · 贴身压迫与截步",
    style: "速绝应变，三式重绝负责终结",
    recipe: ["架", "化", "冲"],
    ultimates: ["boxer-ultimate", "boxer-lock-ultimate", "boxer-counter-ultimate"],
    maxHp: 58,
    startingMomentum: 0,
    accent: BOXER_ACCENT,
    deck: ["guard", "guard", "parry", "parry", "punch", "punch", "elbow", "intercept", "break"],
  },
  swordsman: {
    id: "swordsman",
    label: "剑客",
    fighterId: "swordsman",
    portraitTexture: "duel-swordsman-down",
    fighterName: "剑客 · 沈砚",
    subtitle: "剑围 · 控距试探与封门",
    style: "速绝解围，三式重绝负责破局",
    recipe: ["探", "封", "刺"],
    ultimates: ["sword-ultimate", "sword-stars-ultimate", "sword-counter-ultimate"],
    maxHp: 52,
    startingMomentum: 0,
    accent: SWORD_ACCENT,
    deck: ["sword-guard", "sword-guard", "sword-parry", "sword-probe", "sword-probe", "sword-thrust", "sword-thrust", "sword-sweep", "sword-sheathe"],
  },
};

const THIEF_ENEMY: EnemyDef = {
  label: "盗贼",
  fighterId: "thief",
  fighterName: "盗贼 · 夜枭",
  subtitle: "诡刃 · 诈手封步与夺势",
  maxHp: 62,
  accent: THIEF_ACCENT,
};

const SPEED_LABEL: Record<ActionDef["speed"], string> = {
  1: "慢",
  2: "稳",
  3: "快",
  4: "抢先",
};

const css = (color: number) => "#" + color.toString(16).padStart(6, "0");
const clampDistance = (value: number) => Phaser.Math.Clamp(value, MIN_DISTANCE, MAX_DISTANCE);

function actionColor(action: ActionDef) {
  if (action.type === "attack") {
    if (action.owner === "swordsman") return SWORD_ACCENT;
    if (action.owner === "boxer") return BOXER_ACCENT;
    if (action.owner === "thief") return THIEF_ACCENT;
    return RED;
  }
  if (action.type === "move") return TEAL;
  if (action.type === "parry") return 0x4f7773;
  return OCHRE;
}

function ultimateTier(action: ActionDef) {
  if ((action.requiresForms?.length ?? 0) >= 3) return "重绝";
  if ((action.requiresMomentum ?? 0) >= 3) return "进阶";
  return "速绝";
}

function actionRangeLabel(action: ActionDef) {
  const minimum = action.minRange ?? MIN_DISTANCE;
  const maximum = action.maxRange ?? MAX_DISTANCE;
  return minimum === maximum ? `${minimum}步` : `${minimum}至${maximum}步`;
}

function ultimateEffectLines(action: ActionDef) {
  const lines: string[] = [];
  lines.push(`消耗｜发动时扣除${action.consumeMomentum ?? 0}势，并清空全部已存招式`);
  if (action.type === "parry") {
    lines.push("化劲｜完全化去下一次攻击，并打断对手后一招");
    if (action.counterDamage) {
      lines.push(`反击｜直接回敬${action.counterDamage}点生命伤害，不经过护架`);
    }
    if (action.counterRetreatSelf) lines.push("位移｜反击后自身燕返退开1步");
    else if (action.counterRetreat) lines.push("位移｜反击后将对手震退1步");
    lines.push("回势｜化劲成功后回复2势");
    return lines;
  }
  if (action.damage) {
    const sequence = action.multiHit?.length
      ? `，分为${action.multiHit.join("＋")}共${action.damage}伤`
      : "";
    lines.push(`伤害｜造成${action.damage}点生命伤害${sequence}`);
  }
  if (action.pierceGuard) {
    lines.push("护架｜先清空全部护架，且本击伤害不被护架抵消");
  } else if (action.guardBreak) {
    lines.push(`护架｜先破${action.guardBreak}点护架，剩余护架仍可抵伤`);
  }
  if (action.suppressActions) lines.push("封招｜造成生命伤害后，封掉对手下一手");
  if (action.stagger) lines.push("打断｜造成生命伤害后，打断对手后一招");
  if (action.knockback) lines.push("位移｜造成生命伤害后，将对手震退1步");
  if (action.bleed) {
    const ticks = Array.from({ length: action.bleed }, (_, index) => action.bleed! - index).join("／");
    lines.push(`流血｜命中后施加${action.bleed}层，后续回合依次损失${ticks}生命`);
  }
  return lines;
}

function intentEffectTokens(action: ActionDef): IntentEffectToken[] {
  const tokens: IntentEffectToken[] = [];
  if ((action.damage ?? 0) > 0) tokens.push({ label: `伤${action.damage}`, color: RED });
  if ((action.guard ?? 0) > 0) tokens.push({ label: `护${action.guard}`, color: DEFENSE_BROWN });
  if (action.type === "move" && action.distanceDelta) {
    tokens.push({ label: action.distanceDelta < 0 ? "↓1" : "↑1", color: TEAL });
  }
  if (action.type === "parry") tokens.push({ label: "化", color: TEAL });
  if ((action.guardBreak ?? 0) > 0) tokens.push({ label: `破${action.guardBreak}`, color: DEFENSE_BROWN });
  if ((action.stealMomentum ?? 0) > 0) tokens.push({ label: `夺${action.stealMomentum}`, color: THIEF_ACCENT });
  if ((action.punishesParry ?? 0) > 0) tokens.push({ label: "诈化", color: THIEF_ACCENT });
  if (action.knockback) tokens.push({ label: "↓1", color: TEAL });
  if (action.stagger) tokens.push({ label: "断", color: RED });
  return tokens.slice(0, 3);
}

function isAttack(action: ActionDef | undefined) {
  return action?.type === "attack";
}

function triggerForAction(action: ActionDef): EnemyTrigger {
  if (action.type === "move") return "move";
  if (action.type === "guard") return "guard";
  if (action.type === "parry") return "parry";
  return "attack";
}

function triggerLabel(trigger: EnemyTrigger) {
  return {
    move: "你先移动",
    guard: "你先架招",
    parry: "你先化劲",
    attack: "你先抢攻",
  }[trigger];
}

function comboFor(first: ActionDef, second: ActionDef): ComboKind {
  if (second.ultimate) return "ultimate";
  if (first.id === "sword-probe" && second.id === "sword-thrust") return "probe";
  if (first.id === "sword-sheathe" && isAttack(second)) return "draw";
  if (first.id === "advance" && isAttack(second)) return "press";
  if (first.type === "guard" && isAttack(second)) return "counter";
  if (first.id === "retreat" && isAttack(second)) return "bait";
  if (first.type === "parry" && isAttack(second)) return "borrow";
  if (isAttack(first) && isAttack(second)) return "chain";
  if (first.type === "move" && second.type === "guard") return "cover";
  return "steady";
}

function comboCopy(kind: ComboKind) {
  const copies: Record<ComboKind, { title: string; detail: string }> = {
    press: { title: "强入破门", detail: "第二招伤害+3，并额外破4护架" },
    counter: { title: "守中反打", detail: "第一拍若挡住伤害，第二招伤害+4" },
    bait: { title: "引空回击", detail: "敌招落空后，第二招射程+1、伤害+5" },
    borrow: { title: "借力打力", detail: "化劲成功后，第二招伤害+6并打断" },
    chain: { title: "连环抢攻", detail: "冲拳接顶肘时，第二招额外+4并打断" },
    cover: { title: "移步封门", detail: "移动后护架额外+3" },
    probe: { title: "问路递锋", detail: "探式接刺式，第二剑额外+4伤" },
    draw: { title: "藏锋乍现", detail: "先蓄2势，再以长剑争夺距离" },
    ultimate: { title: "绝式待发", detail: "速绝易成、重绝难蓄；所需式都不限制先后" },
    steady: { title: "散手应变", detail: "无额外加成，按牌面依次执行" },
  };
  return copies[kind];
}

type PoseMetric = {
  footX: number;
  footY: number;
  shadowWidth: number;
  shadowHeight: number;
};

const POSE_METRICS: Record<`${FighterId}-${Facing}`, ReadonlyArray<PoseMetric>> = {
  "swordsman-down": [
    { footX: 256, footY: 482, shadowWidth: 48, shadowHeight: 11 },
    { footX: 256, footY: 472, shadowWidth: 50, shadowHeight: 11 },
    { footX: 256, footY: 467, shadowWidth: 58, shadowHeight: 12 },
    { footX: 256, footY: 466, shadowWidth: 54, shadowHeight: 12 },
  ],
  "swordsman-up": [
    { footX: 281, footY: 493, shadowWidth: 52, shadowHeight: 11 },
    { footX: 187, footY: 506, shadowWidth: 45, shadowHeight: 10 },
    { footX: 292, footY: 419, shadowWidth: 59, shadowHeight: 12 },
    { footX: 221, footY: 418, shadowWidth: 60, shadowHeight: 12 },
  ],
  "boxer-up": [
    { footX: 256, footY: 450, shadowWidth: 58, shadowHeight: 12 },
    { footX: 256, footY: 482, shadowWidth: 50, shadowHeight: 11 },
    { footX: 256, footY: 465, shadowWidth: 62, shadowHeight: 12 },
    { footX: 256, footY: 472, shadowWidth: 66, shadowHeight: 13 },
  ],
  "boxer-down": [
    { footX: 270, footY: 467, shadowWidth: 58, shadowHeight: 12 },
    { footX: 265, footY: 475, shadowWidth: 50, shadowHeight: 11 },
    { footX: 270, footY: 431, shadowWidth: 64, shadowHeight: 12 },
    { footX: 234, footY: 443, shadowWidth: 66, shadowHeight: 13 },
  ],
  "thief-down": [
    { footX: 382, footY: 493, shadowWidth: 58, shadowHeight: 12 },
    { footX: 245, footY: 490, shadowWidth: 52, shadowHeight: 11 },
    { footX: 416, footY: 452, shadowWidth: 66, shadowHeight: 12 },
    { footX: 152, footY: 441, shadowWidth: 68, shadowHeight: 13 },
  ],
  "thief-up": [
    { footX: 377, footY: 497, shadowWidth: 60, shadowHeight: 12 },
    { footX: 126, footY: 499, shadowWidth: 52, shadowHeight: 11 },
    { footX: 354, footY: 436, shadowWidth: 66, shadowHeight: 12 },
    { footX: 261, footY: 449, shadowWidth: 68, shadowHeight: 13 },
  ],
};

function fighterTexture(fighterId: FighterId, facing: Facing) {
  return `duel-${fighterId}-${facing}`;
}

function ensureGuardVeilTexture(scene: Phaser.Scene) {
  if (scene.textures.exists(GUARD_VEIL_TEXTURE)) return;
  const texture = scene.textures.createCanvas(GUARD_VEIL_TEXTURE, 192, 192);
  if (!texture) return;
  const context = texture.context;
  context.clearRect(0, 0, 192, 192);

  // A soft, paper-friendly veil reads as gathered qi without becoming a neon ring.
  const veil = context.createRadialGradient(96, 96, 22, 96, 96, 91);
  veil.addColorStop(0, "rgba(54, 125, 115, 0.026)");
  veil.addColorStop(0.52, "rgba(54, 125, 115, 0.072)");
  veil.addColorStop(0.78, "rgba(54, 125, 115, 0.22)");
  veil.addColorStop(0.91, "rgba(54, 125, 115, 0.13)");
  veil.addColorStop(1, "rgba(66, 111, 99, 0)");
  context.fillStyle = veil;
  context.fillRect(0, 0, 192, 192);

  const reflectedLight = context.createRadialGradient(67, 58, 0, 78, 69, 66);
  reflectedLight.addColorStop(0, "rgba(166, 106, 44, 0.14)");
  reflectedLight.addColorStop(0.42, "rgba(166, 106, 44, 0.052)");
  reflectedLight.addColorStop(1, "rgba(190, 148, 77, 0)");
  context.fillStyle = reflectedLight;
  context.fillRect(0, 0, 192, 192);
  texture.refresh();
}

class PoseFighter {
  readonly root: Phaser.GameObjects.Container;
  private readonly sprite: Phaser.GameObjects.Image;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly softShadow: Phaser.GameObjects.Ellipse;
  private readonly guardVeil: Phaser.GameObjects.Image;
  private readonly guardArc: Phaser.GameObjects.Graphics;
  private readonly guardPulse = { value: 0 };
  private homeX: number;
  private homeY: number;
  private spriteBaseX = 0;
  private spriteBaseY = 0;
  private shadowBaseScaleX = 1;
  private softShadowBaseScaleX = 1;
  private guardFxActive = false;
  private pose = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private fighterId: FighterId,
    private facing: Facing,
    texture: string,
    x: number,
    y: number,
  ) {
    this.homeX = x;
    this.homeY = y;
    this.root = scene.add.container(x, y).setDepth(42);
    this.softShadow = scene.add.ellipse(0, 1, 68, 21, 0x6d5a35, 0.1);
    this.shadow = scene.add.ellipse(0, 0, 56, 13, 0x211d18, 0.22);
    ensureGuardVeilTexture(scene);
    this.guardVeil = scene.add.image(0, -48, GUARD_VEIL_TEXTURE)
      .setDisplaySize(90, 90)
      .setVisible(false);
    this.guardArc = scene.add.graphics().setPosition(0, -48).setVisible(false);
    // A dark under-stroke keeps the muted colors readable over the painted courtyard.
    this.guardArc.lineStyle(3.4, INK, 0.24);
    this.guardArc.beginPath();
    this.guardArc.arc(0, 0, 44, -2.82, -2.06, false);
    this.guardArc.strokePath();
    this.guardArc.beginPath();
    this.guardArc.arc(0, 0, 44, -0.32, 0.32, false);
    this.guardArc.strokePath();
    this.guardArc.beginPath();
    this.guardArc.arc(0, 0, 41, -1.53, -1.08, false);
    this.guardArc.strokePath();
    this.guardArc.beginPath();
    this.guardArc.arc(0, 0, 42, 1.02, 1.5, false);
    this.guardArc.strokePath();
    this.guardArc.lineStyle(2, TEAL, 0.9);
    this.guardArc.beginPath();
    this.guardArc.arc(0, 0, 44, -2.82, -2.06, false);
    this.guardArc.strokePath();
    this.guardArc.beginPath();
    this.guardArc.arc(0, 0, 44, -0.32, 0.32, false);
    this.guardArc.strokePath();
    this.guardArc.lineStyle(1.7, DEFENSE_BROWN, 0.82);
    this.guardArc.beginPath();
    this.guardArc.arc(0, 0, 41, -1.53, -1.08, false);
    this.guardArc.strokePath();
    this.guardArc.beginPath();
    this.guardArc.arc(0, 0, 42, 1.02, 1.5, false);
    this.guardArc.strokePath();
    this.guardArc.fillStyle(TEAL, 0.86);
    this.guardArc.fillCircle(-40, 19, 1.8);
    this.guardArc.fillCircle(37, -21, 1.45);
    this.sprite = scene.add.image(0, 0, texture, 0);
    if (scene.game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
      this.guardArc.postFX.addGlow(TEAL, 0.9, 0.06, false, 0.1, 3);
    }
    this.applyPoseFrame(0);
    this.root.add([
      this.softShadow,
      this.shadow,
      this.guardVeil,
      this.sprite,
      this.guardArc,
    ]);
  }

  setPosition(x: number, y: number) {
    this.homeX = x;
    this.homeY = y;
    this.root.setPosition(x, y);
  }

  commitHome() {
    this.homeX = this.root.x;
    this.homeY = this.root.y;
  }

  get homePosition() {
    return { x: this.homeX, y: this.homeY };
  }

  get groundY() {
    return this.root.y;
  }

  setArchetype(fighterId: FighterId, facing: Facing, texture: string) {
    this.fighterId = fighterId;
    this.facing = facing;
    this.sprite.setTexture(texture, 0);
    this.pose = 0;
    this.applyPoseFrame(0);
  }

  setPose(frame: 0 | 1 | 2 | 3) {
    this.pose = frame;
    this.applyPoseFrame(frame);
  }

  setGuarded(active: boolean) {
    this.guardFxActive = active;
    const visible = active || this.guardPulse.value > 0.01;
    this.guardVeil.setVisible(visible);
    this.guardArc.setVisible(visible);
  }

  pulseShield() {
    this.scene.tweens.killTweensOf(this.guardPulse);
    this.guardPulse.value = 1;
    this.guardVeil.setVisible(true);
    this.guardArc.setVisible(true);
    this.scene.tweens.add({
      targets: this.guardPulse,
      value: 0,
      duration: MOTION_ENABLED ? 560 : 1,
      ease: "Cubic.Out",
      onComplete: () => {
        if (!this.guardFxActive) {
          this.guardVeil.setVisible(false);
          this.guardArc.setVisible(false);
        }
      },
    });
  }

  private applyPoseFrame(frame: 0 | 1 | 2 | 3) {
    // Phaser restores a sprite sheet frame's native dimensions on setFrame.
    // Reapply the visual size every time so an animation never balloons to 512px.
    this.sprite
      .setFrame(frame)
      .setDisplaySize(FIGHTER_DISPLAY_SIZE, FIGHTER_DISPLAY_SIZE);
    const metric = POSE_METRICS[`${this.fighterId}-${this.facing}`][frame];
    const sourceScale = FIGHTER_DISPLAY_SIZE / 512;
    this.spriteBaseX = (256 - metric.footX) * sourceScale;
    this.spriteBaseY = (256 - metric.footY) * sourceScale;
    this.sprite.setPosition(this.spriteBaseX, this.spriteBaseY);
    this.shadow.setPosition(0, 0).setDisplaySize(metric.shadowWidth, metric.shadowHeight);
    this.softShadow
      .setPosition(0, 1)
      .setDisplaySize(metric.shadowWidth + 14, metric.shadowHeight + 8);
    this.shadowBaseScaleX = this.shadow.scaleX;
    this.softShadowBaseScaleX = this.softShadow.scaleX;
  }

  idle(clock: number, freeze = false) {
    const guardVisible = this.guardFxActive || this.guardPulse.value > 0.01;
    if (guardVisible) {
      const breath = Math.sin(clock * 1.65);
      const impact = this.guardPulse.value;
      const shieldScale = 1 + breath * 0.008 + impact * 0.045;
      this.guardVeil
        .setVisible(true)
        .setDisplaySize(90 * shieldScale, 90 * shieldScale)
        .setAlpha(0.58 + breath * 0.035 + impact * 0.25);
      this.guardArc
        .setVisible(true)
        .setScale(shieldScale)
        .setRotation(clock * 0.075)
        .setAlpha(0.76 + breath * 0.055 + impact * 0.2);
    } else {
      this.guardVeil.setVisible(false);
      this.guardArc.setVisible(false);
    }
    if (this.pose !== 0 || freeze) return;
    this.sprite.y = this.spriteBaseY + Math.sin(clock * 2.8 + (this.fighterId === "boxer" ? 0 : 1.2)) * 1.2;
    this.sprite.rotation = Math.sin(clock * 1.6) * 0.008;
    const breath = 1 + Math.sin(clock * 2.8) * 0.025;
    this.shadow.scaleX = this.shadowBaseScaleX * breath;
    this.softShadow.scaleX = this.softShadowBaseScaleX * breath;
  }

  resetPose() {
    this.pose = 0;
    this.applyPoseFrame(0);
    this.root.setScale(1).setRotation(0);
    this.sprite.setPosition(this.spriteBaseX, this.spriteBaseY).setRotation(0).clearTint();
  }

  flash() {
    this.sprite.setTintFill(0xfff2bd);
    this.scene.time.delayedCall(MOTION_ENABLED ? 125 : 1, () => {
      if (this.sprite.active) this.sprite.clearTint();
    });
  }
}

class CombatUiScene extends Phaser.Scene {
  protected text(
    x: number,
    y: number,
    copy: string,
    style?: Phaser.Types.GameObjects.Text.TextStyle,
  ) {
    return this.add.text(x, y, copy, {
      fontFamily: FONT,
      color: css(INK),
      ...style,
    }).setResolution(TEXT_RESOLUTION);
  }

  protected setupCamera() {
    this.cameras.main
      .setZoom(RENDER_SCALE)
      .centerOn(WIDTH / 2, HEIGHT / 2)
      .setRoundPixels(true);
    if (this.game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
      const pipelines = this.game.renderer.pipelines;
      if (!pipelines.postPipelineClasses.has("DuelCombatPostFX")) {
        pipelines.addPostPipeline("DuelCombatPostFX", DuelCombatPostFX);
      }
      this.cameras.main.setPostPipeline("DuelCombatPostFX");
    }
  }
}

export class DuelInnScene extends CombatUiScene {
  private player!: FighterState;
  private enemy!: FighterState;
  private playerHud!: FighterHud;
  private enemyHud!: FighterHud;
  private phase: BattlePhase = "intro";
  private round = 1;
  private distance = 3;
  private clock = 0;
  private cardSerial = 0;
  private selectedProfessionId: PlayerProfessionId = DEFAULT_PLAYER_PROFESSION;
  private formTrail: FormGlyph[] = [];
  private enemyFormTrail: FormGlyph[] = [];
  private playerTacticHistory: EnemyTrigger[] = [];
  private enemyRead: EnemyTrigger | null = null;
  private deck: CardInstance[] = [];
  private discard: CardInstance[] = [];
  private hand: CardInstance[] = [];
  private selectedIds: number[] = [];
  private playerPlan: ActionId[] = [];
  private enemyPlan: ActionId[] = [];
  private enemyIntent!: EnemyIntentPlan;
  private enemyBranchTriggered: boolean | null = null;
  private records: BeatRecord[] = [];
  private activeBeat = -1;
  private combo: ComboKind = "steady";
  private roundEvents: RoundEvents = {
    playerBlocked: false,
    playerParried: false,
    enemyMissed: false,
  };
  private resolutionToken = 0;
  private handLayer!: Phaser.GameObjects.Container;
  private intentLayer!: Phaser.GameObjects.Container;
  private intentDetailLayer!: Phaser.GameObjects.Container;
  private ultimateDetailLayer!: Phaser.GameObjects.Container;
  private reviewLayer!: Phaser.GameObjects.Container;
  private planSlots: PlanSlot[] = [];
  private fixedActionControls: FixedActionControl[] = [];
  private ultimateActionControls: UltimateActionControl[] = [];
  private beatPills: Phaser.GameObjects.Rectangle[] = [];
  private openIntentIndex: number | null = null;
  private openUltimateIndex: number | null = null;
  private ultimateDetailPanel?: Phaser.GameObjects.Rectangle;
  private comboText!: Phaser.GameObjects.Text;
  private confirmBody!: Phaser.GameObjects.Rectangle;
  private confirmText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private handLabel!: Phaser.GameObjects.Text;
  private pileLabel!: Phaser.GameObjects.Text;
  private distanceText!: Phaser.GameObjects.Text;
  private arenaCenterMarker!: Phaser.GameObjects.Arc;
  private topSideText!: Phaser.GameObjects.Text;
  private bottomSideText!: Phaser.GameObjects.Text;
  private arenaCallout!: Phaser.GameObjects.Text;
  private footerText!: Phaser.GameObjects.Text;
  private introOverlay?: Phaser.GameObjects.Container;
  private resultOverlay?: Phaser.GameObjects.Container;

  constructor() {
    super("inn-duel");
  }

  preload() {
    this.load.image("duel-courtyard", "/assets/combat/duel-courtyard-bg.png");
    this.load.spritesheet(
      "duel-swordsman-down",
      "/assets/combat/swordsman-turn-poses.png",
      { frameWidth: 512, frameHeight: 512 },
    );
    this.load.spritesheet(
      "duel-swordsman-up",
      "/assets/combat/swordsman-turn-poses-up.png",
      { frameWidth: 512, frameHeight: 512 },
    );
    this.load.spritesheet(
      "duel-boxer-up",
      "/assets/combat/boxer-turn-poses.png",
      { frameWidth: 512, frameHeight: 512 },
    );
    this.load.spritesheet(
      "duel-boxer-down",
      "/assets/combat/boxer-turn-poses-down.png",
      { frameWidth: 512, frameHeight: 512 },
    );
    this.load.spritesheet(
      "duel-thief-down",
      "/assets/combat/thief-turn-poses-down.png",
      { frameWidth: 512, frameHeight: 512 },
    );
    this.load.spritesheet(
      "duel-thief-up",
      "/assets/combat/thief-turn-poses-up.png",
      { frameWidth: 512, frameHeight: 512 },
    );
  }

  create() {
    this.resetRuntimeState();
    this.setupCamera();
    this.drawBackground();
    this.drawHeader();
    this.drawArena();

    const [enemyY, playerY] = this.positionsForDistance(this.distance);
    const profession = this.playerProfession;
    const rival = this.opponentProfession;
    const enemyRig = new PoseFighter(
      this,
      rival.fighterId,
      "down",
      fighterTexture(rival.fighterId, "down"),
      FIGHTER_X,
      enemyY,
    );
    const playerRig = new PoseFighter(
      this,
      profession.fighterId,
      "up",
      fighterTexture(profession.fighterId, "up"),
      FIGHTER_X,
      playerY,
    );
    this.enemy = {
      id: rival.fighterId,
      name: rival.fighterName,
      subtitle: rival.subtitle,
      hp: rival.maxHp,
      maxHp: rival.maxHp,
      guard: 0,
      momentum: 0,
      retreat: MAX_RETREAT,
      parryReady: false,
      evadeBeat: -1,
      staggeredBeat: -1,
      sealedActions: 0,
      counterDamage: 0,
      counterRetreat: false,
      counterRetreatSelf: false,
      bleed: 0,
      rig: enemyRig,
    };
    this.player = {
      id: profession.fighterId,
      name: profession.fighterName,
      subtitle: profession.subtitle,
      hp: profession.maxHp,
      maxHp: profession.maxHp,
      guard: 0,
      momentum: profession.startingMomentum,
      retreat: MAX_RETREAT,
      parryReady: false,
      evadeBeat: -1,
      staggeredBeat: -1,
      sealedActions: 0,
      counterDamage: 0,
      counterRetreat: false,
      counterRetreatSelf: false,
      bleed: 0,
      rig: playerRig,
    };

    this.enemyHud = this.createFighterHud(14, 75, this.enemy, rival.accent);
    this.playerHud = this.createFighterHud(14, 496, this.player, profession.accent);
    this.drawPlanner();
    this.drawUltimateArea();
    this.drawHandArea();
    this.buildDeck();
    this.prepareRound(true);
    this.showIntro();
    this.input.on("pointerup", this.handleScenePointerUp, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off("pointerup", this.handleScenePointerUp, this);
    });
  }

  update(_time: number, deltaMs: number) {
    this.clock += Math.min(40, deltaMs) / 1000;
    const freeze = this.phase === "resolving" || this.phase === "ended";
    this.player?.rig.idle(this.clock, freeze);
    this.enemy?.rig.idle(this.clock, freeze);
  }

  private resetRuntimeState() {
    this.phase = "intro";
    this.round = 1;
    this.distance = 3;
    this.clock = 0;
    this.cardSerial = 0;
    this.selectedProfessionId = DEFAULT_PLAYER_PROFESSION;
    this.formTrail = [];
    this.enemyFormTrail = [];
    this.playerTacticHistory = [];
    this.enemyRead = null;
    this.deck = [];
    this.discard = [];
    this.hand = [];
    this.selectedIds = [];
    this.playerPlan = [];
    this.enemyPlan = [];
    this.enemyBranchTriggered = null;
    this.records = [];
    this.activeBeat = -1;
    this.combo = "steady";
    this.planSlots = [];
    this.fixedActionControls = [];
    this.ultimateActionControls = [];
    this.beatPills = [];
    this.openIntentIndex = null;
    this.openUltimateIndex = null;
    this.ultimateDetailPanel = undefined;
    this.introOverlay = undefined;
    this.resultOverlay = undefined;
    this.resolutionToken += 1;
  }

  private drawBackground() {
    this.cameras.main.setBackgroundColor("#8e945e");
    const g = this.add.graphics();
    g.fillStyle(0x929963, 1).fillRect(0, 0, WIDTH, HEIGHT);
    for (let y = 0; y < HEIGHT; y += 26) {
      for (let x = 0; x < WIDTH; x += 26) {
        g.fillStyle((x / 26 + y / 26) % 2 === 0 ? 0xb2b678 : 0x7f8758, 0.16);
        g.fillRect(x, y, 26, 26);
      }
    }
    g.fillStyle(0xcbbb68, 1).fillRect(0, 0, WIDTH, 70);
    g.fillStyle(INK, 1).fillRect(0, 68, WIDTH, 3);
    g.fillStyle(PAPER, 0.98).fillRoundedRect(8, 72, 414, 780, 13);
    g.lineStyle(2.5, INK, 1).strokeRoundedRect(8, 72, 414, 780, 13);
    g.fillStyle(INK, 0.97).fillRoundedRect(8, 829, 414, 23, 6);
    g.fillStyle(RED, 1).fillRoundedRect(14, 833, 4, 15, 2);
  }

  private drawHeader() {
    this.text(15, 11, "江湖过招", { fontSize: "20px", fontStyle: "bold" });
    this.text(15, 42, "回合制 · 双拍拆招", {
      fontSize: "10px",
      fontStyle: "bold",
      color: "#5c593f",
    });
    this.roundText = this.text(270, 25, "第1合", {
      fontSize: "11px",
      fontStyle: "bold",
      color: css(this.playerProfession.accent),
    }).setOrigin(0.5);
    this.headerButton(374, 24, 78, "返回模式", () => {
      this.resolutionToken += 1;
      this.scene.start("inn-mode-select");
    });
  }

  private headerButton(x: number, y: number, width: number, copy: string, onTap: () => void) {
    const body = this.add.rectangle(x, y, width, 32, PAPER_LIGHT, 0.96)
      .setStrokeStyle(1.7, INK, 1)
      .setInteractive({ useHandCursor: true })
      .setDepth(100);
    this.text(x, y, copy, { fontSize: "10px", fontStyle: "bold" })
      .setOrigin(0.5)
      .setDepth(101);
    body.on("pointerdown", () => body.setScale(0.95));
    body.on("pointerout", () => body.setScale(1));
    body.on("pointerup", () => {
      body.setScale(1);
      onTap();
    });
  }

  private drawArena() {
    this.add.image(215, (ARENA_TOP + ARENA_BOTTOM) / 2, "duel-courtyard")
      .setDisplaySize(402, ARENA_BOTTOM - ARENA_TOP)
      .setDepth(12);
    const g = this.add.graphics();
    g.setDepth(14);
    g.fillStyle(0xfff1bc, 0.13).fillRoundedRect(14, ARENA_TOP, 402, ARENA_BOTTOM - ARENA_TOP, 10);
    g.lineStyle(2, INK, 0.9).strokeRoundedRect(14, ARENA_TOP, 402, ARENA_BOTTOM - ARENA_TOP, 10);
    g.lineStyle(1, 0xf8edbf, 0.72).strokeRoundedRect(20, ARENA_TOP + 6, 390, ARENA_BOTTOM - ARENA_TOP - 12, 8);
    g.fillStyle(0xfff4cf, 0.12).fillEllipse(FIGHTER_X, ARENA_CENTER_Y, 224, 282);
    g.lineStyle(2, 0x4e654e, 0.38).lineBetween(72, ARENA_TOP + 25, 72, ARENA_BOTTOM - 25);
    for (let index = 0; index < 4; index += 1) {
      g.lineBetween(65, 230 + index * 67, 79, 230 + index * 67);
    }

    this.arenaCenterMarker = this.add.circle(72, ARENA_CENTER_Y, 4, TEAL, 0.86)
      .setStrokeStyle(1.5, PAPER_LIGHT, 0.95)
      .setDepth(79);

    this.topSideText = this.text(26, 168, "对手 · 盗贼", {
      fontSize: "9px",
      fontStyle: "bold",
      color: "#5f654d",
    }).setDepth(80);
    this.bottomSideText = this.text(404, 467, `我方 · ${this.playerProfession.label}`, {
      fontSize: "9px",
      fontStyle: "bold",
      color: "#6b5945",
    }).setOrigin(1, 0).setDepth(80);

    this.distanceText = this.text(72, ARENA_CENTER_Y, "", {
      fontSize: "10px",
      fontStyle: "bold",
      align: "center",
      backgroundColor: "#fff1bc",
      padding: { x: 5, y: 4 },
    }).setOrigin(0.5).setDepth(80);
    this.arenaCallout = this.text(CALLOUT_X, CALLOUT_Y, "", {
      fontSize: "11px",
      fontStyle: "bold",
      color: "#fff4cf",
      align: "left",
      backgroundColor: "#29271d",
      padding: { x: 8, y: 6 },
      lineSpacing: 2,
      wordWrap: { width: 178, useAdvancedWrap: true },
    }).setOrigin(0, 0).setDepth(160).setAlpha(0);

    for (let index = 0; index < 2; index += 1) {
      const beatY = 181 + index * 29;
      const body = this.add.rectangle(380, beatY, 56, 23, PAPER_LIGHT, 0.92)
        .setStrokeStyle(1.4, INK, 0.65)
        .setDepth(86);
      this.text(380, beatY, index === 0 ? "1 · 起手" : "2 · 合手", {
        fontSize: "9px",
        fontStyle: "bold",
        color: "#6b6346",
      }).setOrigin(0.5).setDepth(87);
      this.beatPills.push(body);
    }
  }

  private createFighterHud(
    x: number,
    y: number,
    fighter: FighterState,
    accent: number,
  ): FighterHud {
    const layer = this.add.container(x, y).setDepth(120);
    const body = this.add.rectangle(201, 38, 402, 76, PAPER_LIGHT, 0.98)
      .setStrokeStyle(2, INK, 1);
    const rail = this.add.rectangle(5, 38, 7, 64, accent, 1);
    const nameText = this.text(16, 7, fighter.name, { fontSize: "13px", fontStyle: "bold" });
    const subtitleText = this.text(386, 9, fighter.subtitle, {
      fontSize: "9px",
      fontStyle: "bold",
      color: "#686044",
    }).setOrigin(1, 0);
    const hpLabel = this.text(16, 31, "命", {
      fontSize: "9px",
      fontStyle: "bold",
      color: "#5d553c",
    }).setOrigin(0, 0.5);
    const hpBack = this.add.rectangle(44, 31, 220, 10, 0x5a5139, 0.16)
      .setOrigin(0, 0.5)
      .setStrokeStyle(1, INK, 0.72);
    const hpFill = this.add.rectangle(45, 31, 218, 8, RED, 1).setOrigin(0, 0.5);
    const hpText = this.text(261, 31, "", {
      fontSize: "9px",
      fontStyle: "bold",
      color: "#fff8dc",
    }).setOrigin(1, 0.5);
    const guardText = this.text(16, 53, "护架 0", {
      fontSize: "9px",
      fontStyle: "bold",
      color: css(OCHRE),
    });
    const statusText = this.text(278, 53, "势", {
      fontSize: "9px",
      fontStyle: "bold",
      color: css(accent),
    }).setOrigin(1, 0);
    layer.add([body, rail, nameText, subtitleText, hpLabel, hpBack, hpFill, hpText, guardText, statusText]);
    const momentumDots: Phaser.GameObjects.Arc[] = [];
    const formTexts: Phaser.GameObjects.Text[] = [];
    const formLabel = this.text(82, 53, "式", {
      fontSize: "9px",
      fontStyle: "bold",
      color: "#6b6247",
    });
    layer.add(formLabel);
    for (let index = 0; index < 3; index += 1) {
      const formCircle = this.add.circle(111 + index * 24, 58, 8, 0xe3d7a6, 0.88)
        .setStrokeStyle(1.1, accent, 0.52);
      const formText = this.text(111 + index * 24, 58, "·", {
        fontSize: "9px",
        fontStyle: "bold",
        color: css(accent),
      }).setOrigin(0.5);
      formTexts.push(formText);
      layer.add([formCircle, formText]);
    }
    for (let index = 0; index < MAX_MOMENTUM; index += 1) {
      const dot = this.add.circle(296 + index * 15, 58, 5.5, 0xd9cb92, 0.7)
        .setStrokeStyle(1.2, INK, 0.42);
      momentumDots.push(dot);
      layer.add(dot);
    }
    return { rail, nameText, subtitleText, hpFill, hpText, guardText, statusText, momentumDots, formTexts };
  }

  private drawPlanner() {
    const g = this.add.graphics().setDepth(122);
    g.fillStyle(0xe5d493, 0.9).fillRoundedRect(14, 576, 402, 66, 7);
    g.lineStyle(1.7, INK, 0.82).strokeRoundedRect(14, 576, 402, 66, 7);
    g.fillStyle(BOXER_ACCENT, 1).fillRoundedRect(20, 582, 5, 54, 2);
    this.text(31, 580, "出招次序", {
      fontSize: "10px",
      fontStyle: "bold",
      color: css(BOXER_ACCENT),
    }).setDepth(130);
    this.comboText = this.text(104, 580, "依次选择两招，进退常驻", {
      fontSize: "8px",
      fontStyle: "bold",
      color: "#625b41",
    }).setFixedSize(294, 14).setDepth(130);

    for (let index = 0; index < PLAN_LIMIT; index += 1) {
      const x = 73 + index * 98;
      const body = this.add.rectangle(x, 616, 90, 38, PAPER_LIGHT, 0.96)
        .setStrokeStyle(1.6, INK, 0.75)
        .setInteractive({ useHandCursor: true })
        .setDepth(128);
      const indexText = this.text(x - 37, 601, String(index + 1), {
        fontSize: "9px",
        fontStyle: "bold",
        color: css(index === 0 ? TEAL : BOXER_ACCENT),
      }).setDepth(130);
      const actionText = this.text(x, 617, "待定", {
        fontSize: "10px",
        fontStyle: "bold",
        align: "center",
        color: "#716a4b",
        wordWrap: { width: 76 },
      }).setOrigin(0.5).setDepth(130);
      body.on("pointerdown", () => body.setScale(0.97));
      body.on("pointerout", () => body.setScale(1));
      body.on("pointerup", () => {
        body.setScale(1);
        this.handlePlanSlot(index);
      });
      this.planSlots.push({ body, indexText, actionText });
    }

    const fixedChoices = [
      { uid: FIXED_ADVANCE_UID, x: 244, label: "进↑" },
      { uid: FIXED_RETREAT_UID, x: 292, label: "退↓" },
    ] as const;
    fixedChoices.forEach((choice) => {
      const body = this.add.rectangle(choice.x, 616, 44, 38, PAPER_LIGHT, 0.96)
        .setStrokeStyle(1.5, TEAL, 0.78)
        .setInteractive({ useHandCursor: true })
        .setDepth(128);
      const labelText = this.text(choice.x, 610, choice.label, {
        fontSize: "10px",
        fontStyle: "bold",
        color: css(TEAL),
      }).setOrigin(0.5).setDepth(130);
      const hintText = this.text(choice.x, 626, "常驻", {
        fontSize: "8px",
        fontStyle: "bold",
        color: "#696347",
      }).setOrigin(0.5).setDepth(130);
      body.on("pointerdown", () => body.setScale(0.95));
      body.on("pointerout", () => body.setScale(1));
      body.on("pointerup", () => {
        body.setScale(1);
        this.selectPlanChoice(choice.uid);
      });
      this.fixedActionControls.push({ uid: choice.uid, body, labelText, hintText });
    });

    this.confirmBody = this.add.rectangle(366, 616, 92, 38, BOXER_ACCENT, 0.3)
      .setStrokeStyle(1.8, INK, 0.86)
      .setInteractive({ useHandCursor: true })
      .setDepth(128);
    this.confirmText = this.text(366, 616, "选满两招", {
      fontSize: "10px",
      fontStyle: "bold",
      color: "#6f6247",
    }).setOrigin(0.5).setDepth(130);
    this.confirmBody.on("pointerdown", () => this.confirmBody.setScale(0.96));
    this.confirmBody.on("pointerout", () => this.confirmBody.setScale(1));
    this.confirmBody.on("pointerup", () => {
      this.confirmBody.setScale(1);
      this.handleConfirm();
    });
  }

  private drawUltimateArea() {
    const g = this.add.graphics().setDepth(138);
    g.fillStyle(0xeadca6, 0.96).fillRoundedRect(14, 646, 402, 58, 7);
    g.lineStyle(1.5, INK, 0.72).strokeRoundedRect(14, 646, 402, 58, 7);
    g.fillStyle(0x8f302e, 1).fillRoundedRect(20, 651, 5, 48, 2);
    this.text(31, 649, "职业绝式 · 固定行动", {
      fontSize: "9px",
      fontStyle: "bold",
      color: "#8f302e",
    }).setDepth(142);
    this.text(404, 649, "不入牌库", {
      fontSize: "8px",
      fontStyle: "bold",
      color: "#6a6249",
    }).setOrigin(1, 0).setDepth(142);

    FIXED_ULTIMATE_UIDS.forEach((uid, index) => {
      const x = 88 + index * 128;
      const body = this.add.rectangle(x, 681, 120, 36, PAPER_LIGHT, 0.98)
        .setStrokeStyle(1.4, 0x8f302e, 0.72)
        .setInteractive({ useHandCursor: true })
        .setDepth(140);
      const glyphText = this.text(x - 48, 681, "绝", {
        fontSize: "12px",
        fontStyle: "bold",
        color: "#8f302e",
      }).setOrigin(0.5).setDepth(142);
      const titleText = this.text(x - 31, 669, "", {
        fontSize: "8px",
        fontStyle: "bold",
        color: css(INK),
      }).setFixedSize(88, 12).setDepth(142);
      const stateText = this.text(x - 31, 685, "", {
        fontSize: "8px",
        fontStyle: "bold",
        color: "#7e5749",
      }).setFixedSize(88, 10).setDepth(142);
      body.on("pointerdown", () => body.setScale(0.97));
      body.on("pointerout", () => body.setScale(1));
      body.on("pointerup", () => {
        body.setScale(1);
        const wasOpen = this.openUltimateIndex === index;
        this.selectPlanChoice(uid);
        if (wasOpen) this.hideUltimateDetail();
        else this.showUltimateDetail(index);
      });
      this.ultimateActionControls.push({ uid, body, glyphText, titleText, stateText });
    });
  }

  private drawHandArea() {
    const headerBand = this.add.graphics().setDepth(144);
    headerBand.fillStyle(0xe2d293, 0.62).fillRoundedRect(14, 706, 402, 21, 5);
    headerBand.lineStyle(1, INK, 0.24).lineBetween(22, 726, 408, 726);
    this.handLabel = this.text(22, 709, "手牌 0 · 依次选2招", {
      fontSize: "11px",
      fontStyle: "bold",
      color: css(BOXER_ACCENT),
    }).setDepth(150);
    this.pileLabel = this.text(408, 710, "抽0 · 弃0", {
      fontSize: "9px",
      fontStyle: "bold",
      color: "#655e43",
    }).setOrigin(1, 0).setDepth(150);
    this.handLayer = this.add.container(0, 0).setDepth(145);
    this.reviewLayer = this.add.container(0, 0).setDepth(147);
    this.intentLayer = this.add.container(0, 0).setDepth(150);
    this.intentDetailLayer = this.add.container(0, 0).setDepth(280);
    this.ultimateDetailLayer = this.add.container(0, 0).setDepth(360);
    this.footerText = this.text(24, 840, "", {
      fontSize: "9px",
      fontStyle: "bold",
      color: "#fff3c8",
      wordWrap: { width: 382, useAdvancedWrap: true },
      maxLines: 1,
    }).setOrigin(0, 0.5).setDepth(180);
  }

  private get playerProfession() {
    return PLAYER_PROFESSIONS[this.selectedProfessionId];
  }

  private get opponentProfession() {
    return THIEF_ENEMY;
  }

  private fighterLabel(fighter: FighterState) {
    return fighter === this.player ? this.playerProfession.label : this.opponentProfession.label;
  }

  private fighterAccent(fighter: FighterState) {
    return fighter === this.player ? this.playerProfession.accent : this.opponentProfession.accent;
  }

  private buildDeck() {
    this.deck = this.playerProfession.deck.map((actionId) => ({
      uid: ++this.cardSerial,
      actionId,
    }));
    Phaser.Utils.Array.Shuffle(this.deck);
  }

  private applyProfessionChoice(professionId: PlayerProfessionId) {
    const profession = PLAYER_PROFESSIONS[professionId];
    this.selectedProfessionId = professionId;
    const rival = this.opponentProfession;
    this.round = 1;
    this.distance = 3;
    this.cardSerial = 0;
    this.formTrail = [];
    this.enemyFormTrail = [];
    this.playerTacticHistory = [];
    this.enemyRead = null;
    this.deck = [];
    this.discard = [];
    this.hand = [];
    this.selectedIds = [];
    this.playerPlan = [];
    this.player.id = profession.fighterId;
    this.player.name = profession.fighterName;
    this.player.subtitle = profession.subtitle;
    this.player.maxHp = profession.maxHp;
    this.player.hp = profession.maxHp;
    this.player.guard = 0;
    this.player.momentum = profession.startingMomentum;
    this.player.retreat = MAX_RETREAT;
    this.player.parryReady = false;
    this.player.sealedActions = 0;
    this.player.counterDamage = 0;
    this.player.counterRetreat = false;
    this.player.counterRetreatSelf = false;
    this.player.bleed = 0;
    this.player.rig.setArchetype(profession.fighterId, "up", fighterTexture(profession.fighterId, "up"));
    this.enemy.id = rival.fighterId;
    this.enemy.name = rival.fighterName;
    this.enemy.subtitle = rival.subtitle;
    this.enemy.maxHp = rival.maxHp;
    this.enemy.hp = rival.maxHp;
    this.enemy.guard = 0;
    this.enemy.momentum = 0;
    this.enemy.retreat = MAX_RETREAT;
    this.enemy.parryReady = false;
    this.enemy.sealedActions = 0;
    this.enemy.counterDamage = 0;
    this.enemy.counterRetreat = false;
    this.enemy.counterRetreatSelf = false;
    this.enemy.bleed = 0;
    this.enemy.rig.setArchetype(rival.fighterId, "down", fighterTexture(rival.fighterId, "down"));
    const [enemyY, playerY] = this.positionsForDistance(this.distance);
    this.player.rig.setPosition(FIGHTER_X, playerY);
    this.enemy.rig.setPosition(FIGHTER_X, enemyY);
    this.buildDeck();
    this.prepareRound(true);
  }

  private prepareRound(initial: boolean) {
    this.player.guard = 0;
    this.enemy.guard = 0;
    this.player.parryReady = false;
    this.enemy.parryReady = false;
    this.player.counterDamage = 0;
    this.enemy.counterDamage = 0;
    this.player.counterRetreat = false;
    this.enemy.counterRetreat = false;
    this.player.counterRetreatSelf = false;
    this.enemy.counterRetreatSelf = false;
    this.player.evadeBeat = -1;
    this.enemy.evadeBeat = -1;
    this.player.staggeredBeat = -1;
    this.enemy.staggeredBeat = -1;
    this.roundEvents = { playerBlocked: false, playerParried: false, enemyMissed: false };
    this.selectedIds = [];
    this.playerPlan = [];
    this.records = [];
    this.activeBeat = -1;
    this.openIntentIndex = null;
    this.openUltimateIndex = null;
    this.ultimateDetailPanel = undefined;
    this.ultimateDetailLayer.removeAll(true);
    this.combo = "steady";
    this.drawToHand();
    this.enemyIntent = this.chooseEnemyPlan();
    this.enemyPlan = [this.enemyIntent.first, this.enemyIntent.defaultSecond];
    this.enemyBranchTriggered = null;
    this.phase = initial ? "intro" : "planning";
    this.player.rig.resetPose();
    this.enemy.rig.resetPose();
    this.roundText.setText(`第${this.round}合`);
    this.renderEnemyIntent();
    this.renderPlanner();
    this.renderHand();
    this.syncAll(false);
    if (!initial) this.showCallout(`第${this.round}合 · 敌招已明`, this.opponentProfession.accent, 520);
  }

  private drawToHand() {
    while (this.hand.length < HAND_LIMIT) {
      if (this.deck.length === 0) {
        if (this.discard.length === 0) break;
        this.deck = Phaser.Utils.Array.Shuffle(this.discard.splice(0));
      }
      const next = this.deck.pop();
      if (next) this.hand.push(next);
    }
  }

  private chooseEnemyPlan(): EnemyIntentPlan {
    const ultimate = ACTIONS["thief-ultimate"];
    const ultimateReady = this.actionLockReason(
      ultimate,
      this.enemyFormTrail,
      this.enemy.momentum,
      this.distance,
    ) === null;
    if (ultimateReady) {
      return {
        first: "thief-feint",
        defaultSecond: "thief-ultimate",
        branch: { trigger: "move", action: "thief-hook", label: "移动则以钩索截步，不强行空放绝招" },
      };
    }
    if (this.enemyRead === "attack" && this.enemy.retreat > 0) {
      return {
        first: "thief-feint",
        defaultSecond: "thief-slash",
        branch: { trigger: "attack", action: "thief-retreat", label: "抢攻则抽身闪避慢招" },
      };
    }
    if (this.enemyRead === "guard" && this.distance === 2) {
      return {
        first: "thief-step",
        defaultSecond: "thief-plunder",
        branch: { trigger: "guard", action: "thief-break", label: "架招则改用重斩破护" },
      };
    }
    if (this.distance >= 4) {
      return {
        first: "thief-step",
        defaultSecond: "thief-hook",
        branch: { trigger: "attack", action: "thief-retreat", label: "远处抢攻则翻身抽离，不白送追击" },
      };
    }
    if (this.distance === 3) {
      return {
        first: "thief-step",
        defaultSecond: "thief-slash",
        branch: { trigger: "move", action: "thief-hook", label: "移动则改用钩索封步" },
      };
    }
    if (this.distance === 2) {
      return {
        first: "thief-feint",
        defaultSecond: "thief-slash",
        branch: { trigger: "parry", action: "thief-feint", label: "化劲则继续诈手打空门" },
      };
    }
    return {
      first: "thief-slash",
      defaultSecond: "thief-break",
      branch: { trigger: "parry", action: "thief-feint", label: "化劲则收刀诈手，不送实招" },
    };
  }

  private resolveEnemySecondAction() {
    const branch = this.enemyIntent.branch;
    if (!branch) return;
    const playerOpening = ACTIONS[this.playerPlan[0]];
    const triggered = triggerForAction(playerOpening) === branch.trigger;
    this.enemyBranchTriggered = triggered;
    this.enemyPlan[1] = triggered ? branch.action : this.enemyIntent.defaultSecond;
    this.renderEnemyIntent();
    if (triggered) {
      this.showCallout(`盗贼变招\n${branch.label}`, THIEF_ACCENT, 820);
    }
  }

  private renderEnemyIntent() {
    this.intentLayer.removeAll(true);
    const intentAccent = this.opponentProfession.accent;
    const labelBody = this.add.rectangle(204, 130, 50, 34, intentAccent, 0.11)
      .setStrokeStyle(1.2, intentAccent, 0.7);
    const label = this.text(204, 130, "敌招\n意图", {
      fontSize: "9px",
      fontStyle: "bold",
      align: "center",
      lineSpacing: -2,
      color: css(intentAccent),
    }).setOrigin(0.5);
    this.intentLayer.add([labelBody, label]);
    this.enemyPlan.forEach((actionId, index) => {
      const action = ACTIONS[actionId];
      const x = 270 + index * 82;
      const active = this.phase === "resolving" && this.activeBeat === index;
      const expanded = this.openIntentIndex === index;
      const body = this.add.rectangle(
        x,
        130,
        78,
        34,
        active ? intentAccent : expanded ? 0xe7d7b7 : PAPER_LIGHT,
        active ? 0.95 : 1,
      )
        .setStrokeStyle(expanded ? 2.2 : 1.4, intentAccent, 0.9)
        .setInteractive({ useHandCursor: true });
      const glyph = this.text(x - 29, 122, action.glyph, {
        fontSize: "10px",
        fontStyle: "bold",
        color: active ? "#fff4cf" : css(intentAccent),
      }).setOrigin(0.5);
      const title = this.text(x + 7, 122, action.title.slice(0, 4), {
        fontSize: "8px",
        fontStyle: "bold",
        color: active ? "#fff4cf" : css(INK),
      }).setOrigin(0.5);
      body.on("pointerdown", () => body.setScale(0.96));
      body.on("pointerout", () => body.setScale(1));
      body.on("pointerup", () => {
        body.setScale(1);
        this.showEnemyIntentDetail(index);
      });
      this.intentLayer.add([body, glyph, title]);
      if (index === 1 && this.enemyIntent.branch) {
        const branchMark = this.text(x + 31, 116, "变", {
          fontSize: "8px",
          fontStyle: "bold",
          color: active ? "#fff4cf" : css(THIEF_ACCENT),
        }).setOrigin(0.5);
        this.intentLayer.add(branchMark);
      }
      const tokens = intentEffectTokens(action);
      const widths = tokens.map((token) => Math.max(14, token.label.length * 7 + 5));
      const totalWidth = widths.reduce((sum, width) => sum + width, 0) + Math.max(0, tokens.length - 1) * 2;
      let cursorX = x - totalWidth / 2;
      tokens.forEach((token, tokenIndex) => {
        const width = widths[tokenIndex];
        const tokenX = cursorX + width / 2;
        const pill = this.add.rectangle(tokenX, 141, width, 12, PAPER_LIGHT, 0.96)
          .setStrokeStyle(1, token.color, 0.82);
        const tokenText = this.text(tokenX, 141, token.label, {
          fontSize: "8px",
          fontStyle: "bold",
          color: css(token.color),
        }).setOrigin(0.5);
        this.intentLayer.add([pill, tokenText]);
        cursorX += width + 2;
      });
    });
    if (this.enemyIntent.branch) {
      const branch = this.enemyIntent.branch;
      const branchAction = ACTIONS[branch.action];
      const state = this.enemyBranchTriggered === true
        ? `已变：${branchAction.title}`
        : this.enemyBranchTriggered === false
          ? `守原：${ACTIONS[this.enemyIntent.defaultSecond].title}`
          : `若${triggerLabel(branch.trigger)} → ${branchAction.title}`;
      const branchHint = this.text(244, 149, state, {
        fontSize: "8px",
        fontStyle: "bold",
        color: css(THIEF_ACCENT),
      }).setFixedSize(162, 10).setDepth(151);
      this.intentLayer.add(branchHint);
    }
    this.renderIntentDetail();
  }

  private showEnemyIntentDetail(index: number) {
    if (this.phase === "resolving" || this.phase === "ended") return;
    this.hideUltimateDetail();
    this.openIntentIndex = this.openIntentIndex === index ? null : index;
    this.renderEnemyIntent();
  }

  private renderIntentDetail() {
    this.intentDetailLayer.removeAll(true);
    if (this.openIntentIndex === null) return;
    const action = ACTIONS[this.enemyPlan[this.openIntentIndex]];
    if (!action) return;
    const intentAccent = this.opponentProfession.accent;
    const typeLabel = action.type === "attack"
      ? `攻击 · ${action.minRange}-${action.maxRange}步`
      : action.type === "move"
        ? "步法 · 改变1步距离"
        : action.type === "guard"
          ? `防守 · 护架${action.guard}`
          : "拆招 · 化去攻击";
    const shadow = this.add.rectangle(218, 247, 350, 80, INK, 0.2);
    const panel = this.add.rectangle(215, 243, 350, 80, PAPER_LIGHT, 1)
      .setStrokeStyle(2, intentAccent, 1);
    const rail = this.add.rectangle(45, 243, 6, 66, intentAccent, 1);
    const heading = this.text(58, 211, `第${this.openIntentIndex + 1}拍 · ${action.title}`, {
      fontSize: "12px",
      fontStyle: "bold",
      color: css(intentAccent),
    });
    const meta = this.text(58, 232, `${SPEED_LABEL[action.speed]}手 · ${typeLabel}`, {
      fontSize: "9px",
      fontStyle: "bold",
      color: "#5f5940",
    });
    const branch = this.openIntentIndex === 1 ? this.enemyIntent.branch : undefined;
    const branchDescription = branch
      ? `${action.description}\n条件变招｜若${triggerLabel(branch.trigger)}，则改用${ACTIONS[branch.action].title}：${branch.label}。`
      : action.description;
    const description = this.text(58, 252, branchDescription, {
      fontSize: "9px",
      fontStyle: "bold",
      color: css(INK),
      wordWrap: { width: 272, useAdvancedWrap: true },
      maxLines: 3,
    });
    const closeBody = this.add.rectangle(365, 220, 34, 24, PAPER, 1)
      .setStrokeStyle(1.3, intentAccent, 0.9)
      .setInteractive({ useHandCursor: true });
    const closeText = this.text(365, 220, "收起", {
      fontSize: "8px",
      fontStyle: "bold",
      color: css(intentAccent),
    }).setOrigin(0.5);
    closeBody.on("pointerup", () => {
      this.openIntentIndex = null;
      this.renderEnemyIntent();
    });
    this.intentDetailLayer.add([shadow, panel, rail, heading, meta, description, closeBody, closeText]);
  }

  private renderHand() {
    this.handLayer.removeAll(true);
    this.reviewLayer.removeAll(true);
    this.handLabel.setText(
      this.phase === "review"
        ? "回合复盘 · 点上方拍位切换"
        : `手牌 ${this.hand.length} · 式 ${this.formTrail.join("") || "待起"}`,
    );
    this.pileLabel.setText(`抽${this.deck.length} · 弃${this.discard.length}`);
    if (this.phase === "review") {
      this.renderReviewPanel(this.activeBeat < 0 ? 0 : this.activeBeat);
      return;
    }

    const cardGroups: Phaser.GameObjects.Container[] = [];
    this.hand.forEach((card, index) => {
      const action = ACTIONS[card.actionId];
      const selectedIndex = this.selectedIds.indexOf(card.uid);
      const selected = selectedIndex >= 0;
      const previewIds = [...this.selectedIds];
      if (!selected) {
        if (previewIds.length < PLAN_LIMIT) previewIds.push(card.uid);
        else {
          previewIds.shift();
          previewIds.push(card.uid);
        }
      }
      const previewPlan = previewIds
        .map((uid) => this.actionIdForChoice(uid))
        .filter((actionId): actionId is ActionId => Boolean(actionId));
      const previewIndex = selected ? selectedIndex : Math.max(0, previewPlan.length - 1);
      const lockReason = action.ultimate
        ? this.projectedActionLockReason(action, previewPlan, previewIndex)
        : null;
      const x = 56 + index * 106;
      const y = selected ? 775 : 779;
      const accent = actionColor(action);
      const group = this.add.container(x, y).setScale(selected ? 1.035 : 1);
      const shadow = this.add.rectangle(3, 4, 94, 98, INK, 0.2);
      const body = this.add.rectangle(0, 0, 94, 98, action.ultimate ? 0xffe7aa : PAPER_LIGHT, 1)
        .setStrokeStyle(selected ? 2.8 : action.ultimate ? 2.3 : 1.8, selected ? accent : action.ultimate ? OCHRE : INK, 1)
        .setInteractive({ useHandCursor: true });
      const headerColor = action.ultimate ? 0x8f302e : accent;
      const header = this.add.rectangle(0, -40, 88, 16, headerColor, selected ? 1 : 0.82);
      const glyphWash = this.add.circle(-29, -17, 13, accent, 0.13);
      const glyph = this.text(-29, -17, action.glyph, {
        fontSize: "14px",
        fontStyle: "bold",
        color: css(accent),
      }).setOrigin(0.5);
      const title = this.text(-9, -44, action.title, {
        fontSize: "8px",
        fontStyle: "bold",
        color: action.ultimate || selected ? "#fff4cf" : css(INK),
      }).setOrigin(0.5, 0);
      const description = this.text(-40, -1, action.description, {
        fontSize: "8px",
        fontStyle: "bold",
        color: "#514d38",
        wordWrap: { width: 80, useAdvancedWrap: true },
        maxLines: 3,
        lineSpacing: 1,
      });
      const range = action.type === "attack"
        ? `${action.minRange}-${action.maxRange}步`
        : action.type === "move"
          ? "移距1步"
          : action.type === "guard"
            ? `护架${action.guard}`
            : "化下一击";
      const footerCopy = action.ultimate
        ? lockReason
          ? `封 · ${lockReason}`
          : "绝式已成 · 可发动"
        : `${SPEED_LABEL[action.speed]} · ${range}`;
      const footer = this.text(-40, 34, footerCopy, {
        fontSize: "8px",
        fontStyle: "bold",
        color: lockReason ? "#8d3e33" : css(accent),
        wordWrap: { width: 80, useAdvancedWrap: true },
        maxLines: 2,
      });
      group.add([shadow, body, header, glyphWash, glyph, title, description, footer]);
      if (selected) {
        const badge = this.add.circle(-38, -41, 9, INK, 1).setStrokeStyle(1.5, accent, 1);
        const badgeText = this.text(-38, -41, String(selectedIndex + 1), {
          fontSize: "9px",
          fontStyle: "bold",
          color: "#fff3cb",
        }).setOrigin(0.5);
        group.add([badge, badgeText]);
      }
      body.on("pointerdown", () => group.setScale(selected ? 1.01 : 0.98));
      body.on("pointerout", () => group.setScale(selected ? 1.035 : 1));
      body.on("pointerup", () => {
        group.setScale(selected ? 1.035 : 1);
        this.selectPlanChoice(card.uid);
      });
      if (this.phase !== "planning") group.setAlpha(0.48);
      this.handLayer.add(group);
      cardGroups.push(group);
    });
    this.selectedIds.forEach((uid) => {
      const index = this.hand.findIndex((card) => card.uid === uid);
      if (index >= 0 && cardGroups[index]) this.handLayer.bringToTop(cardGroups[index]);
    });
  }

  private renderReviewPanel(index: number) {
    const record = this.records[index];
    const panel = this.add.rectangle(215, 778, 390, 98, PAPER_LIGHT, 0.98)
      .setStrokeStyle(1.8, INK, 0.9);
    const rail = this.add.rectangle(26, 778, 6, 84, index === 0 ? TEAL : this.playerProfession.accent, 1);
    this.reviewLayer.add([panel, rail]);
    if (!record) return;
    const heading = this.text(38, 735, record.heading, {
      fontSize: "11px",
      fontStyle: "bold",
      color: css(index === 0 ? TEAL : this.playerProfession.accent),
    });
    const versus = this.text(395, 737, `${record.playerAction}  ↔  ${record.enemyAction}`, {
      fontSize: "8px",
      fontStyle: "bold",
      color: "#655e43",
    }).setOrigin(1, 0);
    const detail = this.text(39, 759, record.lines.join("\n"), {
      fontSize: "8px",
      fontStyle: "bold",
      color: "#3f3d2e",
      wordWrap: { width: 350, useAdvancedWrap: true },
      maxLines: 3,
      lineSpacing: 2,
    });
    this.reviewLayer.add([heading, versus, detail]);
  }

  private renderPlanner() {
    const plan = this.phase === "planning"
      ? this.selectedIds
        .map((uid) => this.actionIdForChoice(uid))
        .filter((actionId): actionId is ActionId => Boolean(actionId))
      : this.playerPlan;
    this.combo = "steady";
    plan.forEach((actionId, index) => {
      if (index === 0) return;
      this.combo = comboFor(ACTIONS[plan[0]], ACTIONS[actionId]);
    });
    this.planSlots.forEach((slot, index) => {
      const actionId = plan[index];
      const action = actionId ? ACTIONS[actionId] : undefined;
      const active = this.phase === "resolving" && this.activeBeat === index;
      const reviewActive = this.phase === "review" && this.activeBeat === index;
      const accent = index === 0 ? TEAL : this.playerProfession.accent;
      slot.body.setFillStyle(active || reviewActive ? accent : PAPER_LIGHT, active ? 0.94 : 0.98);
      slot.body.setStrokeStyle(active || reviewActive ? 2.5 : 1.6, active || reviewActive ? accent : INK, 0.86);
      slot.actionText.setText(action?.title ?? "待定");
      slot.actionText.setColor(active ? "#fff4cf" : action ? css(INK) : "#716a4b");
      slot.indexText.setText(`${index + 1} ${action ? SPEED_LABEL[action.speed] : ""}`.trim());
      slot.indexText.setColor(css(index === 0 ? TEAL : this.playerProfession.accent));
    });

    this.fixedActionControls.forEach((control) => {
      const selectedIndex = this.selectedIds.indexOf(control.uid);
      const selected = this.phase === "planning" && selectedIndex >= 0;
      control.body.setFillStyle(selected ? TEAL : PAPER_LIGHT, selected ? 0.96 : 0.96);
      control.body.setStrokeStyle(selected ? 2.4 : 1.5, TEAL, selected ? 1 : 0.78);
      control.labelText
        .setText(`${selected ? `${selectedIndex + 1}·` : ""}${control.uid === FIXED_ADVANCE_UID ? "进↑" : "退↓"}`)
        .setColor(selected ? "#fff4cf" : css(TEAL));
      control.hintText
        .setText(
          control.uid === FIXED_ADVANCE_UID
            ? `可复退·${this.player.retreat}`
            : this.player.retreat > 0
              ? `退路${this.player.retreat}`
              : "抵墙",
        )
        .setColor(selected ? "#fff4cf" : this.player.retreat > 0 ? "#696347" : css(RED));
      control.body.setAlpha(this.phase === "planning" ? 1 : 0.5);
      control.labelText.setAlpha(this.phase === "planning" ? 1 : 0.55);
      control.hintText.setAlpha(this.phase === "planning" ? 1 : 0.55);
    });

    if (plan.length === 2) {
      const copy = comboCopy(this.combo);
      this.comboText.setText(`章法·${copy.title}｜${copy.detail}`);
    } else {
      this.comboText.setText("依次选择两招；进可复退，退会消耗退路");
    }

    if (this.phase === "planning") {
      const ready = plan.length === PLAN_LIMIT;
      this.confirmBody.setFillStyle(ready ? this.playerProfession.accent : 0xbbae7c, ready ? 0.96 : 0.35);
      this.confirmText.setText(ready ? "开招" : "选满两招");
      this.confirmText.setColor(ready ? "#fff3cb" : "#6f6247");
    } else if (this.phase === "review") {
      this.confirmBody.setFillStyle(TEAL, 0.96);
      this.confirmText.setText("下一回合").setColor("#fff3cb");
    } else {
      this.confirmBody.setFillStyle(0xbbae7c, 0.35);
      this.confirmText.setText(this.phase === "resolving" ? "交锋中" : "已结束").setColor("#6f6247");
    }
    this.beatPills.forEach((body, index) => {
      const active = this.activeBeat === index && (this.phase === "resolving" || this.phase === "review");
      body.setFillStyle(active ? (index === 0 ? TEAL : this.playerProfession.accent) : PAPER_LIGHT, active ? 0.95 : 0.9);
    });
    this.renderUltimateControls();
    this.renderEnemyIntent();
  }

  private renderUltimateControls() {
    this.ultimateActionControls.forEach((_control, index) => {
      const { action, control, selectedIndex, selected, reason } = this.ultimatePreviewState(index);
      const accent = this.playerProfession.accent;
      const inspected = this.openUltimateIndex === index;
      control.body
        .setFillStyle(selected ? accent : inspected ? 0xf0d28e : reason ? 0xd5c997 : PAPER_LIGHT, selected ? 0.96 : reason ? 0.6 : 0.99)
        .setStrokeStyle(selected ? 2.5 : inspected ? 3 : reason ? 1.2 : 2, selected ? accent : inspected ? 0x8f302e : reason ? 0x8d8262 : accent, 0.96)
        .setAlpha(this.phase === "planning" ? 1 : 0.48);
      control.glyphText
        .setText(selected ? String(selectedIndex + 1) : action.glyph)
        .setColor(selected ? "#fff4cf" : reason ? "#81775b" : css(accent))
        .setAlpha(this.phase === "planning" ? 1 : 0.55);
      control.titleText
        .setText(action.title)
        .setColor(selected ? "#fff4cf" : reason ? "#6f6851" : css(INK))
        .setAlpha(this.phase === "planning" ? 1 : 0.55);
      const range = action.minRange === action.maxRange
        ? `${action.minRange}步`
        : `${action.minRange}-${action.maxRange}步`;
      const tier = ultimateTier(action);
      const recipe = action.requiresForms?.join("+") ?? "";
      control.stateText
        .setText(selected ? "已编入出招" : reason ? `${tier}·${recipe}·${action.requiresMomentum}势` : `${tier}·可发动·${range}`)
        .setColor(selected ? "#fff4cf" : reason ? "#866152" : css(accent))
        .setAlpha(this.phase === "planning" ? 1 : 0.55);
    });
  }

  private ultimatePreviewState(index: number) {
    const control = this.ultimateActionControls[index];
    const action = ACTIONS[this.playerProfession.ultimates[index]];
    const selectedIndex = this.selectedIds.indexOf(control.uid);
    const selected = this.phase === "planning" && selectedIndex >= 0;
    const previewIds = [...this.selectedIds];
    if (!selected) {
      if (previewIds.length < PLAN_LIMIT) previewIds.push(control.uid);
      else {
        previewIds.shift();
        previewIds.push(control.uid);
      }
    }
    const previewPlan = previewIds
      .map((uid) => this.actionIdForChoice(uid))
      .filter((actionId): actionId is ActionId => Boolean(actionId));
    const previewIndex = selected ? selectedIndex : Math.max(0, previewPlan.length - 1);
    const reason = this.phase === "planning"
      ? this.projectedActionLockReason(action, previewPlan, previewIndex)
      : this.actionLockReason(action, this.formTrail, this.player.momentum, this.distance);
    return { action, control, selectedIndex, selected, reason };
  }

  private showUltimateDetail(index: number) {
    if (!this.ultimateActionControls[index]) return;
    this.tweens.killTweensOf(this.arenaCallout);
    this.arenaCallout.setAlpha(0);
    this.openUltimateIndex = index;
    this.openIntentIndex = null;
    this.renderEnemyIntent();
    this.renderUltimateControls();
    this.renderUltimateDetail();
  }

  private hideUltimateDetail() {
    if (this.openUltimateIndex === null) return;
    this.openUltimateIndex = null;
    this.ultimateDetailPanel = undefined;
    this.ultimateDetailLayer.removeAll(true);
    this.renderUltimateControls();
  }

  private renderUltimateDetail() {
    this.ultimateDetailLayer.removeAll(true);
    this.ultimateDetailPanel = undefined;
    if (this.openUltimateIndex === null) return;
    const { action, selectedIndex, selected, reason } = this.ultimatePreviewState(this.openUltimateIndex);
    const accent = this.playerProfession.accent;
    const shadow = this.add.rectangle(218, 329, 390, 292, INK, 0.26);
    const panel = this.add.rectangle(215, 325, 390, 292, PAPER_LIGHT, 1)
      .setStrokeStyle(2.5, accent, 1)
      .setInteractive();
    this.ultimateDetailPanel = panel;
    const rail = this.add.rectangle(27, 325, 7, 276, accent, 1);
    const heading = this.text(42, 188, `${action.glyph} · ${action.title}`, {
      fontSize: "14px",
      fontStyle: "bold",
      color: css(accent),
    });
    const closeBody = this.add.rectangle(380, 194, 44, 24, PAPER, 1)
      .setStrokeStyle(1.4, accent, 0.92)
      .setInteractive({ useHandCursor: true });
    const closeText = this.text(380, 194, "收起", {
      fontSize: "8px",
      fontStyle: "bold",
      color: css(accent),
    }).setOrigin(0.5);
    const meta = this.text(
      42,
      215,
      `${ultimateTier(action)} · ${SPEED_LABEL[action.speed]}手 · 距离${actionRangeLabel(action)} · 耗${action.consumeMomentum ?? 0}势`,
      { fontSize: "9px", fontStyle: "bold", color: "#5f563d" },
    );
    const recipe = this.text(42, 236, `前置招式｜${action.requiresForms?.join("＋") || "无"}（顺序不限）`, {
      fontSize: "9px",
      fontStyle: "bold",
      color: css(INK),
    });
    const stateBody = this.add.rectangle(215, 263, 346, 30, reason ? 0xf1d0b3 : 0xcfe2cf, 0.96)
      .setStrokeStyle(1.3, reason ? RED : TEAL, 0.9);
    const state = this.text(
      48,
      263,
      selected
        ? `当前状态｜已编入第${selectedIndex + 1}手`
        : reason
          ? `当前未成式｜${reason}`
          : "当前状态｜条件满足，可以发动",
      {
        fontSize: "9px",
        fontStyle: "bold",
        color: css(reason ? RED : TEAL),
        wordWrap: { width: 326, useAdvancedWrap: true },
      },
    ).setOrigin(0, 0.5);
    const summary = this.text(42, 287, action.description, {
      fontSize: "9px",
      fontStyle: "bold",
      color: css(INK),
      wordWrap: { width: 344, useAdvancedWrap: true },
      maxLines: 2,
      lineSpacing: 1,
    });
    const effectHeading = this.text(42, 322, "完整结算", {
      fontSize: "10px",
      fontStyle: "bold",
      color: "#8f302e",
    });
    const effects = this.text(42, 342, ultimateEffectLines(action).join("\n"), {
      fontSize: "9px",
      fontStyle: "bold",
      color: "#39372b",
      wordWrap: { width: 344, useAdvancedWrap: true },
      maxLines: 9,
      lineSpacing: 2,
    });
    const hint = this.text(388, 452, "点面板外收起", {
      fontSize: "8px",
      fontStyle: "bold",
      color: "#6f674d",
    }).setOrigin(1, 0);
    closeBody.on("pointerdown", () => closeBody.setScale(0.95));
    closeBody.on("pointerout", () => closeBody.setScale(1));
    closeBody.on("pointerup", () => this.hideUltimateDetail());
    this.ultimateDetailLayer.add([
      shadow,
      panel,
      rail,
      heading,
      closeBody,
      closeText,
      meta,
      recipe,
      stateBody,
      state,
      summary,
      effectHeading,
      effects,
      hint,
    ]);
  }

  private handleScenePointerUp(pointer: Phaser.Input.Pointer) {
    if (this.openUltimateIndex === null) return;
    if (this.ultimateDetailPanel?.getBounds().contains(pointer.worldX, pointer.worldY)) return;
    const tappedUltimate = this.ultimateActionControls.some((control) => (
      control.body.getBounds().contains(pointer.worldX, pointer.worldY)
    ));
    if (!tappedUltimate) this.hideUltimateDetail();
  }

  private actionIdForChoice(uid: number) {
    const fixed = FIXED_ACTIONS.get(uid);
    if (fixed) return fixed;
    const ultimateIndex = FIXED_ULTIMATE_UIDS.indexOf(uid as (typeof FIXED_ULTIMATE_UIDS)[number]);
    if (ultimateIndex >= 0) return this.playerProfession.ultimates[ultimateIndex];
    return this.hand.find((card) => card.uid === uid)?.actionId;
  }

  private projectedTrailBefore(plan: ActionId[], index: number) {
    const trail = [...this.formTrail];
    for (let planIndex = 0; planIndex < index; planIndex += 1) {
      const action = ACTIONS[plan[planIndex]];
      if (action?.ultimate) trail.splice(0);
      else if (action?.form) trail.push(action.form);
    }
    return trail.slice(-3);
  }

  private projectedMomentumBefore(plan: ActionId[], index: number) {
    let momentum = this.player.momentum;
    for (let planIndex = 0; planIndex < index; planIndex += 1) {
      const action = ACTIONS[plan[planIndex]];
      momentum = Math.min(MAX_MOMENTUM, momentum + (action?.momentumGain ?? 0));
      if (action?.ultimate) momentum = Math.max(0, momentum - (action.consumeMomentum ?? 0));
    }
    return momentum;
  }

  private projectedDistanceBefore(plan: ActionId[], index: number) {
    let distance = this.distance;
    for (let planIndex = 0; planIndex < index; planIndex += 1) {
      distance = clampDistance(distance + (ACTIONS[plan[planIndex]]?.distanceDelta ?? 0));
    }
    return distance;
  }

  private actionLockReason(
    action: ActionDef,
    trail: readonly FormGlyph[],
    momentum: number,
    distance: number,
  ) {
    if (!action.ultimate) return null;
    const required = action.requiresForms ?? [];
    const missing = required.filter((glyph) => !trail.includes(glyph));
    if (missing.length > 0) {
      return `还缺${missing.join("、")}式（顺序不限）`;
    }
    if (momentum < (action.requiresMomentum ?? 0)) {
      return `还缺${(action.requiresMomentum ?? 0) - momentum}势`;
    }
    const minRange = action.minRange ?? MIN_DISTANCE;
    const maxRange = action.maxRange ?? MAX_DISTANCE;
    if (distance < minRange || distance > maxRange) {
      return `须处于${minRange === maxRange ? minRange : `${minRange}-${maxRange}`}步`;
    }
    return null;
  }

  private projectedActionLockReason(action: ActionDef, plan: ActionId[], index: number) {
    return this.actionLockReason(
      action,
      this.projectedTrailBefore(plan, index),
      this.projectedMomentumBefore(plan, index),
      this.projectedDistanceBefore(plan, index),
    );
  }

  private recordCombatForm(actor: FighterState, action: ActionDef) {
    if (!action.form || action.ultimate) return;
    if (actor === this.player) {
      this.formTrail.push(action.form);
      this.formTrail = this.formTrail.slice(-3);
    } else {
      this.enemyFormTrail = this.enemyFormTrail.filter((glyph) => glyph !== action.form);
      this.enemyFormTrail.push(action.form);
      this.enemyFormTrail = this.enemyFormTrail.slice(-3);
    }
    const gain = action.momentumGain ?? 0;
    if (gain > 0) actor.momentum = Math.min(MAX_MOMENTUM, actor.momentum + gain);
    this.spawnFormStamp(actor, action.form, gain);
  }

  private spawnFormStamp(actor: FighterState, form: FormGlyph, gain: number) {
    const accent = this.fighterAccent(actor);
    const stamp = this.add.circle(actor.rig.root.x - 48, actor.rig.root.y, 15, PAPER_LIGHT, 0.96)
      .setStrokeStyle(2.4, accent, 0.95)
      .setDepth(300)
      .setScale(0.72);
    const glyph = this.text(stamp.x, stamp.y, form, {
      fontSize: "12px",
      fontStyle: "bold",
      color: css(accent),
    }).setOrigin(0.5).setDepth(301).setScale(0.72);
    if (gain > 0) this.spawnFloat(stamp.x + 34, stamp.y, `+${gain}势`, accent);
    this.tweens.add({
      targets: [stamp, glyph],
      scale: 1,
      duration: MOTION_ENABLED ? 150 : 1,
      ease: "Back.Out",
      yoyo: true,
      hold: MOTION_ENABLED ? 260 : 1,
      onComplete: () => {
        stamp.destroy();
        glyph.destroy();
      },
    });
  }

  private selectPlanChoice(uid: number) {
    if (this.phase !== "planning") return;
    const currentIndex = this.selectedIds.indexOf(uid);
    if (currentIndex >= 0) {
      this.selectedIds.splice(currentIndex, 1);
    } else {
      if (uid === FIXED_RETREAT_UID && this.player.retreat <= 0) {
        this.showCallout("退路已尽 · 背抵墙面\n先前进或成功化劲恢复退路", RED, 1100);
        this.footerText.setText("退路已尽：主动前进或成功化劲可恢复1点退路。");
        return;
      }
      const candidateIds = [...this.selectedIds];
      if (candidateIds.length < PLAN_LIMIT) candidateIds.push(uid);
      else {
        candidateIds.shift();
        candidateIds.push(uid);
      }
      const candidatePlan = candidateIds
        .map((choiceUid) => this.actionIdForChoice(choiceUid))
        .filter((actionId): actionId is ActionId => Boolean(actionId));
      const action = ACTIONS[candidatePlan.at(-1) ?? "advance"];
      const reason = action?.ultimate
        ? this.projectedActionLockReason(action, candidatePlan, candidatePlan.length - 1)
        : null;
      if (reason) {
        if (!action.ultimate) {
          this.showCallout(`${action.title}\n${action.description}\n未成式：${reason}`, this.playerProfession.accent, 1450);
        }
        this.footerText.setText(`${action.description} 当前未成式：${reason}。`);
        return;
      }
      this.selectedIds = candidateIds;
    }
    this.renderPlanner();
    this.renderHand();
    this.refreshFooter();
  }

  private handlePlanSlot(index: number) {
    if (this.phase === "planning") {
      if (index < this.selectedIds.length) {
        this.selectedIds.splice(index, 1);
        this.renderPlanner();
        this.renderHand();
        this.refreshFooter();
      }
      return;
    }
    if (this.phase === "review" && this.records[index]) {
      this.activeBeat = index;
      this.renderPlanner();
      this.renderHand();
      this.refreshFooter();
    }
  }

  private handleConfirm() {
    if (this.phase === "planning" && this.selectedIds.length === PLAN_LIMIT) {
      void this.startResolution();
      return;
    }
    if (this.phase === "review") void this.nextRound();
  }

  private async startResolution() {
    if (this.phase !== "planning" || this.selectedIds.length !== PLAN_LIMIT) return;
    this.playerPlan = this.selectedIds
      .map((uid) => this.actionIdForChoice(uid))
      .filter((actionId): actionId is ActionId => Boolean(actionId));
    if (this.playerPlan.length !== PLAN_LIMIT) return;
    for (let index = 0; index < this.playerPlan.length; index += 1) {
      const action = ACTIONS[this.playerPlan[index]];
      const reason = this.projectedActionLockReason(action, this.playerPlan, index);
      if (reason) {
        this.showCallout(`${action.title}尚未成式\n${reason}`, this.playerProfession.accent, 1050);
        this.footerText.setText(`无法开招：${reason}。调整顺序、距离或先积攒招式。`);
        return;
      }
    }
    this.combo = comboFor(ACTIONS[this.playerPlan[0]], ACTIONS[this.playerPlan[1]]);
    const used = this.hand.filter((card) => this.selectedIds.includes(card.uid));
    this.hand = this.hand.filter((card) => !this.selectedIds.includes(card.uid));
    this.discard.push(...used);
    this.phase = "resolving";
    this.activeBeat = 0;
    this.openIntentIndex = null;
    this.openUltimateIndex = null;
    this.ultimateDetailPanel = undefined;
    this.ultimateDetailLayer.removeAll(true);
    this.records = [];
    const token = ++this.resolutionToken;
    this.renderPlanner();
    this.renderHand();
    this.refreshFooter();

    for (let beat = 0; beat < PLAN_LIMIT; beat += 1) {
      if (token !== this.resolutionToken || this.phase !== "resolving") return;
      if (beat === 1) this.resolveEnemySecondAction();
      await this.resolveBeat(beat, token);
      if (token !== this.resolutionToken || this.phase !== "resolving") return;
      if (this.player.hp <= 0 || this.enemy.hp <= 0) {
        this.finishBattle(this.enemy.hp <= 0);
        return;
      }
    }

    await this.settleRoundTradeoffs(token);
    if (token !== this.resolutionToken || this.phase !== "resolving") return;
    if (this.player.hp <= 0 || this.enemy.hp <= 0) {
      this.finishBattle(this.enemy.hp <= 0);
      return;
    }
    this.updateEnemyRead();

    this.phase = "review";
    this.activeBeat = 1;
    this.player.rig.resetPose();
    this.enemy.rig.resetPose();
    this.renderPlanner();
    this.renderHand();
    this.syncAll(true);
    this.refreshFooter();
  }

  private async settleRoundTradeoffs(token: number) {
    const finalRecord = this.records.at(-1);
    if (this.player.parryReady) {
      this.player.parryReady = false;
      const lostForm = this.formTrail.pop();
      this.player.hp = Math.max(0, this.player.hp - 3);
      finalRecord?.lines.push(`化劲未接到实招，空门反噬3伤${lostForm ? `，并震散“${lostForm}”式` : ""}。`);
      this.showCallout("化劲落空 · 空门\n生命 -3", THIEF_ACCENT, 760);
      this.spawnFloat(this.player.rig.root.x, this.player.rig.root.y - 40, "空门 -3", RED);
      await this.animateStagger(this.player, token);
    }
    if (!this.playerPlan.some((actionId) => isAttack(ACTIONS[actionId]))) {
      this.enemy.momentum = Math.min(MAX_MOMENTUM, this.enemy.momentum + 1);
      finalRecord?.lines.push("本合我方未主动攻击，盗贼借势再积1势。 ");
      this.spawnFloat(this.enemy.rig.root.x, this.enemy.rig.root.y - 40, "+1势", THIEF_ACCENT);
    }
    this.syncAll(true);
  }

  private updateEnemyRead() {
    this.playerTacticHistory.push(...this.playerPlan.map((actionId) => triggerForAction(ACTIONS[actionId])));
    this.playerTacticHistory = this.playerTacticHistory.slice(-6);
    const recent = this.playerTacticHistory.slice(-4);
    const counts = new Map<EnemyTrigger, number>();
    recent.forEach((trigger) => counts.set(trigger, (counts.get(trigger) ?? 0) + 1));
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    this.enemyRead = ranked[0]?.[1] >= 2 ? ranked[0][0] : null;
  }

  private async resolveBeat(index: number, token: number) {
    const playerAction = ACTIONS[this.playerPlan[index]];
    const enemyAction = ACTIONS[this.enemyPlan[index]];
    const record: BeatRecord = {
      heading: index === 0 ? "第一拍 · 起手" : "第二拍 · 合手",
      playerAction: playerAction.title,
      enemyAction: enemyAction.title,
      lines: [],
    };
    this.records[index] = record;
    this.activeBeat = index;
    this.renderPlanner();
    this.showCallout(`${record.heading}\n${playerAction.title}  对  ${enemyAction.title}`, index === 0 ? TEAL : this.playerProfession.accent, 820);
    await this.wait(MOTION_ENABLED ? 440 : 1, token);
    if (token !== this.resolutionToken) return;

    const playerFirst = playerAction.speed > enemyAction.speed
      || (playerAction.speed === enemyAction.speed && this.round % 2 === 1);
    const order: Array<[FighterState, FighterState, ActionDef]> = playerFirst
      ? [[this.player, this.enemy, playerAction], [this.enemy, this.player, enemyAction]]
      : [[this.enemy, this.player, enemyAction], [this.player, this.enemy, playerAction]];
    record.lines.push(`${this.fighterLabel(order[0][0])}先动：${SPEED_LABEL[order[0][2].speed]}手压过对方。`);

    for (let actionIndex = 0; actionIndex < order.length; actionIndex += 1) {
      const [actor, target, action] = order[actionIndex];
      if (token !== this.resolutionToken || actor.hp <= 0 || target.hp <= 0) return;
      await this.presentActionCue(actor, action, index, actionIndex, token);
      if (token !== this.resolutionToken) return;
      await this.executeAction(actor, target, action, index, record, token);
      if (token !== this.resolutionToken) return;
      await this.wait(MOTION_ENABLED ? 180 : 1, token);
    }
    this.showCallout(`${record.heading} · 结`, index === 0 ? TEAL : this.playerProfession.accent, 460);
    await this.wait(MOTION_ENABLED ? 340 : 1, token);
  }

  private async presentActionCue(
    actor: FighterState,
    action: ActionDef,
    beat: number,
    actionIndex: number,
    token: number,
  ) {
    const actorName = this.fighterLabel(actor);
    const accent = this.fighterAccent(actor);
    this.showCallout(`${beat + 1}拍 · ${actionIndex + 1}手\n${actorName}｜${action.title}`, accent, 680);
    this.spawnActionFocus(actor, accent);
    await this.wait(MOTION_ENABLED ? 320 : 1, token);
  }

  private async executeAction(
    actor: FighterState,
    target: FighterState,
    action: ActionDef,
    beat: number,
    record: BeatRecord,
    token: number,
  ) {
    const actorName = this.fighterLabel(actor);
    if (actor.staggeredBeat === beat) {
      record.lines.push(`${actorName}仍在失衡，${action.title}被打断。`);
      await this.animateStagger(actor, token);
      return;
    }
    if (actor.sealedActions > 0) {
      actor.sealedActions -= 1;
      record.lines.push(`${actorName}经脉受制，${action.title}无法出手。`);
      this.showCallout(`锁脉生效\n${action.title}被封`, this.fighterAccent(target), 820);
      this.syncAll(true);
      await this.animateStagger(actor, token);
      return;
    }
    if (action.ultimate) {
      const trail = actor === this.player ? this.formTrail : this.enemyFormTrail;
      const reason = this.actionLockReason(action, trail, actor.momentum, this.distance);
      if (reason) {
        record.lines.push(`${actorName}${action.title}断式：${reason}。`);
        this.showCallout(`绝式被拆\n${reason}`, this.fighterAccent(target), 900);
        await this.animateStagger(actor, token);
        return;
      }
      actor.momentum = Math.max(0, actor.momentum - (action.consumeMomentum ?? 0));
      if (actor === this.player) this.formTrail = [];
      else this.enemyFormTrail = [];
      this.spawnFloat(actor.rig.root.x, actor.rig.root.y - 48, "绝式贯通", this.fighterAccent(actor));
      this.syncAll(true);
      await this.animateUltimateCharge(actor, action, token);
      record.lines.push(`${actorName}${ultimateTier(action)}所需式、势与距离齐备，${action.title}发动。`);
    }
    if (action.type === "move" && action.distanceDelta) {
      if (action.distanceDelta > 0 && actor.retreat <= 0) {
        record.lines.push(`${actorName}退路已尽、背抵墙面，${action.title}无法发动。`);
        this.showCallout(`${actorName}抵墙\n已无退路`, this.fighterAccent(target), 760);
        await this.animateStagger(actor, token);
        return;
      }
      const before = this.distance;
      await this.animateDistanceChange(actor, action.distanceDelta, token);
      const verb = action.distanceDelta < 0 ? "逼近" : "拉开";
      if (before !== this.distance) {
        if (action.distanceDelta > 0) {
          actor.retreat = Math.max(0, actor.retreat - 1);
          actor.evadeBeat = beat;
        } else {
          actor.retreat = Math.min(MAX_RETREAT, actor.retreat + 1);
        }
        this.recordCombatForm(actor, action);
      }
      record.lines.push(
        before === this.distance
          ? `${actorName}${action.title}，但已无处可移。`
          : `${actorName}${verb}1步：距离${before}→${this.distance}；退路${actor.retreat}/${MAX_RETREAT}。`,
      );
      this.syncAll(true);
      return;
    }
    if (action.type === "guard") {
      const bonus = actor === this.player && beat === 1 && this.combo === "cover" ? 3 : 0;
      if (action.punishesParry && target.parryReady) {
        target.parryReady = false;
        const damage = action.punishesParry;
        target.hp = Math.max(0, target.hp - damage);
        const targetTrail = target === this.player ? this.formTrail : this.enemyFormTrail;
        const lost = action.scatterForm ? targetTrail.splice(-action.scatterForm) : [];
        this.spawnFloat(target.rig.root.x, target.rig.root.y - 38, `诈手 -${damage}`, RED);
        target.rig.flash();
        record.lines.push(`${actorName}${action.title}识破化劲空门，直伤${damage}${lost.length ? `并震散“${lost.join("、")}”式` : ""}。`);
        await this.animateStagger(target, token);
      }
      actor.guard += (action.guard ?? 0) + bonus;
      if (actor === this.player) {
        this.enemy.momentum = Math.min(MAX_MOMENTUM, this.enemy.momentum + 1);
        record.lines.push("我方选择稳架，盗贼借压迫积1势。 ");
      }
      await this.animateGuard(actor, token);
      record.lines.push(`${actorName}架起${(action.guard ?? 0) + bonus}点护架。`);
      this.recordCombatForm(actor, action);
      this.syncAll(true);
      return;
    }
    if (action.type === "parry") {
      actor.parryReady = true;
      actor.counterDamage = action.counterDamage ?? 0;
      actor.counterRetreat = Boolean(action.counterRetreat);
      actor.counterRetreatSelf = Boolean(action.counterRetreatSelf);
      await this.animateParry(actor, token);
      record.lines.push(
        action.counterDamage
          ? `${actorName}布下绝式反击；化去下一击后回敬${action.counterDamage}伤。`
          : `${actorName}布下化劲，等待下一次攻击。`,
      );
      this.recordCombatForm(actor, action);
      this.syncAll(true);
      return;
    }
    const landed = await this.performAttack(actor, target, action, beat, record, token);
    if (landed && !action.ultimate) {
      this.recordCombatForm(actor, action);
      this.syncAll(true);
    }
  }

  private async performAttack(
    actor: FighterState,
    target: FighterState,
    action: ActionDef,
    beat: number,
    record: BeatRecord,
    token: number,
  ) {
    const actorName = this.fighterLabel(actor);
    const targetName = this.fighterLabel(target);
    let damage = action.damage ?? 0;
    let guardBreak = action.guardBreak ?? 0;
    let rangeBonus = 0;
    let stagger = Boolean(action.stagger);
    const comboNotes: string[] = [];

    if (actor === this.player && beat === 1) {
      if (this.combo === "press") {
        damage += 3;
        guardBreak += 4;
        comboNotes.push("强入破门");
      } else if (this.combo === "counter" && this.roundEvents.playerBlocked) {
        damage += 4;
        comboNotes.push("守中反打");
      } else if (this.combo === "bait" && this.roundEvents.enemyMissed) {
        damage += 5;
        rangeBonus += 1;
        comboNotes.push("引空回击");
      } else if (this.combo === "borrow" && this.roundEvents.playerParried) {
        damage += 6;
        stagger = true;
        comboNotes.push("借力打力");
      } else if (this.combo === "chain") {
        damage += 3;
        comboNotes.push("连环抢攻");
      }
    }

    const opposingAction = actor === this.player
      ? ACTIONS[this.enemyPlan[beat]]
      : ACTIONS[this.playerPlan[beat]];
    if (actor === this.player && action.bonusAfterForm && this.formTrail.at(-1) === action.bonusAfterForm) {
      damage += action.bonusDamage ?? 0;
      comboNotes.push(`${action.bonusAfterForm}式追击`);
    }
    if (action.interceptsMove && opposingAction?.type === "move") {
      damage += action.bonusDamage ?? 0;
      stagger = true;
      comboNotes.push("截步成功");
    }
    if (action.punishesGuard && target.guard > 0) {
      guardBreak += action.punishesGuard;
      comboNotes.push("问路破门");
    }
    if (actor === this.enemy && target.retreat <= 0) {
      damage += 3;
      comboNotes.push("抵墙破绽");
    }
    const minRange = action.minRange ?? 0;
    const maxRange = (action.maxRange ?? 0) + rangeBonus;
    const dodged = target.evadeBeat === beat && action.speed < 4;
    const inRange = this.distance >= minRange && this.distance <= maxRange;

    if (dodged || !inRange) {
      await this.animateMiss(actor, action, token);
      if (actor === this.enemy) this.roundEvents.enemyMissed = true;
      const reason = dodged ? `${targetName}撤步闪开` : `距离${this.distance}步，招式范围为${minRange}-${maxRange}步`;
      record.lines.push(`${actorName}${action.title}落空：${reason}。`);
      return false;
    }

    if (target.parryReady) {
      const counterDamage = target.counterDamage;
      const counterRetreat = target.counterRetreat;
      const counterRetreatSelf = target.counterRetreatSelf;
      target.parryReady = false;
      target.counterDamage = 0;
      target.counterRetreat = false;
      target.counterRetreatSelf = false;
      target.staggeredBeat = -1;
      actor.staggeredBeat = beat + 1;
      if (target === this.player) {
        target.momentum = Math.min(MAX_MOMENTUM, target.momentum + 2);
        this.roundEvents.playerParried = true;
      }
      target.retreat = Math.min(MAX_RETREAT, target.retreat + 1);
      await this.animateParriedStrike(actor, target, action, token);
      if (counterDamage > 0) {
        actor.hp = Math.max(0, actor.hp - counterDamage);
        await this.animateCounterStrike(target, actor, counterDamage, token);
        record.lines.push(`${targetName}化去${action.title}并反击${counterDamage}伤，${actorName}后一招被震散。`);
        if (counterRetreat && actor.hp > 0) {
          const mover = counterRetreatSelf ? target : actor;
          const before = this.distance;
          await this.animateDistanceChange(mover, 1, token, true);
          if (before !== this.distance) record.lines.push(`反击借位：距离${before}→${this.distance}。`);
        }
      } else {
        record.lines.push(`${targetName}化去${action.title}，${actorName}后一招被震散。`);
      }
      this.syncAll(true);
      return false;
    }

    await this.animateAttackLead(actor, action, token);
    const broken = action.pierceGuard ? target.guard : Math.min(target.guard, guardBreak);
    target.guard -= broken;
    const blocked = action.pierceGuard ? 0 : Math.min(target.guard, damage);
    target.guard -= blocked;
    const hpDamage = Math.max(0, damage - blocked);
    target.hp = Math.max(0, target.hp - hpDamage);
    if (action.suppressActions && hpDamage > 0) {
      target.sealedActions = Math.max(target.sealedActions, action.suppressActions);
      comboNotes.push(`封下一手`);
    }
    if (action.bleed && hpDamage > 0) {
      target.bleed = Math.max(target.bleed, action.bleed);
      comboNotes.push(`流血${action.bleed}`);
    }
    if (action.stealMomentum && hpDamage > 0) {
      const stolen = Math.min(target.momentum, action.stealMomentum);
      target.momentum -= stolen;
      actor.momentum = Math.min(MAX_MOMENTUM, actor.momentum + stolen);
      if (stolen > 0) comboNotes.push(`夺${stolen}势`);
    }
    if (action.scatterForm && hpDamage > 0) {
      const targetTrail = target === this.player ? this.formTrail : this.enemyFormTrail;
      const scattered = targetTrail.splice(-action.scatterForm);
      if (scattered.length > 0) comboNotes.push(`震散${scattered.join("、")}式`);
    }
    if (target === this.player && hpDamage > 0) {
      target.momentum = Math.max(0, target.momentum - 1);
    }
    if (target === this.player && blocked > 0) this.roundEvents.playerBlocked = true;
    if (stagger && hpDamage > 0) target.staggeredBeat = beat + 1;
    if (action.interceptsMove && opposingAction?.type === "move" && hpDamage > 0) target.staggeredBeat = beat;

    await this.animateImpact(actor, target, action, hpDamage, blocked, token);
    const pieces = [`${actorName}${action.title}`];
    if (comboNotes.length) pieces.push(comboNotes.join("＋"));
    if (broken > 0) pieces.push(`先破${broken}护架`);
    if (blocked > 0) pieces.push(`护架挡${blocked}`);
    pieces.push(hpDamage > 0 ? `实伤${hpDamage}` : "未伤及性命");
    record.lines.push(pieces.join("，") + "。 ");

    if (action.knockback && hpDamage > 0 && target.hp > 0) {
      const before = this.distance;
      await this.animateDistanceChange(target, 1, token, true);
      if (this.distance !== before) record.lines.push(`${targetName}被震退：距离${before}→${this.distance}。`);
    }
    this.syncAll(true);
    return true;
  }

  private separationForDistance(distance: number) {
    return CONTACT_SEPARATION + (clampDistance(distance) - 1) * DISTANCE_STEP_PIXELS;
  }

  private distanceForSeparation(separation: number) {
    return clampDistance(1 + Math.round((separation - CONTACT_SEPARATION) / DISTANCE_STEP_PIXELS));
  }

  private positionsForDistance(distance: number): [number, number] {
    const separation = this.separationForDistance(distance);
    return [
      ARENA_CENTER_Y - separation / 2,
      ARENA_CENTER_Y + separation / 2,
    ];
  }

  private async animateDistanceChange(
    actor: FighterState,
    delta: -1 | 1,
    token: number,
    forced = false,
  ) {
    const before = this.distanceForSeparation(
      Math.abs(this.player.rig.homePosition.y - this.enemy.rig.homePosition.y),
    );
    const requested = clampDistance(before + delta);
    actor.rig.setPose(delta < 0 ? 1 : 0);
    if (before === requested) {
      await this.animateStagger(actor, token);
      actor.rig.resetPose();
      return;
    }
    const [enemyY, playerY] = this.positionsForDistance(requested);
    const actorTargetY = actor === this.player ? playerY : enemyY;
    const other = actor === this.player ? this.enemy : this.player;
    const otherTargetY = other === this.player ? playerY : enemyY;
    this.spawnDust(actor.rig.root.x, actor.rig.groundY, forced ? this.fighterAccent(actor) : OCHRE);
    await Promise.all([
      this.tweenTo(
        actor.rig.root,
        { y: actorTargetY, scaleX: 1.03, scaleY: 0.98 },
        MOTION_ENABLED ? 290 : 1,
        "Cubic.Out",
        token,
      ),
      this.tweenTo(
        other.rig.root,
        { y: otherTargetY },
        MOTION_ENABLED ? 290 : 1,
        "Cubic.Out",
        token,
      ),
    ]);
    this.enemy.rig.commitHome();
    this.player.rig.commitHome();
    this.distance = requested;
    actor.rig.resetPose();
    this.syncAll(false);
  }

  private async animateGuard(actor: FighterState, token: number) {
    actor.rig.setPose(2);
    actor.rig.setGuarded(true);
    actor.rig.pulseShield();
    this.spawnGuardImpact(actor);
    await this.wait(MOTION_ENABLED ? 340 : 1, token);
    actor.rig.resetPose();
  }

  private async animateParry(actor: FighterState, token: number) {
    actor.rig.setPose(2);
    const g = this.add.graphics()
      .setPosition(actor.rig.root.x, actor.rig.root.y - 48)
      .setDepth(74)
      .setScale(0.92);
    g.lineStyle(6, INK, 0.22);
    g.beginPath();
    g.arc(0, 0, 45, -2.7, 0.15, false);
    g.strokePath();
    g.lineStyle(3.8, TEAL, 0.98);
    g.beginPath();
    g.arc(0, 0, 45, -2.7, 0.15, false);
    g.strokePath();
    g.lineStyle(1.8, DEFENSE_BROWN, 0.9);
    g.beginPath();
    g.arc(0, 0, 39, -1.65, -0.82, false);
    g.strokePath();
    if (this.game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
      g.postFX.addGlow(TEAL, 1.45, 0.16, false, 0.1, 4);
    }
    this.tweens.add({
      targets: g,
      angle: 18,
      scale: 1.13,
      alpha: 0,
      duration: MOTION_ENABLED ? 470 : 1,
      ease: "Cubic.Out",
      onComplete: () => g.destroy(),
    });
    await this.wait(MOTION_ENABLED ? 330 : 1, token);
    actor.rig.resetPose();
  }

  private async animateUltimateCharge(actor: FighterState, action: ActionDef, token: number) {
    const accent = this.fighterAccent(actor);
    actor.rig.setPose(2);
    const chargeY = actor.rig.root.y - 48;
    const halo = this.add.circle(actor.rig.root.x, chargeY, 30, accent, 0.16)
      .setStrokeStyle(5, accent, 1)
      .setDepth(73)
      .setScale(0.5);
    if (this.game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
      halo.postFX.addGlow(accent, 2.2, 0.35, false, 0.1, 5);
    }
    const recipe = action.requiresForms ?? [];
    const seals = recipe.map((form, index) => {
      const angle = -Math.PI + index * (Math.PI / Math.max(1, recipe.length - 1));
      const x = actor.rig.root.x + Math.cos(angle) * 48;
      const y = chargeY + Math.sin(angle) * 34;
      const body = this.add.circle(x, y, 13, PAPER_LIGHT, 0.98)
        .setStrokeStyle(2.4, accent, 1)
        .setDepth(302)
        .setScale(0.2);
      const glyph = this.text(x, y, form, {
        fontSize: "11px",
        fontStyle: "bold",
        color: css(accent),
      }).setOrigin(0.5).setDepth(303).setScale(0.2);
      this.tweens.add({
        targets: [body, glyph],
        scale: 1,
        delay: index * 90,
        duration: MOTION_ENABLED ? 170 : 1,
        ease: "Back.Out",
      });
      return [body, glyph] as const;
    });
    this.tweens.add({ targets: halo, scale: 2.3, alpha: 0, duration: MOTION_ENABLED ? 620 : 1, ease: "Cubic.Out" });
    this.cameras.main.flash(MOTION_ENABLED ? 90 : 1, 255, 239, 174, false);
    this.showCallout(`绝式贯通\n${action.title}`, accent, 980);
    await this.wait(MOTION_ENABLED ? 640 : 1, token);
    seals.flat().forEach((object) => object.destroy());
    halo.destroy();
    actor.rig.resetPose();
  }

  private async animateAttackLead(actor: FighterState, action: ActionDef, token: number) {
    const direction: -1 | 1 = actor === this.player ? -1 : 1;
    const home = actor.rig.homePosition;
    actor.rig.setPose(0);
    await this.tweenTo(
      actor.rig.root,
      {
        x: home.x - (actor === this.player ? 4 : -4),
        y: home.y - direction * 7,
        rotation: direction * 0.025,
        scaleX: 0.98,
        scaleY: 1.02,
      },
      MOTION_ENABLED ? 125 : 1,
      "Sine.In",
      token,
    );
    actor.rig.setPose(
      action.id === "thief-break"
      || action.id === "sword-sweep"
      || action.id === "break"
      || action.ultimate
        ? 2
        : 1,
    );
    this.spawnMotionStreaks(actor, this.fighterAccent(actor), direction);
    await this.tweenTo(
      actor.rig.root,
      {
        x: home.x + (actor === this.player ? 5 : -5),
        y: home.y + direction * (action.speed <= 1 ? 20 : 28),
        rotation: 0,
        scaleX: 1.06,
        scaleY: 1.04,
      },
      MOTION_ENABLED ? 185 : 1,
      "Cubic.Out",
      token,
    );
  }

  private async animateImpact(
    actor: FighterState,
    target: FighterState,
    action: ActionDef,
    hpDamage: number,
    blocked: number,
    token: number,
  ) {
    const accent = this.fighterAccent(actor);
    const actorHome = actor.rig.homePosition;
    const targetHome = target.rig.homePosition;
    if (action.ultimate && action.multiHit && hpDamage > 0) {
      target.rig.setPose(3);
      let remaining = hpDamage;
      for (let index = 0; index < action.multiHit.length; index += 1) {
        const planned = action.multiHit[index];
        const shown = index === action.multiHit.length - 1 ? remaining : Math.min(remaining, planned);
        if (shown <= 0) break;
        remaining -= shown;
        this.spawnStrike(actor, target, action, index % 2 === 0 ? accent : OCHRE);
        target.rig.flash();
        this.spawnFloat(target.rig.root.x + (index - 1) * 24, target.rig.root.y - 34, `-${shown}`, RED);
        if (MOTION_ENABLED) this.cameras.main.shake(78, index === action.multiHit.length - 1 ? 0.009 : 0.004);
        await this.wait(MOTION_ENABLED ? 125 : 1, token);
      }
    } else {
      this.spawnStrike(actor, target, action, accent);
    }
    if (hpDamage > 0) {
      target.rig.setPose(3);
      target.rig.flash();
      if (!action.ultimate) this.spawnFloat(target.rig.root.x, target.rig.root.y - 34, `-${hpDamage}`, RED);
      if (MOTION_ENABLED) this.cameras.main.shake(95, hpDamage >= 12 ? 0.006 : 0.0035);
    } else {
      target.rig.setPose(2);
      target.rig.pulseShield();
      this.spawnGuardImpact(target);
      this.spawnFloat(target.rig.root.x, target.rig.root.y - 34, `挡 ${blocked}`, OCHRE);
    }
    this.syncAll(true);
    await this.wait(MOTION_ENABLED ? 85 : 1, token);
    const recoilDirection: -1 | 1 = actor === this.player ? -1 : 1;
    const recoil = hpDamage > 0 ? 10 : 5;
    await Promise.all([
      this.tweenTo(
        actor.rig.root,
        { x: actorHome.x, y: actorHome.y, rotation: 0, scaleX: 1, scaleY: 1 },
        MOTION_ENABLED ? 220 : 1,
        "Sine.InOut",
        token,
      ),
      this.tweenTo(
        target.rig.root,
        {
          x: targetHome.x + (actor === this.player ? -6 : 6),
          y: targetHome.y + recoilDirection * recoil,
          scaleX: 0.98,
          scaleY: 1.03,
        },
        MOTION_ENABLED ? 115 : 1,
        "Quad.Out",
        token,
      ),
    ]);
    await this.tweenTo(
      target.rig.root,
      { x: targetHome.x, y: targetHome.y, scaleX: 1, scaleY: 1 },
      MOTION_ENABLED ? 165 : 1,
      "Back.Out",
      token,
    );
    actor.rig.resetPose();
    target.rig.resetPose();
  }

  private async animateMiss(actor: FighterState, action: ActionDef, token: number) {
    const home = actor.rig.homePosition;
    await this.animateAttackLead(actor, action, token);
    const direction: -1 | 1 = actor === this.player ? -1 : 1;
    const missY = actor.rig.root.y + direction * 44;
    const line = this.add.rectangle(actor.rig.root.x + 15, missY, 52, 3, this.fighterAccent(actor), 0.8)
      .setRotation(actor === this.player ? -0.35 : 0.35)
      .setDepth(76);
    this.tweens.add({ targets: line, alpha: 0, scaleX: 1.5, duration: 260, onComplete: () => line.destroy() });
    this.spawnFloat(actor.rig.root.x, missY, "落空", 0x6b654b);
    await this.wait(MOTION_ENABLED ? 170 : 1, token);
    await this.tweenTo(
      actor.rig.root,
      { x: home.x, y: home.y, rotation: 0, scaleX: 1, scaleY: 1 },
      MOTION_ENABLED ? 210 : 1,
      "Back.Out",
      token,
    );
    actor.rig.resetPose();
  }

  private async animateParriedStrike(
    actor: FighterState,
    target: FighterState,
    action: ActionDef,
    token: number,
  ) {
    const actorHome = actor.rig.homePosition;
    await this.animateAttackLead(actor, action, token);
    target.rig.setPose(2);
    const ring = this.add.circle(target.rig.root.x, target.rig.root.y - 48, 24, TEAL, 0.14)
      .setStrokeStyle(4.5, TEAL, 1)
      .setDepth(78);
    if (this.game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
      ring.postFX.addGlow(TEAL, 1.6, 0.2, false, 0.1, 4);
    }
    this.tweens.add({ targets: ring, scale: 2.2, alpha: 0, duration: 360, onComplete: () => ring.destroy() });
    this.spawnFloat(target.rig.root.x, target.rig.root.y - 38, "化劲 +2势 · 复1退路", TEAL);
    actor.rig.root.setRotation(0.08 * (actor === this.player ? 1 : -1));
    await this.wait(MOTION_ENABLED ? 240 : 1, token);
    await this.tweenTo(
      actor.rig.root,
      { x: actorHome.x, y: actorHome.y, rotation: 0, scaleX: 1, scaleY: 1 },
      MOTION_ENABLED ? 210 : 1,
      "Back.Out",
      token,
    );
    actor.rig.resetPose();
    target.rig.resetPose();
  }

  private async animateCounterStrike(
    counterActor: FighterState,
    victim: FighterState,
    damage: number,
    token: number,
  ) {
    const home = counterActor.rig.homePosition;
    const direction: -1 | 1 = counterActor === this.player ? -1 : 1;
    counterActor.rig.setPose(1);
    await this.tweenTo(
      counterActor.rig.root,
      { y: home.y + direction * 18, scaleX: 1.06, scaleY: 1.03 },
      MOTION_ENABLED ? 145 : 1,
      "Cubic.Out",
      token,
    );
    this.spawnStrike(counterActor, victim, ACTIONS[counterActor.id === "boxer" ? "boxer-counter-ultimate" : "sword-counter-ultimate"], this.fighterAccent(counterActor));
    victim.rig.setPose(3);
    victim.rig.flash();
    this.spawnFloat(victim.rig.root.x, victim.rig.root.y - 38, `反击 -${damage}`, RED);
    this.cameras.main.shake(MOTION_ENABLED ? 110 : 1, 0.007);
    this.syncAll(true);
    await this.wait(MOTION_ENABLED ? 170 : 1, token);
    await this.tweenTo(
      counterActor.rig.root,
      { x: home.x, y: home.y, scaleX: 1, scaleY: 1 },
      MOTION_ENABLED ? 190 : 1,
      "Back.Out",
      token,
    );
    counterActor.rig.resetPose();
    victim.rig.resetPose();
  }

  private async animateStagger(actor: FighterState, token: number) {
    actor.rig.setPose(3);
    const baseX = actor.rig.homePosition.x;
    if (MOTION_ENABLED) {
      await this.tweenTo(actor.rig.root, { x: baseX + 7 }, 70, "Linear", token);
      await this.tweenTo(actor.rig.root, { x: baseX - 6 }, 70, "Linear", token);
      await this.tweenTo(actor.rig.root, { x: baseX }, 70, "Linear", token);
    }
    actor.rig.resetPose();
  }

  private spawnActionFocus(actor: FighterState, accent: number) {
    const ring = this.add.ellipse(actor.rig.root.x, actor.rig.groundY - 2, 72, 25, accent, 0.14)
      .setStrokeStyle(3.2, accent, 0.94)
      .setDepth(40)
      .setScale(0.84);
    const marker = this.add.graphics().setDepth(41);
    marker.lineStyle(2.6, accent, 0.92);
    marker.lineBetween(actor.rig.root.x - 41, actor.rig.groundY - 19, actor.rig.root.x - 41, actor.rig.groundY - 7);
    marker.lineBetween(actor.rig.root.x + 41, actor.rig.groundY - 19, actor.rig.root.x + 41, actor.rig.groundY - 7);
    this.tweens.add({
      targets: [ring, marker],
      alpha: 0,
      duration: MOTION_ENABLED ? 620 : 80,
      ease: "Cubic.Out",
      onComplete: () => {
        ring.destroy();
        marker.destroy();
      },
    });
    this.tweens.add({ targets: ring, scale: 1.18, duration: MOTION_ENABLED ? 520 : 1, ease: "Sine.Out" });
  }

  private spawnMotionStreaks(actor: FighterState, accent: number, direction: -1 | 1) {
    const g = this.add.graphics().setPosition(actor.rig.root.x, actor.rig.root.y).setDepth(39);
    g.lineStyle(2.8, accent, 0.64);
    const trailDirection = -direction;
    for (let index = 0; index < 3; index += 1) {
      const x = -24 + index * 24;
      g.lineBetween(x, trailDirection * (14 + index * 3), x + (index - 1) * 4, trailDirection * (35 + index * 4));
    }
    this.tweens.add({
      targets: g,
      alpha: 0,
      y: g.y + trailDirection * 9,
      duration: MOTION_ENABLED ? 280 : 60,
      ease: "Cubic.Out",
      onComplete: () => g.destroy(),
    });
  }

  private spawnGuardImpact(target: FighterState) {
    const x = target.rig.root.x;
    const y = target.rig.root.y - 49;
    const ripple = this.add.graphics().setPosition(x, y).setDepth(82).setScale(0.94).setAngle(-8);
    ripple.lineStyle(4.8, INK, 0.23);
    ripple.beginPath();
    ripple.arc(0, 0, 47, -2.72, -1.83, false);
    ripple.strokePath();
    ripple.beginPath();
    ripple.arc(0, 0, 47, -0.42, 0.41, false);
    ripple.strokePath();
    ripple.beginPath();
    ripple.arc(0, 0, 43, 0.92, 1.58, false);
    ripple.strokePath();
    ripple.lineStyle(3, TEAL, 0.98);
    ripple.beginPath();
    ripple.arc(0, 0, 47, -2.72, -1.83, false);
    ripple.strokePath();
    ripple.beginPath();
    ripple.arc(0, 0, 47, -0.42, 0.41, false);
    ripple.strokePath();
    ripple.lineStyle(2.3, DEFENSE_BROWN, 0.9);
    ripple.beginPath();
    ripple.arc(0, 0, 43, 0.92, 1.58, false);
    ripple.strokePath();
    if (this.game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
      ripple.postFX.addGlow(TEAL, 1.45, 0.16, false, 0.1, 4);
    }
    this.tweens.add({
      targets: ripple,
      scale: 1.13,
      angle: 8,
      alpha: 0,
      duration: MOTION_ENABLED ? 500 : 1,
      ease: "Cubic.Out",
      onComplete: () => ripple.destroy(),
    });
    const moteAngles = [-2.52, -1.86, -0.48, 0.24, 1.24];
    moteAngles.forEach((angle, index) => {
      const radius = 40 + (index % 2) * 4;
      const mote = this.add.circle(
        x + Math.cos(angle) * radius,
        y + Math.sin(angle) * radius,
        index % 2 === 0 ? 2.4 : 1.8,
        index === 3 ? DEFENSE_BROWN : TEAL,
        0.94,
      ).setDepth(83);
      this.tweens.add({
        targets: mote,
        x: mote.x + Math.cos(angle) * 12,
        y: mote.y + Math.sin(angle) * 12,
        scale: 0.35,
        alpha: 0,
        duration: MOTION_ENABLED ? 390 + index * 18 : 1,
        ease: "Cubic.Out",
        onComplete: () => mote.destroy(),
      });
    });
  }

  private spawnStrike(actor: FighterState, target: FighterState, action: ActionDef, accent: number) {
    const g = this.add.graphics()
      .setPosition(target.rig.root.x, target.rig.root.y - 48)
      .setDepth(77)
      .setScale(0.88);
    if (actor.id === "swordsman") {
      const sweeping = action.id === "sword-sweep";
      const attackDirection: -1 | 1 = actor === this.player ? -1 : 1;
      const width = action.ultimate ? 6.2 : sweeping ? 5.2 : 3.6;
      const drawSwordPath = () => {
        g.beginPath();
        if (action.ultimate) {
          g.moveTo(-34, 40);
          g.lineTo(28, -42);
        } else if (sweeping) {
          g.arc(0, -4, 46, -2.8, 0.25, false);
        } else {
          g.moveTo(-12, -attackDirection * 34);
          g.lineTo(4, attackDirection * 10);
        }
        g.strokePath();
      };
      g.lineStyle(width + 2.6, INK, 0.3);
      drawSwordPath();
      g.lineStyle(width, accent, 0.96);
      drawSwordPath();
      g.lineStyle(1.8, 0xfff4cf, 0.94);
      g.lineBetween(-10, -attackDirection * 22, 8, attackDirection * 8);
      if (action.ultimate) {
        g.lineBetween(-18, 34, 34, -34);
        g.lineBetween(-42, 25, 18, -46);
      }
    } else if (actor.id === "thief") {
      const sweeping = action.id === "thief-break" || action.id === "thief-ultimate";
      const width = action.ultimate ? 6.4 : sweeping ? 5.1 : 3.8;
      const drawKnifePath = () => {
        g.beginPath();
        if (sweeping) g.arc(0, -2, action.ultimate ? 48 : 39, -2.72, 0.18, false);
        else {
          g.moveTo(-27, 24);
          g.lineTo(22, -25);
        }
        g.strokePath();
      };
      g.lineStyle(width + 3, INK, 0.34);
      drawKnifePath();
      g.lineStyle(width, THIEF_ACCENT, 0.98);
      drawKnifePath();
      g.lineStyle(1.9, 0xffdf9a, 0.94);
      g.beginPath();
      g.arc(0, -2, action.ultimate ? 38 : 29, -2.55, -0.2, false);
      g.strokePath();
    } else {
      g.fillStyle(INK, 0.16).fillEllipse(0, -3, 42, 31);
      g.fillStyle(accent, 0.22).fillEllipse(0, -3, 36, 27);
      g.lineStyle(5.4, INK, 0.28);
      g.beginPath();
      g.arc(0, -3, 17, -2.45, -0.68, false);
      g.strokePath();
      g.lineStyle(3.8, accent, 0.96);
      g.beginPath();
      g.arc(0, -3, 17, -2.45, -0.68, false);
      g.strokePath();
      g.lineStyle(2.4, 0xfff4cf, 0.9);
      g.beginPath();
      g.arc(0, -3, 10, 0.28, 1.86, false);
      g.strokePath();
      g.fillStyle(0xfff1c2, 0.96).fillCircle(1, -4, 3.5);
    }
    g.lineStyle(2.1, accent, 0.72);
    for (let index = 0; index < 5; index += 1) {
      const angle = (Math.PI * 2 * index) / 5 - 0.25;
      g.lineBetween(
        Math.cos(angle) * 23,
        Math.sin(angle) * 17,
        Math.cos(angle) * 34,
        Math.sin(angle) * 26,
      );
    }
    if (this.game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
      g.postFX.addGlow(
        action.ultimate ? 0xd4a54c : accent,
        action.ultimate ? 3.1 : 1.55,
        action.ultimate ? 0.48 : 0.18,
        false,
        0.1,
        action.ultimate ? 6 : 4,
      );
    }
    this.tweens.add({
      targets: g,
      alpha: 0,
      scale: 1.24,
      duration: MOTION_ENABLED ? 420 : 80,
      ease: "Cubic.Out",
      onComplete: () => g.destroy(),
    });
  }

  private spawnDust(x: number, y: number, color: number) {
    for (let index = 0; index < 4; index += 1) {
      const puff = this.add.circle(x + (index - 1.5) * 9, y, 5 + index, color, 0.32).setDepth(38);
      this.tweens.add({
        targets: puff,
        x: puff.x + (index - 1.5) * 5,
        y: puff.y + 8,
        alpha: 0,
        scale: 1.5,
        duration: MOTION_ENABLED ? 420 : 1,
        onComplete: () => puff.destroy(),
      });
    }
  }

  private spawnFloat(x: number, y: number, copy: string, color: number) {
    const label = this.text(x, y, copy, {
      fontSize: "13px",
      fontStyle: "bold",
      color: css(color),
      backgroundColor: "#fff3c8",
      padding: { x: 5, y: 2 },
    }).setOrigin(0.5).setDepth(300);
    this.tweens.add({
      targets: label,
      y: y - 28,
      alpha: 0,
      duration: MOTION_ENABLED ? 720 : 120,
      ease: "Cubic.Out",
      onComplete: () => label.destroy(),
    });
  }

  private showCallout(copy: string, color: number, duration: number) {
    this.arenaCallout
      .setPosition(CALLOUT_X, CALLOUT_Y)
      .setText(copy)
      .setBackgroundColor(css(color))
      .setAlpha(1)
      .setScale(0.96);
    if (MOTION_ENABLED) {
      this.tweens.killTweensOf(this.arenaCallout);
      this.tweens.add({
        targets: this.arenaCallout,
        x: CALLOUT_X + 4,
        scale: 1,
        duration: 130,
        ease: "Back.Out",
      });
      this.tweens.add({
        targets: this.arenaCallout,
        alpha: 0,
        delay: Math.max(200, duration - 180),
        duration: 180,
      });
    } else {
      this.arenaCallout.setAlpha(0);
    }
  }

  private syncAll(animated: boolean) {
    this.syncHud(this.player, this.playerHud, animated);
    this.syncHud(this.enemy, this.enemyHud, animated);
    const professionAccent = this.playerProfession.accent;
    this.playerHud.rail.setFillStyle(professionAccent, 1);
    this.playerHud.nameText.setColor(css(professionAccent));
    this.playerHud.statusText.setColor(css(professionAccent));
    this.roundText.setColor(css(professionAccent));
    this.handLabel.setColor(css(professionAccent));
    this.enemyHud.rail.setFillStyle(this.opponentProfession.accent, 1);
    this.enemyHud.nameText.setColor(css(this.opponentProfession.accent));
    this.enemyHud.statusText.setColor(css(this.opponentProfession.accent));
    const distanceLabel = this.distance === 1 ? "贴身" : this.distance === 2 ? "中近" : this.distance === 3 ? "剑围" : "远距";
    this.distanceText.setText(`${this.distance}步\n${distanceLabel}`);
    this.distanceText.setY(ARENA_CENTER_Y);
    this.arenaCenterMarker?.setY(ARENA_CENTER_Y);
    const readLabel = this.enemyRead
      ? `已看破·${{ move: "步法", guard: "架招", parry: "化劲", attack: "抢攻" }[this.enemyRead]}`
      : "尚未看破";
    this.topSideText.setText(`对手 · ${this.opponentProfession.label} · ${readLabel}`);
    this.bottomSideText.setText(`我方 · ${this.playerProfession.label}`);
    this.playerHud.statusText.setText(`${this.player.momentum >= MAX_MOMENTUM ? "势满" : "势"} · 退${this.player.retreat}`);
    this.enemyHud.statusText.setText(`${this.enemy.momentum >= MAX_MOMENTUM ? "势满" : "势"} · 退${this.enemy.retreat}`);
    this.playerHud.formTexts.forEach((formText, index) => {
      formText.setText(this.formTrail[index] ?? "·");
      formText.setColor(this.formTrail[index] ? css(professionAccent) : "#8e8564");
    });
    this.playerHud.momentumDots.forEach((dot, index) => {
      dot.setFillStyle(index < this.player.momentum ? professionAccent : 0xd9cb92, index < this.player.momentum ? 1 : 0.7);
      dot.setScale(index < this.player.momentum ? 1.08 : 1);
    });
    this.enemyHud.formTexts.forEach((formText, index) => {
      formText.setText(this.enemyFormTrail[index] ?? "·");
      formText.setColor(this.enemyFormTrail[index] ? css(THIEF_ACCENT) : "#8e8564");
    });
    this.enemyHud.momentumDots.forEach((dot, index) => {
      dot.setFillStyle(index < this.enemy.momentum ? THIEF_ACCENT : 0xd9cb92, index < this.enemy.momentum ? 1 : 0.7);
      dot.setScale(index < this.enemy.momentum ? 1.08 : 1);
    });
    if (this.ultimateActionControls.length) this.renderUltimateControls();
    this.refreshFooter();
  }

  private syncHud(fighter: FighterState, hud: FighterHud, animated: boolean) {
    fighter.rig.setGuarded(fighter.guard > 0);
    hud.nameText.setText(fighter.name);
    hud.subtitleText.setText(fighter.subtitle);
    const width = 218 * (fighter.hp / fighter.maxHp);
    if (animated && MOTION_ENABLED) {
      this.tweens.add({ targets: hud.hpFill, displayWidth: Math.max(0.1, width), duration: 260, ease: "Sine.Out" });
    } else {
      hud.hpFill.setDisplaySize(Math.max(0.1, width), 8);
    }
    hud.hpText.setText(`${fighter.hp}/${fighter.maxHp}`);
    const states = [
      fighter.bleed > 0 ? `流血${fighter.bleed}` : "",
      fighter.sealedActions > 0 ? `封招${fighter.sealedActions}` : "",
    ].filter(Boolean);
    hud.guardText.setText(`护架 ${fighter.guard}${states.length ? ` · ${states.join(" · ")}` : ""}`);
    hud.guardText.setColor(fighter.guard > 0 ? css(OCHRE) : "#746c4d");
  }

  private refreshFooter() {
    if (!this.footerText) return;
    if (this.phase === "intro") {
      this.footerText.setText("选择拳师或剑客迎战盗贼；玩家卡组与绝式整套切换，敌人始终使用独立诡刃套路。");
      return;
    }
    if (this.phase === "planning") {
      if (this.selectedIds.length < 2) {
        this.footerText.setText(`还需选择${2 - this.selectedIds.length}招；我方式：${this.formTrail.join("→") || "无"}｜敌方${this.enemy.momentum}势、退路${this.enemy.retreat}。`);
      } else {
        const copy = comboCopy(this.combo);
        this.footerText.setText(`${copy.title}：${copy.detail}。确认后逐拍播放。`);
      }
      return;
    }
    if (this.phase === "resolving") {
      this.footerText.setText(`第${this.round}合正在交锋；伤害、护架和距离会在命中瞬间结算。`);
      return;
    }
    if (this.phase === "review") {
      const record = this.records[this.activeBeat];
      this.footerText.setText(record ? `${record.heading}：${record.lines.at(-1) ?? "已结算"}` : "点击拍位查看细节。");
      return;
    }
    this.footerText.setText("本场交锋已经结束。");
  }

  private async nextRound() {
    if (this.phase !== "review") return;
    this.phase = "resolving";
    const token = ++this.resolutionToken;
    const bleeders = [this.player, this.enemy].filter((fighter) => fighter.bleed > 0);
    for (const fighter of bleeders) {
      const bleedDamage = fighter.bleed;
      fighter.hp = Math.max(0, fighter.hp - bleedDamage);
      fighter.bleed = Math.max(0, fighter.bleed - 1);
      this.spawnFloat(fighter.rig.root.x, fighter.rig.root.y - 40, `流血 -${bleedDamage}`, RED);
      this.showCallout(`${this.fighterLabel(fighter)}伤势发作\n生命 -${bleedDamage}`, RED, 650);
      this.syncAll(true);
      await this.wait(MOTION_ENABLED ? 430 : 1, token);
      if (fighter.hp <= 0) {
        this.finishBattle(this.enemy.hp <= 0);
        return;
      }
    }
    this.round += 1;
    this.prepareRound(false);
  }

  private showIntro() {
    const overlay = this.add.container(0, 0).setDepth(1200);
    const shade = this.add.rectangle(215, 430, WIDTH, HEIGHT, 0x15170f, 0.7).setInteractive();
    const panel = this.add.rectangle(215, 430, 378, 660, PAPER_LIGHT, 1)
      .setStrokeStyle(3, INK, 1);
    const seal = this.add.circle(64, 136, 22, this.playerProfession.accent, 1).setStrokeStyle(2, INK, 1);
    const sealText = this.text(64, 136, "门", {
      fontSize: "16px",
      fontStyle: "bold",
      color: "#fff3ca",
    }).setOrigin(0.5);
    const title = this.text(98, 119, "择一角色迎敌", { fontSize: "22px", fontStyle: "bold" });
    const subtitle = this.text(98, 153, "拳师与剑客只属于玩家；本局敌手固定为盗贼·夜枭。", {
      fontSize: "10px",
      fontStyle: "bold",
      color: "#625c43",
    });
    const professionHeading = this.text(36, 188, "选择你的角色与打法｜敌手：盗贼", {
      fontSize: "12px",
      fontStyle: "bold",
      color: css(BOXER_ACCENT),
    });
    const items: Phaser.GameObjects.GameObject[] = [];
    const choiceViews: Array<{
      definition: ProfessionDef;
      body: Phaser.GameObjects.Rectangle;
      rail: Phaser.GameObjects.Rectangle;
      name: Phaser.GameObjects.Text;
      mark: Phaser.GameObjects.Text;
    }> = [];
    (Object.values(PLAYER_PROFESSIONS) as ProfessionDef[]).forEach((definition, index) => {
      const y = 267 + index * 118;
      const body = this.add.rectangle(215, y, 338, 106, PAPER_LIGHT, 1)
        .setStrokeStyle(1.4, INK, 0.75)
        .setInteractive({ useHandCursor: true });
      const rail = this.add.rectangle(49, y, 6, 94, definition.accent, 0.72);
      const portraitHalo = this.add.circle(94, y, 42, definition.accent, 0.09)
        .setStrokeStyle(1.4, definition.accent, 0.5);
      const portrait = this.add.image(94, y, definition.portraitTexture, 0).setDisplaySize(88, 88);
      const name = this.text(142, y - 43, `${definition.label} · ${definition.fighterName.split("·").at(-1)?.trim()}`, {
        fontSize: "14px",
        fontStyle: "bold",
        color: css(INK),
      });
      const style = this.text(142, y - 17, definition.style, {
        fontSize: "9px",
        fontStyle: "bold",
        color: "#625b41",
        wordWrap: { width: 220, useAdvancedWrap: true },
      });
      const recipe = this.text(142, y + 12, `主绝式 ${definition.recipe.join(" + ")} · 顺序不限`, {
        fontSize: "9px",
        fontStyle: "bold",
        color: css(definition.accent),
      });
      const ultimate = this.text(142, y + 36, "三门绝式固定待命 · 不占手牌", {
        fontSize: "9px",
        fontStyle: "bold",
        color: "#8e382f",
      });
      const mark = this.text(382, y - 43, "", {
        fontSize: "8px",
        fontStyle: "bold",
        color: css(definition.accent),
      }).setOrigin(1, 0);
      body.on("pointerdown", () => body.setScale(0.985));
      body.on("pointerout", () => body.setScale(1));
      body.on("pointerup", () => {
        body.setScale(1);
        this.applyProfessionChoice(definition.id);
        renderProfessionChoices();
      });
      choiceViews.push({ definition, body, rail, name, mark });
      items.push(body, rail, portraitHalo, portrait, name, style, recipe, ultimate, mark);
    });

    const ruleHeading = this.text(36, 455, "本局怎么搓招", {
      fontSize: "12px",
      fontStyle: "bold",
      color: css(TEAL),
    });
    const rules = [
      ["读", "敌方起手、默认合手与条件变招全部公开。"],
      ["搓", "卡牌命中或生效才落式，最近三式留谱；先后顺序不限。"],
      ["衡", "架会助敌积势，退消耗退路，化空会暴露空门。"],
    ] as const;
    rules.forEach((rule, index) => {
      const y = 493 + index * 42;
      const badge = this.add.circle(54, y, 14, index === 1 ? TEAL : BOXER_ACCENT, 0.95);
      const number = this.text(54, y, rule[0], {
        fontSize: "10px",
        fontStyle: "bold",
        color: "#fff3ca",
      }).setOrigin(0.5);
      const detail = this.text(78, y, rule[1], {
        fontSize: "9px",
        fontStyle: "bold",
        color: "#5c5741",
        wordWrap: { width: 302, useAdvancedWrap: true },
      }).setOrigin(0, 0.5);
      items.push(badge, number, detail);
    });

    const recipeBanner = this.add.rectangle(215, 625, 338, 38, 0xe4d69f, 0.72)
      .setStrokeStyle(1.2, INK, 0.42);
    const recipeText = this.text(215, 625, "敌我都有势、三格招式谱与2点退路；前进或化劲成功可复退。", {
      fontSize: "9px",
      fontStyle: "bold",
      color: "#5b553f",
    }).setOrigin(0.5);
    const button = this.add.rectangle(215, 693, 258, 46, this.playerProfession.accent, 1)
      .setStrokeStyle(2, INK, 1)
      .setInteractive({ useHandCursor: true });
    const buttonText = this.text(215, 693, `以${this.playerProfession.label}开始第1合`, {
      fontSize: "13px",
      fontStyle: "bold",
      color: "#fff3ca",
    }).setOrigin(0.5);

    const renderProfessionChoices = () => {
      choiceViews.forEach((view) => {
        const selected = view.definition.id === this.selectedProfessionId;
        view.body.setFillStyle(selected ? view.definition.accent : PAPER_LIGHT, selected ? 0.16 : 1);
        view.body.setStrokeStyle(selected ? 2.4 : 1.4, selected ? view.definition.accent : INK, selected ? 1 : 0.75);
        view.rail.setAlpha(selected ? 1 : 0.58);
        view.name.setColor(selected ? css(view.definition.accent) : css(INK));
        view.mark.setText(selected ? "已选" : "");
      });
      seal.setFillStyle(this.playerProfession.accent, 1);
      button.setFillStyle(this.playerProfession.accent, 1);
      buttonText.setText(`以${this.playerProfession.label}开始第1合`);
    };

    button.on("pointerdown", () => button.setScale(0.97));
    button.on("pointerout", () => button.setScale(1));
    button.on("pointerup", () => {
      button.setScale(1);
      overlay.destroy(true);
      this.introOverlay = undefined;
      this.phase = "planning";
      this.renderPlanner();
      this.renderHand();
      this.refreshFooter();
    });
    overlay.add([
      shade,
      panel,
      seal,
      sealText,
      title,
      subtitle,
      professionHeading,
      ruleHeading,
      ...items,
      recipeBanner,
      recipeText,
      button,
      buttonText,
    ]);
    renderProfessionChoices();
    this.introOverlay = overlay;
  }

  private finishBattle(playerWon: boolean) {
    if (this.phase === "ended") return;
    this.phase = "ended";
    this.resolutionToken += 1;
    this.activeBeat = -1;
    this.player.rig.resetPose();
    this.enemy.rig.resetPose();
    this.renderPlanner();
    this.renderHand();
    this.syncAll(true);
    this.showResult(playerWon);
  }

  private showResult(playerWon: boolean) {
    if (this.resultOverlay) return;
    const accent = playerWon ? TEAL : RED;
    const overlay = this.add.container(0, 0).setDepth(1300);
    const shade = this.add.rectangle(215, 430, WIDTH, HEIGHT, 0x15170f, 0.72).setInteractive();
    const panel = this.add.rectangle(215, 430, 366, 340, PAPER_LIGHT, 1)
      .setStrokeStyle(3, INK, 1);
    const seal = this.add.circle(215, 302, 29, accent, 1).setStrokeStyle(2, INK, 1);
    const sealText = this.text(215, 302, playerWon ? "胜" : "负", {
      fontSize: "18px",
      fontStyle: "bold",
      color: "#fff3ca",
    }).setOrigin(0.5);
    const title = this.text(215, 355, playerWon ? "破招取胜" : `${this.opponentProfession.label}压阵 · 败`, {
      fontSize: "20px",
      fontStyle: "bold",
      color: css(accent),
    }).setOrigin(0.5);
    const detail = this.text(215, 404, `历经${this.round}合｜${this.playerProfession.label} ${this.player.hp}/${this.player.maxHp}｜${this.opponentProfession.label} ${this.enemy.hp}/${this.enemy.maxHp}\n招式谱、势、距离与拆招均已逐拍结算。`, {
      fontSize: "10px",
      fontStyle: "bold",
      color: "#59543d",
      align: "center",
      lineSpacing: 5,
    }).setOrigin(0.5);
    const restart = this.resultButton(215, 488, 252, "再战一局", accent, () => this.scene.restart());
    const leave = this.resultButton(215, 548, 252, "返回模式", 0x81764d, () => this.scene.start("inn-mode-select"));
    overlay.add([shade, panel, seal, sealText, title, detail, ...restart, ...leave]);
    this.resultOverlay = overlay;
    if (MOTION_ENABLED) {
      panel.setScale(0.94);
      this.tweens.add({ targets: panel, scale: 1, duration: 180, ease: "Back.Out" });
    }
  }

  private resultButton(
    x: number,
    y: number,
    width: number,
    copy: string,
    accent: number,
    onTap: () => void,
  ) {
    const body = this.add.rectangle(x, y, width, 44, PAPER, 1)
      .setStrokeStyle(2, accent, 1)
      .setInteractive({ useHandCursor: true });
    const label = this.text(x, y, copy, {
      fontSize: "12px",
      fontStyle: "bold",
      color: css(accent),
    }).setOrigin(0.5);
    body.on("pointerdown", () => body.setScale(0.97));
    body.on("pointerout", () => body.setScale(1));
    body.on("pointerup", () => {
      body.setScale(1);
      onTap();
    });
    return [body, label] as Phaser.GameObjects.GameObject[];
  }

  private wait(ms: number, token: number) {
    return new Promise<void>((resolve) => {
      this.time.delayedCall(ms, () => {
        if (token === this.resolutionToken) resolve();
        else resolve();
      });
    });
  }

  private tweenTo(
    target: Phaser.GameObjects.Components.Transform,
    values: Record<string, number>,
    duration: number,
    ease: string,
    token: number,
  ) {
    return new Promise<void>((resolve) => {
      if (token !== this.resolutionToken) {
        resolve();
        return;
      }
      this.tweens.add({
        targets: target,
        ...values,
        duration,
        ease,
        onComplete: () => resolve(),
      });
    });
  }
}
