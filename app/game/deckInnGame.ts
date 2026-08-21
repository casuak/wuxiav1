import * as Phaser from "phaser";
import { DuelInnScene, InnModeSelectScene } from "./duelInnGame";

const GAME_WIDTH = 430;
const GAME_HEIGHT = 860;
const SAVE_KEY = "ten-day-inn-cardplay-v3";
const WAGE_PER_HELPER = 4;
const REPAIR_COST = 6;
const PREP_COST = 5;
const UI_FONT = '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif';
const RENDER_SCALE = typeof window === "undefined"
  ? 1
  : Math.min(3, Math.max(1, Math.ceil(window.devicePixelRatio || 1)));
const TEXT_RESOLUTION = Math.max(2, RENDER_SCALE);
const MOTION_ENABLED = typeof window === "undefined"
  || !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const ENCOUNTER_LAYOUT = {
  guestLabelY: 160,
  guestTabY: 188,
  guestTabHeight: 28,
  guestSinglePanelY: 242,
  guestSinglePanelHeight: 128,
  guestMultiPanelY: 257,
  guestMultiPanelHeight: 100,
  facilityLabelY: 317,
} as const;
const GUEST_CARD_GRID = {
  panelCenterX: 215,
  panelWidth: 394,
  tabInset: 5,
  twoTabGap: 12,
  threeTabGap: 9,
  portraitX: -145,
  portraitFrameWidth: 82,
  contentLeft: -91,
  contentRight: 184,
  rewardWidth: 70,
  intentHeight: 22,
} as const;
const HAND_FAN_MAX_SPAN = 292;
const HAND_FAN_CARD_WIDTH = 106;
const HAND_FAN_CARD_HEIGHT = 164;
const HAND_FAN_BASE_DEPTH = 100;
const MAX_HAND_SIZE = 7;
const INK_PAPER_FRAGMENT_SHADER = `
#define SHADER_NAME TEN_DAY_INN_INK_PAPER
precision mediump float;

uniform sampler2D uMainSampler;
uniform vec2 uResolution;
uniform float uBreath;

varying vec2 outTexCoord;

float paperHash(vec2 point) {
  return fract(52.9829189 * fract(dot(point, vec2(0.06711056, 0.00583715))));
}

void main() {
  vec4 source = texture2D(uMainSampler, outTexCoord);
  vec3 color = source.rgb;
  float luminance = dot(color, vec3(0.299, 0.587, 0.114));

  color = mix(vec3(luminance), color, 1.045);
  color = (color - 0.5) * 1.035 + 0.5;

  vec2 paperCell = floor(outTexCoord * uResolution * 0.46);
  float grain = paperHash(paperCell) - 0.5;
  float fiber = fract((gl_FragCoord.y + gl_FragCoord.x * 0.12) * 0.17) - 0.5;
  color += vec3(grain * 0.013 + fiber * 0.004);

  vec2 fromCenter = (outTexCoord - 0.5) * vec2(0.86, 1.0);
  float vignette = smoothstep(0.42, 0.72, length(fromCenter));
  color *= 1.0 - vignette * 0.085;

  float lanternBreath = 0.997 + uBreath * 0.003;
  color *= lanternBreath;
  color = mix(color, color * vec3(1.025, 1.0, 0.94), 0.12);

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), source.a);
}
`;

class InkPaperPostFXPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game: Phaser.Game) {
    super({
      game,
      name: "InkPaperPostFX",
      renderTarget: true,
      fragShader: INK_PAPER_FRAGMENT_SHADER,
    });
  }

  onPreRender() {
    this.set2f("uResolution", this.renderer.width, this.renderer.height);
    const breath = MOTION_ENABLED ? Math.sin((this.game.loop.time / 1000) * 0.32) : 0;
    this.set1f("uBreath", breath);
  }
}

type TargetKind = "market" | "stove" | "hall" | "room" | "guest" | "staff" | "any";
type CardTag = "采办" | "烹饪" | "跑堂" | "人情" | "整理" | "账房" | "客房";
type StaffId = "owner" | "aman" | "xiaomei";
type CardRarity = "初始" | "常见" | "少见" | "稀有" | "负担";
type ChallengeTier = "normal" | "elite" | "boss";
type GuestKey = "traveller" | "porter" | "merchant" | "scholar" | "lodger" | "family" | "critic";
type GuestIntent = "催单" | "弄脏" | "讲价" | "加单" | "查店";
type SpecialRule =
  | "none"
  | "rush"
  | "rain"
  | "mess_wave"
  | "repeat_tax"
  | "inspection"
  | "credit";

// Card families keep a stable ink color. The same ink is applied to every
// currently valid target, so color becomes a gameplay instruction rather than decoration.
const CARD_TAG_ACCENTS: Record<CardTag, number> = {
  采办: 0x81945f,
  烹饪: 0xc36f49,
  跑堂: 0x718990,
  人情: 0x987252,
  整理: 0x748d68,
  账房: 0xac8948,
  客房: 0x6d8491,
};
const TARGET_BASE_ACCENTS: Record<TargetKind, number> = {
  market: CARD_TAG_ACCENTS.采办,
  stove: CARD_TAG_ACCENTS.烹饪,
  hall: 0xa58a50,
  room: CARD_TAG_ACCENTS.客房,
  guest: 0x8b7661,
  staff: 0x8c7149,
  any: 0x8d9665,
};
const BASIC_ACTION_ACCENT = TARGET_BASE_ACCENTS.any;
const colorToCss = (color: number) => `#${color.toString(16).padStart(6, "0")}`;

type ActionDef = {
  id: string;
  title: string;
  description: string;
  target: TargetKind;
  cost: number;
  tag: CardTag;
  rarity: CardRarity;
  glyph: string;
  accent: number;
  rewardable?: boolean;
  status?: boolean;
  exhaust?: boolean;
};

type GuestDef = {
  name: string;
  subtitle: string;
  food: number;
  care: number;
  bed: number;
  patience: number;
  reward: number;
  damage: number;
  intent: GuestIntent;
  frame: number;
  accent: number;
};

type GuestState = {
  uid: string;
  key: GuestKey;
  food: number;
  care: number;
  bed: number;
  patience: number;
  reward: number;
  damage: number;
  intent: GuestIntent;
};

type ChallengePhase = {
  title: string;
  rule: string;
  guests: GuestKey[];
  goal: number;
  turns: number;
  special?: SpecialRule;
};

type ChallengeDef = {
  id: string;
  title: string;
  subtitle: string;
  rule: string;
  tier: ChallengeTier;
  minDay: number;
  turns: number;
  goal: number;
  rewardTags: CardTag[];
  special: SpecialRule;
  waves?: Record<number, GuestKey[]>;
  phases?: ChallengePhase[];
};

type RelicDef = {
  id: string;
  title: string;
  description: string;
  glyph: string;
  accent: number;
  group: "facility" | "role" | "treasure" | "route";
};

type EncounterState = {
  challengeId: string;
  turn: number;
  phaseIndex: number;
  phaseTurn: number;
  satisfied: number;
  phaseSatisfied: number;
  nextGuestSerial: number;
  guests: GuestState[];
  ingredients: number;
  dishes: number;
  fineDishes: number;
  beds: number;
  mess: number;
  labor: number;
  hand: string[];
  drawPile: string[];
  discardPile: string[];
  exhausted: string[];
  playedThisTurn: string[];
  servedThisTurn: number;
  cookedThisTurn: number;
  cookedTotal: number;
  boughtThisTurn: number;
  cleanedThisTurn: number;
  oldSoupTriggered: boolean;
  debtShieldUsed: boolean;
  staffJobs: Partial<Record<StaffId, string>>;
  routeProgress: number;
  routeTriggered: boolean;
};

type RunState = {
  day: number;
  signboard: number;
  maxSignboard: number;
  coins: number;
  deck: string[];
  relics: string[];
  route?: string;
  prepared?: boolean;
  staff: StaffId[];
  roomUnlocked: boolean;
  bigInn: boolean;
  rng: number;
  finalBoss: string;
  history: string[];
  bookingChoices: string[];
  totalSatisfied: number;
  totalEarned: number;
};

type SaveMode = "booking" | "encounter" | "reward" | "route" | "relic" | "outcome" | "gameover" | "victory";

type SaveState = {
  version: 3;
  mode: SaveMode;
  run: RunState;
  encounter?: EncounterState;
  rewardOptions?: string[];
  relicOptions?: string[];
  outcomeText?: string;
};

type TargetView = {
  key: string;
  kind: TargetKind;
  container: Phaser.GameObjects.Container;
  glow: Phaser.GameObjects.Rectangle;
  cue: Phaser.GameObjects.Container;
  cueWash: Phaser.GameObjects.Rectangle;
  cueFrame: Phaser.GameObjects.Rectangle;
  cueCorners: Phaser.GameObjects.Graphics;
  width: number;
  height: number;
};

type DragCard = {
  container: Phaser.GameObjects.Container;
  homeX: number;
  homeY: number;
  homeRotation?: number;
  width: number;
  height: number;
};

type SelectedAction = {
  card: DragCard;
  cardId: string;
  handIndex: number;
  basic: boolean;
};

type EnhancementItem = {
  id: string;
  title: string;
  description: string;
  category: string;
  glyph: string;
  accent: number;
  count?: number;
};

type PileKind = "discard" | "draw" | "deck";

type PileEntry = {
  cardId: string;
  count: number;
};

const ACTIONS: Record<string, ActionDef> = {
  market_early: {
    id: "market_early", title: "赶早采买", description: "获得2份备料。", target: "market", cost: 1,
    tag: "采办", rarity: "初始", glyph: "采", accent: 0x8d9a63, rewardable: true,
  },
  cook_home: {
    id: "cook_home", title: "家常小炒", description: "消耗1备料，做好1份热菜。", target: "stove", cost: 1,
    tag: "烹饪", rarity: "初始", glyph: "炒", accent: 0xc87950, rewardable: true,
  },
  serve_steady: {
    id: "serve_steady", title: "稳稳上菜", description: "消耗1热菜，满足1点食欲。", target: "guest", cost: 1,
    tag: "跑堂", rarity: "初始", glyph: "上", accent: 0x788e91, rewardable: true,
  },
  greet_smile: {
    id: "greet_smile", title: "笑脸迎客", description: "满足1点人情，耐心+1。", target: "guest", cost: 1,
    tag: "人情", rarity: "初始", glyph: "迎", accent: 0x9b7755, rewardable: true,
  },
  clean_quick: {
    id: "clean_quick", title: "顺手收桌", description: "清除2点脏乱。", target: "hall", cost: 1,
    tag: "整理", rarity: "初始", glyph: "净", accent: 0x7d956c, rewardable: true,
  },
  ledger_count: {
    id: "ledger_count", title: "盘算周转", description: "获得2文；本场使用后移除。", target: "hall", cost: 0,
    tag: "账房", rarity: "初始", glyph: "算", accent: 0xb5934f, rewardable: true, exhaust: true,
  },
  market_route: {
    id: "market_route", title: "熟门熟路", description: "获得3份备料。若本回合首次采办，再抽1张。", target: "market", cost: 1,
    tag: "采办", rarity: "常见", glyph: "路", accent: 0x84975f, rewardable: true,
  },
  debt_stock: {
    id: "debt_stock", title: "赊账进货", description: "免费获得4备料，并加入1张欠账。", target: "market", cost: 0,
    tag: "账房", rarity: "少见", glyph: "赊", accent: 0xa96452, rewardable: true, exhaust: true,
  },
  stockpile: {
    id: "stockpile", title: "看天囤货", description: "获得2备料；有储藏间则额外获得2份。", target: "market", cost: 1,
    tag: "采办", rarity: "常见", glyph: "囤", accent: 0x829368, rewardable: true,
  },
  hot_wok: {
    id: "hot_wok", title: "热锅不停", description: "消耗1备料，做好1热菜并抽1张。", target: "stove", cost: 1,
    tag: "烹饪", rarity: "常见", glyph: "旺", accent: 0xc86d47, rewardable: true,
  },
  one_pot_two: {
    id: "one_pot_two", title: "一锅两吃", description: "消耗2备料，做好3份热菜。", target: "stove", cost: 1,
    tag: "烹饪", rarity: "少见", glyph: "锅", accent: 0xc37a48, rewardable: true,
  },
  slow_braise: {
    id: "slow_braise", title: "慢火细炖", description: "消耗2备料，做好1热菜与1份名菜。", target: "stove", cost: 2,
    tag: "烹饪", rarity: "少见", glyph: "炖", accent: 0xa95042, rewardable: true,
  },
  borrow_fire: {
    id: "borrow_fire", title: "借火赶工", description: "免费做好1热菜，但增加2点脏乱。", target: "stove", cost: 0,
    tag: "烹饪", rarity: "少见", glyph: "火", accent: 0xbc5842, rewardable: true, exhaust: true,
  },
  two_tables: {
    id: "two_tables", title: "一肩两桌", description: "消耗至多2热菜，分别照应两位客人。", target: "guest", cost: 1,
    tag: "跑堂", rarity: "少见", glyph: "双", accent: 0x6f878d, rewardable: true,
  },
  signature_serve: {
    id: "signature_serve", title: "压轴名菜", description: "用1名菜满足2点食欲，并多收2文。", target: "guest", cost: 1,
    tag: "跑堂", rarity: "少见", glyph: "名", accent: 0xad5543, rewardable: true,
  },
  full_house: {
    id: "full_house", title: "满堂彩", description: "消耗3热菜，所有客人各满足1点食欲。", target: "guest", cost: 2,
    tag: "跑堂", rarity: "稀有", glyph: "满", accent: 0xa74638, rewardable: true,
  },
  tea_chat: {
    id: "tea_chat", title: "顺手添茶", description: "本回合上过菜才可免费打出；人情-1，耐心+1。", target: "guest", cost: 0,
    tag: "人情", rarity: "常见", glyph: "茶", accent: 0x789063, rewardable: true,
  },
  read_room: {
    id: "read_room", title: "察言观色", description: "满足2点人情，并抽2张牌。", target: "guest", cost: 1,
    tag: "人情", rarity: "少见", glyph: "察", accent: 0x8f7456, rewardable: true,
  },
  regular_bond: {
    id: "regular_bond", title: "宾至如归", description: "人情-1；若因此满意，修复1点招牌。", target: "guest", cost: 1,
    tag: "人情", rarity: "少见", glyph: "归", accent: 0x966348, rewardable: true,
  },
  wipe_clean: {
    id: "wipe_clean", title: "一抹即净", description: "清空所有脏乱。", target: "hall", cost: 1,
    tag: "整理", rarity: "少见", glyph: "扫", accent: 0x68896d, rewardable: true,
  },
  clean_serve: {
    id: "clean_serve", title: "边走边收", description: "清除2脏乱；本回合上过菜则抽1张。", target: "hall", cost: 1,
    tag: "整理", rarity: "常见", glyph: "收", accent: 0x739174, rewardable: true,
  },
  room_turn: {
    id: "room_turn", title: "整好床铺", description: "准备2个床位。", target: "room", cost: 1,
    tag: "客房", rarity: "常见", glyph: "床", accent: 0x718a91, rewardable: true,
  },
  settle_well: {
    id: "settle_well", title: "引客安寝", description: "消耗1床位，满足住宿并照应1点人情。", target: "guest", cost: 1,
    tag: "客房", rarity: "少见", glyph: "宿", accent: 0x6c7f91, rewardable: true,
  },
  night_round: {
    id: "night_round", title: "夜半添被", description: "准备1床位并抽1张牌。", target: "room", cost: 1,
    tag: "客房", rarity: "常见", glyph: "夜", accent: 0x687b8b, rewardable: true,
  },
  calculate: {
    id: "calculate", title: "铁算盘", description: "若还有至少2点行动，获得4文。", target: "hall", cost: 1,
    tag: "账房", rarity: "少见", glyph: "财", accent: 0xb18a42, rewardable: true,
  },
  master_plan: {
    id: "master_plan", title: "掌柜调度", description: "抽3张牌，并清除1点脏乱。", target: "hall", cost: 1,
    tag: "账房", rarity: "稀有", glyph: "调", accent: 0x9e7444, rewardable: true,
  },
  banquet_order: {
    id: "banquet_order", title: "整席齐出", description: "消耗3备料，做好2热菜与2名菜。", target: "stove", cost: 2,
    tag: "烹饪", rarity: "稀有", glyph: "宴", accent: 0xa94c3d, rewardable: true,
  },
  status_hurry: {
    id: "status_hurry", title: "催单", description: "忙乱占据一张手牌，无法打出。", target: "any", cost: 9,
    tag: "跑堂", rarity: "负担", glyph: "催", accent: 0x9d5045, status: true,
  },
  status_dirty: {
    id: "status_dirty", title: "脏碗", description: "以此前堂为目标：清除2脏乱，本场移除。", target: "hall", cost: 1,
    tag: "整理", rarity: "负担", glyph: "脏", accent: 0x796f58, status: true, exhaust: true,
  },
  status_debt: {
    id: "status_debt", title: "欠账", description: "无法打出；每次洗牌损失1文。", target: "any", cost: 9,
    tag: "账房", rarity: "负担", glyph: "欠", accent: 0x9b5547, status: true,
  },
  status_fatigue: {
    id: "status_fatigue", title: "疲惫", description: "永久混入牌组；每场抽到后才会移除。", target: "any", cost: 9,
    tag: "整理", rarity: "负担", glyph: "乏", accent: 0x6f6e62, status: true,
  },
};

const UPGRADE_EFFECTS: Record<string, string> = {
  market_early: "额外获得1份备料。",
  cook_home: "额外做好1份热菜。",
  serve_steady: "额外满足1点食欲。",
  greet_smile: "额外满足1点人情，并额外增加1点耐心。",
  clean_quick: "额外清除1点脏乱。",
  ledger_count: "额外获得1文。",
  market_route: "额外获得1份备料。",
  debt_stock: "额外获得1份备料。",
  stockpile: "额外获得1份备料。",
  hot_wok: "额外做好1份热菜。",
  one_pot_two: "额外做好1份热菜。",
  slow_braise: "额外做好1份热菜。",
  borrow_fire: "额外做好1份热菜。",
  two_tables: "最多照应的桌数由2桌提高至3桌。",
  signature_serve: "额外满足1点食欲，并额外多收1文。",
  full_house: "每位客人额外满足1点食欲。",
  tea_chat: "额外满足1点人情。",
  read_room: "额外满足1点人情。",
  regular_bond: "额外满足1点人情。",
  wipe_clean: "清空脏乱后额外抽1张牌。",
  clean_serve: "额外清除1点脏乱。",
  room_turn: "额外准备1个床位。",
  settle_well: "额外满足1点人情。",
  night_round: "额外准备1个床位。",
  calculate: "额外获得1文。",
  master_plan: "额外清除1点脏乱。",
  banquet_order: "额外做好1份热菜。",
};

const GUESTS: Record<GuestKey, GuestDef> = {
  traveller: { name: "赶路客", subtitle: "只想尽快吃口热饭", food: 1, care: 0, bed: 0, patience: 2, reward: 4, damage: 2, intent: "催单", frame: 2, accent: 0x718995 },
  porter: { name: "码头脚夫", subtitle: "饭量大，落座也快", food: 2, care: 0, bed: 0, patience: 2, reward: 6, damage: 2, intent: "弄脏", frame: 1, accent: 0x8d7658 },
  merchant: { name: "行商", subtitle: "吃饭之前先谈价钱", food: 1, care: 1, bed: 0, patience: 3, reward: 8, damage: 2, intent: "讲价", frame: 2, accent: 0x9b704f },
  scholar: { name: "赴试书生", subtitle: "饭要热，礼数也要周全", food: 1, care: 2, bed: 0, patience: 3, reward: 8, damage: 2, intent: "查店", frame: 3, accent: 0x7b788c },
  lodger: { name: "投宿旅人", subtitle: "要一顿饭和一张床", food: 1, care: 0, bed: 1, patience: 3, reward: 10, damage: 3, intent: "弄脏", frame: 2, accent: 0x667f8c },
  family: { name: "同乡团客", subtitle: "一桌人要一起吃上", food: 2, care: 1, bed: 0, patience: 3, reward: 11, damage: 3, intent: "加单", frame: 1, accent: 0x97704f },
  critic: { name: "慕名食客", subtitle: "胃口与眼光都很高", food: 2, care: 2, bed: 0, patience: 3, reward: 14, damage: 4, intent: "查店", frame: 3, accent: 0xa25143 },
};

const RELICS: Record<string, RelicDef> = {
  route_fire: { id: "route_fire", title: "烟火流水", description: "依次打出采办→烹饪→跑堂：做成1热菜，返还1行动并抽1张。进度可跨时刻保留。", glyph: "火", accent: 0xc56d48, group: "route" },
  route_hospitality: { id: "route_hospitality", title: "人情往来", description: "依次打出人情→跑堂→账房：所有客人耐心+1，获得4文并抽1张。", glyph: "情", accent: 0x94704f, group: "route" },
  route_order: { id: "route_order", title: "利落周转", description: "依次打出整理→账房→采办：清除2脏乱，返还1行动并抽1张。", glyph: "净", accent: 0x718b69, group: "route" },
  double_stove: { id: "double_stove", title: "双眼灶", description: "每回合第一次烹饪额外做好1份热菜。", glyph: "灶", accent: 0xc26d4e, group: "facility" },
  pantry: { id: "pantry", title: "储藏间", description: "每场客局开局额外获得2份备料。", glyph: "仓", accent: 0x819461, group: "facility" },
  blue_banner: { id: "blue_banner", title: "青布酒幌", description: "每场第一批客人的耐心各增加1。", glyph: "幌", accent: 0x738b84, group: "facility" },
  role_chef: { id: "role_chef", title: "阿满做厨工", description: "每回合第一次烹饪额外产出1份热菜。", glyph: "厨", accent: 0xc1714d, group: "role" },
  role_runner: { id: "role_runner", title: "阿满做跑堂", description: "每回合第一次上菜返还1点行动。", glyph: "堂", accent: 0x708791, group: "role" },
  role_steward: { id: "role_steward", title: "阿满做管事", description: "每回合第一次整理后抽1张牌。", glyph: "管", accent: 0x78916b, group: "role" },
  old_soup: { id: "old_soup", title: "祖传老汤", description: "每场第三次烹饪会额外做好1份名菜。", glyph: "汤", accent: 0xa85a45, group: "treasure" },
  abacus: { id: "abacus", title: "乌木算盘", description: "每场首次洗牌不受欠账影响。", glyph: "算", accent: 0xa17d45, group: "treasure" },
  warm_lantern: { id: "warm_lantern", title: "暖门灯", description: "每场客局开始时修复1点招牌。", glyph: "灯", accent: 0xb55543, group: "treasure" },
};

const CHALLENGES: Record<string, ChallengeDef> = {
  morning_rush: {
    id: "morning_rush", title: "赶考早席", subtitle: "第一拨生意", rule: "经营牌可以立即打出，也能排给掌柜成为每刻自动执行的差事。",
    tier: "normal", minDay: 1, turns: 4, goal: 3, rewardTags: ["采办", "烹饪", "跑堂"], special: "none",
    waves: { 1: ["traveller"], 2: ["traveller"], 3: ["porter"] },
  },
  merchant_table: {
    id: "merchant_table", title: "货商同桌", subtitle: "钱与人情", rule: "行商每回合都会压价，越拖收入越低。",
    tier: "normal", minDay: 2, turns: 4, goal: 2, rewardTags: ["人情", "账房"], special: "none",
    waves: { 1: ["merchant", "traveller"] },
  },
  scholar_gathering: {
    id: "scholar_gathering", title: "书生雅聚", subtitle: "不只要填饱肚子", rule: "礼数比饭量更重要，检验招呼与抽牌能力。",
    tier: "normal", minDay: 2, turns: 4, goal: 2, rewardTags: ["人情", "整理"], special: "inspection",
    waves: { 1: ["scholar"], 2: ["scholar"] },
  },
  dock_workers: {
    id: "dock_workers", title: "河工同桌", subtitle: "大碗快上", rule: "饭量大、耐心短，脏乱也会迅速累积。",
    tier: "normal", minDay: 2, turns: 4, goal: 3, rewardTags: ["烹饪", "跑堂", "整理"], special: "mess_wave",
    waves: { 1: ["porter", "traveller"], 2: ["porter"] },
  },
  rain_lodgers: {
    id: "rain_lodgers", title: "雨夜借宿", subtitle: "市场时开时闭", rule: "偶数回合市场关闭，必须提前囤货并准备床位。",
    tier: "normal", minDay: 4, turns: 5, goal: 3, rewardTags: ["客房", "采办"], special: "rain",
    waves: { 1: ["lodger"], 2: ["traveller"], 3: ["lodger"] },
  },
  late_inn: {
    id: "late_inn", title: "深夜满房", subtitle: "前堂与客房争行动", rule: "每回合额外增加脏乱，不能只顾着挣钱。",
    tier: "normal", minDay: 4, turns: 5, goal: 3, rewardTags: ["客房", "整理"], special: "mess_wave",
    waves: { 1: ["lodger", "merchant"], 3: ["lodger"] },
  },
  family_feast: {
    id: "family_feast", title: "同乡团席", subtitle: "一桌多口", rule: "团客会不断加单，适合批量生产与连桌上菜。",
    tier: "normal", minDay: 4, turns: 5, goal: 3, rewardTags: ["烹饪", "跑堂"], special: "none",
    waves: { 1: ["family"], 2: ["traveller"], 3: ["family"] },
  },
  inspection_day: {
    id: "inspection_day", title: "名客巡店", subtitle: "灶台之外也要体面", rule: "脏乱达到3时会损伤招牌，检验构筑的完整性。",
    tier: "normal", minDay: 7, turns: 5, goal: 3, rewardTags: ["人情", "整理", "账房"], special: "inspection",
    waves: { 1: ["critic"], 2: ["scholar"], 3: ["merchant"] },
  },
  festival_edge: {
    id: "festival_edge", title: "灯市客潮", subtitle: "最终大席前的热身", rule: "客人来得更快，所有耐心在回合末额外减少1。",
    tier: "normal", minDay: 7, turns: 5, goal: 4, rewardTags: ["跑堂", "烹饪"], special: "rush",
    waves: { 1: ["traveller", "porter"], 2: ["traveller"], 3: ["merchant"] },
  },
  elite_wedding: {
    id: "elite_wedding", title: "临时喜宴", subtitle: "难局 · 高额谢礼", rule: "四桌需求在短时间内集中出现，脏乱持续增加。",
    tier: "elite", minDay: 2, turns: 5, goal: 4, rewardTags: ["烹饪", "跑堂"], special: "mess_wave",
    waves: { 1: ["family", "traveller"], 2: ["porter"], 3: ["family"] },
  },
  elite_tasting: {
    id: "elite_tasting", title: "豪商试菜", subtitle: "难局 · 镇店之物", rule: "同回合重复使用同名牌会额外消耗1点行动。",
    tier: "elite", minDay: 4, turns: 5, goal: 3, rewardTags: ["烹饪", "人情"], special: "repeat_tax",
    waves: { 1: ["critic", "merchant"], 2: ["scholar"] },
  },
  elite_credit: {
    id: "elite_credit", title: "豪客赊宴", subtitle: "难局 · 高风险周转", rule: "开局得到备料，但两张欠账会立刻进入弃牌堆。",
    tier: "elite", minDay: 5, turns: 5, goal: 4, rewardTags: ["账房", "客房"], special: "credit",
    waves: { 1: ["merchant", "family"], 2: ["lodger"], 3: ["critic"] },
  },
  boss_dock: {
    id: "boss_dock", title: "码头开市宴", subtitle: "第三日大席", rule: "两阶段连续开席，检验最基本的循环稳定性。",
    tier: "boss", minDay: 3, turns: 4, goal: 0, rewardTags: ["采办", "烹饪"], special: "none",
    phases: [
      { title: "晨客涌入", rule: "两名赶路客必须在两刻内吃上。", guests: ["traveller", "traveller"], goal: 2, turns: 2 },
      { title: "脚夫开席", rule: "饭量更大，散席后也更脏。", guests: ["porter", "merchant"], goal: 2, turns: 3, special: "mess_wave" },
    ],
  },
  boss_rain: {
    id: "boss_rain", title: "暴雨商队", subtitle: "第六日大席", rule: "市场关闭与客房压力交替出现，检验引擎韧性。",
    tier: "boss", minDay: 6, turns: 6, goal: 0, rewardTags: ["客房", "整理"], special: "rain",
    phases: [
      { title: "抢在雨前", rule: "先处理赶路人与行商。", guests: ["traveller", "merchant"], goal: 2, turns: 2 },
      { title: "雨脚如麻", rule: "市场逢偶数刻关闭。", guests: ["lodger", "lodger"], goal: 2, turns: 3, special: "rain" },
      { title: "满堂泥水", rule: "每刻增加脏乱，必须兼顾收拾。", guests: ["family", "scholar"], goal: 2, turns: 3, special: "mess_wave" },
    ],
  },
  boss_festival: {
    id: "boss_festival", title: "上元百席", subtitle: "第十日压轴大席", rule: "客潮、主宴、散席三阶段连续结算。",
    tier: "boss", minDay: 10, turns: 7, goal: 0, rewardTags: ["跑堂", "烹饪"], special: "none",
    phases: [
      { title: "灯市入席", rule: "短耐心客人同时涌入。", guests: ["traveller", "porter", "traveller"], goal: 3, turns: 3, special: "rush" },
      { title: "主桌开宴", rule: "高需求客人考验持续出菜。", guests: ["family", "critic"], goal: 2, turns: 3, special: "repeat_tax" },
      { title: "散席留宿", rule: "住宿与脏乱一起到来。", guests: ["lodger", "lodger", "merchant"], goal: 3, turns: 3, special: "mess_wave" },
    ],
  },
  boss_critics: {
    id: "boss_critics", title: "名士品宴", subtitle: "第十日压轴大席", rule: "礼数、菜品与整洁轮番受检。",
    tier: "boss", minDay: 10, turns: 7, goal: 0, rewardTags: ["人情", "整理"], special: "inspection",
    phases: [
      { title: "迎客问礼", rule: "先稳住两位讲究客人。", guests: ["scholar", "merchant"], goal: 2, turns: 3, special: "inspection" },
      { title: "品味论菜", rule: "重复手段会更加费力。", guests: ["critic", "critic"], goal: 2, turns: 3, special: "repeat_tax" },
      { title: "巡看前堂", rule: "脏乱达到3就损伤招牌。", guests: ["scholar", "family"], goal: 2, turns: 3, special: "inspection" },
    ],
  },
  boss_caravan: {
    id: "boss_caravan", title: "西域商队夜宿", subtitle: "第十日压轴大席", rule: "供应、堂食与住宿连续承压。",
    tier: "boss", minDay: 10, turns: 7, goal: 0, rewardTags: ["客房", "采办"], special: "rain",
    phases: [
      { title: "商队进城", rule: "先接下大桌团客。", guests: ["family", "merchant"], goal: 2, turns: 3 },
      { title: "封市之后", rule: "偶数刻无法采办。", guests: ["porter", "lodger"], goal: 2, turns: 3, special: "rain" },
      { title: "彻夜安顿", rule: "连续安排三名投宿客。", guests: ["lodger", "lodger", "lodger"], goal: 3, turns: 3, special: "mess_wave" },
    ],
  },
};

const STARTING_DECK = [
  "market_early", "market_early",
  "cook_home", "cook_home",
  "serve_steady", "serve_steady",
  "greet_smile", "greet_smile",
  "clean_quick", "ledger_count",
];

const NORMAL_CHALLENGES = [
  "merchant_table", "scholar_gathering", "dock_workers", "rain_lodgers",
  "late_inn", "family_feast", "inspection_day", "festival_edge",
];
const ELITE_CHALLENGES = ["elite_wedding", "elite_tasting", "elite_credit"];
const FINAL_BOSSES = ["boss_festival", "boss_critics", "boss_caravan"];

function baseCardId(id: string) {
  return id.endsWith("+") ? id.slice(0, -1) : id;
}

function isUpgraded(id: string) {
  return id.endsWith("+");
}

function createFreshSave(): SaveState {
  const seed = ((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0) || 1;
  return {
    version: 3,
    mode: "booking",
    run: {
      day: 1,
      signboard: 18,
      maxSignboard: 18,
      coins: 8,
      deck: [...STARTING_DECK],
      relics: [],
      prepared: false,
      staff: ["owner"],
      roomUnlocked: false,
      bigInn: false,
      rng: seed,
      finalBoss: FINAL_BOSSES[seed % FINAL_BOSSES.length],
      history: [],
      bookingChoices: [],
      totalSatisfied: 0,
      totalEarned: 0,
    },
  };
}

class DeckInnScene extends Phaser.Scene {
  private save: SaveState = createFreshSave();
  private phaseLayer?: Phaser.GameObjects.Container;
  private handLayer?: Phaser.GameObjects.Container;
  private enhancementLayer?: Phaser.GameObjects.Container;
  private pileViewerLayer?: Phaser.GameObjects.Container;
  private handCards: DragCard[] = [];
  private targetViews: TargetView[] = [];
  private dayText!: Phaser.GameObjects.Text;
  private coinText!: Phaser.GameObjects.Text;
  private signText!: Phaser.GameObjects.Text;
  private deckText!: Phaser.GameObjects.Text;
  private enhancementText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private titleText!: Phaser.GameObjects.Text;
  private resetArmed = false;
  private actionLocked = false;
  private selectedAction?: SelectedAction;
  private focusedGuestUid?: string;
  private guestFocusMotionPending = false;
  private lastRenderedMode?: SaveMode;
  private handMotionPending = true;
  private selectedEnhancementId?: string;
  private hintBeforeEnhancements = "";
  private selectedPileCardId?: string;
  private hintBeforePileViewer = "";
  private pendingLaborGain = 0;
  private pendingLaborReason = "";
  private pendingStaffPulses = new Set<StaffId>();
  private pendingRoutePulse = false;

  constructor() {
    super("inn-deckbuilder");
  }

  private text(
    x: number,
    y: number,
    copy: string,
    style?: Phaser.Types.GameObjects.Text.TextStyle,
  ) {
    return this.add.text(x, y, copy, {
      fontFamily: UI_FONT,
      color: "#202018",
      ...style,
    }).setResolution(TEXT_RESOLUTION);
  }

  preload() {
    if (!this.textures.exists("food")) {
      this.load.spritesheet("food", "/assets/food-atlas.png", { frameWidth: 512, frameHeight: 512 });
    }
    if (!this.textures.exists("people")) {
      this.load.spritesheet("people", "/assets/people-atlas.png", { frameWidth: 512, frameHeight: 512 });
    }
    if (!this.textures.exists("scenes")) {
      this.load.spritesheet("scenes", "/assets/scene-atlas.png", { frameWidth: 512, frameHeight: 512 });
    }
    if (!this.textures.exists("campaignFood")) {
      this.load.spritesheet("campaignFood", "/assets/campaign-food-atlas.png", { frameWidth: 512, frameHeight: 512 });
    }
    if (!this.textures.exists("campaignScenes")) {
      this.load.spritesheet("campaignScenes", "/assets/campaign-scene-atlas.png", { frameWidth: 512, frameHeight: 512 });
    }
    if (!this.textures.exists("campaignItems")) {
      this.load.spritesheet("campaignItems", "/assets/campaign-item-atlas.png", { frameWidth: 512, frameHeight: 512 });
    }
  }

  create() {
    this.save = this.loadSave();
    this.cameras.main
      .setZoom(RENDER_SCALE)
      .centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2)
      .setRoundPixels(true);
    if (this.game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
      this.game.renderer.pipelines.addPostPipeline("InkPaperPostFX", InkPaperPostFXPipeline);
      this.cameras.main.setPostPipeline("InkPaperPostFX");
    }
    this.input.dragDistanceThreshold = 8;
    this.drawBackground();
    this.createHud();
    this.render();
    this.cameras.main.fadeIn(260, 36, 28, 20);
  }

  private drawBackground() {
    this.cameras.main.setBackgroundColor("#9da36b");
    const graphics = this.add.graphics();
    graphics.fillStyle(0x9da36b, 1);
    graphics.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    for (let y = 0; y < GAME_HEIGHT; y += 28) {
      for (let x = 0; x < GAME_WIDTH; x += 28) {
        graphics.fillStyle(((x + y) / 28) % 2 === 0 ? 0xb4b878 : 0x8d955e, 0.2);
        graphics.fillRect(x, y, 28, 28);
      }
    }

    graphics.fillStyle(0xe9cf78, 0.1);
    graphics.fillEllipse(370, 176, 270, 320);
    graphics.fillStyle(0x66765f, 0.09);
    graphics.fillEllipse(42, 610, 220, 390);
    graphics.lineStyle(2, 0xffefae, 0.12);
    graphics.strokeCircle(394, 148, 86);
    graphics.lineStyle(1, 0x4f5d48, 0.12);
    graphics.strokeCircle(20, 688, 74);

    graphics.fillStyle(0xc9b96c, 1);
    graphics.fillRect(0, 0, GAME_WIDTH, 72);
    graphics.fillStyle(0x202018, 1);
    graphics.fillRect(0, 70, GAME_WIDTH, 3);

    graphics.fillStyle(0xfff4bf, 0.92);
    graphics.fillRoundedRect(8, 78, 414, 730, 12);
    graphics.lineStyle(2.5, 0x202018, 1);
    graphics.strokeRoundedRect(8, 78, 414, 730, 12);

    graphics.fillStyle(0x202018, 0.97);
    graphics.fillRoundedRect(8, 814, 414, 38, 8);
    graphics.fillStyle(0xb45141, 1);
    graphics.fillRoundedRect(14, 820, 4, 25, 2);
    this.hintText = this.text(18, 824, "", {
      fontSize: "11px",
      color: "#fff3c8",
      fontStyle: "bold",
      wordWrap: { width: 394 },
    });
  }

  private createHud() {
    this.titleText = this.text(14, 10, "十日客栈", {
      fontSize: "20px",
      fontStyle: "bold",
    });
    this.dayText = this.text(15, 54, "", { fontSize: "11px", fontStyle: "bold", color: "#55563b" });

    this.createHudChip(244, 35, 66, 0x9d7540, "文", (text) => { this.coinText = text; });
    this.createHudChip(320, 35, 72, 0xa74d3f, "招", (text) => { this.signText = text; });
    this.createHudChip(393, 35, 68, 0x607b69, "组", (text) => { this.deckText = text; }, () => {
      this.openPileViewer("deck");
    });

    const enhancementButton = this.add.container(143, 35).setDepth(10);
    const enhancementShadow = this.add.rectangle(2, 3, 58, 28, 0x202018, 0.2);
    const enhancementBg = this.add.rectangle(0, 0, 58, 28, 0xfff4bf, 1)
      .setStrokeStyle(2, 0x202018, 1);
    const enhancementSeal = this.add.circle(-19, 0, 8, 0x9c7744, 1)
      .setStrokeStyle(1.2, 0x202018, 1);
    const enhancementGlyph = this.text(-19, 0, "强", {
      fontSize: "9px", color: "#fff4bf", fontStyle: "bold",
    }).setOrigin(0.5);
    this.enhancementText = this.text(8, 0, "强化 0", {
      fontSize: "9px", fontStyle: "bold",
    }).setOrigin(0.5);
    enhancementButton.add([
      enhancementShadow, enhancementBg, enhancementSeal, enhancementGlyph, this.enhancementText,
    ]);
    enhancementButton
      .setSize(58, 28)
      .setInteractive(this.containerHitArea(58, 28), Phaser.Geom.Rectangle.Contains);
    enhancementButton.input!.cursor = "pointer";
    enhancementButton.on("pointerdown", () => {
      if (!this.actionLocked) enhancementButton.setScale(0.96);
    });
    enhancementButton.on("pointerout", () => {
      if (!this.enhancementLayer) enhancementButton.setScale(1);
    });
    enhancementButton.on("pointerup", () => {
      if (this.actionLocked) return;
      enhancementButton.setScale(1);
      this.openEnhancementPanel();
    });

    const resetBg = this.add.rectangle(191, 35, 34, 28, 0xfff4bf, 1)
      .setStrokeStyle(2, 0x202018, 1)
      .setInteractive({ useHandCursor: true });
    const resetText = this.text(191, 35, "新档", { fontSize: "9px", fontStyle: "bold" }).setOrigin(0.5);
    resetBg.on("pointerover", () => {
      if (!this.resetArmed) resetBg.setFillStyle(0xffeaa7);
    });
    resetBg.on("pointerout", () => {
      if (!this.resetArmed) resetBg.setFillStyle(0xfff4bf);
    });
    resetBg.on("pointerdown", () => {
      if (!this.resetArmed) {
        this.resetArmed = true;
        resetBg.setFillStyle(0xb55443);
        resetText.setText("确认").setColor("#fff4bf");
        this.time.delayedCall(1800, () => {
          this.resetArmed = false;
          if (resetBg.active) {
            resetBg.setFillStyle(0xfff4bf);
            resetText.setText("新档").setColor("#202018");
          }
        });
        return;
      }
      this.save = createFreshSave();
      this.persist();
      this.render();
    });

    const modeShadow = this.add.rectangle(387, 61, 62, 20, 0x202018, 0.2);
    const modeBg = this.add.rectangle(385, 59, 62, 20, 0xfff4bf, 1)
      .setStrokeStyle(1.6, 0x202018, 1)
      .setInteractive({ useHandCursor: true });
    const modeText = this.text(385, 59, "切换玩法", {
      fontSize: "9px", fontStyle: "bold", color: "#5b5540",
    }).setOrigin(0.5);
    modeBg.on("pointerdown", () => {
      if (!this.actionLocked) {
        modeBg.setFillStyle(0xe9d692);
        modeText.setScale(0.96);
      }
    });
    modeBg.on("pointerout", () => {
      modeBg.setFillStyle(0xfff4bf);
      modeText.setScale(1);
    });
    modeBg.on("pointerup", () => {
      modeBg.setFillStyle(0xfff4bf);
      modeText.setScale(1);
      if (!this.actionLocked) this.scene.start("inn-mode-select");
    });
    modeShadow.setDepth(8);
    modeBg.setDepth(9);
    modeText.setDepth(10);
  }

  private createHudChip(
    x: number,
    y: number,
    width: number,
    accent: number,
    glyph: string,
    assign: (text: Phaser.GameObjects.Text) => void,
    onTap?: () => void,
  ) {
    this.add.rectangle(x + 2, y + 3, width, 29, 0x202018, 0.2);
    const body = this.add.rectangle(x, y, width, 29, 0xfff4bf, 1)
      .setStrokeStyle(2, 0x202018, 1);
    this.add.rectangle(x, y - 11, width - 5, 2, 0xffffff, 0.2);
    const sealX = x - width / 2 + 14;
    const seal = this.add.circle(sealX, y, 9, accent, 1).setStrokeStyle(1.5, 0x202018, 1);
    this.text(sealX, y, glyph, {
      fontSize: "9px", color: "#fff4bf", fontStyle: "bold",
    }).setOrigin(0.5);
    const label = this.text(x + 10, y, "", { fontSize: "10px", fontStyle: "bold" }).setOrigin(0.5);
    assign(label);
    if (onTap) {
      const hit = this.add.rectangle(x, y, width, 40, 0xffffff, 0.001)
        .setDepth(12)
        .setInteractive({ useHandCursor: true });
      hit.on("pointerdown", () => {
        if (this.actionLocked) return;
        body.setFillStyle(0xf2dea0);
        seal.setScale(0.9);
      });
      hit.on("pointerout", () => {
        body.setFillStyle(0xfff4bf);
        seal.setScale(1);
      });
      hit.on("pointerup", () => {
        if (this.actionLocked) return;
        body.setFillStyle(0xfff4bf);
        seal.setScale(1);
        onTap();
      });
    }
  }

  private render() {
    const modeChanged = this.lastRenderedMode !== this.save.mode;
    this.lastRenderedMode = this.save.mode;
    this.enhancementLayer?.destroy(true);
    this.enhancementLayer = undefined;
    this.pileViewerLayer?.destroy(true);
    this.pileViewerLayer = undefined;
    this.actionLocked = false;
    this.selectedAction = undefined;
    if (this.save.mode !== "encounter") {
      this.focusedGuestUid = undefined;
      this.guestFocusMotionPending = false;
      this.pendingLaborGain = 0;
      this.pendingLaborReason = "";
      this.pendingStaffPulses.clear();
      this.pendingRoutePulse = false;
    }
    this.phaseLayer?.destroy(true);
    this.phaseLayer = this.add.container(0, modeChanged && MOTION_ENABLED ? 8 : 0)
      .setDepth(20)
      .setAlpha(modeChanged && MOTION_ENABLED ? 0 : 1);
    this.handLayer = undefined;
    this.handCards = [];
    this.targetViews = [];
    this.refreshHud();

    if (this.save.mode === "booking") this.renderBooking();
    else if (this.save.mode === "encounter") this.renderEncounter();
    else if (this.save.mode === "reward") this.renderCardReward();
    else if (this.save.mode === "route") this.renderRouteReward();
    else if (this.save.mode === "relic") this.renderRelicReward();
    else if (this.save.mode === "outcome") this.renderOutcome();
    else if (this.save.mode === "gameover") this.renderGameOver();
    else this.renderVictory();

    if (modeChanged && MOTION_ENABLED && this.phaseLayer) {
      this.tweens.add({
        targets: this.phaseLayer,
        y: 0,
        alpha: 1,
        duration: 220,
        ease: "Cubic.Out",
      });
    }
  }

  private refreshHud() {
    const { run } = this.save;
    this.titleText.setText(run.bigInn ? "十日大客栈" : run.roomUnlocked ? "十日客店" : "十日客栈");
    this.dayText.setText(`第 ${run.day} 日 · ${this.modeLabel()}`);
    this.coinText.setText(String(run.coins));
    this.signText.setText(`${run.signboard}/${run.maxSignboard}`);
    this.deckText.setText(`卡组 ${run.deck.length}`);
    this.enhancementText.setText(`强化 ${this.currentEnhancements().length}`);
  }

  private modeLabel() {
    const labels: Record<SaveMode, string> = {
      booking: "翻看订桌簿",
      encounter: "客局进行中",
      reward: "挑选谢礼",
      route: "定下经营路数",
      relic: "扩建客栈",
      outcome: "带伤打烊",
      gameover: "招牌倒下",
      victory: "十日功成",
    };
    return labels[this.save.mode];
  }

  private currentEnhancements(): EnhancementItem[] {
    const { run } = this.save;
    const items: EnhancementItem[] = [];
    const relicIds = [...new Set([...(run.route ? [run.route] : []), ...run.relics])]
      .filter((id) => Boolean(RELICS[id]));
    const groupOrder: Record<RelicDef["group"], number> = {
      route: 0,
      facility: 1,
      role: 2,
      treasure: 3,
    };
    relicIds.sort((left, right) => groupOrder[RELICS[left].group] - groupOrder[RELICS[right].group]);

    relicIds.forEach((id) => {
      const relic = RELICS[id];
      const category: Record<RelicDef["group"], string> = {
        route: "经营路线",
        facility: "客栈设施",
        role: "伙计岗位",
        treasure: "镇店之物",
      };
      items.push({
        id: `relic:${id}`,
        title: relic.title,
        description: relic.description,
        category: category[relic.group],
        glyph: relic.glyph,
        accent: relic.accent,
      });
    });

    if (run.staff.includes("aman")) {
      items.push({
        id: "staff:aman",
        title: "阿满入伙",
        description: "每刻行动上限增加1，并解锁第二个排班位；班底按掌柜→阿满顺序自动开工。每日支付4文工钱。",
        category: "经营班底",
        glyph: "满",
        accent: 0x738b69,
      });
    }
    if (run.staff.includes("xiaomei")) {
      items.push({
        id: "staff:xiaomei",
        title: "小梅入伙",
        description: "每刻行动上限再增加1，并解锁第三个排班位；她会在阿满之后完成流水线收尾。每日支付4文工钱。",
        category: "经营班底",
        glyph: "梅",
        accent: 0x8c6e84,
      });
    }
    if (run.roomUnlocked) {
      items.push({
        id: "progress:room",
        title: "客房开门",
        description: "每场客局开局拥有1个床位，并解锁客房目标与住宿经营牌。",
        category: "客栈扩建",
        glyph: "房",
        accent: TARGET_BASE_ACCENTS.room,
      });
    }
    if (run.prepared) {
      items.push({
        id: "temporary:prepared",
        title: "提前备席",
        description: "下一场客局开局额外抽2张牌；进入客局后消耗。",
        category: "临时强化",
        glyph: "筹",
        accent: 0x7d8f61,
      });
    }

    const upgradedCounts = new Map<string, number>();
    run.deck.forEach((cardId) => {
      if (!isUpgraded(cardId)) return;
      const base = baseCardId(cardId);
      upgradedCounts.set(base, (upgradedCounts.get(base) ?? 0) + 1);
    });
    upgradedCounts.forEach((count, id) => {
      const def = ACTIONS[id];
      if (!def) return;
      items.push({
        id: `card:${id}`,
        title: `${def.title}+`,
        description: `基础：${def.description}\n强化：${UPGRADE_EFFECTS[id] ?? "效果提高。"}`,
        category: "卡牌强化",
        glyph: def.glyph,
        accent: this.cardVisualAccent(def),
        count,
      });
    });
    return items;
  }

  private openEnhancementPanel(selectedId?: string, preserveState = false) {
    const items = this.currentEnhancements();
    if (!preserveState) {
      const selectedCard = this.selectedAction?.card;
      if (selectedCard?.container.active) {
        this.tweens.killTweensOf(selectedCard.container);
        this.setCardSelectionCue(selectedCard, false);
        selectedCard.container
          .setPosition(selectedCard.homeX, selectedCard.homeY)
          .setRotation(selectedCard.homeRotation ?? 0)
          .setScale(1);
        if (this.handCards.includes(selectedCard)) this.restoreCardLayer(selectedCard);
        else selectedCard.container.setDepth(20);
      }
      this.selectedAction = undefined;
      this.clearTargetHighlights();
      this.hintBeforeEnhancements = this.hintText.text;
      this.hintText.setText("点选强化图标查看完整效果；点右上角或面板外关闭。");
      this.actionLocked = true;
    }
    this.enhancementLayer?.destroy(true);

    const selected = items.find((item) => item.id === selectedId)
      ?? items.find((item) => item.id === this.selectedEnhancementId)
      ?? items[0];
    this.selectedEnhancementId = selected?.id;
    const layer = this.add.container(0, 0).setDepth(15000);
    this.enhancementLayer = layer;
    const backdrop = this.add.rectangle(215, 430, GAME_WIDTH, GAME_HEIGHT, 0x16140f, 0.72)
      .setInteractive({ useHandCursor: true });
    const panelShadow = this.add.rectangle(219, 429, 390, 674, 0x202018, 0.38);
    const panel = this.add.rectangle(215, 425, 390, 674, 0xffefbb, 1)
      .setStrokeStyle(3, 0x202018, 1)
      .setInteractive();
    const innerLine = this.add.rectangle(215, 425, 374, 658, 0xffffff, 0)
      .setStrokeStyle(1, 0xffffff, 0.28);
    const topWash = this.add.rectangle(215, 126, 382, 72, 0x9c7744, 0.09);
    const title = this.text(38, 103, "当前强化", { fontSize: "20px", fontStyle: "bold" });
    const summary = this.text(39, 137, `共 ${items.length} 种效果 · 点小图标查看详情`, {
      fontSize: "10px", color: "#665e43", fontStyle: "bold",
    });
    const divider = this.add.rectangle(215, 161, 350, 1, 0x202018, 0.24);
    const closeShadow = this.add.rectangle(392, 117, 34, 32, 0x202018, 0.2);
    const closeBg = this.add.rectangle(389, 114, 34, 32, 0xb45141, 1)
      .setStrokeStyle(2, 0x202018, 1)
      .setInteractive({ useHandCursor: true });
    const closeText = this.text(389, 114, "×", {
      fontSize: "20px", color: "#fff4bf", fontStyle: "bold",
    }).setOrigin(0.5);
    layer.add([
      backdrop, panelShadow, panel, innerLine, topWash, title, summary, divider,
      closeShadow, closeBg, closeText,
    ]);

    backdrop.on("pointerup", () => this.closeEnhancementPanel());
    closeBg.on("pointerdown", () => closeBg.setScale(0.92));
    closeBg.on("pointerout", () => closeBg.setScale(1));
    closeBg.on("pointerup", () => {
      closeBg.setScale(1);
      this.closeEnhancementPanel();
    });

    if (items.length === 0) {
      const emptySeal = this.add.circle(215, 280, 42, 0x9c7744, 0.18)
        .setStrokeStyle(2, 0x9c7744, 0.8);
      const emptyGlyph = this.text(215, 280, "强", {
        fontSize: "26px", fontStyle: "bold", color: "#7f6943",
      }).setOrigin(0.5);
      const emptyText = this.text(215, 355, "尚未获得强化\n完成客局、扩建客栈或获得第三张同名牌后会显示在这里。", {
        fontSize: "12px", fontStyle: "bold", color: "#5f5b42", align: "center",
        wordWrap: { width: 310, useAdvancedWrap: true }, lineSpacing: 6,
      }).setOrigin(0.5, 0);
      layer.add([emptySeal, emptyGlyph, emptyText]);
    } else {
      const columns = 5;
      const startX = 60;
      const startY = 195;
      const gapX = 78;
      const gapY = 66;
      items.forEach((item, index) => {
        const x = startX + (index % columns) * gapX;
        const y = startY + Math.floor(index / columns) * gapY;
        const isSelected = item.id === selected?.id;
        const icon = this.add.container(x, y).setScale(isSelected ? 1.06 : 1);
        const iconGlow = this.add.rectangle(0, -7, 54, 50, item.accent, isSelected ? 0.18 : 0)
          .setStrokeStyle(isSelected ? 2.5 : 0, item.accent, 1);
        const iconBody = this.add.rectangle(0, -7, 46, 42, 0xfff4c3, 1)
          .setStrokeStyle(2, isSelected ? item.accent : 0x202018, 1);
        const glyphHalo = this.add.circle(0, -7, 16, item.accent, 0.16);
        const glyphRing = this.add.circle(0, -7, 13, item.accent, 1)
          .setStrokeStyle(1.5, 0x202018, 1);
        const glyph = this.text(0, -7, item.glyph, {
          fontSize: "12px", fontStyle: "bold", color: "#fff4c8",
        }).setOrigin(0.5);
        const shortTitle = item.title.length > 5 ? `${item.title.slice(0, 5)}…` : item.title;
        const label = this.text(0, 22, shortTitle, {
          fontSize: "9px", fontStyle: "bold", color: isSelected ? colorToCss(item.accent) : "#504d39",
          align: "center",
        }).setOrigin(0.5);
        icon.add([iconGlow, iconBody, glyphHalo, glyphRing, glyph, label]);
        if ((item.count ?? 1) > 1) {
          const countBg = this.add.circle(18, -25, 9, 0x202018, 1)
            .setStrokeStyle(1, item.accent, 1);
          const countText = this.text(18, -25, `×${item.count}`, {
            fontSize: "9px", fontStyle: "bold", color: "#fff4bf",
          }).setOrigin(0.5);
          icon.add([countBg, countText]);
        }
        icon.setSize(64, 60).setInteractive(this.containerHitArea(64, 60), Phaser.Geom.Rectangle.Contains);
        icon.input!.cursor = "pointer";
        icon.on("pointerdown", () => icon.setScale(0.96));
        icon.on("pointerout", () => icon.setScale(isSelected ? 1.06 : 1));
        icon.on("pointerup", () => {
          this.selectedEnhancementId = item.id;
          this.openEnhancementPanel(item.id, true);
        });
        layer.add(icon);
      });

      if (selected) {
        const detailShadow = this.add.rectangle(218, 598, 354, 250, 0x202018, 0.22);
        const detailBg = this.add.rectangle(215, 594, 354, 250, 0xfff5c8, 1)
          .setStrokeStyle(2.2, 0x202018, 1);
        const detailWash = this.add.rectangle(215, 594, 348, 244, selected.accent, 0.055);
        const detailRail = this.add.rectangle(43, 594, 7, 232, selected.accent, 1);
        const detailHalo = this.add.circle(76, 518, 31, selected.accent, 0.17);
        const detailRing = this.add.circle(76, 518, 24, selected.accent, 1)
          .setStrokeStyle(2, 0x202018, 1);
        const detailGlyph = this.text(76, 518, selected.glyph, {
          fontSize: "19px", fontStyle: "bold", color: "#fff4c8",
        }).setOrigin(0.5);
        const detailTitle = this.text(116, 486, selected.title, {
          fontSize: selected.title.length > 10 ? "15px" : "18px", fontStyle: "bold",
          wordWrap: { width: 235, useAdvancedWrap: true }, maxLines: 1,
        });
        const detailCategory = this.text(116, 519, selected.category, {
          fontSize: "10px", fontStyle: "bold", color: colorToCss(selected.accent),
        });
        const description = this.text(55, 560, selected.description, {
          fontSize: "12px", color: "#504d39", fontStyle: "bold",
          wordWrap: { width: 320, useAdvancedWrap: true }, maxLines: 7, lineSpacing: 5,
        });
        const position = this.text(382, 697, `${items.indexOf(selected) + 1}/${items.length}`, {
          fontSize: "9px", color: "#71694d", fontStyle: "bold",
        }).setOrigin(1, 0);
        const detailContent = this.add.container(0, 0);
        detailContent.add([
          detailHalo, detailRing, detailGlyph, detailTitle, detailCategory, description, position,
        ]);
        layer.add([detailShadow, detailBg, detailWash, detailRail, detailContent]);
        if (MOTION_ENABLED && preserveState) {
          detailContent.setAlpha(0.35).setX(7);
          this.tweens.add({
            targets: detailContent,
            x: 0,
            alpha: 1,
            duration: 105,
            ease: "Cubic.Out",
          });
        }
      }
    }

    if (MOTION_ENABLED && !preserveState) {
      layer.setAlpha(0).setScale(0.985);
      this.tweens.add({
        targets: layer,
        alpha: 1,
        scale: 1,
        duration: 180,
        ease: "Cubic.Out",
      });
    }
  }

  private closeEnhancementPanel() {
    const layer = this.enhancementLayer;
    if (!layer) return;
    const finish = () => {
      if (layer.active) layer.destroy(true);
      if (this.enhancementLayer === layer) this.enhancementLayer = undefined;
      this.actionLocked = false;
      if (this.hintText.active) this.hintText.setText(this.hintBeforeEnhancements);
    };
    if (MOTION_ENABLED) {
      this.tweens.add({
        targets: layer,
        alpha: 0,
        scale: 0.985,
        duration: 120,
        ease: "Cubic.In",
        onComplete: finish,
      });
    } else {
      finish();
    }
  }

  private pileEntries(cards: string[]): PileEntry[] {
    const counts = new Map<string, number>();
    cards.forEach((cardId) => counts.set(cardId, (counts.get(cardId) ?? 0) + 1));
    return [...counts.entries()]
      .map(([cardId, count]) => ({ cardId, count }))
      .sort((left, right) => {
        const leftDef = ACTIONS[baseCardId(left.cardId)];
        const rightDef = ACTIONS[baseCardId(right.cardId)];
        if (Boolean(leftDef?.status) !== Boolean(rightDef?.status)) return leftDef?.status ? 1 : -1;
        const tagOrder = (leftDef?.tag ?? "").localeCompare(rightDef?.tag ?? "", "zh-CN");
        if (tagOrder !== 0) return tagOrder;
        return (leftDef?.title ?? left.cardId).localeCompare(rightDef?.title ?? right.cardId, "zh-CN");
      });
  }

  private openPileViewer(kind: PileKind, selectedCardId?: string, preserveState = false) {
    const encounter = this.save.encounter;
    if (kind !== "deck" && !encounter) return;
    if (!preserveState) {
      const selectedCard = this.selectedAction?.card;
      if (selectedCard?.container.active) {
        this.tweens.killTweensOf(selectedCard.container);
        this.setCardSelectionCue(selectedCard, false);
        selectedCard.container
          .setPosition(selectedCard.homeX, selectedCard.homeY)
          .setRotation(selectedCard.homeRotation ?? 0)
          .setScale(1);
        if (this.handCards.includes(selectedCard)) this.restoreCardLayer(selectedCard);
        else selectedCard.container.setDepth(20);
      }
      this.selectedAction = undefined;
      this.clearTargetHighlights();
      this.hintBeforePileViewer = this.hintText.text;
      this.hintText.setText("点牌名查看完整效果；点右上角或面板外返回当前页面。");
      this.actionLocked = true;
    }
    this.pileViewerLayer?.destroy(true);

    const cards = kind === "deck"
      ? this.save.run.deck
      : kind === "discard"
        ? encounter?.discardPile ?? []
        : encounter?.drawPile ?? [];
    const entries = this.pileEntries(cards);
    const selected = entries.find((entry) => entry.cardId === selectedCardId)
      ?? entries.find((entry) => entry.cardId === this.selectedPileCardId)
      ?? entries[0];
    this.selectedPileCardId = selected?.cardId;
    const accent = kind === "discard" ? 0x9b6652 : 0x607b69;
    const pileTitle = kind === "deck" ? "卡组" : kind === "discard" ? "弃牌库" : "抽牌库";
    const layer = this.add.container(0, 0).setDepth(15000);
    this.pileViewerLayer = layer;
    const backdrop = this.add.rectangle(215, 430, GAME_WIDTH, GAME_HEIGHT, 0x16140f, 0.72)
      .setInteractive({ useHandCursor: true });
    const panelShadow = this.add.rectangle(219, 429, 390, 674, 0x202018, 0.38);
    const panel = this.add.rectangle(215, 425, 390, 674, 0xffefbb, 1)
      .setStrokeStyle(3, 0x202018, 1)
      .setInteractive();
    const innerLine = this.add.rectangle(215, 425, 374, 658, 0xffffff, 0)
      .setStrokeStyle(1, 0xffffff, 0.28);
    const topWash = this.add.rectangle(215, 126, 382, 72, accent, 0.1);
    const rail = this.add.rectangle(24, 425, 6, 650, accent, 1);
    const title = this.text(38, 103, `${pileTitle} · ${cards.length}张`, {
      fontSize: "20px", fontStyle: "bold",
    });
    const summaryCopy = kind === "deck"
      ? `${entries.length}种牌 · ${this.deckTagSummary() || "尚未形成牌型"} · 点牌查看详情`
      : kind === "draw"
        ? `${entries.length}种牌 · 只显示构成，抽取顺序未知`
        : `${entries.length}种牌 · 本刻打出、弃置的牌会来到这里`;
    const summary = this.text(39, 137, summaryCopy, {
      fontSize: "10px", color: "#665e43", fontStyle: "bold",
    });
    const divider = this.add.rectangle(215, 161, 350, 1, 0x202018, 0.24);
    const closeShadow = this.add.rectangle(392, 117, 34, 32, 0x202018, 0.2);
    const closeBg = this.add.rectangle(389, 114, 34, 32, accent, 1)
      .setStrokeStyle(2, 0x202018, 1)
      .setInteractive({ useHandCursor: true });
    const closeText = this.text(389, 114, "×", {
      fontSize: "20px", color: "#fff4bf", fontStyle: "bold",
    }).setOrigin(0.5);
    layer.add([
      backdrop, panelShadow, panel, innerLine, topWash, rail, title, summary, divider,
      closeShadow, closeBg, closeText,
    ]);

    backdrop.on("pointerup", () => this.closePileViewer());
    closeBg.on("pointerdown", () => closeBg.setScale(0.92));
    closeBg.on("pointerout", () => closeBg.setScale(1));
    closeBg.on("pointerup", () => {
      closeBg.setScale(1);
      this.closePileViewer();
    });

    if (entries.length === 0) {
      const emptySeal = this.add.circle(215, 302, 44, accent, 0.18)
        .setStrokeStyle(2, accent, 0.85);
      const emptyGlyph = this.text(215, 302, kind === "deck" ? "组" : kind === "discard" ? "弃" : "抽", {
        fontSize: "26px", fontStyle: "bold", color: colorToCss(accent),
      }).setOrigin(0.5);
      const emptyCopy = kind === "deck"
        ? "卡组还是空的\n获得经营牌后会在这里显示完整构成。"
        : kind === "discard"
          ? "弃牌库还是空的\n打出的经营牌会在这里等待下次洗牌。"
          : "抽牌库已经见底\n下一次抽牌会洗回弃牌库。";
      const emptyText = this.text(215, 380, emptyCopy, {
        fontSize: "12px", fontStyle: "bold", color: "#5f5b42", align: "center",
        wordWrap: { width: 310, useAdvancedWrap: true }, lineSpacing: 6,
      }).setOrigin(0.5, 0);
      layer.add([emptySeal, emptyGlyph, emptyText]);
    } else {
      const columns = 4;
      const startX = 76;
      const startY = 196;
      const gapX = 92;
      const gapY = 58;
      const tileWidth = 82;
      const tileHitWidth = 86;
      entries.forEach((entry, index) => {
        const def = ACTIONS[baseCardId(entry.cardId)];
        if (!def) return;
        const itemAccent = this.cardVisualAccent(def);
        const x = startX + (index % columns) * gapX;
        const y = startY + Math.floor(index / columns) * gapY;
        const isSelected = entry.cardId === selected?.cardId;
        const tile = this.add.container(x, y).setScale(isSelected ? 1.045 : 1);
        const tileShadow = this.add.rectangle(2, 3, tileWidth, 48, 0x202018, 0.18);
        const tileBody = this.add.rectangle(0, 0, tileWidth, 48, 0xfff4c3, 1)
          .setStrokeStyle(isSelected ? 2.5 : 1.7, isSelected ? itemAccent : 0x202018, 1);
        const tileWash = this.add.rectangle(0, 0, tileWidth - 4, 44, itemAccent, isSelected ? 0.12 : 0.055);
        const tileRail = this.add.rectangle(-38, 0, 5, 40, itemAccent, 1);
        const glyphRing = this.add.circle(-23, -3, 12, itemAccent, 1)
          .setStrokeStyle(1.3, 0x202018, 1);
        const glyph = this.text(-23, -3, def.glyph, {
          fontSize: "10px", fontStyle: "bold", color: "#fff4c8",
        }).setOrigin(0.5);
        const upgradedMark = isUpgraded(entry.cardId);
        const titleLimit = upgradedMark ? 3 : 4;
        const shortTitle = def.title.length > titleLimit ? `${def.title.slice(0, titleLimit)}…` : def.title;
        const cardTitle = this.text(-6, -10, `${shortTitle}${upgradedMark ? "+" : ""}`, {
          fontSize: "9px", fontStyle: "bold", color: "#302e23",
        });
        const costCopy = def.status ? "状态" : `${def.cost}行动`;
        const meta = this.text(-6, 8, costCopy, {
          fontSize: "9px", fontStyle: "bold", color: colorToCss(itemAccent),
        });
        tile.add([tileShadow, tileBody, tileWash, tileRail, glyphRing, glyph, cardTitle, meta]);
        if (entry.count > 1) {
          const countBg = this.add.circle(32, -18, 9, 0x202018, 1)
            .setStrokeStyle(1, itemAccent, 1);
          const countText = this.text(32, -18, `×${entry.count}`, {
            fontSize: "9px", fontStyle: "bold", color: "#fff4bf",
          }).setOrigin(0.5);
          tile.add([countBg, countText]);
        }
        tile.setSize(tileHitWidth, 52)
          .setInteractive(this.containerHitArea(tileHitWidth, 52), Phaser.Geom.Rectangle.Contains);
        tile.input!.cursor = "pointer";
        tile.on("pointerdown", () => tile.setScale(0.97));
        tile.on("pointerout", () => tile.setScale(isSelected ? 1.045 : 1));
        tile.on("pointerup", () => {
          this.selectedPileCardId = entry.cardId;
          this.openPileViewer(kind, entry.cardId, true);
        });
        layer.add(tile);
      });

      if (selected) {
        const def = ACTIONS[baseCardId(selected.cardId)];
        if (def) {
          const itemAccent = this.cardVisualAccent(def);
          const upgraded = isUpgraded(selected.cardId);
          const detailShadow = this.add.rectangle(218, 646, 354, 178, 0x202018, 0.22);
          const detailBg = this.add.rectangle(215, 642, 354, 178, 0xfff5c8, 1)
            .setStrokeStyle(2.2, 0x202018, 1);
          const detailWash = this.add.rectangle(215, 642, 348, 172, itemAccent, 0.06);
          const detailRail = this.add.rectangle(43, 642, 7, 160, itemAccent, 1);
          const detailHalo = this.add.circle(76, 590, 28, itemAccent, 0.16);
          const detailRing = this.add.circle(76, 590, 21, itemAccent, 1)
            .setStrokeStyle(2, 0x202018, 1);
          const detailGlyph = this.text(76, 590, def.glyph, {
            fontSize: "17px", fontStyle: "bold", color: "#fff4c8",
          }).setOrigin(0.5);
          const detailTitle = this.text(112, 558, `${def.title}${upgraded ? "+" : ""}`, {
            fontSize: def.title.length > 9 ? "15px" : "18px", fontStyle: "bold",
            wordWrap: { width: 248, useAdvancedWrap: true }, maxLines: 1,
          });
          const detailMeta = this.text(112, 590, `${def.tag} · ${def.rarity} · ${def.status ? "状态牌" : `${def.cost}行动`}`, {
            fontSize: "10px", fontStyle: "bold", color: colorToCss(itemAccent),
          });
          const effectCopy = upgraded
            ? `${def.description}\n强化：${UPGRADE_EFFECTS[def.id] ?? "效果提高。"}`
            : def.description;
          const detailCopy = kind === "deck" && !def.status
            ? `${effectCopy}\n差事：${this.staffJobDescription(selected.cardId)}`
            : effectCopy;
          const description = this.text(55, 624, detailCopy, {
            fontSize: "11px", color: "#504d39", fontStyle: "bold",
            wordWrap: { width: 320, useAdvancedWrap: true }, maxLines: 5, lineSpacing: 3,
          });
          const count = this.text(382, 702, kind === "deck" ? `卡组中 ${selected.count}张` : `此牌 ${selected.count}张`, {
            fontSize: "9px", color: "#71694d", fontStyle: "bold",
          }).setOrigin(1, 0);
          const detailContent = this.add.container(0, 0);
          detailContent.add([
            detailHalo, detailRing, detailGlyph, detailTitle, detailMeta, description, count,
          ]);
          layer.add([detailShadow, detailBg, detailWash, detailRail, detailContent]);
          if (MOTION_ENABLED && preserveState) {
            detailContent.setAlpha(0.35).setX(7);
            this.tweens.add({
              targets: detailContent,
              x: 0,
              alpha: 1,
              duration: 105,
              ease: "Cubic.Out",
            });
          }
        }
      }
    }

    if (MOTION_ENABLED && !preserveState) {
      layer.setAlpha(0).setScale(0.985);
      this.tweens.add({
        targets: layer,
        alpha: 1,
        scale: 1,
        duration: 180,
        ease: "Cubic.Out",
      });
    }
  }

  private closePileViewer() {
    const layer = this.pileViewerLayer;
    if (!layer) return;
    const finish = () => {
      if (layer.active) layer.destroy(true);
      if (this.pileViewerLayer === layer) this.pileViewerLayer = undefined;
      this.actionLocked = false;
      if (this.hintText.active) this.hintText.setText(this.hintBeforePileViewer);
    };
    if (MOTION_ENABLED) {
      this.tweens.add({
        targets: layer,
        alpha: 0,
        scale: 0.985,
        duration: 120,
        ease: "Cubic.In",
        onComplete: finish,
      });
    } else {
      finish();
    }
  }

  private renderBooking() {
    this.ensureBookingChoices();
    const { run } = this.save;
    const boss = CHALLENGES[this.nextBossId()];
    const finalBoss = CHALLENGES[run.finalBoss];
    const bossDay = run.day <= 3 ? 3 : run.day <= 6 ? 6 : 10;

    this.addPanel(18, 90, 394, 112, 0xf4e7b5);
    this.addToPhase(this.text(30, 101, run.day === 10 ? "压轴大席已经开门" : "今日接哪一局生意？", {
      fontSize: "19px", fontStyle: "bold",
    }));
    this.addToPhase(this.text(30, 135, `第${bossDay}日大席 · ${boss.title}`, {
      fontSize: "12px", fontStyle: "bold", color: "#95463b",
    }));
    this.addToPhase(this.text(30, 157, boss.rule, {
      fontSize: "10px", color: "#5d583e", fontStyle: "bold", wordWrap: { width: 368 }, maxLines: 2,
    }));
    this.addToPhase(this.text(30, 184, `终局：${finalBoss.title} · ${this.bossPrepHint(run.finalBoss)}`, {
      fontSize: "9px", color: "#76503f", fontStyle: "bold", wordWrap: { width: 368 }, maxLines: 1,
    }));

    const choices = run.bookingChoices;
    const choiceYs = choices.length === 1
      ? [350]
      : choices.length === 2
        ? [285, 435]
        : [250, 380, 510];

    choices.forEach((id, index) => {
      const challenge = CHALLENGES[id];
      const accent = challenge.tier === "boss" ? 0xa84d3e : challenge.tier === "elite" ? 0xb17c36 : 0x748b68;
      const card = this.createChoiceRow({
        y: choiceYs[index],
        height: choices.length === 1 ? 152 : choices.length === 2 ? 126 : 112,
        title: challenge.title,
        subtitle: challenge.rule,
        meta: this.challengeRewardLabel(challenge),
        badge: challenge.tier === "boss" ? "大" : challenge.tier === "elite" ? "难" : String(challenge.turns),
        glyph: challenge.tier === "boss" ? "宴" : challenge.tier === "elite" ? "险" : "客",
        accent,
        onTap: (cardView) => this.chooseBookingCard(cardView, id),
      });
      card.container.setData("challengeId", id);
    });

    const canPrepare = !run.prepared && run.coins >= PREP_COST;
    const prepare = this.createTapButton({
      x: 112, y: 582, width: 182, height: 72,
      title: run.prepared ? "备席已完成" : "提前备席",
      subtitle: run.prepared ? "下场多抽2张" : `花${PREP_COST}文 · 下场多抽2张`,
      glyph: run.prepared ? "✓" : "筹", accent: 0x7d8f61,
      muted: !canPrepare,
      onTap: canPrepare ? (cardView) => this.choosePrepareCard(cardView) : undefined,
    });
    prepare.container.setDepth(10);

    const canRepair = run.signboard < run.maxSignboard && run.coins >= REPAIR_COST;
    const repair = this.createTapButton({
      x: 318, y: 582, width: 182, height: 72,
      title: "修补门面", subtitle: `花${REPAIR_COST}文 · 招牌+4`,
      glyph: "补", accent: 0xa55a43,
      muted: !canRepair,
      onTap: canRepair ? (cardView) => this.chooseRepairCard(cardView) : undefined,
    });
    repair.container.setDepth(10);

    const staffNames = run.staff.map((id) => id === "owner" ? "掌柜" : id === "aman" ? "阿满" : "小梅").join("、");
    this.addPanel(24, 644, 382, 140, 0xe6dfaa);
    this.addToPhase(this.text(38, 658, `班底 · ${staffNames}`, { fontSize: "14px", fontStyle: "bold" }));
    this.addToPhase(this.text(38, 686, `每回合 ${this.maxLabor()} 行动　日工钱 ${Math.max(0, run.staff.length - 1) * WAGE_PER_HELPER}文　永久构筑 ${run.relics.length}件`, {
      fontSize: "10px", color: "#5e6045", fontStyle: "bold",
    }));
    const tags = this.deckTagSummary();
    this.addToPhase(this.text(38, 715, `经营路数 · ${run.route ? RELICS[run.route]?.title : "首日后确定"}`, {
      fontSize: "11px", color: "#8a493c", fontStyle: "bold",
    }));
    this.addToPhase(this.text(38, 742, `当前牌组 · ${tags || "尚未成形"}`, {
      fontSize: "11px", color: "#574f39", fontStyle: "bold", wordWrap: { width: 350 },
    }));
    this.addToPhase(this.text(38, 766, `牌组 ${run.deck.length}张 · 钱 ${run.coins}文 · 招牌 ${run.signboard}/${run.maxSignboard}`, {
      fontSize: "10px", color: "#574f39", fontStyle: "bold",
    }));
    this.hintText.setText("点选一局生意开场；需要时先备席或修补门面。");
  }

  private choosePrepareCard(card: DragCard) {
    if (this.save.run.prepared || this.save.run.coins < PREP_COST) return;
    this.actionLocked = true;
    this.tweens.add({
      targets: card.container,
      y: card.homeY - 10,
      scale: 1.08,
      alpha: 0,
      duration: 150,
      onComplete: () => {
        this.save.run.coins -= PREP_COST;
        this.save.run.prepared = true;
        this.persist();
        this.render();
        this.toast("席面备妥", `花去${PREP_COST}文，下一场开局多抽2张。`, 1300);
      },
    });
  }

  private chooseRepairCard(card: DragCard) {
    if (this.save.run.coins < REPAIR_COST || this.save.run.signboard >= this.save.run.maxSignboard) return;
    this.actionLocked = true;
    this.tweens.add({
      targets: card.container,
      y: card.homeY - 10,
      scale: 1.08,
      alpha: 0,
      duration: 150,
      onComplete: () => {
        this.save.run.coins -= REPAIR_COST;
        this.save.run.signboard = Math.min(this.save.run.maxSignboard, this.save.run.signboard + 4);
        this.persist();
        this.render();
        this.toast("门面修好", `花去${REPAIR_COST}文，招牌恢复4点。`, 1300);
      },
    });
  }

  private ensureBookingChoices() {
    const { run } = this.save;
    if (run.bookingChoices.length > 0) return;
    if (run.day === 1) {
      run.bookingChoices = ["morning_rush"];
    } else if (run.day === 3) {
      run.bookingChoices = ["boss_dock"];
    } else if (run.day === 6) {
      run.bookingChoices = ["boss_rain"];
    } else if (run.day === 10) {
      run.bookingChoices = [run.finalBoss];
    } else {
      const available = NORMAL_CHALLENGES.filter((id) => {
        const challenge = CHALLENGES[id];
        if (challenge.minDay > run.day) return false;
        if (!run.roomUnlocked && id.includes("lodger")) return false;
        return !run.history.slice(-3).includes(id);
      });
      const shuffled = this.shuffle([...available]);
      run.bookingChoices = shuffled.slice(0, 2);
      if ([2, 5, 8, 9].includes(run.day) && this.random() < 0.58) {
        const elite = this.shuffle(ELITE_CHALLENGES.filter((id) => CHALLENGES[id].minDay <= run.day))[0];
        if (elite) run.bookingChoices[1] = elite;
      }
    }
    this.persist();
  }

  private chooseBookingCard(card: DragCard, challengeId: string) {
    this.actionLocked = true;
    this.tweens.add({
      targets: card.container,
      y: card.homeY - 16,
      scale: 1.1,
      alpha: 0,
      duration: 180,
      ease: "Quad.Out",
      onComplete: () => this.startEncounter(challengeId),
    });
  }

  private nextBossId() {
    const day = this.save.run.day;
    if (day <= 3) return "boss_dock";
    if (day <= 6) return "boss_rain";
    return this.save.run.finalBoss;
  }

  private bossPrepHint(bossId: string) {
    const hints: Record<string, string> = {
      boss_festival: "宜备批量出菜、跑堂与客房",
      boss_critics: "宜备人情、整理并减少重复手段",
      boss_caravan: "宜备采办、囤货与客房",
    };
    return hints[bossId] ?? "先让牌组运转稳定";
  }

  private challengeRewardLabel(challenge: ChallengeDef) {
    if (challenge.tier === "boss") return this.save.run.day === 10 ? "终局验证" : "大席 · 永久成长";
    if (challenge.tier === "elite") return "难局 · 镇店之物";
    return `客局 · ${challenge.rewardTags.slice(0, 2).join("/")}`;
  }

  private routeRewardTags() {
    const tags: Record<string, CardTag[]> = {
      route_fire: ["采办", "烹饪", "跑堂"],
      route_hospitality: ["人情", "跑堂", "账房"],
      route_order: ["整理", "账房", "采办"],
    };
    return this.save.run.route ? tags[this.save.run.route] ?? [] : [];
  }

  private deckTagSummary() {
    const counts = new Map<CardTag, number>();
    this.save.run.deck.forEach((id) => {
      const def = ACTIONS[baseCardId(id)];
      if (!def || def.status) return;
      counts.set(def.tag, (counts.get(def.tag) ?? 0) + 1);
    });
    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3)
      .map(([tag, count]) => `${tag}${count}`)
      .join(" · ");
  }

  private addToPhase<T extends Phaser.GameObjects.GameObject>(object: T) {
    this.phaseLayer?.add(object);
    return object;
  }

  private addPanel(x: number, y: number, width: number, height: number, color: number) {
    const shadow = this.add.rectangle(x + width / 2 + 3, y + height / 2 + 4, width, height, 0x202018, 0.16);
    const panel = this.add.rectangle(x + width / 2, y + height / 2, width, height, color, 0.97)
      .setStrokeStyle(2, 0x202018, 0.92);
    const highlight = this.add.rectangle(x + width / 2, y + 3, width - 10, 2, 0xffffff, 0.2);
    this.addToPhase(shadow);
    this.addToPhase(panel);
    this.addToPhase(highlight);
    return panel;
  }

  private addSectionHeader(y: number, title: string, detail: string, accent = 0x8d9665) {
    const labelWidth = Math.max(64, title.length * 13 + 22);
    const detailWidth = Math.max(78, detail.length * 9 + 18);
    const rule = this.add.rectangle(215, y + 7, 382, 1, 0x202018, 0.2);
    const labelBg = this.add.rectangle(20 + labelWidth / 2, y + 7, labelWidth, 18, 0xfff4bf, 1);
    const detailBg = this.add.rectangle(410 - detailWidth / 2, y + 7, detailWidth, 18, 0xfff4bf, 1);
    const mark = this.add.rectangle(25, y + 7, 4, 13, accent, 1);
    const titleText = this.text(33, y, title, {
      fontSize: "11px", fontStyle: "bold", color: "#4f5139",
    });
    const detailText = this.text(406, y + 1, detail, {
      fontSize: "9px", fontStyle: "bold", color: "#746b4c",
    }).setOrigin(1, 0);
    [rule, labelBg, detailBg, mark, titleText, detailText].forEach((object) => this.addToPhase(object));
  }

  private createChoiceRow(options: {
    x?: number;
    y: number;
    width?: number;
    height?: number;
    title: string;
    subtitle: string;
    meta: string;
    badge: string;
    glyph: string;
    accent: number;
    muted?: boolean;
    onTap?: (card: DragCard) => void;
  }): DragCard {
    const x = options.x ?? 215;
    const width = options.width ?? 374;
    const height = options.height ?? 112;
    const container = this.add.container(x, options.y);
    const shadow = this.add.rectangle(4, 5, width, height, 0x202018, 0.24);
    const body = this.add.rectangle(0, 0, width, height, options.muted ? 0xd8d3a4 : 0xfff3c2, 1)
      .setStrokeStyle(2.4, 0x202018, 1);
    const topLight = this.add.rectangle(0, -height / 2 + 4, width - 10, 2, 0xffffff, 0.24);
    const accent = this.add.rectangle(-width / 2 + 7, 0, 10, height - 12, options.accent, 1);
    const wash = this.add.ellipse(-width / 2 + 50, -5, 70, 62, options.accent, 0.09);
    const halo = this.add.circle(-width / 2 + 50, -5, 29, options.accent, 0.18);
    const glyphRing = this.add.circle(-width / 2 + 50, -5, 22, options.accent, 1)
      .setStrokeStyle(2, 0x202018, 1);
    const glyph = this.text(-width / 2 + 50, -5, options.glyph, {
      fontSize: "19px", fontStyle: "bold", color: "#fff4c8",
    }).setOrigin(0.5);
    const title = this.text(-width / 2 + 91, -height / 2 + 17, options.title, {
      fontSize: options.title.length > 11 ? "13px" : "15px",
      fontStyle: "bold",
      wordWrap: { width: width - 145, useAdvancedWrap: true },
      maxLines: 1,
    });
    const subtitle = this.text(-width / 2 + 91, -height / 2 + 45, options.subtitle, {
      fontSize: "11px",
      color: "#514d38",
      fontStyle: "bold",
      wordWrap: { width: width - 145, useAdvancedWrap: true },
      maxLines: 3,
      lineSpacing: 1,
    });
    const meta = this.text(-width / 2 + 91, height / 2 - 17, options.meta, {
      fontSize: "10px", color: colorToCss(options.accent), fontStyle: "bold",
    }).setOrigin(0, 0.5);
    const badgeBody = this.add.circle(width / 2 - 26, 0, 18, 0x202018, 1)
      .setStrokeStyle(2, options.accent, 1);
    const badge = this.text(width / 2 - 26, 0, options.badge, {
      fontSize: "11px", color: "#fff3c0", fontStyle: "bold",
    }).setOrigin(0.5);

    container.add([shadow, body, topLight, accent, wash, halo, glyphRing, glyph, title, subtitle, meta, badgeBody, badge]);
    container.setSize(width, height).setAlpha(options.muted ? 0.66 : 1);
    this.addToPhase(container);
    const card: DragCard = { container, homeX: x, homeY: options.y, width, height };

    if (options.onTap) {
      container.setInteractive(this.containerHitArea(width, height), Phaser.Geom.Rectangle.Contains);
      container.input!.cursor = "pointer";
      container.on("pointerdown", () => {
        if (!this.actionLocked) {
          this.tweens.killTweensOf(container);
          container.setScale(0.982);
        }
      });
      container.on("pointerout", () => {
        if (!this.actionLocked) {
          this.tweens.add({ targets: container, scale: 1, duration: 90, ease: "Back.Out" });
        }
      });
      container.on("pointerup", () => {
        if (this.actionLocked) return;
        container.setScale(1.025);
        options.onTap?.(card);
      });
    }
    return card;
  }

  private createTapButton(options: {
    x: number;
    y: number;
    width: number;
    height: number;
    title: string;
    subtitle?: string;
    glyph?: string;
    accent: number;
    muted?: boolean;
    onTap?: (button: DragCard) => void;
  }): DragCard {
    const container = this.add.container(options.x, options.y);
    const shadow = this.add.rectangle(3, 4, options.width, options.height, 0x202018, 0.22);
    const glow = this.add.rectangle(0, 0, options.width + 8, options.height + 8, 0xe8cc62, 0.05)
      .setStrokeStyle(3, 0xe8cc62, 1)
      .setAlpha(0);
    const body = this.add.rectangle(0, 0, options.width, options.height, options.muted ? 0xd4d0a4 : 0xfff3c2, 1)
      .setStrokeStyle(2.2, 0x202018, 1);
    const colorWash = this.add.rectangle(0, 0, options.width - 4, options.height - 4, options.accent, options.muted ? 0.025 : 0.055);
    const topLight = this.add.rectangle(0, -options.height / 2 + 4, options.width - 10, 2, 0xffffff, 0.24);
    const stripe = this.add.rectangle(-options.width / 2 + 6, 0, 8, options.height - 10, options.accent, 1);
    const glyphHalo = this.add.circle(-options.width / 2 + 28, 0, 17, options.accent, 0.12);
    const glyph = this.text(-options.width / 2 + 28, 0, options.glyph ?? "", {
      fontSize: "16px", fontStyle: "bold", color: "#403d2d",
    }).setOrigin(0.5);
    const titleX = options.glyph ? -options.width / 2 + 50 : -options.width / 2 + 18;
    const titleY = options.subtitle ? -10 : 0;
    const title = this.text(titleX, titleY, options.title, {
      fontSize: options.width >= 170 ? "13px" : "12px", fontStyle: "bold",
    }).setOrigin(0, 0.5);
    const subtitle = this.text(titleX, 14, options.subtitle ?? "", {
      fontSize: "10px", color: "#5c563f", fontStyle: "bold",
      wordWrap: { width: options.width - (options.glyph ? 66 : 32), useAdvancedWrap: true },
      maxLines: 1,
    }).setOrigin(0, 0.5);
    container.add([shadow, glow, body, colorWash, topLight, stripe, glyphHalo, glyph, title, subtitle]);
    container
      .setSize(options.width, options.height)
      .setData("glow", glow)
      .setData("accent", options.accent)
      .setAlpha(options.muted ? 0.62 : 1);
    this.addToPhase(container);
    const button: DragCard = {
      container,
      homeX: options.x,
      homeY: options.y,
      width: options.width,
      height: options.height,
    };
    if (options.onTap) {
      container.setInteractive(this.containerHitArea(options.width, options.height), Phaser.Geom.Rectangle.Contains);
      container.input!.cursor = "pointer";
      container.on("pointerdown", () => {
        if (!this.actionLocked) {
          this.tweens.killTweensOf(container);
          container.setScale(0.975);
        }
      });
      container.on("pointerout", () => {
        if (!this.actionLocked && this.selectedAction?.card.container !== container) {
          this.tweens.add({ targets: container, scale: 1, duration: 90, ease: "Back.Out" });
        }
      });
      container.on("pointerup", () => {
        if (this.actionLocked) return;
        container.setScale(1.025);
        options.onTap?.(button);
      });
    }
    return button;
  }

  private createPileButton(kind: PileKind, x: number, y: number, count: number) {
    const discard = kind === "discard";
    const accent = discard ? 0x9b6652 : 0x607b69;
    const glyphCopy = discard ? "弃" : "抽";
    const container = this.add.container(x, y);
    const backCard = this.add.rectangle(3, -3, 42, 50, 0xe8dca8, 1)
      .setStrokeStyle(1.5, 0x202018, 0.78);
    const shadow = this.add.rectangle(2, 3, 46, 54, 0x202018, 0.24);
    const body = this.add.rectangle(0, 0, 46, 54, 0xfff3c2, 1)
      .setStrokeStyle(2.1, 0x202018, 1);
    const wash = this.add.rectangle(0, 0, 42, 50, accent, 0.075);
    const topStripe = this.add.rectangle(0, -18, 42, 16, accent, 1)
      .setStrokeStyle(1.2, 0x202018, 1);
    const glyph = this.text(0, -18, glyphCopy, {
      fontSize: "11px", fontStyle: "bold", color: "#fff4c8",
    }).setOrigin(0.5);
    const countHalo = this.add.circle(0, 8, 16, accent, 0.18);
    const countRing = this.add.circle(0, 8, 13, 0x202018, 1)
      .setStrokeStyle(1.5, accent, 1);
    const countText = this.text(0, 7, String(count), {
      fontSize: count > 9 ? "12px" : "15px", fontStyle: "bold", color: "#fff4bf",
    }).setOrigin(0.5);
    container.add([
      backCard, shadow, body, wash, topStripe, glyph, countHalo, countRing, countText,
    ]);
    container
      .setSize(50, 58)
      .setInteractive(this.containerHitArea(50, 58), Phaser.Geom.Rectangle.Contains);
    container.input!.cursor = "pointer";
    container.on("pointerdown", () => {
      if (!this.actionLocked) container.setScale(0.965);
    });
    container.on("pointerout", () => {
      if (!this.actionLocked) container.setScale(1);
    });
    container.on("pointerup", () => {
      if (this.actionLocked) return;
      container.setScale(1);
      this.openPileViewer(kind);
    });
    this.addToPhase(container);
    return container;
  }

  private createCard(options: {
    x: number;
    y: number;
    width?: number;
    height?: number;
    title: string;
    subtitle: string;
    typeLabel: string;
    badge: string;
    accent: number;
    glyph?: string;
    atlas?: string;
    frame?: number;
    muted?: boolean;
    onTap?: (card: DragCard) => void;
    draggable?: boolean;
    onDragStart?: (card: DragCard) => void;
    onDrop?: (card: DragCard) => void;
  }): DragCard {
    const width = options.width ?? 76;
    const height = options.height ?? 112;
    const container = this.add.container(options.x, options.y);
    const shadow = this.add.rectangle(3, 4, width, height, 0x202018, 0.28);
    const glow = this.add.rectangle(0, 0, width + 8, height + 8, 0xe8cc62, 0.05)
      .setStrokeStyle(3, 0xe8cc62, 1)
      .setAlpha(0);
    const body = this.add.rectangle(0, 0, width, height, options.muted ? 0xd8d4a3 : 0xfff5c8, 1)
      .setStrokeStyle(2.2, 0x202018, 1);
    const colorWash = this.add.rectangle(0, 0, width - 4, height - 4, options.accent, options.muted ? 0.025 : 0.055);
    const innerLine = this.add.rectangle(0, 1, width - 7, height - 7, 0xffffff, 0)
      .setStrokeStyle(1, 0xffffff, 0.2);
    const stripe = this.add.rectangle(0, -height / 2 + 13, width - 4, 22, options.accent, 1)
      .setStrokeStyle(1.4, 0x202018, 1);
    const leftRail = this.add.rectangle(-width / 2 + 4, 11, 4, height - 32, options.accent, 0.92);
    const badgeX = -width / 2 + 13;
    const badgeY = -height / 2 + 13;

    const title = this.text(-width / 2 + 28, -height / 2 + 13, options.title, {
      fontSize: width >= 108
        ? options.title.length > 8 ? "11px" : "13px"
        : options.title.length > 7 ? "10px" : "12px",
      fontStyle: "bold",
      wordWrap: { width: width - 36, useAdvancedWrap: true },
      maxLines: 2,
      align: "left",
    }).setOrigin(0, 0.5);

    let art: Phaser.GameObjects.GameObject;
    const artY = -height / 2 + 50;
    const artX = width <= 120 ? -18 : 0;
    const artWash = this.add.ellipse(artX, artY, Math.min(70, width - 18), 48, options.accent, 0.1);
    if (options.atlas && options.frame !== undefined) {
      art = this.add.image(artX, artY, options.atlas, options.frame)
        .setDisplaySize(Math.min(width - 14, 70), Math.min(48, height * 0.38));
    } else {
      const artGroup = this.add.container(artX, artY);
      const halo = this.add.circle(0, 0, Math.min(24, width * 0.27), options.accent, 0.2);
      const ring = this.add.circle(0, 0, Math.min(18, width * 0.2), options.accent, 0.92)
        .setStrokeStyle(2.2, 0x202018, 1);
      const glyph = this.text(0, 0, options.glyph ?? options.typeLabel.slice(0, 1), {
        fontSize: width < 70 ? "13px" : "16px",
        fontStyle: "bold",
        color: "#fff4c8",
      }).setOrigin(0.5);
      artGroup.add([halo, ring, glyph]);
      art = artGroup;
    }

    const descTop = -height / 2 + Math.min(82, height * 0.64);
    const subtitle = this.text(-width / 2 + 7, descTop, options.subtitle, {
      fontSize: width >= 108 ? "11px" : "10px",
      color: "#56513b",
      fontStyle: "bold",
      wordWrap: { width: width - 24, useAdvancedWrap: true },
      maxLines: height >= 145 ? 5 : 3,
      lineSpacing: 1,
      align: "left",
    }).setOrigin(0, 0);
    const typeLabel = this.text(-width / 2 + 7, height / 2 - 12, options.typeLabel, {
      fontSize: "10px", color: colorToCss(options.accent), fontStyle: "bold",
    }).setOrigin(0, 0.5);
    const badgeCircle = this.add.circle(badgeX, badgeY, 9, 0x202018, 1)
      .setStrokeStyle(1.5, options.accent, 1);
    const badge = this.text(badgeX, badgeY, options.badge, {
      fontSize: "10px", color: "#fff4bf", fontStyle: "bold",
    }).setOrigin(0.5);

    container.add([
      shadow, glow, body, colorWash, innerLine, leftRail, stripe, badgeCircle, badge,
      title, artWash, art, subtitle, typeLabel,
    ]);
    container.setSize(width, height).setData("glow", glow).setData("accent", options.accent);
    this.addToPhase(container);
    const card: DragCard = { container, homeX: options.x, homeY: options.y, width, height };

    if (options.onTap) {
      const hitArea = this.containerHitArea(width, height);
      container.setInteractive(hitArea, Phaser.Geom.Rectangle.Contains);
      container.input!.cursor = "pointer";
      container.on("pointerdown", () => {
        container.setData("suppressTap", false);
        if (!this.actionLocked) container.setScale(1.035);
      });
      container.on("pointerout", () => {
        if (!this.actionLocked && this.selectedAction?.card.container !== container) container.setScale(1);
      });
      container.on("pointerup", () => {
        if (this.actionLocked) return;
        if (container.getData("suppressTap")) return;
        container.setScale(this.selectedAction?.card.container === container ? 1.08 : 1);
        options.onTap?.(card);
      });
    }

    if (options.draggable) {
      if (!container.input) {
        const hitArea = this.containerHitArea(width, height);
        container.setInteractive(hitArea, Phaser.Geom.Rectangle.Contains);
      }
      container.input!.cursor = "grab";
      this.input.setDraggable(container);
      container.on("dragstart", () => {
        if (this.actionLocked) return;
        container.setData("suppressTap", true);
        if (container.depth < 6000) container.setData("homeDepth", container.depth);
        container.parentContainer?.bringToTop(container);
        container.setDepth(7000).setScale(1.06).setRotation(0);
        options.onDragStart?.(card);
      });
      container.on("drag", (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
        if (this.actionLocked) return;
        const deltaX = dragX - container.x;
        container
          .setPosition(dragX, dragY)
          .setRotation(Phaser.Math.Clamp(deltaX * 0.014, -0.12, 0.12));
        this.updateTargetHover(dragX, dragY);
      });
      container.on("dragend", () => {
        if (this.actionLocked) return;
        options.onDrop?.(card);
      });
    }

    return card;
  }

  private cardVisualAccent(def: ActionDef) {
    return def.target === "any" ? def.accent : TARGET_BASE_ACCENTS[def.target];
  }

  private selectedCueAccent() {
    const selected = this.selectedAction;
    if (!selected || selected.basic) return BASIC_ACTION_ACCENT;
    const def = ACTIONS[baseCardId(selected.cardId)];
    return def ? this.cardVisualAccent(def) : TARGET_BASE_ACCENTS.any;
  }

  private drawTargetCorners(
    graphics: Phaser.GameObjects.Graphics,
    width: number,
    height: number,
    accent: number,
  ) {
    const x = width / 2 - 5;
    const y = height / 2 - 5;
    const length = Math.min(20, Math.max(11, width * 0.09));
    graphics.clear().lineStyle(3, accent, 1).beginPath();
    graphics.moveTo(-x, -y + length).lineTo(-x, -y).lineTo(-x + length, -y);
    graphics.moveTo(x - length, -y).lineTo(x, -y).lineTo(x, -y + length);
    graphics.moveTo(x, y - length).lineTo(x, y).lineTo(x - length, y);
    graphics.moveTo(-x + length, y).lineTo(-x, y).lineTo(-x, y - length);
    graphics.strokePath();
  }

  private paintTargetCue(target: TargetView, accent: number) {
    target.glow
      .setFillStyle(accent, 0.15)
      .setStrokeStyle(4, accent, 0.98);
    target.cueWash.setFillStyle(accent, 0.105);
    target.cueFrame.setStrokeStyle(1.5, accent, 0.72);
    this.drawTargetCorners(target.cueCorners, target.width, target.height, accent);
  }

  private isSelectedTargetValid(target: TargetView) {
    const selected = this.selectedAction;
    if (!selected) return false;
    const def = selected.basic ? undefined : ACTIONS[baseCardId(selected.cardId)];
    if (target.kind === "staff") {
      return Boolean(!selected.basic && def && !def.status && !this.actionError(selected.cardId, target, false));
    }
    const targetKind = selected.basic
      ? "any"
      : def?.target ?? "any";
    if (targetKind !== "any" && target.kind !== targetKind) return false;
    return !this.actionError(selected.cardId, target, selected.basic);
  }

  private setCardSelectionCue(card: DragCard, active: boolean) {
    const glow = card.container.getData("glow") as Phaser.GameObjects.Rectangle | undefined;
    if (!glow) return;
    this.tweens.killTweensOf(glow);
    glow.setScale(1);
    if (!active) {
      glow.setAlpha(0);
      return;
    }
    const accent = Number(card.container.getData("accent") ?? BASIC_ACTION_ACCENT);
    glow.setFillStyle(accent, 0.14).setStrokeStyle(3.5, accent, 1);
    if (MOTION_ENABLED) {
      this.tweens.add({
        targets: glow,
        alpha: { from: 0.74, to: 1 },
        scaleX: { from: 1, to: 1.018 },
        scaleY: { from: 1, to: 1.012 },
        duration: 620,
        ease: "Sine.InOut",
        yoyo: true,
        repeat: -1,
      });
    } else {
      glow.setAlpha(0.92);
    }
  }

  private registerTarget(
    key: string,
    kind: TargetKind,
    container: Phaser.GameObjects.Container,
    glow: Phaser.GameObjects.Rectangle,
    width: number,
    height: number,
    onIdleTap?: () => void,
  ) {
    const baseAccent = TARGET_BASE_ACCENTS[kind];
    const cueWash = this.add.rectangle(0, 0, width - 6, height - 6, baseAccent, 0.105);
    const cueFrame = this.add.rectangle(0, 0, width - 9, height - 9, 0xffffff, 0)
      .setStrokeStyle(1.5, baseAccent, 0.72);
    const cueCorners = this.add.graphics();
    const cue = this.add.container(0, 0, [cueWash, cueFrame, cueCorners]).setAlpha(0);
    container.add(cue);
    const target: TargetView = {
      key, kind, container, glow, cue, cueWash, cueFrame, cueCorners, width, height,
    };
    this.paintTargetCue(target, baseAccent);
    this.targetViews.push(target);
    const hitArea = this.containerHitArea(width, height);
    container.setInteractive(hitArea, Phaser.Geom.Rectangle.Contains);
    container.input!.cursor = "pointer";
    container.on("pointerdown", () => {
      if (!this.actionLocked && this.isSelectedTargetValid(target)) container.setScale(0.988);
    });
    container.on("pointerover", () => {
      if (!this.selectedAction) return;
      const valid = this.isSelectedTargetValid(target);
      const accent = this.selectedCueAccent();
      this.paintTargetCue(target, accent);
      this.tweens.killTweensOf([target.glow, target.cue]);
      target.glow.setAlpha(valid ? 1 : 0.025).setScale(valid ? 1.026 : 1);
      target.cue.setAlpha(valid ? 1 : 0).setScale(valid ? 1.008 : 1);
    });
    container.on("pointerout", () => {
      if (!this.actionLocked) container.setScale(1);
      if (this.selectedAction) this.highlightSelectedTargets();
    });
    container.on("pointerup", () => {
      container.setScale(1);
      if (this.selectedAction) this.playSelectedOnTarget(target);
      else onIdleTap?.();
    });
    return target;
  }

  private containerHitArea(width: number, height: number) {
    // Phaser normalizes Container input into top-left local coordinates by adding displayOrigin.
    return new Phaser.Geom.Rectangle(0, 0, width, height);
  }

  private findTargetAt(x: number, y: number) {
    return [...this.targetViews].reverse().find((target) => new Phaser.Geom.Rectangle(
      target.container.x - target.width / 2,
      target.container.y - target.height / 2,
      target.width,
      target.height,
    ).contains(x, y));
  }

  private updateTargetHover(x: number, y: number) {
    const dragged = this.findTargetAt(x, y);
    const accent = this.selectedCueAccent();
    this.targetViews.forEach((target) => {
      const valid = this.isSelectedTargetValid(target);
      const hovered = target === dragged && valid;
      this.paintTargetCue(target, accent);
      this.tweens.killTweensOf([target.glow, target.cue]);
      target.glow
        .setAlpha(hovered ? 1 : valid ? 0.66 : 0.025)
        .setScale(hovered ? 1.026 : valid ? 1.012 : 1);
      target.cue
        .setAlpha(hovered ? 1 : valid ? 0.78 : 0)
        .setScale(hovered ? 1.008 : 1);
    });
  }

  private returnCard(card: DragCard) {
    this.setCardSelectionCue(card, false);
    this.clearTargetHighlights();
    this.tweens.add({
      targets: card.container,
      x: card.homeX,
      y: card.homeY,
      rotation: card.homeRotation ?? 0,
      scale: 1,
      alpha: 1,
      duration: 160,
      ease: "Back.Out",
      onComplete: () => this.restoreCardLayer(card),
    });
  }

  private restoreCardLayer(card: DragCard) {
    const handIndex = this.handCards.indexOf(card);
    if (handIndex >= 0 && this.handLayer && card.container.parentContainer === this.handLayer) {
      this.handLayer.moveTo(card.container, handIndex);
      card.container.setDepth(HAND_FAN_BASE_DEPTH + handIndex);
      return;
    }
    card.container.setDepth(Number(card.container.getData("homeDepth") ?? 0));
  }

  private raiseCardLayer(card: DragCard) {
    card.container.parentContainer?.bringToTop(card.container);
    card.container.setDepth(7000);
  }

  private clearTargetHighlights() {
    this.targetViews.forEach((target) => {
      this.tweens.killTweensOf([target.glow, target.cue]);
      target.glow.setAlpha(0).setScale(1);
      target.cue.setAlpha(0).setScale(1);
      this.paintTargetCue(target, TARGET_BASE_ACCENTS[target.kind]);
    });
  }

  private actionImpact(target: TargetView, cardId: string, basic: boolean) {
    const def = ACTIONS[baseCardId(cardId)];
    const accent = basic
      ? BASIC_ACTION_ACCENT
      : def ? this.cardVisualAccent(def) : TARGET_BASE_ACCENTS[target.kind];
    const x = target.container.x;
    const y = target.container.y;
    const ring = this.add.circle(x, y, 15, accent, 0)
      .setStrokeStyle(3, accent, 0.95)
      .setDepth(9000);
    const wash = this.add.circle(x, y, 10, accent, 0.3).setDepth(8999);

    this.tweens.add({
      targets: ring,
      scale: MOTION_ENABLED ? 2.5 : 1.5,
      alpha: 0,
      duration: MOTION_ENABLED ? 300 : 120,
      ease: "Cubic.Out",
      onComplete: () => ring.destroy(),
    });
    this.tweens.add({
      targets: wash,
      scale: 1.7,
      alpha: 0,
      duration: 190,
      ease: "Quad.Out",
      onComplete: () => wash.destroy(),
    });

    if (!MOTION_ENABLED) return;
    for (let index = 0; index < 6; index += 1) {
      const angle = (Math.PI * 2 * index) / 6 + Math.random() * 0.28;
      const distance = 24 + Math.random() * 18;
      const dot = this.add.circle(x, y, 2 + Math.random() * 2, accent, 0.8).setDepth(8998);
      this.tweens.add({
        targets: dot,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        scale: 0.35,
        alpha: 0,
        duration: 260 + Math.random() * 90,
        ease: "Cubic.Out",
        onComplete: () => dot.destroy(),
      });
    }
  }

  private startEncounter(challengeId: string) {
    const { run } = this.save;
    const challenge = CHALLENGES[challengeId];
    const prepared = Boolean(run.prepared);
    const drawPile = this.shuffle([...run.deck]);
    const encounter: EncounterState = {
      challengeId,
      turn: 1,
      phaseIndex: 0,
      phaseTurn: 1,
      satisfied: 0,
      phaseSatisfied: 0,
      nextGuestSerial: 0,
      guests: [],
      ingredients: 1 + (run.relics.includes("pantry") ? 2 : 0),
      dishes: 1,
      fineDishes: 0,
      beds: run.roomUnlocked ? 1 : 0,
      mess: 0,
      labor: this.maxLabor(),
      hand: [],
      drawPile,
      discardPile: [],
      exhausted: [],
      playedThisTurn: [],
      servedThisTurn: 0,
      cookedThisTurn: 0,
      cookedTotal: 0,
      boughtThisTurn: 0,
      cleanedThisTurn: 0,
      oldSoupTriggered: false,
      debtShieldUsed: false,
      staffJobs: {},
      routeProgress: 0,
      routeTriggered: false,
    };

    if (run.relics.includes("warm_lantern")) {
      run.signboard = Math.min(run.maxSignboard, run.signboard + 1);
    }
    if (challenge.special === "credit") {
      encounter.ingredients += 3;
      encounter.discardPile.push("status_debt", "status_debt");
    }

    this.save.mode = "encounter";
    this.save.encounter = encounter;
    this.focusedGuestUid = undefined;
    run.bookingChoices = [];
    run.prepared = false;
    this.spawnCurrentGuests();
    this.drawCards(prepared ? 7 : 5);
    this.persist();
    this.render();
    this.toast(
      prepared ? "备席开场 · 多抽2张" : challenge.tier === "boss" ? "大席开场" : "客局开场",
      challenge.rule,
    );
  }

  private spawnCurrentGuests() {
    const encounter = this.save.encounter;
    if (!encounter) return;
    const challenge = CHALLENGES[encounter.challengeId];
    const phase = challenge.phases?.[encounter.phaseIndex];
    const guestKeys = phase
      ? phase.guests
      : challenge.waves?.[encounter.turn] ?? [];

    guestKeys.forEach((key, index) => {
      if (encounter.guests.length >= 3) {
        this.damageSignboard(1, "门口挤满，客人转身走了");
        return;
      }
      const definition = GUESTS[key];
      const guest: GuestState = {
        uid: `${key}-${++encounter.nextGuestSerial}`,
        key,
        food: definition.food,
        care: definition.care,
        bed: definition.bed,
        patience: definition.patience,
        reward: definition.reward,
        damage: definition.damage,
        intent: definition.intent,
      };
      if (this.save.run.relics.includes("blue_banner") && encounter.turn === 1 && index < 3) {
        guest.patience += 1;
      }
      encounter.guests.push(guest);
    });
  }

  private renderEncounter() {
    const encounter = this.save.encounter;
    if (!encounter) {
      this.save.mode = "booking";
      this.render();
      return;
    }
    const challenge = CHALLENGES[encounter.challengeId];
    const phase = challenge.phases?.[encounter.phaseIndex];
    const maxTurns = phase?.turns ?? challenge.turns;
    const currentTurn = phase ? encounter.phaseTurn : encounter.turn;
    const goal = phase?.goal ?? challenge.goal;
    const progress = phase ? encounter.phaseSatisfied : encounter.satisfied;
    const special = this.activeSpecial();

    this.addPanel(16, 86, 398, 68, challenge.tier === "boss" ? 0xebc49f : 0xf3e7b5);
    this.addToPhase(this.text(28, 96, challenge.title, { fontSize: "17px", fontStyle: "bold" }));
    this.addToPhase(this.text(401, 98, `${currentTurn}/${maxTurns}刻`, {
      fontSize: "12px", fontStyle: "bold", color: "#8f4035",
    }).setOrigin(1, 0));
    this.addToPhase(this.text(28, 125, phase ? `${phase.title} · ${phase.rule}` : challenge.rule, {
      fontSize: "10px", color: "#5a563e", fontStyle: "bold", wordWrap: { width: 310 }, maxLines: 2,
    }));
    const phaseMarks = challenge.phases
      ? challenge.phases.map((_, index) => index < encounter.phaseIndex ? "●" : index === encounter.phaseIndex ? "◉" : "○").join(" ")
      : `满意 ${progress}/${goal}`;
    this.addToPhase(this.text(401, 132, phaseMarks, {
      fontSize: "10px", color: "#874238", fontStyle: "bold",
    }).setOrigin(1, 0));

    this.renderGuestArea(encounter);

    this.addSectionHeader(ENCOUNTER_LAYOUT.facilityLabelY, "经营区", "打出，或排给班底", 0x9f7b48);
    const marketClosed = special === "rain" && currentTurn % 2 === 0;
    this.createFacilityTarget("market", 112, 360, "菜市", marketClosed ? "雨封 · 本刻关闭" : `备料 ${encounter.ingredients}`, "市", TARGET_BASE_ACCENTS.market, marketClosed);
    this.createFacilityTarget("stove", 318, 360, "灶台", `热菜 ${encounter.dishes} · 名菜 ${encounter.fineDishes}`, "灶", TARGET_BASE_ACCENTS.stove);
    this.createFacilityTarget("hall", 112, 427, "前堂", `脏乱 ${encounter.mess}/5`, "堂", TARGET_BASE_ACCENTS.hall);
    this.createFacilityTarget(
      "room", 318, 427, runRoomTitle(this.save.run.roomUnlocked),
      this.save.run.roomUnlocked ? `床位 ${encounter.beds}` : "第三日后解锁",
      "房", TARGET_BASE_ACCENTS.room, !this.save.run.roomUnlocked,
    );

    this.renderStatusBar(encounter);
    this.renderHand(encounter);
    this.hintText.setText(`剩余 ${encounter.labor} 行动 · 牌可立即打出，也可拖到班底排成长期差事。`);
  }

  private intentPreview(guest: GuestState) {
    const previews: Record<GuestIntent, string> = {
      催单: guest.food > 0 ? "塞入1张催单" : "无事发生",
      弄脏: "脏乱+1",
      讲价: "赏钱-1",
      加单: "食欲+1",
      查店: "脏乱≥3时招牌-2",
    };
    return previews[guest.intent];
  }

  private maskGuestPortrait(
    portrait: Phaser.GameObjects.Image,
    panelY: number,
    portraitY: number,
    radius: number,
  ) {
    const phaseOffsetY = this.phaseLayer?.y ?? 0;
    const maskSource = this.make.graphics({
      x: GUEST_CARD_GRID.panelCenterX + GUEST_CARD_GRID.portraitX,
      y: panelY + portraitY + phaseOffsetY,
    }, false);
    maskSource.fillStyle(0xffffff, 1).fillCircle(0, 0, radius);
    const mask = maskSource.createGeometryMask();
    portrait.setMask(mask);

    if (MOTION_ENABLED && phaseOffsetY !== 0) {
      this.tweens.add({
        targets: maskSource,
        y: panelY + portraitY,
        duration: 220,
        ease: "Cubic.Out",
      });
    }

    portrait.once(Phaser.GameObjects.Events.DESTROY, () => {
      mask.destroy();
      maskSource.destroy();
    });
  }

  private renderGuestArea(encounter: EncounterState) {
    const hasGuestTabs = encounter.guests.length > 1;
    this.addSectionHeader(
      ENCOUNTER_LAYOUT.guestLabelY,
      "当前客人",
      hasGuestTabs ? `${encounter.guests.length}席 · 点席切换` : encounter.guests.length > 0 ? "正在接待" : "暂时空席",
      TARGET_BASE_ACCENTS.guest,
    );

    if (encounter.guests.length === 0) {
      this.addPanel(18, 178, 394, 128, 0xe7dfa8);
      this.addToPhase(this.text(215, 242, "桌位暂空\n趁机备料、下厨或收拾前堂", {
        fontSize: "13px", fontStyle: "bold", color: "#747451", align: "center",
      }).setOrigin(0.5));
      this.focusedGuestUid = undefined;
      return;
    }

    const focused = encounter.guests.find((guest) => guest.uid === this.focusedGuestUid) ?? encounter.guests[0];
    this.focusedGuestUid = focused.uid;

    if (hasGuestTabs) {
      const tabGap = encounter.guests.length === 2
        ? GUEST_CARD_GRID.twoTabGap
        : GUEST_CARD_GRID.threeTabGap;
      const tabUsableWidth = GUEST_CARD_GRID.panelWidth - GUEST_CARD_GRID.tabInset * 2;
      const tabWidth = (tabUsableWidth - tabGap * (encounter.guests.length - 1)) / encounter.guests.length;
      const tabLeft = GUEST_CARD_GRID.panelCenterX
        - GUEST_CARD_GRID.panelWidth / 2
        + GUEST_CARD_GRID.tabInset;

      encounter.guests.forEach((guest, index) => {
        const def = GUESTS[guest.key];
        const active = guest.uid === focused.uid;
        const urgent = guest.patience <= 1;
        const tabX = tabLeft + tabWidth / 2 + index * (tabWidth + tabGap);
        const tabInnerLeft = -tabWidth / 2;
        const tabInnerRight = tabWidth / 2;
        const container = this.add.container(tabX, ENCOUNTER_LAYOUT.guestTabY);
        const glow = this.add.rectangle(
          0, 0, tabWidth + 7, ENCOUNTER_LAYOUT.guestTabHeight + 6, 0xe8cc62, 0.05,
        ).setStrokeStyle(3, 0xe8cc62, 1).setAlpha(0);
        const body = this.add.rectangle(
          0, 0, tabWidth, ENCOUNTER_LAYOUT.guestTabHeight, active ? 0xffedac : 0xe5dda8, 1,
        ).setStrokeStyle(active ? 2.5 : 1.8, active ? TARGET_BASE_ACCENTS.guest : 0x202018, 1);
        const mark = this.add.rectangle(
          tabInnerLeft + 5, 0, 6, ENCOUNTER_LAYOUT.guestTabHeight - 8, def.accent, 1,
        );
        const seatBg = this.add.circle(tabInnerLeft + 17, 0, 8, def.accent, active ? 0.96 : 0.2)
          .setStrokeStyle(1, def.accent, 0.9);
        const seatText = this.text(tabInnerLeft + 17, 0, String(index + 1), {
          fontSize: "9px", fontStyle: "bold", color: active ? "#fff2bf" : colorToCss(def.accent),
        }).setOrigin(0.5);
        const label = this.text(tabInnerLeft + 30, 0, def.name, {
          fontSize: tabWidth < 140 ? "10px" : "11px", fontStyle: "bold",
        }).setOrigin(0, 0.5);
        const patienceChipX = tabInnerRight - 21;
        const patienceChip = this.add.rectangle(
          patienceChipX,
          0,
          36,
          18,
          urgent ? 0x9b4136 : def.accent,
          urgent || active ? 0.94 : 0.13,
        ).setStrokeStyle(1, urgent ? 0x7b302b : def.accent, 0.82);
        const patienceLabel = this.text(patienceChipX, 0, `耐${guest.patience}`, {
          fontSize: "9px",
          fontStyle: "bold",
          color: urgent || active ? "#fff2bf" : colorToCss(def.accent),
        }).setOrigin(0.5);
        const activeBridge = this.add.rectangle(
          0,
          ENCOUNTER_LAYOUT.guestTabHeight / 2 + 1.5,
          tabWidth - 10,
          4,
          def.accent,
          active ? 0.95 : 0,
        );
        container.add([
          glow, body, mark, seatBg, seatText, label, patienceChip, patienceLabel, activeBridge,
        ]);
        container.setSize(tabWidth, ENCOUNTER_LAYOUT.guestTabHeight);
        this.addToPhase(container);

        this.registerTarget(
          `guest:${guest.uid}`,
          "guest",
          container,
          glow,
          tabWidth,
          ENCOUNTER_LAYOUT.guestTabHeight,
          () => {
            if (!active) {
              this.focusedGuestUid = guest.uid;
              this.guestFocusMotionPending = true;
              this.render();
            }
          },
        );
      });
    }

    const def = GUESTS[focused.key];
    const urgent = focused.patience <= 1;
    const needs = [
      focused.food > 0 ? `食欲 ${focused.food}` : "",
      focused.care > 0 ? `人情 ${focused.care}` : "",
      focused.bed > 0 ? `住宿 ${focused.bed}` : "",
    ].filter(Boolean).join("　") || "即将满意";
    const panelY = hasGuestTabs ? ENCOUNTER_LAYOUT.guestMultiPanelY : ENCOUNTER_LAYOUT.guestSinglePanelY;
    const panelHeight = hasGuestTabs
      ? ENCOUNTER_LAYOUT.guestMultiPanelHeight
      : ENCOUNTER_LAYOUT.guestSinglePanelHeight;
    const portraitFrameHeight = panelHeight - 18;
    const portraitRadius = hasGuestTabs ? 27 : 35;
    const portraitY = hasGuestTabs ? -8 : -9;
    const contentTop = -panelHeight / 2 + 14;
    const needsY = 3;
    const intentY = panelHeight / 2 - 15;
    const contentWidth = GUEST_CARD_GRID.contentRight - GUEST_CARD_GRID.contentLeft;
    const rewardX = GUEST_CARD_GRID.contentRight - GUEST_CARD_GRID.rewardWidth / 2;
    const container = this.add.container(GUEST_CARD_GRID.panelCenterX, panelY);
    const shadow = this.add.rectangle(3, 4, GUEST_CARD_GRID.panelWidth, panelHeight, 0x202018, 0.2);
    const glow = this.add.rectangle(0, 0, GUEST_CARD_GRID.panelWidth + 8, panelHeight + 8, 0xe8cc62, 0.05)
      .setStrokeStyle(3, 0xe8cc62, 1)
      .setAlpha(0);
    const body = this.add.rectangle(0, 0, GUEST_CARD_GRID.panelWidth, panelHeight, 0xfff2bf, 1)
      .setStrokeStyle(2.2, 0x202018, 1);
    const urgencyWash = this.add.rectangle(
      0,
      0,
      GUEST_CARD_GRID.panelWidth - 6,
      panelHeight - 6,
      0xa8463b,
      urgent ? 0.055 : 0,
    );
    const accent = this.add.rectangle(-190, 0, 8, panelHeight - 12, TARGET_BASE_ACCENTS.guest, 1);
    const portraitShadow = this.add.rectangle(
      GUEST_CARD_GRID.portraitX + 2,
      3,
      GUEST_CARD_GRID.portraitFrameWidth,
      portraitFrameHeight,
      0x202018,
      0.15,
    );
    const portraitMat = this.add.rectangle(
      GUEST_CARD_GRID.portraitX,
      0,
      GUEST_CARD_GRID.portraitFrameWidth,
      portraitFrameHeight,
      0xf4e4ad,
      1,
    ).setStrokeStyle(1.7, def.accent, 0.9);
    const portraitMatTop = this.add.rectangle(
      GUEST_CARD_GRID.portraitX,
      -portraitFrameHeight / 2 + 3,
      GUEST_CARD_GRID.portraitFrameWidth - 7,
      2,
      0xffffff,
      0.24,
    );
    const portraitWindow = this.add.circle(
      GUEST_CARD_GRID.portraitX,
      portraitY,
      portraitRadius + 3,
      def.accent,
      0.13,
    );
    const portrait = this.add.image(
      GUEST_CARD_GRID.portraitX,
      portraitY,
      "people",
      def.frame,
    ).setDisplaySize((portraitRadius + 3) * 2, (portraitRadius + 3) * 2);
    this.maskGuestPortrait(portrait, panelY, portraitY, portraitRadius);
    const portraitRing = this.add.circle(
      GUEST_CARD_GRID.portraitX,
      portraitY,
      portraitRadius + 1,
      0xfff1bd,
      0.001,
    ).setStrokeStyle(1.7, def.accent, 0.82);
    const patienceY = portraitFrameHeight / 2 - 9;
    const patienceBg = this.add.rectangle(
      GUEST_CARD_GRID.portraitX,
      patienceY,
      GUEST_CARD_GRID.portraitFrameWidth - 12,
      17,
      urgent ? 0x9b4136 : def.accent,
      0.94,
    ).setStrokeStyle(1, 0x202018, 0.7);
    const patienceText = this.text(
      GUEST_CARD_GRID.portraitX,
      patienceY,
      `耐心 ${focused.patience}`,
      { fontSize: "9px", fontStyle: "bold", color: "#fff2bf" },
    ).setOrigin(0.5);

    const title = this.text(GUEST_CARD_GRID.contentLeft, contentTop, def.name, {
      fontSize: "17px", fontStyle: "bold",
    });
    const rewardBg = this.add.rectangle(
      rewardX,
      contentTop + 10,
      GUEST_CARD_GRID.rewardWidth,
      22,
      def.accent,
      0.12,
    ).setStrokeStyle(1.3, def.accent, 0.82);
    const rewardSeal = this.add.circle(rewardX - 22, contentTop + 10, 8, def.accent, 0.95)
      .setStrokeStyle(1, 0x202018, 0.72);
    const rewardSealText = this.text(rewardX - 22, contentTop + 10, "赏", {
      fontSize: "9px", fontStyle: "bold", color: "#fff2bf",
    }).setOrigin(0.5);
    const reward = this.text(rewardX + 10, contentTop + 10, `${focused.reward}文`, {
      fontSize: "10px", fontStyle: "bold", color: colorToCss(def.accent),
    }).setOrigin(0.5);
    const subtitle = this.text(GUEST_CARD_GRID.contentLeft, contentTop + 25, def.subtitle, {
      fontSize: "9px", fontStyle: "bold", color: "#69654b",
      wordWrap: { width: contentWidth - 4 }, maxLines: 1,
    });
    const needMark = this.add.circle(
      GUEST_CARD_GRID.contentLeft + 7,
      needsY + 7,
      8,
      def.accent,
      0.92,
    ).setStrokeStyle(1, 0x202018, 0.68);
    const needMarkText = this.text(GUEST_CARD_GRID.contentLeft + 7, needsY + 7, "求", {
      fontSize: "9px", fontStyle: "bold", color: "#fff2bf",
    }).setOrigin(0.5);
    const needText = this.text(GUEST_CARD_GRID.contentLeft + 20, needsY, needs.replace(/　/g, " · "), {
      fontSize: "10px", fontStyle: "bold", color: "#4f5138",
      wordWrap: { width: contentWidth - 22 }, maxLines: 1,
    });
    const intentBg = this.add.rectangle(
      (GUEST_CARD_GRID.contentLeft + GUEST_CARD_GRID.contentRight) / 2,
      intentY,
      contentWidth,
      GUEST_CARD_GRID.intentHeight,
      urgent ? 0xe8b892 : 0xe5cf91,
      0.9,
    )
      .setStrokeStyle(1.5, urgent ? 0x9b4136 : TARGET_BASE_ACCENTS.guest, 1);
    const intentRail = this.add.rectangle(
      GUEST_CARD_GRID.contentLeft + 4,
      intentY,
      5,
      GUEST_CARD_GRID.intentHeight - 5,
      urgent ? 0x9b4136 : def.accent,
      0.96,
    );
    const intent = this.text(
      GUEST_CARD_GRID.contentLeft + 12,
      intentY,
      `${urgent ? "急迫 · " : ""}下一刻：${this.intentPreview(focused)}`,
      {
        fontSize: "10px", fontStyle: "bold", color: urgent ? "#8d302b" : "#7f4036",
      },
    ).setOrigin(0, 0.5);
    const detailContent = this.add.container(0, 0, [
      title, rewardBg, rewardSeal, rewardSealText, reward, subtitle,
      needMark, needMarkText, needText, intentBg, intentRail, intent,
    ]);
    const animateFocus = this.guestFocusMotionPending && MOTION_ENABLED;
    this.guestFocusMotionPending = false;
    if (animateFocus) {
      detailContent.setX(8).setAlpha(0.35);
      this.tweens.add({
        targets: detailContent,
        x: 0,
        alpha: 1,
        duration: 125,
        ease: "Cubic.Out",
      });
    }
    container.add([
      shadow, glow, body, urgencyWash, accent,
      portraitShadow, portraitMat, portraitMatTop, portraitWindow, portrait, portraitRing, patienceBg, patienceText,
      detailContent,
    ]);
    container.setSize(GUEST_CARD_GRID.panelWidth, panelHeight).setData("glow", glow);
    this.addToPhase(container);
    this.registerTarget(
      `guest:${focused.uid}`,
      "guest",
      container,
      glow,
      GUEST_CARD_GRID.panelWidth,
      panelHeight,
    );
  }

  private createFacilityTarget(
    key: string,
    x: number,
    y: number,
    title: string,
    subtitle: string,
    glyph: string,
    accent: number,
    muted = false,
  ) {
    const button = this.createTapButton({
      x, y, width: 192, height: 58,
      title, subtitle, glyph: muted ? "锁" : glyph,
      accent, muted,
    });
    this.registerTarget(key, key as TargetKind, button.container, button.container.getData("glow"), 192, 58);
  }

  private staffName(staffId: StaffId) {
    return staffId === "owner" ? "掌柜" : staffId === "aman" ? "阿满" : "小梅";
  }

  private staffJobPower(cardId: string) {
    return isUpgraded(cardId) ? 2 : 1;
  }

  private staffJobShort(cardId: string) {
    const def = ACTIONS[baseCardId(cardId)];
    const power = this.staffJobPower(cardId);
    if (!def) return "无效";
    const copies: Record<CardTag, string> = {
      采办: `+${power}料`,
      烹饪: `1料→${power}菜`,
      跑堂: `上菜${power}`,
      人情: `照应${power}`,
      整理: `净${power}`,
      账房: `+${power}文`,
      客房: `+${power}床`,
    };
    return copies[def.tag];
  }

  private staffJobDescription(cardId: string) {
    const def = ACTIONS[baseCardId(cardId)];
    const power = this.staffJobPower(cardId);
    if (!def) return "这份差事已经失效。";
    const copies: Record<CardTag, string> = {
      采办: `获得${power}份备料。`,
      烹饪: `若有备料，消耗1份并做好${power}份热菜。`,
      跑堂: `若有热菜，为首位仍有食欲的客人上菜${power}次。`,
      人情: `照应首位需要人情的客人${power}点，并增加1耐心。`,
      整理: `清除${power}点脏乱。`,
      账房: `获得${power}文。`,
      客房: `准备${power}个床位。`,
    };
    return copies[def.tag];
  }

  private staffSlotJobShort(cardId: string) {
    const def = ACTIONS[baseCardId(cardId)];
    const power = this.staffJobPower(cardId);
    if (!def) return "无效";
    const copies: Record<CardTag, string> = {
      采办: `料+${power}`,
      烹饪: `菜+${power}`,
      跑堂: `上菜${power}`,
      人情: `照应${power}`,
      整理: `净-${power}`,
      账房: `钱+${power}`,
      客房: `床+${power}`,
    };
    return copies[def.tag];
  }

  private renderStaffJobSlots(encounter: EncounterState) {
    const roster: StaffId[] = ["owner", "aman", "xiaomei"];
    const positions = [247, 313, 379];
    roster.forEach((staffId, index) => {
      const unlocked = this.save.run.staff.includes(staffId);
      const cardId = encounter.staffJobs[staffId];
      const def = cardId ? ACTIONS[baseCardId(cardId)] : undefined;
      const accent = def ? this.cardVisualAccent(def) : TARGET_BASE_ACCENTS.staff;
      const container = this.add.container(positions[index], 501);
      const shadow = this.add.rectangle(2, 3, 60, 34, 0x202018, 0.18);
      const glow = this.add.rectangle(0, 0, 66, 40, accent, 0.08)
        .setStrokeStyle(3, accent, 1)
        .setAlpha(0);
      const body = this.add.rectangle(0, 0, 60, 34, unlocked ? 0xfff0bd : 0xd1cda5, 1)
        .setStrokeStyle(1.7, unlocked ? 0x202018 : 0x858066, 1);
      const wash = this.add.rectangle(0, 0, 56, 30, accent, unlocked ? 0.08 : 0.025);
      const stripe = this.add.rectangle(-27, 0, 4, 28, accent, unlocked ? 1 : 0.35);
      const title = this.text(2, -8, this.staffName(staffId), {
        fontSize: "10px", fontStyle: "bold", color: unlocked ? "#353225" : "#7d7962",
      }).setOrigin(0.5);
      const job = this.text(2, 8, def && cardId ? this.staffSlotJobShort(cardId) : unlocked ? "+ 待排" : "未入伙", {
        fontSize: "10px", fontStyle: "bold", color: colorToCss(accent),
      }).setOrigin(0.5);
      container.add([shadow, glow, body, wash, stripe, title, job]);
      container.setSize(62, 40).setData("glow", glow);
      this.addToPhase(container);
      if (unlocked) {
        this.registerTarget(`staff:${staffId}`, "staff", container, glow, 62, 40, () => {
          if (cardId && def) {
            this.toast(`${this.staffName(staffId)} · ${def.title}${isUpgraded(cardId) ? "+" : ""}`, `每次新一刻：${this.staffJobDescription(cardId)}`, 1900);
          } else {
            this.toast(`${this.staffName(staffId)}待排`, "选一张非负担牌拖到这里，消耗1行动；之后每个新时刻自动开工。", 1900);
          }
        });
      }
      if (this.pendingStaffPulses.has(staffId) && MOTION_ENABLED) {
        glow.setAlpha(0.9);
        container.setScale(0.88);
        this.tweens.add({
          targets: container,
          scale: 1.08,
          duration: 180,
          ease: "Back.Out",
          yoyo: true,
          onComplete: () => container.setScale(1),
        });
        this.tweens.add({ targets: glow, alpha: 0, duration: 620, ease: "Cubic.Out" });
      }
    });
    this.pendingStaffPulses.clear();
  }

  private renderStatusBar(encounter: EncounterState) {
    const pendingGain = Math.min(this.pendingLaborGain, encounter.labor);
    const pendingReason = this.pendingLaborReason;
    this.addPanel(18, 464, 394, 68, 0xe5dda8);
    this.addToPhase(this.text(30, 470, `行动 ${encounter.labor}/${this.maxLabor()}`, {
      fontSize: "14px", fontStyle: "bold", color: encounter.labor > 0 ? "#46623f" : "#9b4d40",
    }));
    const laborPips: Phaser.GameObjects.Arc[] = [];
    Array.from({ length: this.maxLabor() }, (_, index) => {
      const available = index < encounter.labor;
      const pip = this.add.circle(126 + index * 19, 481, 6, available ? 0x5f8057 : 0xe8ddb0, 1)
        .setStrokeStyle(1.8, available ? 0x314c31 : 0x8d8667, 1);
      laborPips.push(pip);
      this.addToPhase(pip);
    });
    this.addToPhase(this.add.rectangle(215, 481, 1, 40, 0x5f6043, 0.2));
    this.addToPhase(this.text(225, 468, "排班 · 左→右开工", {
      fontSize: "10px", fontStyle: "bold", color: "#685f43",
    }));
    this.renderStaffJobSlots(encounter);

    const routeText = this.text(30, 500, this.save.run.route
      ? `章法 ${this.routeStatus(encounter)}`
      : "章法 · 首日后定路", {
      fontSize: "10px", color: encounter.routeTriggered ? "#985044" : "#586548", fontStyle: "bold",
      wordWrap: { width: 176 }, maxLines: 1,
    });
    this.addToPhase(routeText);
    if (this.pendingRoutePulse && MOTION_ENABLED) {
      routeText.setScale(0.88).setColor("#a34838");
      this.tweens.add({
        targets: routeText,
        scale: 1.08,
        duration: 150,
        ease: "Back.Out",
        yoyo: true,
        onComplete: () => routeText.setScale(1),
      });
    }
    this.pendingRoutePulse = false;

    if (pendingGain > 0) {
      this.animateLaborGain(laborPips, encounter.labor, pendingGain, pendingReason || "行动增加");
      this.pendingLaborGain = 0;
      this.pendingLaborReason = "";
    }

  }

  private animateLaborGain(
    laborPips: Phaser.GameObjects.Arc[],
    currentLabor: number,
    gained: number,
    reason: string,
  ) {
    const accent = 0x75a35e;
    const firstGainedIndex = Math.max(0, currentLabor - gained);
    const gainedPips = laborPips.slice(firstGainedIndex, currentLabor);
    const glow = this.add.rectangle(116, 482, 190, 50, accent, 0.2)
      .setStrokeStyle(3, 0xc9df86, 0.95)
      .setDepth(8990);
    const feedback = this.add.container(0, 0).setDepth(9002);
    const amountText = this.text(116, 474, `+${gained} 行动`, {
      fontSize: "17px", fontStyle: "bold", color: "#3f6a35",
      stroke: "#fff4bf", strokeThickness: 5,
    }).setOrigin(0.5);
    const reasonText = this.text(116, 497, reason, {
      fontSize: "10px", fontStyle: "bold", color: "#536b44",
      stroke: "#fff4bf", strokeThickness: 3,
    }).setOrigin(0.5);
    feedback.add([amountText, reasonText]);

    gainedPips.forEach((pip, index) => {
      const ring = this.add.circle(pip.x, pip.y, 7, accent, 0)
        .setStrokeStyle(3, 0xc9df86, 0.95)
        .setDepth(9001);
      if (MOTION_ENABLED) {
        pip.setScale(0.2).setAlpha(0.3);
        this.tweens.add({
          targets: pip,
          scale: 1.75,
          alpha: 1,
          duration: 190,
          delay: index * 70,
          ease: "Back.Out",
          onComplete: () => {
            if (!pip.active) return;
            this.tweens.add({ targets: pip, scale: 1, duration: 110, ease: "Cubic.Out" });
          },
        });
        this.tweens.add({
          targets: ring,
          scale: 2.5,
          alpha: 0,
          duration: 460,
          delay: index * 70,
          ease: "Cubic.Out",
          onComplete: () => ring.destroy(),
        });
      } else {
        ring.destroy();
      }
    });

    if (MOTION_ENABLED) {
      glow.setAlpha(0).setScale(0.9);
      feedback.setAlpha(0).setScale(0.82).setY(7);
      this.tweens.add({
        targets: glow,
        alpha: 0.72,
        scale: 1.04,
        duration: 170,
        ease: "Back.Out",
        onComplete: () => {
          this.tweens.add({
            targets: glow,
            alpha: 0,
            scale: 1.12,
            duration: 430,
            ease: "Cubic.Out",
            onComplete: () => glow.destroy(),
          });
        },
      });
      this.tweens.add({
        targets: feedback,
        alpha: 1,
        scale: 1.08,
        y: 0,
        duration: 180,
        ease: "Back.Out",
        onComplete: () => {
          this.time.delayedCall(360, () => {
            if (!feedback.active) return;
            this.tweens.add({
              targets: feedback,
              y: -28,
              alpha: 0,
              duration: 390,
              ease: "Cubic.In",
              onComplete: () => feedback.destroy(true),
            });
          });
        },
      });
    } else {
      this.time.delayedCall(700, () => {
        if (glow.active) glow.destroy();
        if (feedback.active) feedback.destroy(true);
      });
    }
  }

  private routeSequence(routeId = this.save.run.route): CardTag[] {
    const sequences: Record<string, CardTag[]> = {
      route_fire: ["采办", "烹饪", "跑堂"],
      route_hospitality: ["人情", "跑堂", "账房"],
      route_order: ["整理", "账房", "采办"],
    };
    return routeId ? sequences[routeId] ?? [] : [];
  }

  private routeStatus(encounter: EncounterState) {
    const routeId = this.save.run.route;
    const sequence = this.routeSequence(routeId);
    if (!routeId || sequence.length === 0) return "未定";
    const routeGlyph = RELICS[routeId]?.glyph ?? "章";
    const short: Record<CardTag, string> = {
      采办: "采", 烹饪: "烹", 跑堂: "跑", 人情: "情", 整理: "整", 账房: "账", 客房: "房",
    };
    if (encounter.routeTriggered) return `${routeGlyph} · 本刻已成章`;
    const progress = Phaser.Math.Clamp(encounter.routeProgress ?? 0, 0, sequence.length - 1);
    return `${routeGlyph} ${sequence.map((tag, index) => `${short[tag]}${index < progress ? "●" : index === progress ? "◉" : "○"}`).join("→")}`;
  }

  private renderHand(encounter: EncounterState) {
    this.addSectionHeader(
      542,
      `手牌 ${encounter.hand.length}`,
      `一牌两用 · 上限 ${MAX_HAND_SIZE}`,
      0xb45141,
    );

    const handCount = encounter.hand.length;
    const fanSpan = handCount > 1 ? Math.min(HAND_FAN_MAX_SPAN, (handCount - 1) * 112) : 0;
    const animateDeal = MOTION_ENABLED && this.handMotionPending;
    this.handLayer = this.add.container(0, 0);
    this.addToPhase(this.handLayer);

    // Add from left to right: later (right-side) children render above earlier cards,
    // leaving every card's cost, color rail, and title start visible on the left.
    encounter.hand.forEach((cardId, handIndex) => {
      const def = ACTIONS[baseCardId(cardId)];
      if (!def) return;
      const progress = handCount > 1 ? handIndex / (handCount - 1) : 0.5;
      const fanPosition = progress * 2 - 1;
      const cardX = 215 - fanSpan / 2 + progress * fanSpan;
      const cardY = 645 + Math.pow(Math.abs(fanPosition), 1.6) * 8;
      const cardRotation = Phaser.Math.DegToRad(fanPosition * 5);
      const upgraded = isUpgraded(cardId);
      const disabled = Boolean(def.status && cardId !== "status_dirty");
      const card = this.createCard({
        x: cardX, y: cardY, width: HAND_FAN_CARD_WIDTH, height: HAND_FAN_CARD_HEIGHT,
        title: `${def.title}${upgraded ? "+" : ""}`,
        subtitle: def.status
          ? def.description
          : upgraded
            ? `${def.description}\n强化：${UPGRADE_EFFECTS[def.id] ?? "效果提高。"}\n差事：${this.staffJobShort(cardId)}`
            : `${def.description}\n差事：${this.staffJobShort(cardId)}`,
        typeLabel: `${def.tag} · ${def.rarity}`,
        badge: disabled ? "堵" : String(this.cardCost(cardId)),
        glyph: def.glyph,
        accent: this.cardVisualAccent(def),
        muted: disabled,
        onTap: disabled ? undefined : (cardView) => this.selectActionCard(cardView, cardId, handIndex, false),
        draggable: !disabled,
        onDragStart: (cardView) => this.beginDraggedAction(cardView, cardId, handIndex, false),
        onDrop: (cardView) => this.playDraggedAction(cardView, cardId, handIndex, false),
      });
      card.homeRotation = cardRotation;
      this.handLayer?.add(card.container);
      this.handCards.push(card);
      card.container
        .setRotation(cardRotation)
        .setDepth(HAND_FAN_BASE_DEPTH + handIndex)
        .setData("homeDepth", HAND_FAN_BASE_DEPTH + handIndex);
      if (animateDeal) {
        card.container
          .setY(cardY + 26)
          .setAlpha(0)
          .setRotation(cardRotation * 1.45);
        this.tweens.add({
          targets: card.container,
          y: cardY,
          alpha: 1,
          rotation: cardRotation,
          duration: 210,
          delay: Math.min(handIndex * 34, 170),
          ease: "Back.Out",
        });
      }
    });
    this.handMotionPending = false;

    const basic = this.createTapButton({
      x: 140, y: 779, width: 144, height: 54,
      title: "亲力亲为", subtitle: "1行动 · 基础工作",
      glyph: "干", accent: BASIC_ACTION_ACCENT,
      muted: encounter.labor <= 0,
      onTap: encounter.labor > 0 ? (cardView) => this.selectActionCard(cardView, "basic_work", -1, true) : undefined,
    });
    basic.container.setDepth(20);

    const endButton = this.createTapButton({
      x: 290, y: 779, width: 144, height: 54,
      title: "过一刻", subtitle: "结算意图 · 重抽",
      glyph: "刻", accent: 0xb45141,
      onTap: () => {
        if (!this.actionLocked) this.endTurn();
      },
    });
    endButton.container.setDepth(20);
    this.createPileButton("discard", 39, 779, encounter.discardPile.length);
    this.createPileButton("draw", 391, 779, encounter.drawPile.length);
  }

  private beginDraggedAction(card: DragCard, cardId: string, handIndex: number, basic: boolean) {
    if (this.actionLocked) return;
    const previous = this.selectedAction?.card;
    if (previous && previous.container !== card.container && previous.container.active) {
      this.setCardSelectionCue(previous, false);
      previous.container
        .setPosition(previous.homeX, previous.homeY)
        .setRotation(previous.homeRotation ?? 0)
        .setScale(1)
        .setDepth(Number(previous.container.getData("homeDepth") ?? 0));
      this.restoreCardLayer(previous);
    }
    this.selectedAction = { card, cardId, handIndex, basic };
    this.setCardSelectionCue(card, true);
    this.highlightSelectedTargets();
    this.hintText.setText("松手到亮起的目标即可出牌；也可以轻点牌与目标。");
  }

  private playDraggedAction(card: DragCard, cardId: string, handIndex: number, basic: boolean) {
    if (this.actionLocked) return;
    const target = this.findTargetAt(card.container.x, card.container.y);
    if (!target) {
      this.selectedAction = undefined;
      this.returnCard(card);
      return;
    }
    const error = this.actionError(cardId, target, basic);
    if (error) {
      this.selectedAction = undefined;
      this.returnCard(card);
      this.toast("这张牌不能这样打", error);
      return;
    }

    this.actionLocked = true;
    this.setCardSelectionCue(card, false);
    this.selectedAction = undefined;
    this.clearTargetHighlights();
    this.tweens.add({
      targets: card.container,
      x: target.container.x,
      y: target.container.y,
      scale: 0.48,
      alpha: 0,
      duration: 150,
      ease: "Cubic.In",
      onComplete: () => {
        this.actionImpact(target, cardId, basic);
        this.executeAction(cardId, target, basic, handIndex);
      },
    });
  }

  private selectActionCard(card: DragCard, cardId: string, handIndex: number, basic: boolean) {
    if (this.actionLocked) return;
    if (this.selectedAction?.card.container === card.container) {
      this.setCardSelectionCue(card, false);
      this.tweens.add({
        targets: card.container,
        y: card.homeY,
        rotation: card.homeRotation ?? 0,
        scale: 1,
        duration: 100,
        onComplete: () => this.restoreCardLayer(card),
      });
      this.selectedAction = undefined;
      this.clearTargetHighlights();
      this.hintText.setText("点选一张手牌，再点亮起的目标打出；也可排给班底。");
      return;
    }

    const previous = this.selectedAction?.card;
    if (previous?.container.active) {
      this.setCardSelectionCue(previous, false);
      this.tweens.add({
        targets: previous.container,
        y: previous.homeY,
        rotation: previous.homeRotation ?? 0,
        scale: 1,
        duration: 100,
        onComplete: () => this.restoreCardLayer(previous),
      });
    }
    this.selectedAction = { card, cardId, handIndex, basic };
    this.setCardSelectionCue(card, true);
    card.container.setData("homeDepth", card.container.depth);
    this.raiseCardLayer(card);
    this.tweens.add({
      targets: card.container,
      y: card.homeY - 28,
      rotation: 0,
      scale: 1.1,
      duration: 150,
      ease: "Back.Out",
    });
    this.highlightSelectedTargets();

    const cardTitle = basic ? "亲力亲为" : ACTIONS[baseCardId(cardId)]?.title;
    const target = basic
      ? "亮起的区域"
      : `${this.targetName(ACTIONS[baseCardId(cardId)]?.target ?? "any")}，或班底排班`;
    const hasAvailableTarget = this.targetViews.some((view) => this.isSelectedTargetValid(view));
    this.hintText.setText(hasAvailableTarget
      ? `已选「${cardTitle}」· 再点${target}打出。`
      : `已选「${cardTitle}」· 当前没有可用目标，再点卡牌取消。`);
  }

  private highlightSelectedTargets() {
    const selected = this.selectedAction;
    if (!selected) {
      this.clearTargetHighlights();
      return;
    }
    const accent = this.selectedCueAccent();
    this.targetViews.forEach((target) => {
      const valid = this.isSelectedTargetValid(target);
      this.paintTargetCue(target, accent);
      this.tweens.killTweensOf([target.glow, target.cue]);
      target.glow.setScale(1);
      target.cue.setScale(valid ? 0.992 : 1);
      if (MOTION_ENABLED) {
        this.tweens.add({
          targets: target.glow,
          alpha: valid ? { from: 0.62, to: 0.96 } : 0.025,
          scaleX: valid ? 1.012 : 1,
          scaleY: valid ? 1.028 : 1,
          duration: valid ? 680 : 120,
          ease: "Sine.InOut",
          yoyo: valid,
          repeat: valid ? -1 : 0,
        });
        this.tweens.add({
          targets: target.cue,
          alpha: valid ? { from: 0.7, to: 1 } : 0,
          scale: valid ? { from: 0.992, to: 1.006 } : 1,
          duration: valid ? 680 : 120,
          ease: "Sine.InOut",
          yoyo: valid,
          repeat: valid ? -1 : 0,
        });
      } else {
        target.glow.setAlpha(valid ? 0.9 : 0.025);
        target.cue.setAlpha(valid ? 0.92 : 0);
      }
    });
  }

  private playSelectedOnTarget(target: TargetView) {
    const selected = this.selectedAction;
    if (!selected || this.actionLocked || this.save.mode !== "encounter") return;
    const error = this.actionError(selected.cardId, target, selected.basic);
    if (error) {
      this.toast("这张牌不能这样打", error);
      this.highlightSelectedTargets();
      return;
    }

    this.actionLocked = true;
    this.setCardSelectionCue(selected.card, false);
    this.selectedAction = undefined;
    this.clearTargetHighlights();
    this.tweens.add({
      targets: selected.card.container,
      x: target.container.x,
      y: target.container.y,
      scale: 0.48,
      alpha: 0,
      duration: 170,
      ease: "Cubic.In",
      onComplete: () => {
        this.actionImpact(target, selected.cardId, selected.basic);
        this.executeAction(selected.cardId, target, selected.basic, selected.handIndex);
      },
    });
  }

  private actionError(cardId: string, target: TargetView, basic: boolean) {
    const encounter = this.save.encounter;
    if (!encounter) return "客局已经结束。";
    if (target.kind === "staff") {
      if (basic) return "亲力亲为只能处理眼前事务，不能作为长期差事。";
      const def = ACTIONS[baseCardId(cardId)];
      const staffId = target.key.replace("staff:", "") as StaffId;
      if (!def) return "这张牌已经失效。";
      if (def.status) return "负担牌不能交给班底。";
      if (!this.save.run.staff.includes(staffId)) return "这位伙计尚未入伙。";
      if (encounter.labor < 1) return "排班需要1点行动。";
      return null;
    }
    const targetGuest = target.kind === "guest"
      ? encounter.guests.find((guest) => `guest:${guest.uid}` === target.key)
      : undefined;

    if (basic) {
      if (encounter.labor < 1) return "本刻已经没有可用行动。";
      if (target.kind === "room" && !this.save.run.roomUnlocked) return "客房尚未修好。";
      if (target.kind === "market" && this.marketClosed()) return "暴雨封市，本刻无法采买。";
      if (target.kind === "stove" && encounter.ingredients < 1) return "没有备料可以下锅。";
      if (target.kind === "hall" && encounter.mess < 1) return "前堂已经很干净。";
      if (target.kind === "guest" && targetGuest) {
        const canFeed = targetGuest.food > 0 && encounter.dishes + encounter.fineDishes > 0;
        const canLodge = targetGuest.bed > 0 && encounter.beds > 0;
        const canCare = targetGuest.care > 0;
        if (!canFeed && !canLodge && !canCare) return "手头资源还满足不了这位客人。";
      }
      return null;
    }

    const def = ACTIONS[baseCardId(cardId)];
    if (!def) return "这张牌已经失效。";
    if (def.status && cardId !== "status_dirty") return "负担牌无法主动打出。";
    if (def.target !== "any" && target.kind !== def.target) return `这张牌需要以${this.targetName(def.target)}为目标。`;
    if (encounter.labor < this.cardCost(cardId)) return "本刻行动不足。";
    if (target.kind === "room" && !this.save.run.roomUnlocked) return "客房尚未修好。";
    if (target.kind === "market" && this.marketClosed()) return "暴雨封市，本刻无法采买。";

    const id = baseCardId(cardId);
    if (["cook_home", "hot_wok"].includes(id) && encounter.ingredients < 1) return "至少需要1份备料。";
    if (["one_pot_two", "slow_braise"].includes(id) && encounter.ingredients < 2) return "至少需要2份备料。";
    if (id === "banquet_order" && encounter.ingredients < 3) return "整席齐出需要3份备料。";
    if (id === "serve_steady" && encounter.dishes + encounter.fineDishes < 1) return "没有做好的菜。";
    if (id === "two_tables" && encounter.dishes < 1) return "至少需要1份普通热菜。";
    if (id === "signature_serve" && encounter.fineDishes < 1) return "需要先做好一份名菜。";
    if (id === "full_house" && encounter.dishes < 3) return "满堂彩需要3份普通热菜。";
    if (id === "tea_chat" && encounter.servedThisTurn < 1) return "本回合先上过菜，才能顺手添茶。";
    if (id === "regular_bond" && (!targetGuest || targetGuest.care < 1)) return "这位客人已经不缺照应。";
    if (["greet_smile", "read_room", "tea_chat"].includes(id) && (!targetGuest || targetGuest.care < 1)) return "这位客人已经受到足够照应。";
    if (id === "settle_well" && (!targetGuest || targetGuest.bed < 1 || encounter.beds < 1)) return "需要一位尚未安顿的投宿客和空床。";
    if (["clean_quick", "wipe_clean", "clean_serve", "status_dirty"].includes(id) && encounter.mess < 1) return "前堂没有需要清理的脏乱。";
    if (id === "calculate" && encounter.labor < 2) return "至少要留有2点行动才能从容盘账。";
    return null;
  }

  private executeAction(cardId: string, target: TargetView, basic: boolean, handIndex: number) {
    const encounter = this.save.encounter;
    if (!encounter) return;
    if (!basic && target.kind === "staff") {
      this.assignStaffJob(cardId, handIndex, target.key.replace("staff:", "") as StaffId);
      return;
    }
    const targetGuest = target.kind === "guest"
      ? encounter.guests.find((guest) => `guest:${guest.uid}` === target.key)
      : undefined;

    const id = baseCardId(cardId);
    const upgraded = isUpgraded(cardId);
    const cost = basic ? 1 : this.cardCost(cardId);
    const actionDef = basic ? undefined : ACTIONS[id];
    encounter.labor = Math.max(0, encounter.labor - cost);

    if (!basic && handIndex >= 0) {
      const [played] = encounter.hand.splice(handIndex, 1);
      this.handMotionPending = true;
      if (ACTIONS[id]?.exhaust || id === "status_dirty") encounter.exhausted.push(played);
      else encounter.discardPile.push(played);
      encounter.playedThisTurn.push(id);
    }

    // Advance the chapter before resolving the card: a final serving can end a
    // phase immediately, but the card that completed the sequence still counts.
    if (!basic && actionDef) this.advanceRouteProgress(actionDef.tag);

    if (basic) {
      this.executeBasic(target, targetGuest);
    } else {
      const boost = upgraded ? 1 : 0;
      switch (id) {
        case "market_early":
          encounter.ingredients += 2 + boost;
          encounter.boughtThisTurn += 1;
          break;
        case "market_route": {
          const first = encounter.boughtThisTurn === 0;
          encounter.ingredients += 3 + boost;
          encounter.boughtThisTurn += 1;
          if (first) this.drawCards(1);
          break;
        }
        case "debt_stock":
          encounter.ingredients += 4 + boost;
          encounter.discardPile.push("status_debt");
          encounter.boughtThisTurn += 1;
          break;
        case "stockpile":
          encounter.ingredients += 2 + boost + (this.save.run.relics.includes("pantry") ? 2 : 0);
          encounter.boughtThisTurn += 1;
          break;
        case "cook_home":
          encounter.ingredients -= 1;
          encounter.dishes += 1 + boost;
          this.afterCooking();
          break;
        case "hot_wok":
          encounter.ingredients -= 1;
          encounter.dishes += 1 + boost;
          this.afterCooking();
          this.drawCards(1);
          break;
        case "one_pot_two":
          encounter.ingredients -= 2;
          encounter.dishes += 3 + boost;
          this.afterCooking();
          break;
        case "slow_braise":
          encounter.ingredients -= 2;
          encounter.dishes += 1 + boost;
          encounter.fineDishes += 1;
          this.afterCooking();
          break;
        case "borrow_fire":
          encounter.dishes += 1 + boost;
          encounter.mess += 2;
          this.afterCooking();
          break;
        case "banquet_order":
          encounter.ingredients -= 3;
          encounter.dishes += 2 + boost;
          encounter.fineDishes += 2;
          this.afterCooking();
          break;
        case "serve_steady":
          if (targetGuest) {
            if (encounter.dishes > 0) encounter.dishes -= 1;
            else encounter.fineDishes -= 1;
            this.serveGuest(targetGuest, 1 + boost, 0);
          }
          break;
        case "two_tables":
          if (targetGuest) this.serveTwoTables(targetGuest, upgraded ? 3 : 2);
          break;
        case "signature_serve":
          if (targetGuest) {
            encounter.fineDishes -= 1;
            this.serveGuest(targetGuest, 2 + boost, 2 + boost);
          }
          break;
        case "full_house":
          encounter.dishes -= 3;
          for (const guest of [...encounter.guests]) {
            if (this.save.mode !== "encounter") break;
            this.serveGuest(guest, 1 + boost, 0, false);
          }
          if (this.save.mode === "encounter") encounter.mess += 1;
          break;
        case "greet_smile":
          if (targetGuest) {
            targetGuest.care = Math.max(0, targetGuest.care - 1 - boost);
            targetGuest.patience += 1 + boost;
            this.checkGuestSatisfied(targetGuest, 0, false);
          }
          break;
        case "tea_chat":
          if (targetGuest) {
            targetGuest.care = Math.max(0, targetGuest.care - 1 - boost);
            targetGuest.patience += 1;
            this.checkGuestSatisfied(targetGuest, 0, false);
          }
          break;
        case "read_room":
          if (targetGuest) {
            targetGuest.care = Math.max(0, targetGuest.care - 2 - boost);
            targetGuest.patience += 1;
            this.drawCards(2);
            this.checkGuestSatisfied(targetGuest, 0, false);
          }
          break;
        case "regular_bond":
          if (targetGuest) {
            targetGuest.care = Math.max(0, targetGuest.care - 1 - boost);
            this.checkGuestSatisfied(targetGuest, 0, true);
          }
          break;
        case "clean_quick":
          encounter.mess = Math.max(0, encounter.mess - 2 - boost);
          this.afterCleaning();
          break;
        case "wipe_clean":
          encounter.mess = 0;
          if (upgraded) this.drawCards(1);
          this.afterCleaning();
          break;
        case "clean_serve":
          encounter.mess = Math.max(0, encounter.mess - 2 - boost);
          if (encounter.servedThisTurn > 0) this.drawCards(1);
          this.afterCleaning();
          break;
        case "status_dirty":
          encounter.mess = Math.max(0, encounter.mess - 2);
          this.afterCleaning();
          break;
        case "room_turn":
          encounter.beds += 2 + boost;
          break;
        case "settle_well":
          if (targetGuest) {
            encounter.beds -= 1;
            targetGuest.bed = Math.max(0, targetGuest.bed - 1);
            targetGuest.care = Math.max(0, targetGuest.care - 1 - boost);
            this.checkGuestSatisfied(targetGuest, 1, false);
          }
          break;
        case "night_round":
          encounter.beds += 1 + boost;
          this.drawCards(1);
          break;
        case "ledger_count":
          this.earnCoins(2 + boost);
          break;
        case "calculate":
          this.earnCoins(4 + boost);
          break;
        case "master_plan":
          encounter.mess = Math.max(0, encounter.mess - 1 - boost);
          this.drawCards(3);
          break;
      }
    }

    if (this.save.mode === "encounter") {
      this.persist();
      this.render();
    }
  }

  private assignStaffJob(cardId: string, handIndex: number, staffId: StaffId) {
    const encounter = this.save.encounter;
    const def = ACTIONS[baseCardId(cardId)];
    if (
      !encounter
      || !def
      || def.status
      || handIndex < 0
      || encounter.hand[handIndex] !== cardId
      || !this.save.run.staff.includes(staffId)
      || encounter.labor < 1
    ) return;

    const [assigned] = encounter.hand.splice(handIndex, 1);
    if (!assigned) return;
    const previous = encounter.staffJobs[staffId];
    if (previous) encounter.discardPile.push(previous);
    encounter.staffJobs[staffId] = assigned;
    encounter.labor -= 1;
    this.handMotionPending = true;
    this.pendingStaffPulses.add(staffId);
    this.persist();
    this.render();
    this.toast(
      `${this.staffName(staffId)}接下「${def.title}${isUpgraded(assigned) ? "+" : ""}」`,
      `${previous ? "替下旧差事；" : ""}从下一刻起：${this.staffJobDescription(assigned)}`,
      1700,
    );
  }

  private advanceRouteProgress(tag: CardTag) {
    const encounter = this.save.encounter;
    const routeId = this.save.run.route;
    if (!encounter || !routeId || encounter.routeTriggered) return;
    const sequence = this.routeSequence(routeId);
    if (sequence.length === 0) return;

    const previous = Phaser.Math.Clamp(encounter.routeProgress ?? 0, 0, sequence.length - 1);
    const expected = sequence[previous];
    if (tag === expected) {
      encounter.routeProgress = previous + 1;
      this.pendingRoutePulse = true;
    } else {
      encounter.routeProgress = tag === sequence[0] ? 1 : 0;
      if (previous > 0 || encounter.routeProgress > 0) this.pendingRoutePulse = true;
      if (previous > 0 && encounter.routeProgress === 0) {
        this.toast("章法断章", `下一步本应是「${expected}」，需从「${sequence[0]}」重新起手。`, 1050);
      }
    }

    if (encounter.routeProgress < sequence.length) return;

    encounter.routeProgress = 0;
    encounter.routeTriggered = true;
    this.pendingRoutePulse = true;
    if (routeId === "route_fire") {
      encounter.dishes += 1;
      this.gainLabor(1, "烟火成章");
      this.drawCards(1);
      this.toast("烟火流水 · 成章", "添1份热菜、返还1行动，并抽1张牌。", 1500);
    } else if (routeId === "route_hospitality") {
      encounter.guests.forEach((guest) => { guest.patience += 1; });
      this.earnCoins(4);
      this.drawCards(1);
      this.toast("人情往来 · 成章", "所有客人耐心+1、赚4文，并抽1张牌。", 1500);
    } else if (routeId === "route_order") {
      encounter.mess = Math.max(0, encounter.mess - 2);
      this.gainLabor(1, "周转成章");
      this.drawCards(1);
      this.toast("利落周转 · 成章", "再清2点脏乱、返还1行动，并抽1张牌。", 1500);
    }
  }

  private runStaffJobs() {
    const encounter = this.save.encounter;
    if (!encounter || this.save.mode !== "encounter") return false;
    const startPhase = encounter.phaseIndex;
    const startTurn = encounter.turn;
    const satisfiedBefore = encounter.satisfied + encounter.phaseSatisfied;
    const reports: string[] = [];

    for (const staffId of this.save.run.staff) {
      const cardId = encounter.staffJobs[staffId];
      const def = cardId ? ACTIONS[baseCardId(cardId)] : undefined;
      if (!cardId || !def || def.status) continue;
      const power = this.staffJobPower(cardId);
      let report = "";

      if (def.tag === "采办") {
        encounter.ingredients += power;
        report = `备料+${power}`;
      } else if (def.tag === "烹饪" && encounter.ingredients > 0) {
        encounter.ingredients -= 1;
        encounter.dishes += power;
        this.afterCooking();
        report = `热菜+${power}`;
      } else if (def.tag === "跑堂") {
        const guest = encounter.guests.find((item) => item.food > 0);
        let served = 0;
        while (
          guest
          && guest.food > 0
          && served < power
          && encounter.dishes + encounter.fineDishes > 0
        ) {
          if (encounter.dishes > 0) encounter.dishes -= 1;
          else encounter.fineDishes -= 1;
          this.serveGuest(guest, 1, 0, false, true);
          served += 1;
        }
        if (served > 0) report = `上菜${served}`;
      } else if (def.tag === "人情") {
        const guest = encounter.guests.find((item) => item.care > 0);
        if (guest) {
          const cared = Math.min(power, guest.care);
          guest.care = Math.max(0, guest.care - power);
          guest.patience += 1;
          this.checkGuestSatisfied(guest, 0, false, true);
          report = `照应${cared}`;
        }
      } else if (def.tag === "整理" && encounter.mess > 0) {
        const cleaned = Math.min(power, encounter.mess);
        encounter.mess = Math.max(0, encounter.mess - power);
        this.afterCleaning();
        report = `脏乱-${cleaned}`;
      } else if (def.tag === "账房") {
        this.earnCoins(power);
        report = `钱+${power}`;
      } else if (def.tag === "客房") {
        encounter.beds += power;
        report = `床位+${power}`;
      }

      if (report) {
        reports.push(`${this.staffName(staffId)} ${report}`);
        this.pendingStaffPulses.add(staffId);
      }
    }

    if (encounter.satisfied + encounter.phaseSatisfied > satisfiedBefore) {
      this.checkChallengeProgress();
    }
    const stable = this.save.mode === "encounter"
      && this.save.encounter === encounter
      && encounter.phaseIndex === startPhase
      && encounter.turn === startTurn;
    if (stable && reports.length > 0) {
      this.toast("班底开工 · 左到右", reports.join("　"), 1550);
    }
    return stable;
  }

  private executeBasic(target: TargetView, guest?: GuestState) {
    const encounter = this.save.encounter;
    if (!encounter) return;
    if (target.kind === "market") {
      encounter.ingredients += 1;
      encounter.boughtThisTurn += 1;
    } else if (target.kind === "stove") {
      encounter.ingredients -= 1;
      encounter.dishes += 1;
      this.afterCooking();
    } else if (target.kind === "hall") {
      encounter.mess = Math.max(0, encounter.mess - 1);
      this.afterCleaning();
    } else if (target.kind === "room") {
      encounter.beds += 1;
    } else if (target.kind === "guest" && guest) {
      if (guest.food > 0 && encounter.dishes + encounter.fineDishes > 0) {
        if (encounter.dishes > 0) encounter.dishes -= 1;
        else encounter.fineDishes -= 1;
        this.serveGuest(guest, 1, 0);
      } else if (guest.bed > 0 && encounter.beds > 0) {
        encounter.beds -= 1;
        guest.bed = Math.max(0, guest.bed - 1);
        this.checkGuestSatisfied(guest, 0, false);
      } else if (guest.care > 0) {
        guest.care = Math.max(0, guest.care - 1);
        guest.patience += 1;
        this.checkGuestSatisfied(guest, 0, false);
      }
    }
  }

  private afterCooking() {
    const encounter = this.save.encounter;
    if (!encounter) return;
    encounter.cookedThisTurn += 1;
    encounter.cookedTotal = (encounter.cookedTotal ?? 0) + 1;
    const firstCook = encounter.cookedThisTurn === 1;
    if (firstCook && (this.save.run.relics.includes("double_stove") || this.save.run.relics.includes("role_chef"))) {
      encounter.dishes += 1;
      this.toast("灶火正旺", "本回合第一次烹饪额外做好1份热菜。", 1100);
    }
    if (this.save.run.relics.includes("old_soup") && encounter.cookedTotal >= 3 && !encounter.oldSoupTriggered) {
      encounter.fineDishes += 1;
      encounter.oldSoupTriggered = true;
      this.toast("老卤入味", "本场第三次烹饪额外做好1份名菜。", 1100);
    }
  }

  private afterCleaning() {
    const encounter = this.save.encounter;
    if (!encounter) return;
    encounter.cleanedThisTurn += 1;
    if (encounter.cleanedThisTurn === 1 && this.save.run.relics.includes("role_steward")) {
      this.drawCards(1);
    }
  }

  private serveTwoTables(primary: GuestState, capacity: number) {
    const encounter = this.save.encounter;
    if (!encounter) return;
    const targets = [primary, ...encounter.guests.filter((guest) => guest.uid !== primary.uid && guest.food > 0)];
    let served = 0;
    for (const guest of targets) {
      if (this.save.mode !== "encounter" || served >= capacity || encounter.dishes <= 0) break;
      encounter.dishes -= 1;
      this.serveGuest(guest, 1, 0, false);
      served += 1;
    }
  }

  private serveGuest(
    guest: GuestState,
    amount: number,
    bonusCoins: number,
    addMess = true,
    deferProgress = false,
  ) {
    const encounter = this.save.encounter;
    if (!encounter) return;
    guest.food = Math.max(0, guest.food - amount);
    encounter.servedThisTurn += 1;
    if (addMess) encounter.mess += 1;
    if (encounter.servedThisTurn === 1 && this.save.run.relics.includes("role_runner")) {
      this.gainLabor(1, "跑堂返还");
      this.toast("跑堂利落", "第一次上菜返还1点行动。", 1000);
    }
    this.checkGuestSatisfied(guest, bonusCoins, false, deferProgress);
  }

  private checkGuestSatisfied(
    guest: GuestState,
    bonusCoins: number,
    healOnFinish: boolean,
    deferProgress = false,
  ) {
    const encounter = this.save.encounter;
    if (!encounter) return false;
    if (guest.food > 0 || guest.care > 0 || guest.bed > 0) return false;

    const definition = GUESTS[guest.key];
    const income = Math.max(1, guest.reward + bonusCoins);
    this.earnCoins(income);
    encounter.satisfied += 1;
    encounter.phaseSatisfied += 1;
    this.save.run.totalSatisfied += 1;
    if (healOnFinish) this.save.run.signboard = Math.min(this.save.run.maxSignboard, this.save.run.signboard + 1);
    encounter.guests = encounter.guests.filter((item) => item.uid !== guest.uid);
    this.toast(`${definition.name}满意离席`, `收下 ${income} 文。`, 1000);
    if (!deferProgress) this.checkChallengeProgress();
    return true;
  }

  private checkChallengeProgress() {
    const encounter = this.save.encounter;
    if (!encounter || this.save.mode !== "encounter") return;
    const challenge = CHALLENGES[encounter.challengeId];
    const phase = challenge.phases?.[encounter.phaseIndex];
    if (phase) {
      if (encounter.phaseSatisfied < phase.goal) return;
      if (encounter.phaseIndex >= (challenge.phases?.length ?? 1) - 1) {
        this.completeEncounter();
        return;
      }
      encounter.phaseIndex += 1;
      encounter.phaseTurn = 1;
      encounter.phaseSatisfied = 0;
      encounter.guests = [];
      this.discardCurrentHand();
      this.refillLabor("席面翻篇");
      encounter.playedThisTurn = [];
      encounter.servedThisTurn = 0;
      encounter.cookedThisTurn = 0;
      encounter.boughtThisTurn = 0;
      encounter.cleanedThisTurn = 0;
      encounter.routeTriggered = false;
      this.spawnCurrentGuests();
      if (!this.runStaffJobs()) return;
      this.drawCards(5);
      const nextPhase = challenge.phases?.[encounter.phaseIndex];
      this.persist();
      this.render();
      if (nextPhase) this.toast("席面翻篇", `${nextPhase.title}：${nextPhase.rule}`, 1800);
      return;
    }

    if (encounter.satisfied >= challenge.goal) this.completeEncounter();
  }

  private endTurn() {
    const encounter = this.save.encounter;
    if (!encounter || this.actionLocked) return;
    this.actionLocked = true;
    const challenge = CHALLENGES[encounter.challengeId];
    const phase = challenge.phases?.[encounter.phaseIndex];
    const special = this.activeSpecial();
    const leaving: GuestState[] = [];

    encounter.guests.forEach((guest) => {
      if (guest.intent === "催单" && guest.food > 0) encounter.discardPile.push("status_hurry");
      if (guest.intent === "弄脏") encounter.mess += 1;
      if (guest.intent === "讲价") guest.reward = Math.max(2, guest.reward - 1);
      if (guest.intent === "加单") {
        guest.food += 1;
        guest.intent = "催单";
      }
      if (guest.intent === "查店" && encounter.mess >= 3) this.damageSignboard(2, "前堂太乱，被挑剔客人看见");

      guest.patience -= special === "rush" ? 2 : 1;
      if (guest.patience <= 0) leaving.push(guest);
    });

    leaving.forEach((guest) => {
      const definition = GUESTS[guest.key];
      this.damageSignboard(guest.damage, `${definition.name}失望离席`);
      encounter.guests = encounter.guests.filter((item) => item.uid !== guest.uid);
    });

    if (special === "mess_wave") encounter.mess += 1;
    if (special === "inspection" && encounter.mess >= 3) this.damageSignboard(1, "脏乱损伤了客栈招牌");
    if (encounter.mess >= 5) {
      this.damageSignboard(1, "前堂已经忙乱不堪");
      encounter.discardPile.push("status_dirty");
    }

    if (this.save.run.signboard <= 0) {
      this.failRun("接连失信，客栈的招牌彻底倒了。");
      return;
    }

    const phaseLimitReached = phase && encounter.phaseTurn >= phase.turns;
    const normalLimitReached = !phase && encounter.turn >= challenge.turns;
    const futureWaves = !phase && Object.keys(challenge.waves ?? {}).some((key) => Number(key) > encounter.turn);
    const noPossibleGuests = !phase && encounter.guests.length === 0 && !futureWaves;

    if (phaseLimitReached) {
      this.failEncounter(true, `${phase.title}没有在限定回合内完成。`);
      return;
    }
    if (normalLimitReached || noPossibleGuests) {
      this.failEncounter(false, "客局未能达到目标，牌组加入一张疲惫。");
      return;
    }

    this.discardCurrentHand();
    encounter.turn += 1;
    encounter.phaseTurn += 1;
    this.refillLabor("新一刻");
    encounter.playedThisTurn = [];
    encounter.servedThisTurn = 0;
    encounter.cookedThisTurn = 0;
    encounter.boughtThisTurn = 0;
    encounter.cleanedThisTurn = 0;
    encounter.routeTriggered = false;
    this.spawnCurrentGuests();
    if (!this.runStaffJobs()) return;
    this.drawCards(5);
    this.persist();
    this.render();
  }

  private failEncounter(isBoss: boolean, reason: string) {
    if (isBoss || CHALLENGES[this.save.encounter?.challengeId ?? ""]?.tier === "boss") {
      this.failRun(`大席失约：${reason}`);
      return;
    }
    this.save.run.deck.push("status_fatigue");
    this.save.mode = "outcome";
    this.save.outcomeText = reason;
    this.persist();
    this.render();
  }

  private completeEncounter() {
    const encounter = this.save.encounter;
    if (!encounter || this.save.mode !== "encounter") return;
    const challenge = CHALLENGES[encounter.challengeId];
    this.save.run.history.push(challenge.id);

    if (this.save.run.day === 1 && !this.save.run.staff.includes("aman")) {
      this.save.run.staff.push("aman");
    }

    if (this.save.run.day === 1 && !this.save.run.route) {
      this.save.relicOptions = ["route_fire", "route_hospitality", "route_order"];
      this.save.mode = "route";
      this.save.encounter = undefined;
      this.persist();
      this.render();
      return;
    }

    if (challenge.tier === "boss") {
      if (this.save.run.day === 10) {
        this.save.run.bigInn = true;
        this.save.mode = "victory";
        this.save.encounter = undefined;
        this.persist();
        this.render();
        return;
      }

      if (this.save.run.day === 3) {
        this.save.run.roomUnlocked = true;
        this.addCardToDeck("room_turn");
        this.addCardToDeck("settle_well");
        this.save.relicOptions = ["double_stove", "pantry", "blue_banner"];
      } else {
        if (!this.save.run.staff.includes("xiaomei")) this.save.run.staff.push("xiaomei");
        this.save.run.bigInn = true;
        this.save.relicOptions = ["role_chef", "role_runner", "role_steward"];
      }
      this.save.mode = "relic";
    } else if (challenge.tier === "elite") {
      const candidates = ["old_soup", "abacus", "warm_lantern", "double_stove", "pantry", "blue_banner"]
        .filter((id) => !this.save.run.relics.includes(id));
      this.save.relicOptions = this.shuffle(candidates).slice(0, 3);
      this.save.mode = "relic";
    } else {
      this.save.rewardOptions = this.pickRewardOptions([...challenge.rewardTags, ...this.routeRewardTags()]);
      this.save.mode = "reward";
    }

    this.save.encounter = undefined;
    this.persist();
    this.render();
  }

  private renderRouteReward() {
    const options = this.save.relicOptions ?? ["route_fire", "route_hospitality", "route_order"];
    const signatureCards: Record<string, string> = {
      route_fire: "hot_wok",
      route_hospitality: "tea_chat",
      route_order: "clean_serve",
    };

    this.addPanel(18, 90, 394, 104, 0xefdba5);
    this.addToPhase(this.text(32, 104, "阿满入伙 · 定下招牌路数", { fontSize: "19px", fontStyle: "bold" }));
    this.addToPhase(this.text(32, 142, "选择一套三步经营章法。进度可跨时刻，打错牌会断章。", {
      fontSize: "11px", color: "#5c583f", fontStyle: "bold", wordWrap: { width: 360 },
    }));

    const positions = [260, 390, 520];
    options.forEach((id, index) => {
      const route = RELICS[id];
      const signature = ACTIONS[signatureCards[id]];
      if (!route || !signature) return;
      this.createChoiceRow({
        y: positions[index], height: 112,
        title: route.title,
        subtitle: route.description,
        meta: `附送经营牌「${signature.title}」`, badge: "路", glyph: route.glyph, accent: route.accent,
        onTap: (cardView) => this.chooseRouteCard(cardView, id, signature.id),
      });
    });

    this.addPanel(28, 602, 374, 154, 0xe4d49a);
    this.addToPhase(this.text(44, 620, "这是本局最重要的构筑方向", {
      fontSize: "15px", fontStyle: "bold", color: "#874337",
    }));
    this.addToPhase(this.text(44, 654, "烟火：采办→烹饪→跑堂\n人情：人情→跑堂→账房　周转：整理→账房→采办", {
      fontSize: "11px", fontStyle: "bold", color: "#56523c",
      wordWrap: { width: 340 }, lineSpacing: 6,
    }));
    this.addToPhase(this.text(44, 720, "选定后不可更改", {
      fontSize: "10px", fontStyle: "bold", color: "#7b5f43",
    }));
    this.hintText.setText("排班牌不推进章法：决定长期经营，还是留在手里当下成章。");
  }

  private chooseRouteCard(card: DragCard, routeId: string, signatureCardId: string) {
    this.actionLocked = true;
    this.tweens.add({
      targets: card.container,
      y: card.homeY - 16,
      scale: 1.1,
      alpha: 0,
      duration: 170,
      onComplete: () => {
        this.save.run.route = routeId;
        if (!this.save.run.relics.includes(routeId)) this.save.run.relics.push(routeId);
        this.addCardToDeck(signatureCardId);
        this.advanceDay();
      },
    });
  }

  private renderCardReward() {
    const options = this.save.rewardOptions ?? [];
    this.addPanel(18, 90, 394, 104, 0xf2e5b1);
    this.addToPhase(this.text(32, 104, "客人留下三份谢礼", { fontSize: "19px", fontStyle: "bold" }));
    this.addToPhase(this.text(32, 142, `选择一张加入牌组 · 当前 ${this.save.run.deck.length} 张 · 偏向「${this.save.run.route ? RELICS[this.save.run.route]?.title : "当前牌路"}」`, {
      fontSize: "10px", color: "#5c583f", fontStyle: "bold", wordWrap: { width: 360 },
    }));

    const positions = [260, 390, 520];
    options.forEach((cardId, index) => {
      const def = ACTIONS[baseCardId(cardId)];
      if (!def) return;
      const card = this.createChoiceRow({
        y: positions[index], height: 112,
        title: def.title,
        subtitle: def.description,
        meta: `${def.rarity} · ${def.tag}`,
        badge: String(def.cost), glyph: def.glyph, accent: this.cardVisualAccent(def),
        onTap: (cardView) => this.chooseRewardCard(cardView, cardId),
      });
      card.container.setData("rewardId", cardId);
    });

    this.addToPhase(this.text(32, 594, "重复拿牌会提高稳定性；第三张同名牌会强化旧牌。", {
      fontSize: "10px", fontStyle: "bold", color: "#625a40",
    }));
    const skip = this.createTapButton({
      x: 215, y: 680, width: 374, height: 72,
      title: "婉拒谢礼 · 收2文", subtitle: "保持牌组精简，避免关键牌被稀释",
      glyph: "辞", accent: 0x9e8050,
      onTap: (cardView) => this.chooseRewardCard(cardView, "skip"),
    });
    skip.container.setDepth(10);
    this.hintText.setText("选一张加入牌组；不需要就婉拒并收下茶钱。");
  }

  private chooseRewardCard(card: DragCard, cardId: string) {
    this.actionLocked = true;
    this.tweens.add({
      targets: card.container,
      y: card.homeY - 14,
      scale: 1.08,
      alpha: 0,
      duration: 170,
      onComplete: () => {
        if (cardId === "skip") this.earnCoins(2);
        else this.addCardToDeck(cardId);
        this.advanceDay();
      },
    });
  }

  private renderRelicReward() {
    const options = this.save.relicOptions ?? [];
    const day = this.save.run.day;
    const title = day === 3 ? "小摊终于有了客房" : day === 6 ? "班底与客栈一同长大" : "难局带来镇店之物";
    const subtitle = day === 3
      ? "客房牌已经加入牌组，再选一项长久扩建。"
      : day === 6
        ? "小梅加入班底，再为阿满确定一个长期岗位。"
        : "选择一件永久生效的经营核心。";

    this.addPanel(18, 90, 394, 104, 0xebd9a1);
    this.addToPhase(this.text(32, 104, title, { fontSize: "18px", fontStyle: "bold" }));
    this.addToPhase(this.text(32, 142, subtitle, {
      fontSize: "11px", color: "#5c583f", fontStyle: "bold", wordWrap: { width: 360 },
    }));

    const positions = [260, 390, 520];
    options.forEach((id, index) => {
      const relic = RELICS[id];
      if (!relic) return;
      this.createChoiceRow({
        y: positions[index], height: 112,
        title: relic.title, subtitle: relic.description,
        meta: relic.group === "role" ? "伙计岗位" : relic.group === "facility" ? "客栈扩建" : "镇店之物",
        badge: "永", glyph: relic.glyph, accent: relic.accent,
        onTap: (cardView) => this.chooseRelicCard(cardView, id),
      });
    });

    this.addPanel(28, 602, 374, 134, 0xe4d49a);
    this.addToPhase(this.text(44, 620, day >= 6 ? "大客栈永久构筑" : "客店永久构筑", {
      fontSize: "15px", fontStyle: "bold", color: "#874337",
    }));
    this.addToPhase(this.text(44, 654, "三个选择只留一个，效果会持续到第十日。\n优先选择能补足当前牌组弱点的项目。", {
      fontSize: "11px", fontStyle: "bold", color: "#56523c", lineSpacing: 6,
    }));
    this.hintText.setText("选择一项永久生效的设施、岗位或镇店之物。");
  }

  private chooseRelicCard(card: DragCard, relicId: string) {
    this.actionLocked = true;
    this.tweens.add({
      targets: card.container,
      y: card.homeY - 16,
      scale: 1.08,
      alpha: 0,
      duration: 170,
      onComplete: () => {
        this.save.run.relics.push(relicId);
        this.save.run.signboard = Math.min(this.save.run.maxSignboard, this.save.run.signboard + 3);
        this.advanceDay();
      },
    });
  }

  private renderOutcome() {
    this.addPanel(24, 96, 382, 642, 0xead8aa);
    this.addToPhase(this.text(215, 128, "这一局生意没接稳", {
      fontSize: "23px", fontStyle: "bold", color: "#8f4036",
    }).setOrigin(0.5));
    this.addToPhase(this.text(215, 174, this.save.outcomeText ?? "客人失望离去。", {
      fontSize: "13px", fontStyle: "bold", color: "#5f583f", align: "center", wordWrap: { width: 330 },
    }).setOrigin(0.5));

    this.createChoiceRow({
      y: 300, width: 340, height: 112,
      title: "疲惫入牌库", subtitle: "失败不会立刻结束经营，但下一场抽牌会更不稳定。",
      meta: "永久构筑代价", badge: "乏", glyph: "乏", accent: 0x756f5f,
    });
    this.createChoiceRow({
      y: 436, width: 340, height: 112,
      title: "招牌继续承压", subtitle: `剩余招牌 ${this.save.run.signboard}/${this.save.run.maxSignboard}。归零则本局结束。`,
      meta: "持续经营压力", badge: String(this.save.run.signboard), glyph: "牌", accent: 0xa54f42,
    });

    this.createTapButton({
      x: 215, y: 610, width: 340, height: 76,
      title: "收灯打烊 · 继续经营", subtitle: "整理残局，进入下一日订桌簿",
      glyph: "灯", accent: 0xb08046,
      onTap: () => this.advanceDay(),
    });
    this.hintText.setText("失败会留下构筑代价，但只要招牌未倒，就还有翻盘机会。");
  }

  private renderGameOver() {
    this.addPanel(24, 92, 382, 654, 0xe1c49e);
    this.createCard({
      x: 215, y: 270, width: 220, height: 258,
      title: "招牌倒下", subtitle: this.save.outcomeText ?? "客栈没能撑过这十日。",
      typeLabel: `止步第${this.save.run.day}日`, badge: "败", glyph: "歇", accent: 0x914238,
      atlas: "campaignScenes", frame: 2,
    });
    this.addToPhase(this.text(215, 432, `满意客人 ${this.save.run.totalSatisfied} · 累计收入 ${this.save.run.totalEarned}文`, {
      fontSize: "13px", fontStyle: "bold", color: "#5c533d",
    }).setOrigin(0.5));
    this.addToPhase(this.text(215, 468, `牌组 ${this.save.run.deck.length}张 · 镇店之物 ${this.save.run.relics.length}件`, {
      fontSize: "12px", fontStyle: "bold", color: "#5c533d",
    }).setOrigin(0.5));

    this.createTapButton({
      x: 215, y: 602, width: 340, height: 76,
      title: "再开一局", subtitle: "重新生成客局路线、奖励与最终大席",
      glyph: "开", accent: 0x7c9168,
      onTap: () => {
        this.save = createFreshSave();
        this.persist();
        this.render();
      },
    });
    this.hintText.setText("每局路线、奖励与最终大席都会变化。换一种牌路再试一次。");
  }

  private renderVictory() {
    const score = this.save.run.coins
      + this.save.run.signboard * 2
      + this.save.run.relics.length * 6
      + this.save.run.totalSatisfied * 2;
    const boss = CHALLENGES[this.save.run.finalBoss];
    this.addPanel(20, 88, 390, 670, 0xf0dda1);
    this.addToPhase(this.text(215, 116, "十日功成 · 压轴大席告捷", {
      fontSize: "21px", fontStyle: "bold", color: "#8f4035",
    }).setOrigin(0.5));

    this.createCard({
      x: 215, y: 278, width: 220, height: 260,
      title: "十里第一栈", subtitle: `成功接下「${boss.title}」。从一个人动手的小摊，经营成了三人班底的大客栈。`,
      typeLabel: "本局通关", badge: "胜", glyph: "栈", accent: 0xa64c3d,
      atlas: "campaignScenes", frame: 3,
    });

    this.addPanel(50, 430, 330, 134, 0xe5d59d);
    this.addToPhase(this.text(215, 448, `经营评分 ${score}`, {
      fontSize: "22px", fontStyle: "bold", color: "#8e4938",
    }).setOrigin(0.5));
    this.addToPhase(this.text(215, 490, `满意客人 ${this.save.run.totalSatisfied} · 累计收入 ${this.save.run.totalEarned}文`, {
      fontSize: "12px", fontStyle: "bold", color: "#574f39",
    }).setOrigin(0.5));
    this.addToPhase(this.text(215, 520, `牌组 ${this.save.run.deck.length}张 · 镇店之物 ${this.save.run.relics.length}件 · 招牌 ${this.save.run.signboard}`, {
      fontSize: "11px", fontStyle: "bold", color: "#574f39",
    }).setOrigin(0.5));

    this.createTapButton({
      x: 215, y: 650, width: 340, height: 76,
      title: "换条牌路重开", subtitle: "重新随机客局、奖励和最终大席",
      glyph: "签", accent: 0x7d9169,
      onTap: () => {
        this.save = createFreshSave();
        this.persist();
        this.render();
      },
    });
    this.hintText.setText("通关不是终点：下一局会遇到另一批客人和另一场压轴大席。");
  }

  private advanceDay() {
    if (this.save.run.day >= 10) return;
    if (this.save.run.day === 1 && !this.save.run.route) {
      this.save.mode = "route";
      this.save.encounter = undefined;
      this.save.rewardOptions = undefined;
      this.save.relicOptions = ["route_fire", "route_hospitality", "route_order"];
      this.persist();
      this.render();
      return;
    }
    const finishedDay = this.save.run.day;
    const wages = finishedDay > 1 ? Math.max(0, this.save.run.staff.length - 1) * WAGE_PER_HELPER : 0;
    let wageNotice = "";
    if (wages > 0 && this.save.run.coins >= wages) {
      this.save.run.coins -= wages;
      wageNotice = `付给伙计 ${wages} 文工钱。`;
    } else if (wages > 0) {
      const shortage = wages - this.save.run.coins;
      this.save.run.coins = 0;
      this.save.run.signboard = Math.max(0, this.save.run.signboard - 1);
      this.save.run.deck.push("status_debt");
      wageNotice = `工钱还差 ${shortage} 文：招牌-1，牌组混入「欠账」。`;
      if (this.save.run.signboard <= 0) {
        this.failRun("连伙计的工钱也结不清，最后一点招牌信誉耗尽了。");
        return;
      }
    }
    this.save.run.day += 1;
    this.save.run.bookingChoices = [];
    this.save.mode = "booking";
    this.save.encounter = undefined;
    this.save.rewardOptions = undefined;
    this.save.relicOptions = undefined;
    this.save.outcomeText = undefined;
    this.persist();
    this.render();
    const milestones: Record<number, string> = {
      2: "阿满加入班底：从现在起，每回合多1点行动。",
      4: "客房开门：牌组加入「整好床铺」与「引客安寝」。",
      7: "小梅加入班底：大客栈每回合再多1点行动。",
    };
    const copy = milestones[this.save.run.day];
    if (copy) this.toast("客栈成长", wageNotice ? `${copy}\n${wageNotice}` : copy, 2400);
    else if (wageNotice) this.toast("夜里结账", wageNotice, 1800);
  }

  private addCardToDeck(cardId: string) {
    const { deck } = this.save.run;
    const base = baseCardId(cardId);
    const same = deck.map((id, index) => ({ id, index })).filter((entry) => baseCardId(entry.id) === base);
    if (same.length >= 2) {
      const upgradeTarget = same.find((entry) => !isUpgraded(entry.id));
      if (upgradeTarget) {
        deck[upgradeTarget.index] = `${base}+`;
        this.toast("旧牌磨练", `已有两张「${ACTIONS[base]?.title}」，其中一张得到强化。`, 1700);
        return;
      }
    }
    deck.push(cardId);
  }

  private pickRewardOptions(tags: CardTag[]) {
    const rewardable = Object.values(ACTIONS)
      .filter((card) => card.rewardable && !card.status)
      .map((card) => card.id);
    const matching = this.shuffle(rewardable.filter((id) => tags.includes(ACTIONS[id].tag)));
    const routeTags = this.routeRewardTags();
    const routeMatching = this.shuffle(rewardable.filter((id) => routeTags.includes(ACTIONS[id].tag)));
    const wildcard = this.shuffle(rewardable.filter((id) => !matching.includes(id)));
    const options: string[] = [];
    if (matching[0]) options.push(matching[0]);
    const routeCandidate = routeMatching.find((id) => !options.includes(id));
    if (routeCandidate) options.push(routeCandidate);
    const remainder = this.shuffle([...new Set([...matching.slice(1), ...wildcard])]);
    while (options.length < 3 && remainder.length > 0) {
      const candidate = remainder.shift();
      if (candidate && !options.includes(candidate)) options.push(candidate);
    }
    return options.slice(0, 3);
  }

  private cardCost(cardId: string) {
    const encounter = this.save.encounter;
    const id = baseCardId(cardId);
    const def = ACTIONS[id];
    if (!def) return 9;
    let cost = def.cost;
    if (this.activeSpecial() === "repeat_tax" && encounter?.playedThisTurn.includes(id)) cost += 1;
    return Math.max(0, cost);
  }

  private activeSpecial() {
    const encounter = this.save.encounter;
    if (!encounter) return "none" as SpecialRule;
    const challenge = CHALLENGES[encounter.challengeId];
    return challenge.phases?.[encounter.phaseIndex]?.special ?? challenge.special;
  }

  private marketClosed() {
    const encounter = this.save.encounter;
    if (!encounter || this.activeSpecial() !== "rain") return false;
    const challenge = CHALLENGES[encounter.challengeId];
    const tick = challenge.phases ? encounter.phaseTurn : encounter.turn;
    return tick % 2 === 0;
  }

  private maxLabor() {
    return 2 + Math.max(0, this.save.run.staff.length - 1);
  }

  private queueLaborGainFeedback(amount: number, reason: string) {
    if (amount <= 0) return;
    const combined = this.pendingLaborGain > 0 && this.pendingLaborReason !== reason;
    this.pendingLaborGain += amount;
    this.pendingLaborReason = combined ? "连连得手" : reason;
  }

  private gainLabor(amount: number, reason: string) {
    const encounter = this.save.encounter;
    if (!encounter || amount <= 0) return 0;
    const next = Math.min(this.maxLabor(), encounter.labor + amount);
    const gained = next - encounter.labor;
    encounter.labor = next;
    this.queueLaborGainFeedback(gained, reason);
    return gained;
  }

  private refillLabor(reason: string) {
    const encounter = this.save.encounter;
    if (!encounter) return;
    const next = this.maxLabor();
    const gained = Math.max(0, next - encounter.labor);
    encounter.labor = next;
    this.queueLaborGainFeedback(gained, reason);
  }

  private drawCards(count: number) {
    const encounter = this.save.encounter;
    if (!encounter) return;
    let drawn = 0;
    let overflow = 0;
    for (let index = 0; index < count; index += 1) {
      if (encounter.drawPile.length === 0) {
        if (encounter.discardPile.length === 0) break;
        const debtCount = encounter.discardPile.filter((id) => baseCardId(id) === "status_debt").length;
        if (debtCount > 0) {
          if (this.save.run.relics.includes("abacus") && !encounter.debtShieldUsed) {
            encounter.debtShieldUsed = true;
            this.toast("算盘拨清", "本场第一次洗牌免去欠账损失。", 1200);
          } else {
            this.save.run.coins = Math.max(0, this.save.run.coins - debtCount);
            this.toast("债主催账", `洗牌损失 ${debtCount} 文。`, 1200);
          }
        }
        encounter.drawPile = this.shuffle([...encounter.discardPile]);
        encounter.discardPile = [];
      }
      const card = encounter.drawPile.pop();
      if (!card) continue;
      if (encounter.hand.length >= MAX_HAND_SIZE) {
        encounter.discardPile.push(card);
        overflow += 1;
      } else {
        encounter.hand.push(card);
        drawn += 1;
      }
    }
    if (drawn > 0) this.handMotionPending = true;
    if (overflow > 0) {
      this.toast(
        "手牌已满",
        `${overflow}张来不及处理的牌进入弃牌堆。`,
        1100,
      );
    }
  }

  private discardCurrentHand() {
    const encounter = this.save.encounter;
    if (!encounter) return;
    encounter.hand.forEach((cardId) => {
      if (baseCardId(cardId) === "status_fatigue") encounter.exhausted.push(cardId);
      else encounter.discardPile.push(cardId);
    });
    encounter.hand = [];
  }

  private earnCoins(amount: number) {
    if (amount <= 0) return;
    this.save.run.coins += amount;
    this.save.run.totalEarned += amount;
    this.animateCoinGain(amount);
  }

  private animateCoinGain(amount: number) {
    this.tweens.killTweensOf(this.coinText);
    this.coinText.setScale(1);
    this.tweens.add({
      targets: this.coinText,
      scale: 1.28,
      duration: 130,
      yoyo: true,
      ease: "Back.Out",
    });
    const copy = this.text(244, 27, `+${amount}`, {
      fontSize: "16px", color: "#a04534", fontStyle: "bold",
      stroke: "#fff4bf", strokeThickness: 3,
    }).setOrigin(0.5).setDepth(9000).setScale(0.7);
    this.tweens.add({
      targets: copy,
      y: 4,
      scale: 1.2,
      alpha: 0,
      duration: 780,
      ease: "Cubic.Out",
      onComplete: () => copy.destroy(),
    });
  }

  private damageSignboard(amount: number, reason: string) {
    if (amount <= 0) return;
    this.save.run.signboard = Math.max(0, this.save.run.signboard - amount);
    this.tweens.killTweensOf(this.signText);
    this.signText.setColor("#a23f35").setScale(1);
    this.tweens.add({
      targets: this.signText,
      scale: 1.24,
      duration: 110,
      yoyo: true,
      repeat: 1,
      ease: "Sine.InOut",
      onComplete: () => this.signText.setColor("#202018").setScale(1),
    });
    this.toast(`招牌 -${amount}`, reason, 1050);
  }

  private failRun(reason: string) {
    this.save.mode = "gameover";
    this.save.outcomeText = reason;
    this.save.encounter = undefined;
    this.persist();
    this.render();
  }

  private targetName(target: TargetKind) {
    const names: Record<TargetKind, string> = {
      market: "菜市",
      stove: "灶台",
      hall: "前堂",
      room: "客房",
      guest: "客人",
      staff: "班底",
      any: "任意目标",
    };
    return names[target];
  }

  private toast(title: string, body: string, lifetime = 1500) {
    const group = this.add.container(215, 112).setDepth(10000).setAlpha(0).setScale(0.92);
    const shadow = this.add.rectangle(4, 5, 324, 70, 0x202018, 0.35);
    const panel = this.add.rectangle(0, 0, 324, 70, 0xfff2bd, 1).setStrokeStyle(2.5, 0x202018, 1);
    const stripe = this.add.rectangle(-151, 0, 8, 54, 0xb25140, 1);
    const titleText = this.text(-137, -22, title, { fontSize: "12px", fontStyle: "bold" });
    const bodyText = this.text(-137, 1, body, {
      fontSize: "10px", color: "#58523c", fontStyle: "bold", wordWrap: { width: 274 }, maxLines: 2,
    });
    group.add([shadow, panel, stripe, titleText, bodyText]);
    this.tweens.add({ targets: group, alpha: 1, scale: 1, y: 123, duration: 180, ease: "Back.Out" });
    this.time.delayedCall(lifetime, () => {
      if (!group.active) return;
      this.tweens.add({
        targets: group, alpha: 0, y: 106, duration: 180,
        onComplete: () => group.destroy(true),
      });
    });
  }

  private random() {
    this.save.run.rng = (Math.imul(this.save.run.rng, 1664525) + 1013904223) >>> 0;
    return this.save.run.rng / 0x100000000;
  }

  private shuffle<T>(items: T[]) {
    for (let index = items.length - 1; index > 0; index -= 1) {
      const target = Math.floor(this.random() * (index + 1));
      [items[index], items[target]] = [items[target], items[index]];
    }
    return items;
  }

  private loadSave() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return createFreshSave();
      const parsed = JSON.parse(raw) as SaveState;
      if (parsed.version !== 3 || !parsed.run || parsed.run.day < 1 || parsed.run.day > 10) return createFreshSave();
      parsed.run.prepared ??= false;
      if (!parsed.run.route && parsed.run.day > 1) {
        const scores = {
          route_fire: 0,
          route_hospitality: 0,
          route_order: 0,
        };
        parsed.run.deck.forEach((cardId) => {
          const tag = ACTIONS[baseCardId(cardId)]?.tag;
          if (tag === "采办" || tag === "烹饪" || tag === "跑堂") scores.route_fire += 1;
          if (tag === "人情" || tag === "跑堂" || tag === "账房") scores.route_hospitality += 1;
          if (tag === "整理" || tag === "账房" || tag === "采办") scores.route_order += 1;
        });
        parsed.run.route = (Object.entries(scores).sort((left, right) => right[1] - left[1])[0]?.[0] ?? "route_fire");
        if (!parsed.run.relics.includes(parsed.run.route)) parsed.run.relics.push(parsed.run.route);
      }
      if (parsed.encounter) {
        parsed.encounter.cookedTotal ??= 0;
        parsed.encounter.oldSoupTriggered ??= false;
        parsed.encounter.debtShieldUsed ??= false;
        parsed.encounter.staffJobs ??= {};
        parsed.encounter.routeProgress ??= 0;
        parsed.encounter.routeTriggered ??= false;
        if (parsed.encounter.hand.length > MAX_HAND_SIZE) {
          const overflow = parsed.encounter.hand.splice(MAX_HAND_SIZE);
          parsed.encounter.discardPile.push(...overflow);
        }
      }
      return parsed;
    } catch {
      return createFreshSave();
    }
  }

  private persist() {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(this.save));
    } catch {
      // Local continuation is optional.
    }
    this.refreshHud();
  }
}

function runRoomTitle(unlocked: boolean) {
  return unlocked ? "客房" : "空后院";
}

export function createDeckInnGame(parent: HTMLElement) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH * RENDER_SCALE,
    height: GAME_HEIGHT * RENDER_SCALE,
    backgroundColor: "#9da36b",
    transparent: false,
    scene: [InnModeSelectScene, DeckInnScene, DuelInnScene],
    render: { antialias: true, pixelArt: false, roundPixels: true },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: GAME_WIDTH * RENDER_SCALE,
      height: GAME_HEIGHT * RENDER_SCALE,
    },
    input: { activePointers: 3 },
  });
}
