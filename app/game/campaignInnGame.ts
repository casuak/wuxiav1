import * as Phaser from "phaser";

const GAME_WIDTH = 430;
const GAME_HEIGHT = 860;
const CARD_WIDTH = 88;
const CARD_HEIGHT = 126;
const STACK_Y = 24;
const PILE_GAP = 6;
const COLLISION_SEARCH_STEP = 8;
const COLLISION_TWEEN_DURATION = 240;
const BOARD_LEFT = 10;
const BOARD_TOP = 178;
const BOARD_RIGHT = 420;
const BOARD_BOTTOM = 778;
const CARD_DEPTH_BASE = 100;
const CARD_DEPTH_CEILING = 4200;
const SAVE_KEY = "stacked-inn-campaign-v1";
const UI_FONT = '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif';
const RENDER_SCALE = typeof window === "undefined"
  ? 1
  : Math.min(2, Math.max(1, Math.round(window.devicePixelRatio || 1)));
const TEXT_RESOLUTION = typeof window === "undefined"
  ? 2
  : Math.max(2, RENDER_SCALE);
const SLOT_X = [55, 162, 268, 375] as const;
const FACILITY_Y = 246;
const SUPPORT_Y = 410;
const EVENT_Y = 566;
const FLOW_Y = 706;

type Specialty = "quick" | "rich" | "batch";
type StaffRole = "chef" | "runner" | "steward";
type Promotion = "lantern" | "premium" | "limited";
type RainPolicy = "kind" | "rate";

type CardKind =
  | "owner"
  | "coin"
  | "stall"
  | "inn"
  | "market"
  | "stove"
  | "helper"
  | "veg"
  | "flour"
  | "pork"
  | "spice"
  | "sugar"
  | "noodles"
  | "yangchun"
  | "braised"
  | "cakes"
  | "guest"
  | "sleepyGuest"
  | "strandedGuest"
  | "caravanGuest"
  | "honoredGuest"
  | "recruit"
  | "wage"
  | "timber"
  | "bedding"
  | "room"
  | "dirtyRoom"
  | "choiceQuick"
  | "choiceRich"
  | "choiceBatch"
  | "pantryPlan"
  | "pantry"
  | "leak"
  | "repairKit"
  | "policyKind"
  | "policyRate"
  | "contractAccept"
  | "contractDecline"
  | "roleChef"
  | "roleRunner"
  | "roleSteward"
  | "promoLantern"
  | "promoPremium"
  | "promoLimited"
  | "banquet"
  | "ledger";

type IngredientKind = "veg" | "flour" | "pork" | "spice" | "sugar";
type DishKind = "noodles" | "yangchun" | "braised" | "cakes";
type GuestKind = "guest" | "sleepyGuest" | "strandedGuest" | "caravanGuest" | "honoredGuest";
type AtlasKey = "food" | "people" | "scenes" | "campaignFood" | "campaignScenes" | "campaignItems";

type CardSpec = {
  title: string;
  subtitle: string;
  typeLabel: string;
  atlas?: AtlasKey;
  frame?: number;
  glyph?: string;
  accent: number;
  paper: number;
};

type CardView = {
  id: string;
  kind: CardKind;
  container: Phaser.GameObjects.Container;
  glow: Phaser.GameObjects.Rectangle;
  art: Phaser.GameObjects.Image | Phaser.GameObjects.Container;
  titleText: Phaser.GameObjects.Text;
  subtitleText: Phaser.GameObjects.Text;
  typeText: Phaser.GameObjects.Text;
  badge: Phaser.GameObjects.Text;
  homeX: number;
  homeY: number;
  stackTarget?: string;
  stackRank: number;
  locked: boolean;
  gone: boolean;
};

type PileLayout = {
  root: CardView;
  height: number;
  locked: boolean;
};

type CampaignState = {
  day: number;
  coins: number;
  reputation: number;
  morale: number;
  totalServed: number;
  totalLodged: number;
  lifetimeEarnings: number;
  lifetimeSpent: number;
  innBuilt: boolean;
  recruited: boolean;
  roomBuilt: boolean;
  specialty: Specialty | null;
  pantryBuilt: boolean;
  rainPolicy: RainPolicy | null;
  caravanAccepted: boolean;
  caravanCompleted: boolean;
  role: StaffRole | null;
  promotion: Promotion | null;
  inventory: Partial<Record<IngredientKind, number>>;
};

type DayDefinition = {
  title: string;
  phase: string;
  intro: string;
  lesson: string;
};

type GoalItem = {
  label: string;
  done: boolean;
  required?: boolean;
};

const PAPER = 0xfff8d6;
const CARD_SPECS: Record<CardKind, CardSpec> = {
  owner: { title: "小掌柜", subtitle: "哪里缺人就往哪里叠", typeLabel: "人物", atlas: "people", frame: 0, accent: 0x9da66f, paper: PAPER },
  coin: { title: "钱串", subtitle: "经营、扩建与发工资", typeLabel: "财物", glyph: "文", accent: 0xd3b65d, paper: PAPER },
  stall: { title: "露天面摊", subtitle: "第一天的一块布棚", typeLabel: "营生", atlas: "scenes", frame: 0, accent: 0xc26d54, paper: PAPER },
  inn: { title: "叠叠客栈", subtitle: "十天之内把门灯点亮", typeLabel: "客栈", atlas: "scenes", frame: 3, accent: 0xc26d54, paper: PAPER },
  market: { title: "清晨菜市", subtitle: "人物 + 钱串 · 采买食材", typeLabel: "地点", atlas: "scenes", frame: 1, accent: 0x9da66f, paper: PAPER },
  stove: { title: "灶台", subtitle: "人物 + 食材 · 烹饪", typeLabel: "设施", atlas: "scenes", frame: 2, accent: 0xb0986a, paper: PAPER },
  helper: { title: "小伙计阿满", subtitle: "可以与掌柜同时做事", typeLabel: "人物", atlas: "people", frame: 3, accent: 0x87968a, paper: PAPER },
  veg: { title: "一篮青菜", subtitle: "做面的清鲜底味", typeLabel: "食材", atlas: "food", frame: 0, accent: 0x9daa75, paper: PAPER },
  flour: { title: "一袋面粉", subtitle: "面食的根本", typeLabel: "食材", atlas: "food", frame: 1, accent: 0xd3b65d, paper: PAPER },
  pork: { title: "一刀鲜肉", subtitle: "价高，但能做硬菜", typeLabel: "食材", glyph: "肉", accent: 0xc06b56, paper: PAPER },
  spice: { title: "一包香料", subtitle: "慢火菜少不了它", typeLabel: "食材", glyph: "香", accent: 0xb48b55, paper: PAPER },
  sugar: { title: "一罐桂花糖", subtitle: "一炉点心能出两份", typeLabel: "食材", glyph: "糖", accent: 0xd3b65d, paper: PAPER },
  noodles: { title: "热汤面", subtitle: "趁热叠到客人身上", typeLabel: "菜肴", atlas: "food", frame: 2, accent: 0xc9845a, paper: PAPER },
  yangchun: { title: "阳春面", subtitle: "便宜、快速、周转高", typeLabel: "招牌菜", atlas: "campaignFood", frame: 0, accent: 0x9daa75, paper: PAPER },
  braised: { title: "红烧肉", subtitle: "慢工换来高价与口碑", typeLabel: "招牌菜", atlas: "campaignFood", frame: 1, accent: 0xb95d49, paper: PAPER },
  cakes: { title: "桂花糕", subtitle: "一次出两份，适合团客", typeLabel: "招牌菜", atlas: "campaignFood", frame: 2, accent: 0xd3b65d, paper: PAPER },
  guest: { title: "赶路客", subtitle: "等一份热饭", typeLabel: "客人", atlas: "people", frame: 2, accent: 0x87968a, paper: PAPER },
  sleepyGuest: { title: "投宿客", subtitle: "可以用饭，也可以住店", typeLabel: "客人", atlas: "people", frame: 2, accent: 0x738895, paper: PAPER },
  strandedGuest: { title: "避雨旅人", subtitle: "衣裳湿透，只求一处暖房", typeLabel: "客人", atlas: "people", frame: 2, accent: 0x688391, paper: PAPER },
  caravanGuest: { title: "商队客人", subtitle: "团单讲究连续出餐", typeLabel: "团客", atlas: "people", frame: 2, accent: 0x8d7458, paper: PAPER },
  honoredGuest: { title: "慕名食客", subtitle: "专程来尝这家客栈", typeLabel: "贵客", atlas: "people", frame: 2, accent: 0xa46450, paper: PAPER },
  recruit: { title: "招工告示", subtitle: "掌柜 + 钱串 · 雇下阿满", typeLabel: "经营", atlas: "campaignItems", frame: 0, accent: 0xc26d54, paper: PAPER },
  wage: { title: "今日工钱", subtitle: "阿满 + 钱串 · 支付 2 文", typeLabel: "账目", glyph: "薪", accent: 0xd3b65d, paper: PAPER },
  timber: { title: "一捆木料", subtitle: "修客房用的梁与板", typeLabel: "建材", atlas: "campaignItems", frame: 1, accent: 0x9b7a52, paper: PAPER },
  bedding: { title: "一床被褥", subtitle: "让客人真正住得下", typeLabel: "建材", atlas: "campaignItems", frame: 1, accent: 0x87968a, paper: PAPER },
  room: { title: "整洁客房", subtitle: "投宿客 + 客房 · 留宿", typeLabel: "客房", atlas: "campaignScenes", frame: 0, accent: 0x87968a, paper: PAPER },
  dirtyRoom: { title: "待扫客房", subtitle: "人物 + 客房 · 打扫", typeLabel: "杂务", atlas: "campaignScenes", frame: 0, accent: 0xa27662, paper: PAPER },
  choiceQuick: { title: "学做阳春面", subtitle: "薄利多销 · 永久选择", typeLabel: "菜谱", atlas: "campaignFood", frame: 0, accent: 0x9daa75, paper: PAPER },
  choiceRich: { title: "学做红烧肉", subtitle: "慢火高价 · 永久选择", typeLabel: "菜谱", atlas: "campaignFood", frame: 1, accent: 0xb95d49, paper: PAPER },
  choiceBatch: { title: "学做桂花糕", subtitle: "批量出餐 · 永久选择", typeLabel: "菜谱", atlas: "campaignFood", frame: 2, accent: 0xd3b65d, paper: PAPER },
  pantryPlan: { title: "储藏间图样", subtitle: "掌柜 + 8 文 + 客栈", typeLabel: "扩建", atlas: "campaignScenes", frame: 1, accent: 0x9daa75, paper: PAPER },
  pantry: { title: "储藏间", subtitle: "采买翻倍，食材可留到明日", typeLabel: "设施", atlas: "campaignScenes", frame: 1, accent: 0x9daa75, paper: PAPER },
  leak: { title: "漏雨屋檐", subtitle: "人物 + 钱串 + 修缮包", typeLabel: "事故", atlas: "campaignScenes", frame: 2, accent: 0x688391, paper: PAPER },
  repairKit: { title: "修缮包", subtitle: "木梯、瓦片与一双稳手", typeLabel: "工具", atlas: "campaignItems", frame: 3, accent: 0xb0986a, paper: PAPER },
  policyKind: { title: "薄收暖心", subtitle: "少收房钱，换更多口碑", typeLabel: "雨夜选择", glyph: "义", accent: 0x7d9a6c, paper: PAPER },
  policyRate: { title: "照价收房", subtitle: "维持房价，保证现金流", typeLabel: "雨夜选择", glyph: "价", accent: 0xc9845a, paper: PAPER },
  contractAccept: { title: "接下商队团单", subtitle: "先收 10 文，须连做 4 份", typeLabel: "契约", atlas: "campaignItems", frame: 2, accent: 0xc26d54, paper: PAPER },
  contractDecline: { title: "婉拒商队团单", subtitle: "轻松经营，只招待 2 人", typeLabel: "契约", glyph: "辞", accent: 0x87968a, paper: PAPER },
  roleChef: { title: "阿满做厨工", subtitle: "每锅多出一份菜", typeLabel: "岗位", glyph: "厨", accent: 0xc9845a, paper: PAPER },
  roleRunner: { title: "阿满做跑堂", subtitle: "每桌多赚钱与口碑", typeLabel: "岗位", glyph: "堂", accent: 0x87968a, paper: PAPER },
  roleSteward: { title: "阿满做管事", subtitle: "采买便宜并自动整房", typeLabel: "岗位", glyph: "账", accent: 0x9daa75, paper: PAPER },
  promoLantern: { title: "满街红灯笼", subtitle: "客流最多：招待 4 人", typeLabel: "宣传", glyph: "灯", accent: 0xc26d54, paper: PAPER },
  promoPremium: { title: "清静雅座", subtitle: "客人较少，但每桌价高", typeLabel: "宣传", glyph: "雅", accent: 0x87968a, paper: PAPER },
  promoLimited: { title: "限量招牌", subtitle: "中等客流，招牌菜加价", typeLabel: "宣传", glyph: "限", accent: 0xd3b65d, paper: PAPER },
  banquet: { title: "春灯午宴", subtitle: "晨客招待完后，掌柜来开席", typeLabel: "终局", atlas: "campaignFood", frame: 3, accent: 0xc26d54, paper: PAPER },
  ledger: { title: "今日账簿", subtitle: "叠到客栈上，打烊结算", typeLabel: "打烊", glyph: "账", accent: 0xd3b65d, paper: PAPER },
};

const DAY_DEFINITIONS: DayDefinition[] = [
  { title: "白手开张", phase: "第一日 · 一人一摊", intro: "十文铜钱，一副肩膀。先把第一碗热面端出去。", lesson: "采买 → 烹饪 → 待客 → 升店" },
  { title: "招第一个伙计", phase: "第二日 · 两人分工", intro: "阿满抱着招工告示来了。多一双手，也多一份工钱。", lesson: "雇人换并行，工资考验现金流" },
  { title: "第一间客房", phase: "第三日 · 堂食与夜宿", intro: "门外有旅人问：除了热饭，可有一张干净床榻？", lesson: "客房收益稳定，但住后必须打扫" },
  { title: "确立招牌菜", phase: "第四日 · 一店一味", intro: "三本菜谱只能留一本。往后的生意，会因此走向不同。", lesson: "快周转、高客单或批量生产" },
  { title: "菜市涨落", phase: "第五日 · 囤货抉择", intro: "菜价忽然上涨。要不要花钱修一间能过夜存货的储藏间？", lesson: "短期现金与长期效率的取舍" },
  { title: "雨夜留客", phase: "第六日 · 风雨应变", intro: "屋檐漏了，避雨的人却越来越多。今晚先修哪里、先顾谁？", lesson: "房价、口碑与修缮人手三方拉扯" },
  { title: "商队团单", phase: "第七日 · 风险契约", intro: "商队愿付定金，但四份饭必须连着上齐。接，还是不接？", lesson: "高收益目标可以主动拒绝" },
  { title: "从动手到管人", phase: "第八日 · 岗位专精", intro: "阿满已经能独当一面。让他专攻厨房、跑堂还是管事？", lesson: "角色能力改变整条经营链" },
  { title: "灯会爆场", phase: "第九日 · 主动造势", intro: "灯会将至。选择宣传方式，也是在选择今天的压力。", lesson: "高客流、高客单与招牌溢价" },
  { title: "十里第一栈", phase: "第十日 · 春灯大宴", intro: "晨客、午宴、夜宿接连而至。十天经营，今日见真章。", lesson: "三阶段终局，检验整套经营体系" },
];

function createInitialState(): CampaignState {
  return {
    day: 1,
    coins: 10,
    reputation: 0,
    morale: 80,
    totalServed: 0,
    totalLodged: 0,
    lifetimeEarnings: 0,
    lifetimeSpent: 0,
    innBuilt: false,
    recruited: false,
    roomBuilt: false,
    specialty: null,
    pantryBuilt: false,
    rainPolicy: null,
    caravanAccepted: false,
    caravanCompleted: false,
    role: null,
    promotion: null,
    inventory: {},
  };
}

function cloneState(state: CampaignState): CampaignState {
  return JSON.parse(JSON.stringify(state)) as CampaignState;
}

function exactKinds(pile: CardView[], expected: CardKind[]) {
  const actual = pile.map((card) => card.kind).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((kind, index) => kind === wanted[index]);
}

function isWorkerKind(kind: CardKind) {
  return kind === "owner" || kind === "helper";
}

function isGuestKind(kind: CardKind): kind is GuestKind {
  return ["guest", "sleepyGuest", "strandedGuest", "caravanGuest", "honoredGuest"].includes(kind);
}

function isDishKind(kind: CardKind): kind is DishKind {
  return ["noodles", "yangchun", "braised", "cakes"].includes(kind);
}

function isIngredientKind(kind: CardKind): kind is IngredientKind {
  return ["veg", "flour", "pork", "spice", "sugar"].includes(kind);
}

function cardBadge(kind: CardKind) {
  const spec = CARD_SPECS[kind];
  return spec.glyph ?? spec.typeLabel.slice(0, 1);
}

class CampaignInnScene extends Phaser.Scene {
  private state: CampaignState = createInitialState();
  private dayStartState: CampaignState = createInitialState();
  private cards = new Map<string, CardView>();
  private cardSerial = 0;
  private stackSerial = 0;
  private cardDepthSerial = CARD_DEPTH_BASE;
  private activeRecipeCount = 0;
  private summaryOpen = false;
  private dayPurchases = 0;
  private dayCooked = 0;
  private dayServed = 0;
  private dayLodged = 0;
  private dayCleaned = 0;
  private daySpecialServed = 0;
  private hotStreak = 0;
  private dayEarnings = 0;
  private daySpent = 0;
  private wagePaid = false;
  private leakFixed = false;
  private contractChoice: "accept" | "decline" | null = null;
  private contractRewarded = false;
  private banquetOpened = false;
  private finaleStage = 1;
  private dayFlags = new Set<string>();
  private phaseText!: Phaser.GameObjects.Text;
  private coinHud!: Phaser.GameObjects.Text;
  private repHud!: Phaser.GameObjects.Text;
  private moraleHud!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private goalTitle!: Phaser.GameObjects.Text;
  private goalProgress!: Phaser.GameObjects.Text;
  private goalLines: Phaser.GameObjects.Text[] = [];
  private recipeNoteText!: Phaser.GameObjects.Text;
  private debugHitAreas = false;
  private debuggedObjects = new WeakSet<Phaser.GameObjects.GameObject>();
  private hoverDropTarget?: CardView;
  private dragGroup: CardView[] = [];
  private collisionSettleTimer?: Phaser.Time.TimerEvent;
  private pendingCollisionCardId?: string;
  private activeCoinGainAnimations = 0;

  constructor() {
    super("inn-ten-day-campaign");
  }

  private crispText(
    x: number,
    y: number,
    text: string | string[],
    style?: Phaser.Types.GameObjects.Text.TextStyle,
  ) {
    return this.add.text(x, y, text, style).setResolution(TEXT_RESOLUTION);
  }

  init(data?: { campaign?: CampaignState }) {
    this.state = data?.campaign ? cloneState(data.campaign) : this.loadCampaign();
  }

  preload() {
    this.load.spritesheet("food", "/assets/food-atlas.png", { frameWidth: 512, frameHeight: 512 });
    this.load.spritesheet("people", "/assets/people-atlas.png", { frameWidth: 512, frameHeight: 512 });
    this.load.spritesheet("scenes", "/assets/scene-atlas.png", { frameWidth: 512, frameHeight: 512 });
    this.load.spritesheet("campaignFood", "/assets/campaign-food-atlas.png", { frameWidth: 512, frameHeight: 512 });
    this.load.spritesheet("campaignScenes", "/assets/campaign-scene-atlas.png", { frameWidth: 512, frameHeight: 512 });
    this.load.spritesheet("campaignItems", "/assets/campaign-item-atlas.png", { frameWidth: 512, frameHeight: 512 });
  }

  create() {
    this.resetRuntime();
    this.dayStartState = cloneState(this.state);
    this.debugHitAreas = new URLSearchParams(window.location.search).has("debugHitboxes");
    this.cameras.main.setZoom(RENDER_SCALE).centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    this.drawTable();
    this.createHud();
    this.createGoalCard();
    this.bindDragEvents();
    this.dealCurrentDay();
    this.refreshAll();
    this.saveCampaign(this.state);

    this.input.keyboard?.on("keydown-R", () => this.restartCurrentDay());
    this.cameras.main.fadeIn(360, 49, 35, 26);
    const definition = DAY_DEFINITIONS[this.state.day - 1];
    this.time.delayedCall(380, () => this.showToast(definition.phase, definition.intro, 3200));
    this.time.delayedCall(760, () => this.spawnNextGuest());
  }

  private resetRuntime() {
    this.cards = new Map();
    this.cardSerial = 0;
    this.stackSerial = 0;
    this.cardDepthSerial = CARD_DEPTH_BASE;
    this.activeRecipeCount = 0;
    this.summaryOpen = false;
    this.dayPurchases = 0;
    this.dayCooked = 0;
    this.dayServed = 0;
    this.dayLodged = 0;
    this.dayCleaned = 0;
    this.daySpecialServed = 0;
    this.hotStreak = 0;
    this.dayEarnings = 0;
    this.daySpent = 0;
    this.wagePaid = false;
    this.leakFixed = false;
    this.contractChoice = null;
    this.contractRewarded = false;
    this.banquetOpened = false;
    this.finaleStage = 1;
    this.dayFlags = new Set();
    this.goalLines = [];
    this.debuggedObjects = new WeakSet();
    this.hoverDropTarget = undefined;
    this.dragGroup = [];
    this.collisionSettleTimer = undefined;
    this.pendingCollisionCardId = undefined;
    this.activeCoinGainAnimations = 0;
  }

  private loadCampaign() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return createInitialState();
      const parsed = JSON.parse(raw) as Partial<CampaignState>;
      if (!parsed.day || parsed.day < 1 || parsed.day > 10) return createInitialState();
      return {
        ...createInitialState(),
        ...parsed,
        inventory: { ...(parsed.inventory ?? {}) },
      };
    } catch {
      return createInitialState();
    }
  }

  private saveCampaign(state: CampaignState) {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    } catch {
      // Device-local continuation is optional.
    }
  }

  private drawTable() {
    this.cameras.main.setBackgroundColor("#9fa66b");
    const paper = this.add.graphics();
    paper.fillStyle(0x9fa66b, 1);
    paper.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    const tile = 32;
    for (let row = 0; row < Math.ceil(GAME_HEIGHT / tile); row += 1) {
      for (let column = 0; column < Math.ceil(GAME_WIDTH / tile); column += 1) {
        paper.fillStyle((row + column) % 2 === 0 ? 0xb8ba7b : 0x929961, 0.24);
        paper.fillRect(column * tile, row * tile, tile, tile);
      }
    }

    paper.fillStyle(0xc8b96c, 1);
    paper.fillRect(0, 0, GAME_WIDTH, 76);
    paper.fillStyle(0x202018, 1);
    paper.fillRect(0, 76, GAME_WIDTH, 3);

    paper.fillStyle(0xf5e8b4, 0.96);
    paper.fillRoundedRect(10, 84, 410, 86, 10);
    paper.lineStyle(2, 0x202018, 0.92);
    paper.strokeRoundedRect(10, 84, 410, 86, 10);

    paper.fillStyle(0xfff4bf, 0.78);
    paper.fillRoundedRect(10, BOARD_TOP, 410, BOARD_BOTTOM - BOARD_TOP, 12);
    paper.lineStyle(2.5, 0x202018, 1);
    paper.strokeRoundedRect(10, BOARD_TOP, 410, BOARD_BOTTOM - BOARD_TOP, 12);
    paper.lineStyle(1, 0x57593f, 0.15);
    paper.lineBetween(20, 332, 410, 332);
    paper.lineBetween(20, 494, 410, 494);
    paper.lineBetween(20, 656, 410, 656);

    this.crispText(20, 184, "经营桌面 · 拖起卡牌，叠到目标牌上", {
      fontFamily: UI_FONT,
      fontSize: "9px",
      color: "#202018",
      fontStyle: "bold",
      letterSpacing: 0.5,
    }).setAlpha(0.62);

    this.add.rectangle(215, 819, 410, 64, 0x202018, 0.97)
      .setStrokeStyle(2, 0x777b53, 1);
    this.crispText(18, 791, "下一步", {
      fontFamily: UI_FONT,
      fontSize: "9px",
      color: "#d9ce78",
      fontStyle: "bold",
      letterSpacing: 1,
    });
    this.hintText = this.crispText(18, 811, "", {
      fontFamily: UI_FONT,
      fontSize: "11px",
      color: "#fff2d6",
      fontStyle: "bold",
      wordWrap: { width: 282 },
      lineSpacing: 2,
    });

    const restartBg = this.add.rectangle(330, 819, 48, 40, 0xfff4bf, 1)
      .setStrokeStyle(2, 0x202018, 1)
      .setInteractive({ useHandCursor: true });
    const restartText = this.crispText(330, 819, "重开", {
      fontFamily: UI_FONT,
      fontSize: "10px",
      color: "#202018",
      fontStyle: "bold",
    }).setOrigin(0.5);
    this.enableHitAreaDebug(restartBg, 0x2f8f2f);
    restartBg.on("pointerdown", () => this.restartCurrentDay());
    restartBg.on("pointerover", () => restartText.setColor("#9a3e31"));
    restartBg.on("pointerout", () => restartText.setColor("#202018"));

    let resetArmed = false;
    const resetBg = this.add.rectangle(389, 819, 48, 40, 0xdad79c, 1)
      .setStrokeStyle(2, 0x202018, 1)
      .setInteractive({ useHandCursor: true });
    const resetText = this.crispText(389, 819, "新档", {
      fontFamily: UI_FONT,
      fontSize: "10px",
      color: "#202018",
      fontStyle: "bold",
    }).setOrigin(0.5);
    this.enableHitAreaDebug(resetBg, 0x2f8f2f);
    resetBg.on("pointerdown", () => {
      if (!resetArmed) {
        resetArmed = true;
        resetBg.setFillStyle(0xc26d54);
        resetText.setText("确认").setColor("#fff4d2");
        this.time.delayedCall(2200, () => {
          resetArmed = false;
          if (resetText.active) {
            resetBg.setFillStyle(0xdad79c);
            resetText.setText("新档").setColor("#202018");
          }
        });
        return;
      }
      const fresh = createInitialState();
      this.saveCampaign(fresh);
      this.scene.restart({ campaign: fresh });
    });
  }

  private createHud() {
    this.crispText(16, 10, "叠叠客栈", {
      fontFamily: UI_FONT,
      fontSize: "21px",
      color: "#202018",
      fontStyle: "bold",
      letterSpacing: 1,
    });
    this.phaseText = this.crispText(16, 43, "", {
      fontFamily: UI_FONT,
      fontSize: "11px",
      color: "#54553a",
      fontStyle: "bold",
      wordWrap: { width: 180 },
    });

    this.coinHud = this.createHudChip(230, 38, 58, "", 0x9c6b28);
    this.repHud = this.createHudChip(298, 38, 58, "", 0x4c7255);
    this.moraleHud = this.createHudChip(374, 38, 70, "", 0x3d6076);
  }

  private createHudChip(x: number, y: number, width: number, label: string, accent: number) {
    this.add.rectangle(x, y, width, 30, 0xfff4bf, 1).setStrokeStyle(2, 0x202018, 1);
    this.add.rectangle(x - width / 2 + 4, y, 4, 22, accent, 1);
    return this.crispText(x + 2, y, label, {
      fontFamily: UI_FONT,
      fontSize: "10px",
      color: "#202018",
      fontStyle: "bold",
    }).setOrigin(0.5);
  }

  private createGoalCard() {
    this.goalTitle = this.crispText(20, 90, "", {
      fontFamily: UI_FONT,
      fontSize: "13px",
      color: "#202018",
      fontStyle: "bold",
    });
    this.goalProgress = this.crispText(408, 91, "", {
      fontFamily: UI_FONT,
      fontSize: "10px",
      color: "#833d32",
      fontStyle: "bold",
    }).setOrigin(1, 0);

    const positions = [
      [20, 114],
      [218, 114],
      [20, 138],
      [218, 138],
    ] as const;
    for (let index = 0; index < 4; index += 1) {
      const [x, y] = positions[index];
      const line = this.crispText(x, y, "", {
        fontFamily: UI_FONT,
        fontSize: "10px",
        color: "#292a20",
        fontStyle: "bold",
        wordWrap: { width: 190 },
      }).setOrigin(0, 0);
      this.goalLines.push(line);
    }

    this.recipeNoteText = this.crispText(20, 159, "", {
      fontFamily: UI_FONT,
      fontSize: "9px",
      color: "#6d4a36",
      fontStyle: "bold",
      wordWrap: { width: 388 },
    }).setOrigin(0, 0.5);
  }

  private dealCurrentDay() {
    const day = this.state.day;
    this.addCard(day === 1 && !this.state.innBuilt ? "stall" : "inn", SLOT_X[0], FACILITY_Y);
    this.addCard("market", SLOT_X[1], FACILITY_Y, { subtitle: this.getMarketSubtitle() });
    this.addCard("stove", SLOT_X[2], FACILITY_Y);
    if (this.state.roomBuilt) this.addCard("room", SLOT_X[3], FACILITY_Y);
    if (this.state.pantryBuilt) this.addCard("pantry", SLOT_X[0], SUPPORT_Y);
    this.addCard("owner", SLOT_X[1], SUPPORT_Y);
    this.addCard("coin", SLOT_X[2], SUPPORT_Y, { subtitle: this.getCoinSubtitle() });
    if (this.state.recruited) {
      this.addCard("helper", SLOT_X[3], SUPPORT_Y, { subtitle: this.getHelperSubtitle() });
    }

    Object.entries(this.state.inventory).forEach(([kind, count]) => {
      for (let index = 0; index < (count ?? 0); index += 1) {
        this.addResource(kind as IngredientKind);
      }
    });

    if (day === 2) {
      this.addCard("recruit", SLOT_X[0], EVENT_Y);
      this.addCard("wage", SLOT_X[1], EVENT_Y);
    } else if (day === 3) {
      const timber = this.addCard("timber", SLOT_X[0], EVENT_Y);
      const bedding = this.addCard("bedding", SLOT_X[0], EVENT_Y + STACK_Y);
      bedding.stackTarget = timber.id;
      bedding.stackRank = ++this.stackSerial;
      this.layoutPile(timber);
    } else if (day === 4) {
      this.dealChoicePile(["choiceQuick", "choiceRich", "choiceBatch"]);
    } else if (day === 5 && !this.state.pantryBuilt) {
      this.addCard("pantryPlan", SLOT_X[0], EVENT_Y);
    } else if (day === 6) {
      this.addCard("leak", SLOT_X[0], EVENT_Y);
      this.addCard("repairKit", SLOT_X[1], EVENT_Y);
      this.dealChoicePile(["policyKind", "policyRate"], SLOT_X[2], EVENT_Y);
    } else if (day === 7) {
      this.dealChoicePile(["contractAccept", "contractDecline"]);
    } else if (day === 8 && !this.state.role) {
      this.dealChoicePile(["roleChef", "roleRunner", "roleSteward"]);
    } else if (day === 9 && !this.state.promotion) {
      this.dealChoicePile(["promoLantern", "promoPremium", "promoLimited"]);
    }
  }

  private dealChoicePile(kinds: CardKind[], x: number = SLOT_X[0], y: number = EVENT_Y) {
    let root: CardView | undefined;
    kinds.forEach((kind, index) => {
      const card = this.addCard(kind, x, y + index * STACK_Y);
      if (!root) {
        root = card;
      } else {
        card.stackTarget = root.id;
        card.stackRank = ++this.stackSerial;
      }
    });
    if (root) this.layoutPile(root);
  }

  private addCard(
    kind: CardKind,
    x: number,
    y: number,
    override?: { title?: string; subtitle?: string },
  ) {
    const id = kind + "-" + ++this.cardSerial;
    const spec = CARD_SPECS[kind];
    const container = this.add.container(x, y).setDepth(this.reserveCardDepths());
    const shadow = this.add.rectangle(3, 4, CARD_WIDTH, CARD_HEIGHT, 0x202018, 0.3);
    const glow = this.add.rectangle(0, 0, CARD_WIDTH + 8, CARD_HEIGHT + 8, 0xe3c75f, 0.02)
      .setStrokeStyle(3, 0xe3c75f, 1)
      .setAlpha(0);
    const body = this.add.rectangle(0, 0, CARD_WIDTH, CARD_HEIGHT, spec.paper, 1)
      .setStrokeStyle(2.5, 0x202018, 1);
    const stripe = this.add.rectangle(0, -52, CARD_WIDTH - 4, 20, spec.accent, 1)
      .setStrokeStyle(1.5, 0x202018, 1);
    const artPlate = this.add.rectangle(0, -10, 76, 60, 0xfff8d6, 1);

    let art: Phaser.GameObjects.Image | Phaser.GameObjects.Container;
    if (spec.atlas && spec.frame !== undefined) {
      art = this.add.image(0, -10, spec.atlas, spec.frame).setDisplaySize(70, 58);
    } else {
      art = this.createGlyphArt(spec.glyph ?? cardBadge(kind), spec.accent);
    }

    const typeText = this.crispText(-37, 23, spec.typeLabel, {
      fontFamily: UI_FONT,
      fontSize: "8px",
      color: "#4b4b35",
      fontStyle: "bold",
    }).setOrigin(0, 0);
    const displayTitle = override?.title ?? spec.title;
    const titleText = this.crispText(-37, -52, displayTitle, {
      fontFamily: UI_FONT,
      fontSize: displayTitle.length > 7 ? "10px" : "12px",
      color: "#202018",
      fontStyle: "bold",
      wordWrap: { width: 76 },
    }).setOrigin(0, 0.5);
    const divider = this.add.rectangle(-4, 34, 60, 1.5, 0x202018, 0.78);
    const subtitleText = this.crispText(-37, 38, "", {
      fontFamily: UI_FONT,
      fontSize: "8px",
      color: "#55523d",
      align: "left",
      wordWrap: { width: 56, useAdvancedWrap: true },
      maxLines: 3,
      lineSpacing: -1,
    }).setOrigin(0, 0);
    this.setCardSubtitleText(subtitleText, override?.subtitle ?? spec.subtitle);
    const badgeCircle = this.add.circle(32, 51, 10, 0x202018, 1).setStrokeStyle(1.5, 0xffefb0, 1);
    const badge = this.crispText(32, 51, kind === "coin" ? String(this.state.coins) : cardBadge(kind), {
      fontFamily: UI_FONT,
      fontSize: "9px",
      color: "#fff8cf",
      fontStyle: "bold",
    }).setOrigin(0.5);

    container.add([
      shadow,
      glow,
      body,
      stripe,
      artPlate,
      art,
      typeText,
      titleText,
      divider,
      subtitleText,
      badgeCircle,
      badge,
    ]);
    container.setSize(CARD_WIDTH, CARD_HEIGHT);
    container.setData("cardId", id);

    const card: CardView = {
      id,
      kind,
      container,
      glow,
      art,
      titleText,
      subtitleText,
      typeText,
      badge,
      homeX: x,
      homeY: y,
      stackRank: 0,
      locked: false,
      gone: false,
    };
    this.cards.set(id, card);
    this.enableCardInput(card);
    container.setScale(0.84).setAlpha(0);
    this.tweens.add({ targets: container, scale: 1, alpha: 1, duration: 250, ease: "Back.Out" });
    this.scheduleCollisionSettle(card, 300);
    return card;
  }

  private createGlyphArt(glyph: string, accent: number) {
    const art = this.add.container(0, -10);
    const halo = this.add.circle(0, 0, 27, 0xffef9d, 0.72);
    const ring = this.add.circle(0, 0, 20, accent, 0.92).setStrokeStyle(3, 0x202018, 1);
    const label = this.crispText(0, 0, glyph, {
      fontFamily: UI_FONT,
      fontSize: "18px",
      color: "#202018",
      fontStyle: "bold",
    }).setOrigin(0.5);
    art.add([halo, ring, label]);
    return art;
  }

  private setCardSubtitleText(text: Phaser.GameObjects.Text, copy: string) {
    text
      .setFontSize(copy.replace(/\s/g, "").length > 22 ? "7px" : "8px")
      .setWordWrapWidth(56, true)
      .setMaxLines(3)
      .setLineSpacing(-1)
      .setText(copy);
  }

  private enableCardInput(card: CardView) {
    if (card.gone || card.locked) return;
    const hitArea = new Phaser.Geom.Rectangle(0, 0, CARD_WIDTH, CARD_HEIGHT);
    if (card.container.input) {
      card.container.input.hitArea = hitArea;
      card.container.input.hitAreaCallback = Phaser.Geom.Rectangle.Contains;
      card.container.input.customHitArea = true;
      card.container.input.enabled = true;
    } else {
      card.container.setInteractive(hitArea, Phaser.Geom.Rectangle.Contains);
    }
    this.input.setDraggable(card.container);
    card.container.input!.cursor = "grab";
    this.enableHitAreaDebug(card.container, 0x2f8f2f);
  }

  private enableHitAreaDebug(gameObject: Phaser.GameObjects.GameObject, color: number) {
    if (!this.debugHitAreas || !gameObject.input || this.debuggedObjects.has(gameObject)) return;
    this.debuggedObjects.add(gameObject);
    this.input.enableDebug(gameObject, color);
  }

  private bindDragEvents() {
    this.input.on(
      Phaser.Input.Events.DRAG_START,
      (_pointer: Phaser.Input.Pointer, object: Phaser.GameObjects.GameObject) => {
        const card = this.cardFromObject(object);
        if (!card || card.locked || card.gone || this.summaryOpen) return;
        this.dragGroup = this.detachStack(card);
        const firstDepth = this.reserveCardDepths(this.dragGroup.length);
        this.dragGroup.forEach((member, index) => {
          this.tweens.killTweensOf(member.container);
          member.container.setDepth(firstDepth + index).setScale(1).setAngle(0);
          if (index > 0) {
            member.locked = true;
            member.container.disableInteractive();
          }
        });
        card.container.input!.cursor = "grabbing";
        const carried = this.dragGroup.length > 1 ? "，连带上层 " + (this.dragGroup.length - 1) + " 张" : "";
        this.hintText.setText("已拿起「" + card.titleText.text + "」" + carried + "\n拖到发绿光的卡牌上松手即可堆叠。");
      },
    );

    this.input.on(
      Phaser.Input.Events.DRAG,
      (_pointer: Phaser.Input.Pointer, object: Phaser.GameObjects.GameObject, dragX: number, dragY: number) => {
        const card = this.cardFromObject(object);
        if (!card || card.locked) return;
        const movingCards = this.dragGroup.length > 0 ? this.dragGroup : [card];
        const halfWidth = (CARD_WIDTH * Math.abs(card.container.scaleX)) / 2;
        const halfHeight = (CARD_HEIGHT * Math.abs(card.container.scaleY)) / 2;
        const rootX = Phaser.Math.Clamp(dragX, BOARD_LEFT + halfWidth, BOARD_RIGHT - halfWidth);
        const maximumRootY = Math.max(
          BOARD_TOP + halfHeight,
          BOARD_BOTTOM - halfHeight - (movingCards.length - 1) * STACK_Y,
        );
        const rootY = Phaser.Math.Clamp(dragY, BOARD_TOP + halfHeight, maximumRootY);
        movingCards.forEach((member, index) => {
          member.container.setPosition(rootX, rootY + index * STACK_Y);
        });
        this.updateDropTargetCue(this.findDropTarget(card));
      },
    );

    this.input.on(
      Phaser.Input.Events.DRAG_END,
      (_pointer: Phaser.Input.Pointer, object: Phaser.GameObjects.GameObject) => {
        const card = this.cardFromObject(object);
        if (!card || card.locked || card.gone) return;
        const movingCards = this.dragGroup.length > 0 ? this.dragGroup : [card];
        card.container.input!.cursor = "grab";
        movingCards.forEach((member, index) => {
          member.locked = false;
          member.container.setScale(1).setAngle(0);
          if (index > 0) this.enableCardInput(member);
        });
        const target = this.findDropTarget(card);
        this.updateDropTargetCue(undefined);
        if (target) {
          movingCards.forEach((member, index) => {
            member.stackTarget = index === 0 ? target.id : movingCards[index - 1].id;
            member.stackRank = ++this.stackSerial;
          });
          const root = this.findRoot(target);
          this.layoutPile(root);
          this.dragGroup = [];
          this.time.delayedCall(170, () => {
            if (root.gone) return;
            const moved = this.resolvePileCollisions(root);
            this.time.delayedCall(moved ? COLLISION_TWEEN_DURATION + 20 : 0, () => this.evaluatePile(root));
          });
        } else {
          movingCards.forEach((member) => {
            member.homeX = member.container.x;
            member.homeY = member.container.y;
          });
          const firstDepth = this.reserveCardDepths(movingCards.length);
          movingCards.forEach((member, index) => member.container.setDepth(firstDepth + index));
          this.dragGroup = [];
          this.resolvePileCollisions(card, true);
          this.refreshGuidance();
        }
      },
    );
  }

  private cardFromObject(object: Phaser.GameObjects.GameObject) {
    const id = object.getData("cardId") as string | undefined;
    return id ? this.cards.get(id) : undefined;
  }

  private updateDropTargetCue(target?: CardView) {
    if (this.hoverDropTarget?.id === target?.id) return;
    if (this.hoverDropTarget && !this.hoverDropTarget.gone) {
      this.tweens.killTweensOf(this.hoverDropTarget.glow);
      this.hoverDropTarget.glow.setAlpha(0);
    }
    this.hoverDropTarget = target;
    if (target) {
      this.tweens.killTweensOf(target.glow);
      target.glow.setStrokeStyle(3, 0x4d8f63, 1).setAlpha(0.95);
    }
  }

  private reserveCardDepths(count = 1) {
    const requested = Math.max(1, count);
    if (this.cardDepthSerial + requested >= CARD_DEPTH_CEILING) {
      const orderedCards = [...this.cards.values()]
        .filter((card) => !card.gone)
        .sort((left, right) => left.container.depth - right.container.depth || left.stackRank - right.stackRank);
      orderedCards.forEach((card, index) => card.container.setDepth(CARD_DEPTH_BASE + index));
      this.cardDepthSerial = CARD_DEPTH_BASE + orderedCards.length;
    }
    const firstDepth = this.cardDepthSerial + 1;
    this.cardDepthSerial += requested;
    return firstDepth;
  }

  private findDropTarget(card: CardView) {
    let best: CardView | undefined;
    let bestScore = 0;
    const draggedBounds = this.cardWorldBounds(card);
    const minimumOverlap = draggedBounds.width * draggedBounds.height * 0.08;
    this.cards.forEach((candidate) => {
      if (
        candidate.id === card.id
        || this.dragGroup.some((member) => member.id === candidate.id)
        || candidate.gone
        || candidate.locked
      ) return;
      const candidateBounds = this.cardWorldBounds(candidate);
      const overlapWidth = Math.max(
        0,
        Math.min(draggedBounds.right, candidateBounds.right) - Math.max(draggedBounds.left, candidateBounds.left),
      );
      const overlapHeight = Math.max(
        0,
        Math.min(draggedBounds.bottom, candidateBounds.bottom) - Math.max(draggedBounds.top, candidateBounds.top),
      );
      const overlapArea = overlapWidth * overlapHeight;
      const score = overlapArea + candidate.container.depth * 0.001;
      if (overlapArea >= minimumOverlap && score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    });
    return best;
  }

  private cardWorldBounds(card: CardView) {
    const width = CARD_WIDTH * Math.abs(card.container.scaleX);
    const height = CARD_HEIGHT * Math.abs(card.container.scaleY);
    return new Phaser.Geom.Rectangle(
      card.container.x - width / 2,
      card.container.y - height / 2,
      width,
      height,
    );
  }

  private detachStack(card: CardView) {
    const pile = this.getPile(card);
    const pickedIndex = pile.findIndex((member) => member.id === card.id);
    const stayingCards = pickedIndex > 0 ? pile.slice(0, pickedIndex) : [];
    const movingCards = pile.slice(Math.max(0, pickedIndex));

    pile.forEach((member) => this.tweens.killTweensOf(member.container));
    this.normalizePile(stayingCards);
    this.normalizePile(movingCards);
    if (stayingCards.length > 0) this.layoutPile(stayingCards[0]);
    return movingCards;
  }

  private normalizePile(pile: CardView[]) {
    pile.forEach((member, index) => {
      member.stackTarget = index === 0 ? undefined : pile[index - 1].id;
      member.stackRank = index === 0 ? 0 : ++this.stackSerial;
    });
  }

  private findRoot(card: CardView) {
    let current = card;
    const seen = new Set<string>();
    while (current.stackTarget && !seen.has(current.id)) {
      seen.add(current.id);
      const next = this.cards.get(current.stackTarget);
      if (!next || next.gone) break;
      current = next;
    }
    return current;
  }

  private getPile(card: CardView) {
    const root = this.findRoot(card);
    return [...this.cards.values()]
      .filter((candidate) => !candidate.gone && this.findRoot(candidate).id === root.id)
      .sort((left, right) => left.stackRank - right.stackRank);
  }

  private layoutPile(card: CardView) {
    const root = this.findRoot(card);
    const pile = this.getPile(root);
    const minimumRootY = BOARD_TOP + CARD_HEIGHT / 2;
    const maximumRootY = Math.max(
      minimumRootY,
      BOARD_BOTTOM - CARD_HEIGHT / 2 - (pile.length - 1) * STACK_Y,
    );
    const rootX = Phaser.Math.Clamp(
      root.container.x,
      BOARD_LEFT + CARD_WIDTH / 2,
      BOARD_RIGHT - CARD_WIDTH / 2,
    );
    const rootY = Phaser.Math.Clamp(root.container.y, minimumRootY, maximumRootY);
    const firstDepth = this.reserveCardDepths(pile.length);
    pile.forEach((member, index) => {
      member.container.setDepth(firstDepth + index);
      this.tweens.add({
        targets: member.container,
        x: rootX,
        y: rootY + index * STACK_Y,
        angle: 0,
        duration: 150,
        ease: "Sine.Out",
      });
    });
  }

  private scheduleCollisionSettle(card: CardView, delay = COLLISION_TWEEN_DURATION) {
    this.pendingCollisionCardId = card.id;
    this.collisionSettleTimer?.remove(false);
    this.collisionSettleTimer = this.time.delayedCall(delay, () => {
      this.collisionSettleTimer = undefined;
      const pendingId = this.pendingCollisionCardId;
      this.pendingCollisionCardId = undefined;
      const pendingCard = pendingId ? this.cards.get(pendingId) : undefined;
      if (!pendingCard || pendingCard.gone) return;
      if (this.dragGroup.length > 0) {
        this.scheduleCollisionSettle(pendingCard, 160);
        return;
      }
      this.resolvePileCollisions(pendingCard);
    });
  }

  private getPileRoots() {
    return [...this.cards.values()].filter(
      (card) => !card.gone && this.findRoot(card).id === card.id,
    );
  }

  private pileBoundsAt(x: number, y: number, height: number) {
    return new Phaser.Geom.Rectangle(
      x - CARD_WIDTH / 2,
      y - CARD_HEIGHT / 2,
      CARD_WIDTH,
      height,
    );
  }

  private pileRectsOverlap(left: Phaser.Geom.Rectangle, right: Phaser.Geom.Rectangle) {
    return left.left < right.right + PILE_GAP
      && left.right > right.left - PILE_GAP
      && left.top < right.bottom + PILE_GAP
      && left.bottom > right.top - PILE_GAP;
  }

  private pilePositionCollides(
    pile: PileLayout,
    x: number,
    y: number,
    piles: PileLayout[],
    positions: Map<string, { x: number; y: number }>,
    onlyLocked = false,
  ) {
    const bounds = this.pileBoundsAt(x, y, pile.height);
    return piles.some((other) => {
      if (other.root.id === pile.root.id || (onlyLocked && !other.locked)) return false;
      const position = positions.get(other.root.id) ?? {
        x: other.root.container.x,
        y: other.root.container.y,
      };
      return this.pileRectsOverlap(bounds, this.pileBoundsAt(position.x, position.y, other.height));
    });
  }

  private findNearestOpenPilePosition(
    pile: PileLayout,
    desiredX: number,
    desiredY: number,
    piles: PileLayout[],
    positions: Map<string, { x: number; y: number }>,
  ) {
    const pileHeight = pile.height;
    const minimumX = BOARD_LEFT + CARD_WIDTH / 2;
    const maximumX = BOARD_RIGHT - CARD_WIDTH / 2;
    const minimumY = BOARD_TOP + CARD_HEIGHT / 2;
    const maximumY = Math.max(minimumY, BOARD_BOTTOM - pileHeight + CARD_HEIGHT / 2);
    const originX = Phaser.Math.Clamp(desiredX, minimumX, maximumX);
    const originY = Phaser.Math.Clamp(desiredY, minimumY, maximumY);
    let best: { x: number; y: number } | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;

    const consider = (candidateX: number, candidateY: number) => {
      const x = Phaser.Math.Clamp(candidateX, minimumX, maximumX);
      const y = Phaser.Math.Clamp(candidateY, minimumY, maximumY);
      if (this.pilePositionCollides(pile, x, y, piles, positions)) return;
      const distance = (x - originX) ** 2 + (y - originY) ** 2;
      if (distance < bestDistance) {
        best = { x, y };
        bestDistance = distance;
      }
    };

    consider(originX, originY);
    if (bestDistance === 0) return best;

    piles.forEach((other) => {
      if (other.root.id === pile.root.id) return;
      const position = positions.get(other.root.id) ?? {
        x: other.root.container.x,
        y: other.root.container.y,
      };
      const bounds = this.pileBoundsAt(position.x, position.y, other.height);
      consider(bounds.left - PILE_GAP - CARD_WIDTH / 2, originY);
      consider(bounds.right + PILE_GAP + CARD_WIDTH / 2, originY);
      consider(originX, bounds.top - PILE_GAP - pileHeight + CARD_HEIGHT / 2);
      consider(originX, bounds.bottom + PILE_GAP + CARD_HEIGHT / 2);
      consider(bounds.left - PILE_GAP - CARD_WIDTH / 2, position.y);
      consider(bounds.right + PILE_GAP + CARD_WIDTH / 2, position.y);
    });

    for (let y = minimumY; y <= maximumY; y += COLLISION_SEARCH_STEP) {
      for (let x = minimumX; x <= maximumX; x += COLLISION_SEARCH_STEP) consider(x, y);
      consider(maximumX, y);
    }
    for (let x = minimumX; x <= maximumX; x += COLLISION_SEARCH_STEP) consider(x, maximumY);
    consider(maximumX, maximumY);
    return best;
  }

  private animatePileTo(root: CardView, x: number, y: number) {
    const pile = this.getPile(root);
    pile.forEach((member, index) => {
      this.tweens.killTweensOf(member.container);
      this.tweens.add({
        targets: member.container,
        x,
        y: y + index * STACK_Y,
        angle: 0,
        duration: COLLISION_TWEEN_DURATION,
        ease: "Back.Out",
      });
    });
  }

  private resolvePileCollisions(preferredCard: CardView, updatePreferredHome = false) {
    if (preferredCard.gone || this.dragGroup.length > 0) return false;
    const roots = this.getPileRoots();
    if (roots.length < 2) return false;
    const preferredRoot = this.findRoot(preferredCard);
    const piles: PileLayout[] = roots.map((root) => {
      const pile = this.getPile(root);
      return {
        root,
        height: CARD_HEIGHT + (pile.length - 1) * STACK_Y,
        locked: pile.some((card) => card.locked),
      };
    });
    const preferredPile = piles.find((pile) => pile.root.id === preferredRoot.id);
    if (!preferredPile) return false;
    const positions = new Map(
      roots.map((root) => [root.id, { x: root.container.x, y: root.container.y }] as const),
    );
    const originalPositions = new Map(
      roots.map((root) => [root.id, { x: root.container.x, y: root.container.y }] as const),
    );
    const preferredPosition = positions.get(preferredRoot.id);

    if (
      preferredPosition
      && !preferredPile.locked
      && this.pilePositionCollides(
        preferredPile,
        preferredPosition.x,
        preferredPosition.y,
        piles,
        positions,
        true,
      )
    ) {
      const openPosition = this.findNearestOpenPilePosition(
        preferredPile,
        preferredPosition.x,
        preferredPosition.y,
        piles,
        positions,
      );
      if (openPosition) positions.set(preferredRoot.id, openPosition);
    }

    const anchor = positions.get(preferredRoot.id) ?? preferredPosition;
    const movablePiles = piles
      .filter((pile) => pile.root.id !== preferredRoot.id && !pile.locked)
      .sort((left, right) => {
        if (!anchor) return 0;
        const leftPosition = positions.get(left.root.id) ?? {
          x: left.root.container.x,
          y: left.root.container.y,
        };
        const rightPosition = positions.get(right.root.id) ?? {
          x: right.root.container.x,
          y: right.root.container.y,
        };
        const leftDistance = (leftPosition.x - anchor.x) ** 2 + (leftPosition.y - anchor.y) ** 2;
        const rightDistance = (rightPosition.x - anchor.x) ** 2 + (rightPosition.y - anchor.y) ** 2;
        return leftDistance - rightDistance;
      });

    movablePiles.forEach((pile) => {
      const position = positions.get(pile.root.id) ?? {
        x: pile.root.container.x,
        y: pile.root.container.y,
      };
      if (!this.pilePositionCollides(pile, position.x, position.y, piles, positions)) return;
      const openPosition = this.findNearestOpenPilePosition(pile, position.x, position.y, piles, positions);
      if (openPosition) positions.set(pile.root.id, openPosition);
    });

    let moved = false;
    roots.forEach((root) => {
      const original = originalPositions.get(root.id);
      const destination = positions.get(root.id);
      if (!original || !destination) return;
      if (Math.abs(original.x - destination.x) < 0.5 && Math.abs(original.y - destination.y) < 0.5) return;
      moved = true;
      if (updatePreferredHome && root.id === preferredRoot.id) {
        this.getPile(root).forEach((member, index) => {
          member.homeX = destination.x;
          member.homeY = destination.y + index * STACK_Y;
        });
      }
      this.animatePileTo(root, destination.x, destination.y);
    });
    return moved;
  }

  private exactWithWorker(pile: CardView[], nonWorkerKinds: CardKind[]) {
    const workers = pile.filter((card) => isWorkerKind(card.kind));
    const others = pile.filter((card) => !isWorkerKind(card.kind));
    return workers.length === 1 && exactKinds(others, nonWorkerKinds);
  }

  private evaluatePile(card: CardView) {
    if (this.summaryOpen) return;
    const root = this.findRoot(card);
    const pile = this.getPile(root);
    if (pile.some((member) => member.locked)) return;

    if (exactKinds(pile, ["ledger", "inn"])) {
      if (this.activeRecipeCount > 0) {
        this.showToast("还有活计没做完", "可以继续经营，但要等所有进度结束后再合账打烊。", 2200);
        this.scatterPile(pile);
        return;
      }
      this.runRecipe(root, pile, "合上账簿 · 今日打烊", 620, () => this.resolveLedger(pile));
      return;
    }
    if (this.exactWithWorker(pile, ["coin", "market"])) {
      if (this.state.day === 4 && !this.state.specialty) {
        this.showToast("先定招牌菜", "菜谱会改变要买的食材；先从三张菜谱中选定一张。", 2200);
        this.scatterPile(pile);
        return;
      }
      const cost = this.getPurchaseCost(pile);
      if (!this.ensureFunds(cost, pile)) return;
      const stewardAssigned = this.state.role === "steward" && pile.some((item) => item.kind === "helper");
      this.runRecipe(root, pile, "过秤、付钱、装篮", stewardAssigned ? 700 : 980, () => this.resolvePurchase(pile, cost));
      return;
    }

    const ingredients = this.getRecipeIngredients();
    if (this.exactWithWorker(pile, ["stove", ...ingredients])) {
      this.runRecipe(root, pile, "起火下锅 · 香气渐浓", this.getCookDuration(pile), () => this.resolveCooking(pile));
      return;
    }

    const dish = pile.find((item) => isDishKind(item.kind));
    const guest = pile.find((item) => isGuestKind(item.kind));
    const runnerAssigned = this.state.role === "runner" && pile.length === 3 && pile.some((item) => item.kind === "helper");
    if (dish && guest && (pile.length === 2 || runnerAssigned)) {
      this.runRecipe(root, pile, "热菜上桌", runnerAssigned ? 480 : 720, () => this.resolveServing(dish, guest, pile));
      return;
    }

    if (pile.length === 2 || (this.state.role === "steward" && pile.length === 3 && pile.some((item) => item.kind === "helper"))) {
      const room = pile.find((item) => item.kind === "room");
      const lodger = pile.find((item) => item.kind === "sleepyGuest" || item.kind === "strandedGuest");
      if (room && lodger) {
        if (this.state.day === 6 && !this.state.rainPolicy) {
          this.showToast("先定雨夜房价", "选择薄收暖心或照价收房，再安排旅人入住。", 2200);
          this.scatterPile(pile);
          return;
        }
        const stewardAssigned = pile.some((item) => item.kind === "helper");
        this.runRecipe(root, pile, "铺床、添灯、安顿住客", stewardAssigned ? 620 : 900, () => this.resolveLodging(room, lodger, pile));
        return;
      }
    }

    if (this.exactWithWorker(pile, ["dirtyRoom"])) {
      const stewardAssigned = this.state.role === "steward" && pile.some((item) => item.kind === "helper");
      this.runRecipe(root, pile, "换被褥 · 扫净客房", stewardAssigned ? 520 : 880, () => this.resolveCleaning(pile));
      return;
    }

    if (this.state.day === 1 && exactKinds(pile, ["owner", "coin", "stall"])) {
      if (this.dayServed < 2) {
        this.showToast("门灯还点不亮", "先招待两位客人，让街坊认识你的手艺。", 2100);
        this.scatterPile(pile);
        return;
      }
      if (!this.ensureFunds(12, pile)) return;
      this.runRecipe(root, pile, "搭屋檐、挂门灯", 1500, () => this.resolveInnUpgrade(pile));
      return;
    }

    if (this.state.day === 2 && exactKinds(pile, ["owner", "coin", "recruit"])) {
      if (!this.ensureFunds(3, pile)) return;
      this.runRecipe(root, pile, "谈妥工钱 · 按下手印", 900, () => this.resolveRecruit(pile));
      return;
    }
    if (this.state.day === 2 && exactKinds(pile, ["helper", "coin", "wage"])) {
      if (!this.ensureFunds(2, pile)) return;
      this.runRecipe(root, pile, "数清今日工钱", 620, () => this.resolveWage(pile));
      return;
    }

    if (this.state.day === 3 && exactKinds(pile, ["owner", "coin", "timber", "bedding", "inn"])) {
      if (!this.ensureFunds(8, pile)) return;
      this.runRecipe(root, pile, "立木架、铺床榻", 1450, () => this.resolveRoomBuild(pile));
      return;
    }

    if (this.state.day === 4) {
      const specialtyCard = pile.find((item) => ["choiceQuick", "choiceRich", "choiceBatch"].includes(item.kind));
      if (specialtyCard && exactKinds(pile, [specialtyCard.kind, "inn"])) {
        this.runRecipe(root, pile, "把菜谱抄进店账", 800, () => this.resolveSpecialty(specialtyCard, pile));
        return;
      }
    }

    if (this.state.day === 5 && exactKinds(pile, ["owner", "coin", "pantryPlan", "inn"])) {
      if (!this.ensureFunds(8, pile)) return;
      this.runRecipe(root, pile, "钉木架、封窗缝", 1350, () => this.resolvePantryBuild(pile));
      return;
    }

    if (this.state.day === 6 && this.exactWithWorker(pile, ["coin", "repairKit", "leak"])) {
      if (!this.ensureFunds(6, pile)) return;
      this.runRecipe(root, pile, "扶梯上瓦 · 补住风雨", 1350, () => this.resolveRepair(pile));
      return;
    }
    if (this.state.day === 6) {
      const policy = pile.find((item) => item.kind === "policyKind" || item.kind === "policyRate");
      if (policy && exactKinds(pile, [policy.kind, "inn"])) {
        this.runRecipe(root, pile, "写下今夜房价", 620, () => this.resolveRainPolicy(policy, pile));
        return;
      }
    }

    if (this.state.day === 7) {
      const contract = pile.find((item) => item.kind === "contractAccept" || item.kind === "contractDecline");
      if (contract && exactKinds(pile, [contract.kind, "inn"])) {
        this.runRecipe(root, pile, "商量团单 · 落定主意", 720, () => this.resolveContractChoice(contract, pile));
        return;
      }
    }

    if (this.state.day === 8) {
      const role = pile.find((item) => ["roleChef", "roleRunner", "roleSteward"].includes(item.kind));
      if (role && exactKinds(pile, [role.kind, "helper"])) {
        this.runRecipe(root, pile, "阿满正式领下岗位", 820, () => this.resolveRoleChoice(role, pile));
        return;
      }
    }

    if (this.state.day === 9) {
      const promotion = pile.find((item) => ["promoLantern", "promoPremium", "promoLimited"].includes(item.kind));
      if (promotion && exactKinds(pile, [promotion.kind, "inn"])) {
        this.runRecipe(root, pile, "挂出今日招牌", 720, () => this.resolvePromotionChoice(promotion, pile));
        return;
      }
    }

    if (this.state.day === 10 && exactKinds(pile, ["owner", "banquet", "inn"])) {
      this.runRecipe(root, pile, "开席 · 春灯午宴", 1150, () => this.resolveBanquetOpen(pile));
      return;
    }

    const titles = pile.map((item) => "「" + item.titleText.text + "」").join(" + ");
    this.hintText.setText(titles + " 暂时凑不成一件事。抓走最上面的牌，再换一种叠法。");
    this.pulsePile(pile, 0xd07a39);
  }

  private runRecipe(
    root: CardView,
    pile: CardView[],
    label: string,
    duration: number,
    resolve: () => void,
  ) {
    this.activeRecipeCount += 1;
    pile.forEach((card) => {
      card.locked = true;
      card.container.disableInteractive();
    });
    this.clearHighlights();

    const panelX = Phaser.Math.Clamp(root.container.x, 64, 366);
    const panelY = Phaser.Math.Clamp(root.container.y - 82, 202, 726);
    const panel = this.add.container(panelX, panelY).setDepth(4500 + this.activeRecipeCount);
    const back = this.add.rectangle(0, 0, 104, 40, 0x3b2b24, 0.98).setStrokeStyle(1.5, 0xc09a65, 1);
    const compactLabel = label.length > 9 ? label.slice(0, 9) + "…" : label;
    const text = this.crispText(0, -7, compactLabel, {
      fontFamily: UI_FONT,
      fontSize: "9px",
      color: "#fff0d2",
      fontStyle: "bold",
    }).setOrigin(0.5);
    const track = this.add.rectangle(0, 10, 82, 6, 0x1e1714, 1);
    const fill = this.add.rectangle(-41, 10, 82, 6, 0xd9a84b, 1).setOrigin(0, 0.5).setScale(0, 1);
    panel.add([back, text, track, fill]);
    this.tweens.add({ targets: fill, scaleX: 1, duration, ease: "Sine.InOut" });
    this.tweens.add({
      targets: pile.map((item) => item.container),
      y: "+=2",
      yoyo: true,
      repeat: Math.max(2, Math.floor(duration / 190)),
      duration: 85,
      ease: "Sine.InOut",
    });
    this.refreshAll();

    this.time.delayedCall(duration, () => {
      panel.destroy(true);
      this.activeRecipeCount = Math.max(0, this.activeRecipeCount - 1);
      resolve();
      this.refreshAll();
    });
  }

  private ensureFunds(cost: number, pile: CardView[]) {
    if (this.state.coins >= cost) return true;
    if (!this.dayFlags.has("credit") && this.state.coins + 5 >= cost) {
      this.dayFlags.add("credit");
      this.state.coins += 5;
      this.animateCoinGain(5);
      this.state.reputation = Math.max(0, this.state.reputation - 1);
      this.state.morale = Math.max(0, this.state.morale - 5);
      this.showToast("向街坊赊来五文", "解了眼前急，但口碑与人心都受了点损。", 2400);
      this.refreshAll();
      return true;
    }
    this.showToast("钱串不够", "这笔买卖还差 " + (cost - this.state.coins) + " 文。先做现有生意回笼铜钱。", 2200);
    this.scatterPile(pile);
    return false;
  }

  private spend(cost: number) {
    this.state.coins -= cost;
    this.state.lifetimeSpent += cost;
    this.daySpent += cost;
  }

  private earn(amount: number) {
    this.state.coins += amount;
    this.state.lifetimeEarnings += amount;
    this.dayEarnings += amount;
    this.animateCoinGain(amount);
  }

  private updateCoinDisplay() {
    this.coinHud.setText("钱 " + this.state.coins);
    this.cards.forEach((card) => {
      if (card.kind !== "coin" || card.gone) return;
      card.badge.setText(String(this.state.coins));
      this.setCardSubtitleText(card.subtitleText, this.getCoinSubtitle());
    });
  }

  private animateCoinGain(amount: number) {
    if (amount <= 0) return;
    this.updateCoinDisplay();
    const lane = this.activeCoinGainAnimations % 3;
    this.activeCoinGainAnimations += 1;

    this.time.delayedCall(0, () => {
      const coin = [...this.cards.values()]
        .filter((card) => card.kind === "coin" && !card.gone)
        .sort((left, right) => right.container.depth - left.container.depth)[0];
      if (!coin) {
        this.activeCoinGainAnimations = Math.max(0, this.activeCoinGainAnimations - 1);
        return;
      }

      const xOffset = lane === 1 ? -18 : lane === 2 ? 18 : 0;
      const startX = coin.container.x + xOffset;
      const startY = coin.container.y - 28 - lane * 10;
      const burst = this.add.container(startX, startY)
        .setDepth(5200 + lane)
        .setScale(0.58)
        .setAlpha(0);
      const halo = this.add.circle(0, 0, 28, 0xffe27a, 0.28)
        .setStrokeStyle(3, 0x4f873f, 0.95);
      const gainText = this.crispText(0, 0, "+" + amount + " 文", {
        fontFamily: UI_FONT,
        fontSize: "18px",
        color: "#fff2a8",
        fontStyle: "bold",
        stroke: "#355a2e",
        strokeThickness: 5,
      }).setOrigin(0.5);
      burst.add([halo, gainText]);

      this.tweens.killTweensOf(coin.badge);
      coin.badge.setScale(1.65);
      this.tweens.add({
        targets: coin.badge,
        scale: 1,
        duration: 460,
        ease: "Bounce.Out",
      });

      const cardFlash = this.add.rectangle(0, 0, CARD_WIDTH + 10, CARD_HEIGHT + 10, 0x4f9b50, 0)
        .setStrokeStyle(5, 0x4f9b50, 1)
        .setScale(0.92);
      coin.container.add(cardFlash);
      this.tweens.add({
        targets: cardFlash,
        alpha: 0,
        scale: 1.1,
        duration: 760,
        ease: "Sine.Out",
        onComplete: () => cardFlash.destroy(),
      });

      this.tweens.killTweensOf(this.coinHud);
      this.coinHud.setScale(1.18);
      this.tweens.add({
        targets: this.coinHud,
        scale: 1,
        duration: 420,
        ease: "Back.Out",
      });

      this.tweens.add({
        targets: burst,
        y: startY - 38,
        alpha: 1,
        scale: 1.08,
        duration: 330,
        ease: "Back.Out",
        onComplete: () => {
          this.tweens.add({
            targets: burst,
            y: burst.y - 28,
            alpha: 0,
            scale: 1.24,
            duration: 360,
            ease: "Sine.In",
            onComplete: () => {
              burst.destroy(true);
              this.activeCoinGainAnimations = Math.max(0, this.activeCoinGainAnimations - 1);
            },
          });
        },
      });
    });
  }

  private resolvePurchase(pile: CardView[], cost: number) {
    this.spend(cost);
    this.dayPurchases += 1;
    this.hotStreak = 0;
    this.useWorker(pile);
    this.returnCards(pile);
    const sets = this.state.pantryBuilt ? 2 : 1;
    const ingredients = this.getRecipeIngredients();
    for (let set = 0; set < sets; set += 1) {
      ingredients.forEach((kind) => this.addResource(kind));
    }
    this.showToast(
      sets === 2 ? "储藏间装得下整批货" : "采买归来",
      sets === 2 ? "一次带回两套食材，后面的忙碌会轻松许多。" : "食材已经摆上经营桌。",
      1800,
    );
  }

  private resolveCooking(pile: CardView[]) {
    const chefAssigned = this.state.role === "chef" && pile.some((card) => card.kind === "helper");
    const ingredients = pile.filter((card) => isIngredientKind(card.kind));
    ingredients.forEach((card) => this.removeCard(card));
    const reusable = pile.filter((card) => !isIngredientKind(card.kind));
    this.useWorker(pile);
    this.returnCards(reusable);

    const dish = this.getCurrentDish();
    let outputCount = this.state.specialty === "batch" ? 2 : 1;
    if (chefAssigned) outputCount += 1;
    if (this.state.day === 9 && this.state.promotion === "limited") outputCount += 1;
    this.dayCooked += outputCount;
    for (let index = 0; index < outputCount; index += 1) this.addDish(dish);
    this.showToast(
      outputCount > 1 ? "一锅出了 " + outputCount + " 份" : "热菜出锅",
      chefAssigned ? "阿满真正叠进灶台掌勺，这一锅才吃到厨工加成。" : CARD_SPECS[dish].subtitle,
      1700,
    );
  }

  private resolveServing(dish: CardView, guest: CardView, pile: CardView[]) {
    const runnerAssigned = this.state.role === "runner" && pile.some((card) => card.kind === "helper");
    const streakBonus = Math.min(3, this.hotStreak);
    const payout = this.getDishPayout(dish.kind as DishKind, runnerAssigned) + streakBonus;
    const reputationGain = this.getServiceReputation(dish.kind as DishKind, runnerAssigned);
    const x = guest.container.x;
    const y = guest.container.y;
    this.useWorker(pile);
    this.removeCard(dish);
    this.removeCard(guest);
    this.returnCards(pile.filter((card) => card.kind === "helper"));
    this.earn(payout);
    this.dayServed += 1;
    this.hotStreak += 1;
    this.state.totalServed += 1;
    this.state.reputation += reputationGain;
    const moraleGain = this.state.specialty === "quick" ? 2 : 1;
    this.state.morale = Phaser.Math.Clamp(this.state.morale + moraleGain, 0, 100);
    if (dish.kind === this.getCurrentDish()) this.daySpecialServed += 1;
    this.floatReward(
      x,
      y,
      "+" + payout + " 文 · 口碑 +" + reputationGain + (streakBonus > 0 ? " · 连桌 +" + streakBonus : ""),
    );
    if (streakBonus > 0 && this.state.day === 4 && !this.dayFlags.has("streakTaught")) {
      this.dayFlags.add("streakTaught");
      this.showToast("触发连桌奖金", "不重新采买就连续上菜，热气不断，后桌会多付赏钱。", 2300);
    }
    this.checkDayMilestones();
    this.time.delayedCall(360, () => this.spawnNextGuest());
  }

  private resolveLodging(room: CardView, guest: CardView, pile: CardView[]) {
    const stewardAssigned = this.state.role === "steward" && pile.some((card) => card.kind === "helper");
    let payout = 10;
    let reputationGain = 1;
    if (this.state.day === 6 && this.state.rainPolicy === "kind") {
      payout = 6;
      reputationGain = 2;
      this.state.morale = Phaser.Math.Clamp(this.state.morale + 5, 0, 100);
    } else if (this.state.day === 6 && this.state.rainPolicy === "rate") {
      payout = 12;
      reputationGain = 0;
      this.state.morale = Phaser.Math.Clamp(this.state.morale - 2, 0, 100);
    }

    const x = room.container.x;
    const y = room.container.y;
    this.useWorker(pile);
    this.removeCard(guest);
    this.returnCards(pile.filter((card) => card.kind === "helper"));
    this.earn(payout);
    this.dayLodged += 1;
    this.state.totalLodged += 1;
    this.state.reputation += reputationGain;
    room.stackTarget = undefined;
    room.stackRank = 0;
    this.setCardKind(room, "dirtyRoom");
    this.returnCards([room]);
    this.floatReward(x, y, "+" + payout + " 文 · 留宿");

    if (stewardAssigned) {
      this.time.delayedCall(520, () => {
        if (!room.gone) {
          this.setCardKind(room, "room");
          this.dayCleaned += 1;
          this.showToast("管事随手整好客房", "把阿满叠进入住操作，省下了一次专门打扫。", 1700);
          this.refreshAll();
          this.spawnNextGuest();
        }
      });
    } else {
      this.time.delayedCall(360, () => this.spawnNextGuest());
    }
  }

  private resolveCleaning(pile: CardView[]) {
    const room = pile.find((card) => card.kind === "dirtyRoom");
    if (!room) return;
    this.useWorker(pile);
    this.setCardKind(room, "room");
    this.dayCleaned += 1;
    this.state.morale = Phaser.Math.Clamp(this.state.morale + 1, 0, 100);
    this.returnCards(pile);
    this.showToast("客房重新整洁", "下一位投宿客可以入住了。", 1600);
    this.time.delayedCall(240, () => this.spawnNextGuest());
  }

  private resolveInnUpgrade(pile: CardView[]) {
    const stall = pile.find((card) => card.kind === "stall");
    this.spend(12);
    this.state.reputation += 1;
    this.state.innBuilt = true;
    if (stall) this.setCardKind(stall, "inn");
    this.returnCards(pile);
    this.showToast("面摊有了屋檐", "第一盏门灯亮起，真正的十日经营开始了。", 2300);
  }

  private resolveRecruit(pile: CardView[]) {
    const notice = pile.find((card) => card.kind === "recruit");
    this.spend(3);
    this.state.recruited = true;
    if (notice) this.removeCard(notice);
    this.returnCards(pile.filter((card) => card.kind !== "recruit"));
    this.addCard("helper", SLOT_X[3], SUPPORT_Y);
    this.showToast("阿满入店", "多一人可以分头采买与下厨，但打烊前别忘了工钱。", 2300);
    this.time.delayedCall(320, () => this.spawnNextGuest());
  }

  private resolveWage(pile: CardView[]) {
    const wage = pile.find((card) => card.kind === "wage");
    this.spend(2);
    this.wagePaid = true;
    if (wage) this.removeCard(wage);
    this.returnCards(pile.filter((card) => card.kind !== "wage"));
    this.state.morale = Phaser.Math.Clamp(this.state.morale + 3, 0, 100);
    this.showToast("工钱当日结清", "阿满把两文钱仔细收进腰包。", 1700);
  }

  private resolveRoomBuild(pile: CardView[]) {
    this.spend(8);
    this.state.roomBuilt = true;
    pile.filter((card) => card.kind === "timber" || card.kind === "bedding").forEach((card) => this.removeCard(card));
    this.returnCards(pile.filter((card) => card.kind !== "timber" && card.kind !== "bedding"));
    this.addCard("room", SLOT_X[3], FACILITY_Y);
    this.showToast("第一间客房落成", "住店收入稳定，但每位客人离开后都要重新打扫。", 2300);
  }

  private resolveSpecialty(choice: CardView, pile: CardView[]) {
    const specialty: Specialty = choice.kind === "choiceQuick" ? "quick" : choice.kind === "choiceRich" ? "rich" : "batch";
    this.state.specialty = specialty;
    this.removeChoiceCards(["choiceQuick", "choiceRich", "choiceBatch"]);
    this.returnCards(pile.filter((card) => card.kind === "inn"));
    this.showToast("招牌菜已定", CARD_SPECS[this.getCurrentDish()].subtitle, 2300);
    this.time.delayedCall(340, () => this.spawnNextGuest());
  }

  private resolvePantryBuild(pile: CardView[]) {
    const plan = pile.find((card) => card.kind === "pantryPlan");
    this.spend(8);
    this.state.pantryBuilt = true;
    if (plan) this.removeCard(plan);
    this.returnCards(pile.filter((card) => card.kind !== "pantryPlan"));
    this.addCard("pantry", SLOT_X[0], SUPPORT_Y);
    this.updateMarketCard();
    this.showToast("储藏间修好", "以后一次采买两套食材，没用完的还能留到明日。", 2300);
  }

  private resolveRepair(pile: CardView[]) {
    this.spend(6);
    this.leakFixed = true;
    this.state.reputation += 2;
    pile.filter((card) => card.kind === "leak" || card.kind === "repairKit").forEach((card) => this.removeCard(card));
    this.returnCards(pile.filter((card) => card.kind !== "leak" && card.kind !== "repairKit"));
    this.showToast("屋檐补住了", "雨声还在，客人却终于能安心坐下。口碑 +2。", 2200);
  }

  private resolveRainPolicy(choice: CardView, pile: CardView[]) {
    this.state.rainPolicy = choice.kind === "policyKind" ? "kind" : "rate";
    this.removeChoiceCards(["policyKind", "policyRate"]);
    this.returnCards(pile.filter((card) => card.kind === "inn"));
    this.showToast(
      this.state.rainPolicy === "kind" ? "今夜薄收房钱" : "今夜照价收房",
      this.state.rainPolicy === "kind" ? "每间少赚几文，但旅人会记住这份暖意。" : "守住现金流，但不会额外得到口碑。",
      2200,
    );
    this.time.delayedCall(300, () => this.spawnNextGuest());
  }

  private resolveContractChoice(choice: CardView, pile: CardView[]) {
    const accepted = choice.kind === "contractAccept";
    this.contractChoice = accepted ? "accept" : "decline";
    this.state.caravanAccepted = accepted;
    this.removeChoiceCards(["contractAccept", "contractDecline"]);
    this.returnCards(pile.filter((card) => card.kind === "inn"));
    if (accepted) {
      this.earn(10);
      this.showToast("收下十文定金", "四位商队客人会依次进门；全部招待完再结尾款。", 2400);
    } else {
      this.state.morale = Phaser.Math.Clamp(this.state.morale + 3, 0, 100);
      this.showToast("婉拒团单", "今天只做三桌普通生意，店里人心轻松了些。", 2200);
    }
    this.time.delayedCall(320, () => this.spawnNextGuest());
  }

  private resolveRoleChoice(choice: CardView, pile: CardView[]) {
    const role: StaffRole = choice.kind === "roleChef" ? "chef" : choice.kind === "roleRunner" ? "runner" : "steward";
    this.state.role = role;
    this.removeChoiceCards(["roleChef", "roleRunner", "roleSteward"]);
    const helper = pile.find((card) => card.kind === "helper");
    if (helper) this.setCardSubtitleText(helper.subtitleText, this.getHelperSubtitle());
    this.returnCards(pile.filter((card) => card.kind === "helper"));
    this.showToast("阿满正式上岗", this.getHelperSubtitle(), 2300);
    this.time.delayedCall(320, () => this.spawnNextGuest());
  }

  private resolvePromotionChoice(choice: CardView, pile: CardView[]) {
    const promotion: Promotion = choice.kind === "promoLantern" ? "lantern" : choice.kind === "promoPremium" ? "premium" : "limited";
    this.state.promotion = promotion;
    this.removeChoiceCards(["promoLantern", "promoPremium", "promoLimited"]);
    this.returnCards(pile.filter((card) => card.kind === "inn"));
    this.showToast(
      promotion === "lantern" ? "灯笼挂满长街" : promotion === "premium" ? "雅座只候知味客" : "今日招牌限量",
      "客流与收益规则已经改变，按新的节奏经营。",
      2200,
    );
    this.time.delayedCall(320, () => this.spawnNextGuest());
  }

  private resolveBanquetOpen(pile: CardView[]) {
    const banquet = pile.find((card) => card.kind === "banquet");
    if (banquet) this.removeCard(banquet);
    this.returnCards(pile.filter((card) => card.kind !== "banquet"));
    this.banquetOpened = true;
    this.finaleStage = 2;
    this.state.reputation += 2;
    this.phaseText.setText("第十日 · 春灯午宴");
    this.showToast("午宴正式开席", "再招待两位宴客，夜里还要腾出客房。", 2300);
    this.time.delayedCall(320, () => this.spawnNextGuest());
  }

  private resolveLedger(pile: CardView[]) {
    const ledger = pile.find((card) => card.kind === "ledger");
    if (ledger) this.removeCard(ledger);
    this.openDaySummary();
  }

  private useWorker(pile: CardView[]) {
    if (pile.some((card) => card.kind === "helper") && this.state.day >= 8) {
      this.state.morale = Phaser.Math.Clamp(this.state.morale - 2, 0, 100);
    }
  }

  private removeChoiceCards(kinds: CardKind[]) {
    [...this.cards.values()]
      .filter((card) => kinds.includes(card.kind) && !card.gone)
      .forEach((card) => this.removeCard(card));
  }

  private returnCards(cards: CardView[]) {
    const returningCards = cards.filter((card) => !card.gone);
    const firstDepth = this.reserveCardDepths(returningCards.length);
    returningCards.forEach((card, index) => {
      card.stackTarget = undefined;
      card.stackRank = 0;
      card.locked = false;
      card.container.setDepth(firstDepth + index);
      this.enableCardInput(card);
      this.tweens.add({
        targets: card.container,
        x: card.homeX,
        y: card.homeY,
        angle: 0,
        duration: 390,
        ease: "Back.Out",
      });
    });
    const settleCard = returningCards.at(-1);
    if (settleCard) this.scheduleCollisionSettle(settleCard, 430);
  }

  private removeCard(card: CardView) {
    if (card.gone) return;
    card.gone = true;
    card.container.disableInteractive();
    this.cards.forEach((candidate) => {
      if (candidate.stackTarget === card.id) candidate.stackTarget = card.stackTarget;
    });
    this.tweens.add({
      targets: card.container,
      scale: 0.75,
      alpha: 0,
      y: card.container.y - 18,
      duration: 220,
      ease: "Sine.In",
      onComplete: () => {
        card.container.destroy(true);
        this.cards.delete(card.id);
      },
    });
  }

  private setCardKind(card: CardView, kind: CardKind) {
    const spec = CARD_SPECS[kind];
    card.kind = kind;
    card.titleText.setText(spec.title);
    this.setCardSubtitleText(card.subtitleText, spec.subtitle);
    card.typeText.setText(spec.typeLabel);
    card.badge.setText(cardBadge(kind));
    if (card.art instanceof Phaser.GameObjects.Image && spec.atlas && spec.frame !== undefined) {
      card.art.setTexture(spec.atlas, spec.frame);
    }
  }

  private scatterPile(pile: CardView[]) {
    const activeCards = pile.filter((card) => !card.gone);
    const firstDepth = this.reserveCardDepths(activeCards.length);
    activeCards.forEach((card, index) => {
      card.stackTarget = undefined;
      card.stackRank = 0;
      card.locked = false;
      card.container.setDepth(firstDepth + index);
      this.enableCardInput(card);
      this.tweens.add({
        targets: card.container,
        x: card.homeX,
        y: card.homeY,
        angle: 0,
        duration: 390,
        delay: Phaser.Math.Between(0, 60),
        ease: "Back.Out",
      });
    });
    const settleCard = activeCards.at(-1);
    if (settleCard) this.scheduleCollisionSettle(settleCard, 430);
    this.time.delayedCall(430, () => this.refreshAll());
  }

  private pulsePile(pile: CardView[], color: number) {
    pile.forEach((card) => {
      card.glow.setStrokeStyle(4, color, 1).setAlpha(0.9);
      this.tweens.add({ targets: card.glow, alpha: 0, duration: 520, ease: "Sine.Out" });
    });
  }

  private showToast(title: string, body: string, lifetime: number) {
    if (this.summaryOpen) return;
    const toast = this.add.container(215, 209).setDepth(5000).setAlpha(0).setScale(0.94);
    const shadow = this.add.rectangle(3, 5, 396, 78, 0x3b281f, 0.22);
    const panel = this.add.rectangle(0, 0, 396, 78, 0xf7ebd2, 0.99).setStrokeStyle(2, 0x6b4933, 0.95);
    const seal = this.add.circle(-174, 0, 15, 0xaa3f30, 1);
    const sealText = this.crispText(-174, 0, "栈", {
      fontFamily: UI_FONT,
      fontSize: "12px",
      color: "#fff0d2",
      fontStyle: "bold",
    }).setOrigin(0.5);
    const titleText = this.crispText(-151, -28, title, {
      fontFamily: UI_FONT,
      fontSize: "13px",
      color: "#9d392c",
      fontStyle: "bold",
    });
    const bodyText = this.crispText(-151, -3, body, {
      fontFamily: UI_FONT,
      fontSize: "10px",
      color: "#4a382f",
      fontStyle: "bold",
      wordWrap: { width: 322 },
      lineSpacing: 2,
    });
    toast.add([shadow, panel, seal, sealText, titleText, bodyText]);
    this.tweens.add({ targets: toast, alpha: 1, scale: 1, duration: 220, ease: "Back.Out" });
    this.time.delayedCall(lifetime, () => {
      this.tweens.add({
        targets: toast,
        alpha: 0,
        y: toast.y - 8,
        duration: 260,
        onComplete: () => toast.destroy(true),
      });
    });
  }

  private floatReward(x: number, y: number, copy: string) {
    const reward = this.crispText(x, y - 54, copy, {
      fontFamily: UI_FONT,
      fontSize: "11px",
      color: "#31583e",
      fontStyle: "bold",
      backgroundColor: "#fff4bf",
      padding: { x: 6, y: 3 },
    }).setOrigin(0.5).setDepth(5200);
    this.tweens.add({
      targets: reward,
      y: reward.y - 48,
      alpha: 0,
      duration: 1100,
      ease: "Sine.Out",
      onComplete: () => reward.destroy(),
    });
  }

  private getMarketSubtitle() {
    const cost = this.getPurchaseCost();
    const quantity = this.state.pantryBuilt ? "两套食材" : "一套食材";
    if (this.state.role === "steward") {
      return "阿满+钱串｜" + cost + "文买" + quantity + "\n掌柜多1文";
    }
    return "人物+钱串｜" + cost + "文买" + quantity;
  }

  private getHelperSubtitle() {
    if (this.state.role === "chef") return "厨工｜叠进灶台\n每锅多出一份";
    if (this.state.role === "runner") return "跑堂｜菜+客+阿满\n多赚钱并加口碑";
    if (this.state.role === "steward") return "管事｜采买省钱\n入住后自动整房";
    return "可以与掌柜同时做事";
  }

  private getCoinSubtitle() {
    return "余额" + this.state.coins + "文｜经营·扩建·发薪";
  }

  private getPurchaseCost(pile?: CardView[]) {
    let cost = this.state.specialty === "rich" ? 6 : this.state.specialty === "batch" ? 4 : 3;
    if (this.state.day === 5) cost += 2;
    if (this.state.day === 6) cost += 1;
    if (this.state.day === 9) cost += 1;
    const stewardAssigned = this.state.role === "steward" && (!pile || pile.some((card) => card.kind === "helper"));
    if (stewardAssigned) cost -= 1;
    return Math.max(2, cost);
  }

  private getRecipeIngredients(): IngredientKind[] {
    if (this.state.specialty === "rich") return ["pork", "spice"];
    if (this.state.specialty === "batch") return ["flour", "sugar"];
    return ["veg", "flour"];
  }

  private getCurrentDish(): DishKind {
    if (this.state.specialty === "quick") return "yangchun";
    if (this.state.specialty === "rich") return "braised";
    if (this.state.specialty === "batch") return "cakes";
    return "noodles";
  }

  private getCookDuration(pile: CardView[]) {
    let duration = this.state.specialty === "quick"
      ? 760
      : this.state.specialty === "rich"
        ? 1350
        : this.state.specialty === "batch"
          ? 950
          : 1050;
    const chefAssigned = this.state.role === "chef" && pile.some((card) => card.kind === "helper");
    if (chefAssigned) duration = Math.round(duration * 0.68);
    if (this.state.day === 6 && !this.leakFixed) duration += 300;
    return duration;
  }

  private getDishPayout(kind: DishKind, runnerAssigned = false) {
    let payout = kind === "braised" ? 18 : kind === "cakes" ? 7 : 8;
    if (runnerAssigned) payout += 2;
    if (this.state.day === 9 && this.state.promotion === "premium") payout += 5;
    if (this.state.day === 9 && this.state.promotion === "limited") payout += 3;
    if (this.state.day === 10) payout += 2;
    return payout;
  }

  private getServiceReputation(kind: DishKind, runnerAssigned = false) {
    let reputation = kind === "braised" ? 2 : 1;
    if (runnerAssigned) reputation += 1;
    if (this.state.day === 9 && this.state.promotion === "lantern") reputation += 1;
    if (this.state.day === 9 && this.state.promotion === "premium") reputation += 1;
    return reputation;
  }

  private addResource(kind: IngredientKind) {
    const x = kind === "veg" || kind === "pork" ? SLOT_X[0] : SLOT_X[1];
    const y = FLOW_Y;
    const existing = [...this.cards.values()].find((card) => {
      if (card.kind !== kind || card.gone || card.locked) return false;
      return this.getPile(card).every((member) => member.kind === kind);
    });
    const card = this.addCard(kind, x, y);
    if (existing) {
      card.stackTarget = this.findRoot(existing).id;
      card.stackRank = ++this.stackSerial;
      this.layoutPile(existing);
    }
    return card;
  }

  private addDish(kind: DishKind) {
    const existing = [...this.cards.values()].find((card) => {
      if (card.kind !== kind || card.gone || card.locked) return false;
      return this.getPile(card).every((member) => member.kind === kind);
    });
    const card = this.addCard(kind, SLOT_X[2], FLOW_Y);
    if (existing) {
      card.stackTarget = this.findRoot(existing).id;
      card.stackRank = ++this.stackSerial;
      this.layoutPile(existing);
    }
    return card;
  }

  private updateMarketCard() {
    this.cards.forEach((card) => {
      if (card.kind === "market" && !card.gone) {
        this.setCardSubtitleText(card.subtitleText, this.getMarketSubtitle());
      }
    });
  }

  private getServeTarget() {
    if (this.state.day === 1) return 2;
    if (this.state.day === 2) return this.state.recruited ? 2 : 0;
    if (this.state.day === 3) return 1;
    if (this.state.day === 4) return this.state.specialty ? 2 : 0;
    if (this.state.day === 5) return 3;
    if (this.state.day === 6) return this.state.rainPolicy ? 1 : 0;
    if (this.state.day === 7) return this.contractChoice === "accept" ? 4 : this.contractChoice === "decline" ? 2 : 0;
    if (this.state.day === 8) return this.state.role ? 3 : 0;
    if (this.state.day === 9) {
      if (this.state.promotion === "lantern") return 4;
      if (this.state.promotion === "premium") return 2;
      if (this.state.promotion === "limited") return 3;
      return 0;
    }
    return 4;
  }

  private getLodgeTarget() {
    if (this.state.day === 3) return 1;
    if (this.state.day === 6) return this.state.rainPolicy ? 2 : 0;
    if (this.state.day === 10) return this.finaleStage >= 3 ? 1 : 0;
    return 0;
  }

  private hasActiveGuest() {
    return [...this.cards.values()].some((card) => isGuestKind(card.kind) && !card.gone);
  }

  private spawnNextGuest() {
    if (this.summaryOpen || this.hasActiveGuest()) return;
    const day = this.state.day;
    if (day === 2 && !this.state.recruited) return;
    if (day === 4 && !this.state.specialty) return;
    if (day === 6 && !this.state.rainPolicy) return;
    if (day === 7 && !this.contractChoice) return;
    if (day === 8 && !this.state.role) return;
    if (day === 9 && !this.state.promotion) return;

    let kind: GuestKind | undefined;
    if (day === 10) {
      if (!this.banquetOpened) {
        if (this.dayServed < 2) {
          kind = "honoredGuest";
        } else {
          this.offerBanquetCard();
          return;
        }
      } else if (this.dayServed < 4) {
        kind = "caravanGuest";
      } else if (this.dayLodged < 2) {
        this.finaleStage = 3;
        this.phaseText.setText("第十日 · 夜宿收官");
        kind = "sleepyGuest";
      }
    } else {
      const lodgeTarget = this.getLodgeTarget();
      const serveTarget = this.getServeTarget();
      if (this.dayLodged < lodgeTarget) {
        kind = day === 6 ? "strandedGuest" : "sleepyGuest";
      } else if (this.dayServed < serveTarget) {
        kind = day === 7 && this.contractChoice === "accept"
          ? "caravanGuest"
          : day === 9
            ? "honoredGuest"
            : day === 6
              ? "strandedGuest"
              : "guest";
      }
    }

    if (!kind) {
      this.refreshAll();
      return;
    }
    const sequence = this.dayServed + this.dayLodged + 1;
    this.addCard(kind, SLOT_X[3], FLOW_Y, {
      subtitle: CARD_SPECS[kind].subtitle + " · 第 " + sequence + " 位",
    });
    this.refreshGuidance();
  }

  private offerBanquetCard() {
    if (this.banquetOpened || this.dayFlags.has("banquetOffered")) return;
    this.dayFlags.add("banquetOffered");
    this.finaleStage = 2;
    this.addCard("banquet", SLOT_X[3], EVENT_Y);
    this.showToast("晨客已经招待妥当", "把掌柜与春灯午宴叠到客栈上，正式开席。", 2500);
    this.refreshAll();
  }

  private checkDayMilestones() {
    if (this.state.day === 7 && this.contractChoice === "accept" && this.dayServed >= 4 && !this.contractRewarded) {
      this.contractRewarded = true;
      this.state.caravanCompleted = true;
      this.earn(20);
      this.state.reputation += 5;
      this.showToast("商队团单如约完成", "结清二十文尾款，商路口碑 +5。", 2500);
    }
    if (this.state.day === 10 && this.dayServed >= 2 && !this.banquetOpened) {
      this.offerBanquetCard();
    }
    if (this.state.day === 10 && this.dayServed >= 4 && this.finaleStage < 3) {
      this.finaleStage = 3;
      this.phaseText.setText("第十日 · 夜宿收官");
      this.showToast("午宴宾客尽欢", "最后把一位投宿客安顿好，十日经营就圆满了。", 2400);
    }
  }

  private getGoalItems(): GoalItem[] {
    const day = this.state.day;
    if (day === 1) {
      return [
        { label: "到菜市采买一次", done: this.dayPurchases >= 1 },
        { label: "招待两位客人", done: this.dayServed >= 2 },
        { label: "花 12 文搭出客栈", done: this.state.innBuilt },
      ];
    }
    if (day === 2) {
      return [
        { label: "雇下小伙计阿满", done: this.state.recruited },
        { label: "招待两位客人", done: this.dayServed >= 2 },
        { label: "支付今日工钱", done: this.wagePaid },
      ];
    }
    if (day === 3) {
      return [
        { label: "修建第一间客房", done: this.state.roomBuilt },
        { label: "留宿一位旅人", done: this.dayLodged >= 1 },
        { label: "招待一位食客", done: this.dayServed >= 1 },
        { label: "打扫一次客房", done: this.dayCleaned >= 1 },
      ];
    }
    if (day === 4) {
      return [
        { label: "永久选择招牌菜", done: Boolean(this.state.specialty) },
        { label: "卖出两份招牌菜", done: this.daySpecialServed >= 2 },
      ];
    }
    if (day === 5) {
      return [
        { label: "应对涨价并招待三人", done: this.dayServed >= 3 },
        { label: "修建储藏间（可选）", done: this.state.pantryBuilt, required: false },
      ];
    }
    if (day === 6) {
      return [
        { label: "决定雨夜房价", done: Boolean(this.state.rainPolicy) },
        { label: "修好漏雨屋檐", done: this.leakFixed },
        { label: "留宿两位避雨旅人", done: this.dayLodged >= 2 },
        { label: "招待一位食客", done: this.dayServed >= 1 },
      ];
    }
    if (day === 7) {
      const target = this.contractChoice === "accept" ? 4 : 2;
      return [
        { label: "决定是否承接团单", done: Boolean(this.contractChoice) },
        { label: "完成 " + target + " 份餐食", done: target > 0 && this.dayServed >= target },
        { label: "结清商队契约", done: this.contractChoice === "decline" || this.contractRewarded },
      ];
    }
    if (day === 8) {
      return [
        { label: "确定阿满的专职岗位", done: Boolean(this.state.role) },
        { label: "招待三位客人", done: this.dayServed >= 3 },
        { label: "员工人心保持 50（挑战）", done: this.state.morale >= 50, required: false },
      ];
    }
    if (day === 9) {
      const target = this.getServeTarget();
      return [
        { label: "选定一种宣传方式", done: Boolean(this.state.promotion) },
        { label: "按计划招待 " + target + " 人", done: target > 0 && this.dayServed >= target },
        { label: "员工人心保持 45（挑战）", done: this.state.morale >= 45, required: false },
      ];
    }
    return [
      { label: "招待两位晨客", done: this.dayServed >= 2 },
      { label: "正式开启春灯午宴", done: this.banquetOpened },
      { label: "累计完成四份餐食", done: this.dayServed >= 4 },
      { label: "安顿一位夜宿客", done: this.dayLodged >= 1 },
    ];
  }

  private isDayComplete() {
    return this.getGoalItems().filter((goal) => goal.required !== false).every((goal) => goal.done);
  }

  private maybeOfferLedger() {
    if (
      !this.isDayComplete()
      || this.activeRecipeCount > 0
      || this.dayFlags.has("ledgerOffered")
      || this.summaryOpen
    ) return;
    this.dayFlags.add("ledgerOffered");
    this.addCard("ledger", SLOT_X[3], EVENT_Y);
    this.showToast("今日目标已经完成", "把「今日账簿」叠到客栈上，由你决定什么时候打烊。", 2600);
  }

  private refreshAll() {
    const definition = DAY_DEFINITIONS[this.state.day - 1];
    const phase = this.state.day === 10 && this.finaleStage === 2
      ? "第十日 · 春灯午宴"
      : this.state.day === 10 && this.finaleStage >= 3
        ? "第十日 · 夜宿收官"
        : definition.phase;
    this.phaseText.setText(phase);
    this.updateCoinDisplay();
    this.repHud.setText("名 " + this.state.reputation);
    this.moraleHud.setText("人心 " + this.state.morale);
    this.updateMarketCard();
    this.updateGoals();
    this.updateRecipeNotes();
    this.refreshGuidance();
    if (this.activeRecipeCount === 0) this.maybeOfferLedger();
  }

  private updateGoals() {
    const definition = DAY_DEFINITIONS[this.state.day - 1];
    this.goalTitle.setText("第" + this.state.day + "日 · " + definition.title);
    const goals = this.getGoalItems();
    const requiredGoals = goals.filter((goal) => goal.required !== false);
    const completedGoals = requiredGoals.filter((goal) => goal.done).length;
    this.goalProgress.setText(completedGoals + "/" + requiredGoals.length + " 项");
    this.goalLines.forEach((line, index) => {
      const goal = goals[index];
      if (!goal) {
        line.setText("");
        return;
      }
      const optional = goal.done ? "✓" : goal.required === false ? "◇" : "○";
      line.setText(optional + "  " + goal.label);
      line.setColor(goal.done ? "#4d7251" : goal.required === false ? "#7c6449" : "#3d352b");
      line.setAlpha(goal.done ? 0.72 : 1);
    });
  }

  private updateRecipeNotes() {
    const dish = CARD_SPECS[this.getCurrentDish()].title;
    const ingredients = this.getRecipeIngredients().map((kind) => CARD_SPECS[kind].title.replace(/^一[篮袋刀包罐]/, "")).join(" + ");
    const role = this.state.role === "chef"
      ? "厨工加成需叠阿满"
      : this.state.role === "runner"
        ? "跑堂加成需菜 + 客 + 阿满"
        : this.state.role === "steward"
          ? "管事参与采买或入住才生效"
          : "掌柜 / 阿满都能操作";
    this.recipeNoteText.setText(
      this.getPurchaseCost() + " 文采买" + (this.state.pantryBuilt ? "两套" : "一套") +
      " ｜ " + ingredients + " → " + dish + " ｜ " + role +
      (this.hotStreak > 0 ? " ｜ 连桌 " + this.hotStreak : "") +
      (this.activeRecipeCount > 0 ? " ｜ 进行中 " + this.activeRecipeCount : ""),
    );
  }

  private refreshGuidance() {
    if (this.summaryOpen) return;
    const has = (kind: CardKind) => [...this.cards.values()].some(
      (card) => card.kind === kind && !card.gone && !card.locked,
    );
    const activeDish = [...this.cards.values()].find(
      (card) => isDishKind(card.kind) && !card.gone && !card.locked,
    );
    const activeGuest = [...this.cards.values()].find(
      (card) => isGuestKind(card.kind) && !card.gone && !card.locked,
    );

    if (has("ledger")) {
      this.setGuidance(["ledger", "inn"], "今日目标完成：把「今日账簿」叠到「客栈」上打烊。");
      return;
    }
    if (this.state.day === 1 && this.dayServed >= 2 && !this.state.innBuilt) {
      this.setGuidance(["owner", "coin", "stall"], "把「小掌柜」和「钱串」叠到「露天面摊」上，花 12 文升店。");
      return;
    }
    if (this.state.day === 2 && !this.state.recruited) {
      this.setGuidance(["owner", "coin", "recruit"], "先雇人：掌柜 + 钱串 + 招工告示。");
      return;
    }
    if (this.state.day === 2 && this.dayServed >= 2 && !this.wagePaid) {
      this.setGuidance(["helper", "coin", "wage"], "打烊前把阿满、钱串与今日工钱叠在一起。");
      return;
    }
    if (this.state.day === 3 && !this.state.roomBuilt) {
      this.setGuidance(["owner", "coin", "timber", "bedding", "inn"], "修客房：掌柜 + 钱串 + 木料 + 被褥 + 客栈。");
      return;
    }
    if (this.state.day === 4 && !this.state.specialty) {
      this.setGuidance(["choiceQuick", "choiceRich", "choiceBatch", "inn"], "从菜谱牌堆中抽出一张，叠到客栈上；这个选择不可反悔。");
      return;
    }
    if (this.state.day === 6 && !this.state.rainPolicy) {
      this.setGuidance(["policyKind", "policyRate", "inn"], "先从雨夜选择牌堆抽一张，叠到客栈上确定房价。");
      return;
    }
    if (this.state.day === 6 && !this.leakFixed) {
      this.setGuidance(["owner", "helper", "coin", "repairKit", "leak"], "修屋檐：任一人物 + 钱串 + 修缮包 + 漏雨屋檐。");
      return;
    }
    if (this.state.day === 7 && !this.contractChoice) {
      this.setGuidance(["contractAccept", "contractDecline", "inn"], "抽出接单或婉拒牌，叠到客栈上决定今天的压力。");
      return;
    }
    if (this.state.day === 8 && !this.state.role) {
      this.setGuidance(["roleChef", "roleRunner", "roleSteward", "helper"], "抽出一张岗位牌，叠到阿满身上确定永久专职。");
      return;
    }
    if (this.state.day === 9 && !this.state.promotion) {
      this.setGuidance(["promoLantern", "promoPremium", "promoLimited", "inn"], "抽出一张宣传牌叠到客栈上，选择客流与收益结构。");
      return;
    }
    if (this.state.day === 10 && has("banquet")) {
      this.setGuidance(["owner", "banquet", "inn"], "晨客已妥：掌柜 + 春灯午宴 + 客栈，正式开席。");
      return;
    }
    if (has("dirtyRoom") && (this.dayLodged < this.getLodgeTarget() || this.dayCleaned < 1)) {
      this.setGuidance(["owner", "helper", "dirtyRoom"], "客房还乱着：任一人物 + 待扫客房。");
      return;
    }
    if (
      activeGuest &&
      (activeGuest.kind === "sleepyGuest" || activeGuest.kind === "strandedGuest") &&
      has("room") &&
      this.dayLodged < this.getLodgeTarget()
    ) {
      if (this.state.role === "steward" && has("helper")) {
        this.setGuidance([activeGuest.kind, "room", "helper"], "客房 + 投宿客 + 阿满三叠，管事会在入住后顺手整房；两张也能正常入住。");
      } else {
        this.setGuidance([activeGuest.kind, "room"], "把投宿客叠到整洁客房上；住后记得打扫。");
      }
      return;
    }
    if (activeDish && activeGuest && this.dayServed < this.getServeTarget()) {
      if (this.state.role === "runner" && has("helper")) {
        this.setGuidance([activeDish.kind, activeGuest.kind, "helper"], "热菜 + 客人 + 阿满三叠触发跑堂加成；只叠菜和客人也能上桌。");
      } else {
        this.setGuidance([activeDish.kind, activeGuest.kind], "热菜已经出锅，直接叠到客人身上。");
      }
      return;
    }
    const ingredients = this.getRecipeIngredients();
    if (ingredients.every((kind) => has(kind))) {
      if (this.state.role === "chef" && has("helper")) {
        this.setGuidance(["helper", "stove", ...ingredients], "阿满 + 两张食材 + 灶台可触发厨工加成；掌柜下厨仍可正常出锅。");
      } else {
        this.setGuidance(["owner", "helper", "stove", ...ingredients], "任一人物 + 两张食材 + 灶台，即可烹饪。");
      }
      return;
    }
    if (this.state.day === 5 && !this.state.pantryBuilt && has("pantryPlan") && this.dayPurchases === 0) {
      this.setGuidance(["owner", "coin", "pantryPlan", "inn"], "可选投资：掌柜 + 8 文 + 储藏间图样 + 客栈；也可以直接高价采买。");
      return;
    }
    if (this.state.role === "steward" && has("helper")) {
      this.setGuidance(["helper", "coin", "market"], "让阿满 + 钱串 + 菜市采买可省 1 文；掌柜采买仍然可行。");
    } else {
      this.setGuidance(["owner", "helper", "coin", "market"], "先采买：任一人物 + 钱串 + 清晨菜市。");
    }
  }

  private setGuidance(kinds: CardKind[], copy: string) {
    const activePrefix = this.activeRecipeCount > 0 ? "进行中 " + this.activeRecipeCount + " 项｜" : "";
    this.hintText.setText(activePrefix + copy);
    this.cards.forEach((card) => {
      const active = kinds.includes(card.kind) && !card.gone && !card.locked;
      this.tweens.killTweensOf(card.glow);
      if (active) {
        card.glow.setAlpha(0.1).setStrokeStyle(4, 0xe3c75f, 1);
        this.tweens.add({
          targets: card.glow,
          alpha: { from: 0.08, to: 0.82 },
          duration: 760,
          yoyo: true,
          repeat: -1,
          ease: "Sine.InOut",
        });
      } else {
        card.glow.setAlpha(0);
      }
    });
  }

  private clearHighlights() {
    this.cards.forEach((card) => {
      this.tweens.killTweensOf(card.glow);
      card.glow.setAlpha(0);
    });
  }

  private captureInventory() {
    if (!this.state.pantryBuilt) {
      this.state.inventory = {};
      return 0;
    }
    const inventory: Partial<Record<IngredientKind, number>> = {};
    let capacity = 6;
    [...this.cards.values()]
      .filter((card) => isIngredientKind(card.kind) && !card.gone)
      .sort((left, right) => left.container.depth - right.container.depth)
      .forEach((card) => {
        if (capacity <= 0 || !isIngredientKind(card.kind)) return;
        inventory[card.kind] = (inventory[card.kind] ?? 0) + 1;
        capacity -= 1;
      });
    this.state.inventory = inventory;
    return 6 - capacity;
  }

  private applyNightlyWage() {
    if (!this.state.recruited || this.state.day === 2) return { wage: 0, paid: true };
    const wage = this.state.role === "steward" ? 2 : this.state.role ? 3 : 2;
    if (this.state.coins >= wage) {
      this.spend(wage);
      return { wage, paid: true };
    }
    this.state.coins = 0;
    this.state.reputation = Math.max(0, this.state.reputation - 1);
    this.state.morale = Math.max(0, this.state.morale - 12);
    return { wage, paid: false };
  }

  private applyCompletionBonus() {
    if (this.state.day === 4) this.state.reputation += 2;
    if (this.state.day === 5 && this.state.pantryBuilt) this.state.reputation += 1;
    if (this.state.day === 9) this.state.reputation += 3;
    this.state.morale = Phaser.Math.Clamp(this.state.morale + 3, 0, 100);
  }

  private openDaySummary() {
    if (this.summaryOpen || this.activeRecipeCount > 0) return;
    this.summaryOpen = true;
    this.clearHighlights();
    this.cards.forEach((card) => card.container.disableInteractive());
    const stored = this.captureInventory();
    const wage = this.applyNightlyWage();
    this.applyCompletionBonus();

    if (this.state.day === 10) {
      this.openFinalSummary(stored, wage);
      return;
    }

    const definition = DAY_DEFINITIONS[this.state.day - 1];
    const curtain = this.add.container(215, 430).setDepth(9000).setAlpha(0);
    const shade = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x251c18, 0.74).setInteractive();
    const shadow = this.add.rectangle(5, 8, 386, 690, 0x241712, 0.38);
    const paper = this.add.rectangle(0, 0, 386, 690, 0xf4e8cf, 1).setStrokeStyle(3, 0x4b3428, 1);
    const redTop = this.add.rectangle(0, -332, 380, 24, 0xa33d2f, 1);
    const title = this.crispText(0, -292, "第" + this.state.day + "日 · 收账", {
      fontFamily: UI_FONT,
      fontSize: "24px",
      color: "#392a22",
      fontStyle: "bold",
    }).setOrigin(0.5);
    const subtitle = this.crispText(0, -254, definition.title + " · " + definition.lesson, {
      fontFamily: UI_FONT,
      fontSize: "11px",
      color: "#745d4b",
      fontStyle: "bold",
      wordWrap: { width: 336 },
      align: "center",
    }).setOrigin(0.5, 0);

    const leftBack = this.add.rectangle(-88, -166, 160, 106, 0xe5d0aa, 0.82).setStrokeStyle(1, 0x8a684b, 0.55);
    const leftText = this.crispText(-88, -166, "今日进账\n" + this.dayEarnings + " 文\n招待 " + this.dayServed + " 人", {
      fontFamily: UI_FONT,
      fontSize: "13px",
      color: "#3e3027",
      fontStyle: "bold",
      align: "center",
      lineSpacing: 6,
    }).setOrigin(0.5);
    const rightBack = this.add.rectangle(88, -166, 160, 106, 0xd9e0d2, 0.88).setStrokeStyle(1, 0x61765f, 0.55);
    const rightText = this.crispText(88, -166, "夜宿 " + this.dayLodged + " 人\n余钱 " + this.state.coins + " 文\n口碑 " + this.state.reputation, {
      fontFamily: UI_FONT,
      fontSize: "13px",
      color: "#354437",
      fontStyle: "bold",
      align: "center",
      lineSpacing: 6,
    }).setOrigin(0.5);

    const detailTitle = this.crispText(-168, -98, "打烊细账", {
      fontFamily: UI_FONT,
      fontSize: "10px",
      color: "#9b3c2e",
      fontStyle: "bold",
    });
    const choice = this.getPersistentChoiceSummary();
    const wageCopy = wage.wage === 0
      ? "今日工钱已当面结清"
      : wage.paid
        ? "夜里自动支付工钱 " + wage.wage + " 文"
        : "工钱不足：口碑 -1，人心 -12";
    const storeCopy = this.state.pantryBuilt
      ? "储藏间保留 " + stored + " 张食材到明日"
      : "没有储藏间，剩余鲜货不能隔夜";
    const details = this.crispText(-168, -72, choice + "\n" + wageCopy + "\n" + storeCopy + "\n人心恢复 3，当前 " + this.state.morale, {
      fontFamily: UI_FONT,
      fontSize: "11px",
      color: "#5d493b",
      fontStyle: "bold",
      lineSpacing: 9,
      wordWrap: { width: 336 },
    });

    const replayBg = this.add.rectangle(-88, 234, 156, 52, 0xe0c99f, 1)
      .setStrokeStyle(2, 0x654937, 1)
      .setInteractive({ useHandCursor: true });
    const replayText = this.crispText(-88, 234, "重玩本日", {
      fontFamily: UI_FONT,
      fontSize: "13px",
      color: "#45332a",
      fontStyle: "bold",
    }).setOrigin(0.5);
    const nextBg = this.add.rectangle(88, 234, 156, 52, 0xa23c2e, 1)
      .setStrokeStyle(2, 0x4a2b23, 1)
      .setInteractive({ useHandCursor: true });
    const nextText = this.crispText(88, 234, "进入第" + (this.state.day + 1) + "日", {
      fontFamily: UI_FONT,
      fontSize: "13px",
      color: "#fff0d4",
      fontStyle: "bold",
    }).setOrigin(0.5);
    const tomorrow = DAY_DEFINITIONS[this.state.day];
    const foot = this.crispText(0, 286, "明日：" + tomorrow.title + " · " + tomorrow.lesson, {
      fontFamily: UI_FONT,
      fontSize: "10px",
      color: "#7a6553",
      fontStyle: "bold",
      wordWrap: { width: 330 },
      align: "center",
    }).setOrigin(0.5);

    curtain.add([
      shade,
      shadow,
      paper,
      redTop,
      title,
      subtitle,
      leftBack,
      leftText,
      rightBack,
      rightText,
      detailTitle,
      details,
      replayBg,
      replayText,
      nextBg,
      nextText,
      foot,
    ]);
    this.enableHitAreaDebug(shade, 0x4777cc);
    this.enableHitAreaDebug(replayBg, 0x2f8f2f);
    this.enableHitAreaDebug(nextBg, 0x2f8f2f);
    replayBg.on("pointerdown", () => this.restartCurrentDay());
    nextBg.on("pointerdown", () => {
      nextBg.disableInteractive();
      const nextState = cloneState(this.state);
      nextState.day += 1;
      this.saveCampaign(nextState);
      this.scene.restart({ campaign: nextState });
    });
    this.tweens.add({ targets: curtain, alpha: 1, duration: 380, ease: "Sine.Out" });
  }

  private getPersistentChoiceSummary() {
    if (this.state.day === 4 && this.state.specialty) {
      return "招牌菜：" + CARD_SPECS[this.getCurrentDish()].title;
    }
    if (this.state.day === 6 && this.state.rainPolicy) {
      return this.state.rainPolicy === "kind" ? "雨夜选择：薄收暖心" : "雨夜选择：照价收房";
    }
    if (this.state.day === 7) {
      return this.contractChoice === "accept"
        ? "商队团单：" + (this.contractRewarded ? "如约完成" : "未能结清")
        : "商队团单：主动婉拒";
    }
    if (this.state.day === 8 && this.state.role) return "阿满岗位：" + this.getRoleName();
    if (this.state.day === 9 && this.state.promotion) return "灯会宣传：" + this.getPromotionName();
    return "今日经营目标全部完成";
  }

  private getRoleName() {
    return this.state.role === "chef" ? "专职厨工" : this.state.role === "runner" ? "专职跑堂" : "专职管事";
  }

  private getPromotionName() {
    return this.state.promotion === "lantern" ? "满街红灯笼" : this.state.promotion === "premium" ? "清静雅座" : "限量招牌";
  }

  private openFinalSummary(stored: number, wage: { wage: number; paid: boolean }) {
    const wealth = this.state.coins >= 90;
    const fame = this.state.reputation >= 22;
    const harmony = this.state.morale >= 65;
    const balanced = this.state.coins >= 70
      && this.state.reputation >= 18
      && this.state.morale >= 55
      && this.state.caravanCompleted;
    const honors = [
      wealth ? "✓ 富足商号" : "○ 富足商号（需 90 文）",
      fame ? "✓ 名满州府" : "○ 名满州府（需 22 口碑）",
      harmony ? "✓ 宾至如归" : "○ 宾至如归（需 65 人心）",
      balanced ? "★ 十里第一栈" : "◇ 十里第一栈（均衡经营并完成商队团单）",
    ];

    const curtain = this.add.container(215, 430).setDepth(9000).setAlpha(0);
    const shade = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x201713, 0.78).setInteractive();
    const shadow = this.add.rectangle(5, 8, 388, 758, 0x241712, 0.42);
    const paper = this.add.rectangle(0, 0, 388, 758, 0xf4e8cf, 1).setStrokeStyle(3, 0x4b3428, 1);
    const top = this.add.rectangle(0, -366, 382, 24, 0xa33d2f, 1);
    const title = this.crispText(0, -324, balanced ? "十里第一栈" : "十日经营 · 总账", {
      fontFamily: UI_FONT,
      fontSize: "26px",
      color: "#392a22",
      fontStyle: "bold",
    }).setOrigin(0.5);
    const subtitle = this.crispText(0, -286, "从一块布棚，到一盏照亮长街的门灯。", {
      fontFamily: UI_FONT,
      fontSize: "11px",
      color: "#745d4b",
      fontStyle: "bold",
    }).setOrigin(0.5);
    const stats = this.crispText(0, -226,
      "余钱 " + this.state.coins + " 文　口碑 " + this.state.reputation + "　人心 " + this.state.morale + "\n" +
      "累计招待 " + this.state.totalServed + " 人　累计留宿 " + this.state.totalLodged + " 人",
      {
        fontFamily: UI_FONT,
        fontSize: "13px",
        color: "#3e3027",
        fontStyle: "bold",
        align: "center",
        lineSpacing: 9,
      },
    ).setOrigin(0.5);
    const honorsText = this.crispText(-165, -154, honors.join("\n"), {
      fontFamily: UI_FONT,
      fontSize: "13px",
      color: "#4a3a2f",
      fontStyle: "bold",
      lineSpacing: 14,
      wordWrap: { width: 330 },
    });
    const route = this.crispText(-165, 72,
      "经营路线：" + CARD_SPECS[this.getCurrentDish()].title + " · " + this.getRoleName() + " · " + this.getPromotionName() + "\n" +
      "商队团单：" + (this.state.caravanCompleted ? "完成" : this.state.caravanAccepted ? "未完成" : "婉拒") +
      "    留存食材：" + stored + " 张" +
      (wage.wage > 0 && !wage.paid ? "\n末日工钱未足，结局人心受到影响。" : ""),
      {
        fontFamily: UI_FONT,
        fontSize: "11px",
        color: "#725c49",
        fontStyle: "bold",
        lineSpacing: 9,
        wordWrap: { width: 330 },
      },
    );

    const replayBg = this.add.rectangle(-88, 298, 156, 52, 0xe0c99f, 1)
      .setStrokeStyle(2, 0x654937, 1)
      .setInteractive({ useHandCursor: true });
    const replayText = this.crispText(-88, 298, "重玩第十日", {
      fontFamily: UI_FONT,
      fontSize: "12px",
      color: "#45332a",
      fontStyle: "bold",
    }).setOrigin(0.5);
    const newBg = this.add.rectangle(88, 298, 156, 52, 0xa23c2e, 1)
      .setStrokeStyle(2, 0x4a2b23, 1)
      .setInteractive({ useHandCursor: true });
    const newText = this.crispText(88, 298, "从第一日再开张", {
      fontFamily: UI_FONT,
      fontSize: "12px",
      color: "#fff0d4",
      fontStyle: "bold",
    }).setOrigin(0.5);
    curtain.add([shade, shadow, paper, top, title, subtitle, stats, honorsText, route, replayBg, replayText, newBg, newText]);
    this.enableHitAreaDebug(replayBg, 0x2f8f2f);
    this.enableHitAreaDebug(newBg, 0x2f8f2f);
    replayBg.on("pointerdown", () => this.restartCurrentDay());
    newBg.on("pointerdown", () => {
      const fresh = createInitialState();
      this.saveCampaign(fresh);
      this.scene.restart({ campaign: fresh });
    });
    this.saveCampaign(this.state);
    this.tweens.add({ targets: curtain, alpha: 1, duration: 420, ease: "Sine.Out" });
  }

  private restartCurrentDay() {
    if (this.activeRecipeCount > 0) {
      this.showToast("灶上还有活计", "等当前进度结束后再重开本日。", 1800);
      return;
    }
    this.scene.restart({ campaign: cloneState(this.dayStartState) });
  }
}

export function createCampaignInnGame(parent: HTMLElement) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH * RENDER_SCALE,
    height: GAME_HEIGHT * RENDER_SCALE,
    backgroundColor: "#e7d3ae",
    transparent: false,
    scene: [CampaignInnScene],
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
