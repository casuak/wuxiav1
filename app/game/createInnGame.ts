import * as Phaser from "phaser";

const GAME_WIDTH = 1280;
const GAME_HEIGHT = 720;
const CARD_WIDTH = 126;
const CARD_HEIGHT = 168;
const STACK_Y = 30;
const BOARD_LEFT = 22;
const BOARD_TOP = 94;
const BOARD_RIGHT = 1032;
const BOARD_BOTTOM = 650;
const CARD_DEPTH_BASE = 100;
const CARD_DEPTH_CEILING = 4200;

type CardKind =
  | "owner"
  | "coin"
  | "stall"
  | "market"
  | "stove"
  | "veg"
  | "flour"
  | "noodles"
  | "guest"
  | "inn"
  | "helper";

type AtlasKey = "food" | "people" | "scenes";

type CardSpec = {
  title: string;
  subtitle: string;
  typeLabel: string;
  atlas?: AtlasKey;
  frame?: number;
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

const CARD_SPECS: Record<CardKind, CardSpec> = {
  owner: {
    title: "小掌柜",
    subtitle: "凡事都得自己来",
    typeLabel: "人物",
    atlas: "people",
    frame: 0,
    accent: 0x9da66f,
    paper: 0xfff8d6,
  },
  coin: {
    title: "钱串",
    subtitle: "可叠到要花钱的牌上",
    typeLabel: "财物",
    accent: 0xd3b65d,
    paper: 0xfff8d6,
  },
  stall: {
    title: "露天面摊",
    subtitle: "两张桌，半块布棚",
    typeLabel: "营生",
    atlas: "scenes",
    frame: 0,
    accent: 0xc26d54,
    paper: 0xfff8d6,
  },
  market: {
    title: "清晨菜市",
    subtitle: "摊主 + 钱串 · 采买 3 文",
    typeLabel: "地点",
    atlas: "scenes",
    frame: 1,
    accent: 0x9da66f,
    paper: 0xfff8d6,
  },
  stove: {
    title: "简陋灶台",
    subtitle: "摊主 + 菜 + 面粉",
    typeLabel: "设施",
    atlas: "scenes",
    frame: 2,
    accent: 0xb0986a,
    paper: 0xfff8d6,
  },
  veg: {
    title: "一篮青菜",
    subtitle: "新鲜得还带着露水",
    typeLabel: "食材",
    atlas: "food",
    frame: 0,
    accent: 0x9daa75,
    paper: 0xfff8d6,
  },
  flour: {
    title: "一袋面粉",
    subtitle: "刚磨好的麦香",
    typeLabel: "食材",
    atlas: "food",
    frame: 1,
    accent: 0xd3b65d,
    paper: 0xfff8d6,
  },
  noodles: {
    title: "热汤面",
    subtitle: "趁热端给饿肚子的客人",
    typeLabel: "菜肴",
    atlas: "food",
    frame: 2,
    accent: 0xc9845a,
    paper: 0xfff8d6,
  },
  guest: {
    title: "赶路客商",
    subtitle: "正等一碗热汤面",
    typeLabel: "客人",
    atlas: "people",
    frame: 2,
    accent: 0x87968a,
    paper: 0xfff8d6,
  },
  inn: {
    title: "一间小客栈",
    subtitle: "终于有门、有灯、有屋檐",
    typeLabel: "客栈",
    atlas: "scenes",
    frame: 3,
    accent: 0xc26d54,
    paper: 0xfff8d6,
  },
  helper: {
    title: "小伙计阿满",
    subtitle: "明日会来门前应聘",
    typeLabel: "人手",
    atlas: "people",
    frame: 3,
    accent: 0x87968a,
    paper: 0xfff8d6,
  },
};

function exactKinds(pile: CardView[], expected: CardKind[]) {
  const actual = pile.map((card) => card.kind).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((kind, index) => kind === wanted[index]);
}

function cardBadge(kind: CardKind) {
  const labels: Record<CardKind, string> = {
    owner: "人",
    coin: "财",
    stall: "摊",
    market: "市",
    stove: "灶",
    veg: "菜",
    flour: "面",
    noodles: "食",
    guest: "客",
    inn: "栈",
    helper: "伙",
  };
  return labels[kind];
}

class InnScene extends Phaser.Scene {
  private cards = new Map<string, CardView>();
  private cardSerial = 0;
  private stackSerial = 0;
  private cardDepthSerial = CARD_DEPTH_BASE;
  private coins = 10;
  private reputation = 0;
  private purchases = 0;
  private cooked = 0;
  private served = 0;
  private spent = 0;
  private earnings = 0;
  private upgraded = false;
  private recipeRunning = false;
  private summaryOpen = false;
  private phaseText!: Phaser.GameObjects.Text;
  private coinHud!: Phaser.GameObjects.Text;
  private repHud!: Phaser.GameObjects.Text;
  private servedHud!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private goalLines: Phaser.GameObjects.Text[] = [];
  private activeHintKinds: CardKind[] = [];
  private completionCurtain?: Phaser.GameObjects.Container;
  private debugHitAreas = false;
  private debuggedObjects = new WeakSet<Phaser.GameObjects.GameObject>();

  constructor() {
    super("inn-day-one");
  }

  preload() {
    this.load.spritesheet("food", "/assets/food-atlas.png", {
      frameWidth: 512,
      frameHeight: 512,
    });
    this.load.spritesheet("people", "/assets/people-atlas.png", {
      frameWidth: 512,
      frameHeight: 512,
    });
    this.load.spritesheet("scenes", "/assets/scene-atlas.png", {
      frameWidth: 512,
      frameHeight: 512,
    });
  }

  create() {
    this.debugHitAreas = new URLSearchParams(window.location.search).has("debugHitboxes");
    this.drawTable();
    this.createHud();
    this.createGoalCard();
    this.bindDragEvents();
    this.dealOpeningHand();
    this.refreshAll();

    this.input.keyboard?.on("keydown-R", () => this.scene.restart());
    this.cameras.main.fadeIn(450, 49, 35, 26);
    this.time.delayedCall(350, () => {
      this.showToast("第一日 · 辰时", "十文铜钱，一副肩膀。先去菜市备料。", 2600);
    });
  }

  private drawTable() {
    this.cameras.main.setBackgroundColor("#a5a873");
    const paper = this.add.graphics();
    paper.fillStyle(0xa5a873, 1);
    paper.fillRoundedRect(0, 0, GAME_WIDTH, GAME_HEIGHT, 18);

    const tile = 48;
    for (let row = 0; row < Math.ceil(GAME_HEIGHT / tile); row += 1) {
      for (let column = 0; column < Math.ceil(GAME_WIDTH / tile); column += 1) {
        paper.fillStyle((row + column) % 2 === 0 ? 0xb6b77e : 0x9b9e6c, 0.34);
        paper.fillRect(column * tile, row * tile, tile, tile);
      }
    }

    for (let i = 0; i < 42; i += 1) {
      const x = Phaser.Math.Between(18, GAME_WIDTH - 18);
      const y = Phaser.Math.Between(20, GAME_HEIGHT - 20);
      const length = Phaser.Math.Between(12, 46);
      paper.lineStyle(1, i % 3 === 0 ? 0x353628 : 0xfff5c5, 0.08);
      paper.beginPath();
      paper.moveTo(x, y);
      paper.lineTo(x + length, y + Phaser.Math.Between(-3, 3));
      paper.strokePath();
    }

    paper.fillStyle(0xc8b96c, 1);
    paper.fillRect(0, 0, GAME_WIDTH, 78);
    paper.fillStyle(0x202018, 1);
    paper.fillRect(0, 78, GAME_WIDTH, 3);

    paper.lineStyle(3, 0x202018, 1);
    paper.strokeRoundedRect(22, 94, 1010, 556, 18);
    paper.fillStyle(0xfff4bf, 0.78);
    paper.fillRoundedRect(22, 94, 1010, 556, 18);

    paper.fillStyle(0xdad79c, 0.88);
    paper.fillRoundedRect(1050, 94, 208, 556, 15);
    paper.lineStyle(3, 0x202018, 1);
    paper.strokeRoundedRect(1050, 94, 208, 556, 15);

    this.add
      .text(40, 101, "今日桌面", {
        fontFamily: '"Noto Serif SC", "Songti SC", serif',
        fontSize: "15px",
        color: "#202018",
        fontStyle: "bold",
      })
      .setAlpha(0.7);

    const restartBg = this.add
      .rectangle(1203, 38, 100, 36, 0xfff4bf, 1)
      .setStrokeStyle(2.5, 0x202018, 1)
      .setInteractive({ useHandCursor: true });
    const restartText = this.add
      .text(1203, 38, "↻  重开本日", {
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: "13px",
        color: "#202018",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.enableHitAreaDebug(restartBg, 0x2f8f2f);
    restartBg.on("pointerdown", () => {
      restartBg.setFillStyle(0xe3cb72);
      this.scene.restart();
    });
    restartBg.on("pointerover", () => restartText.setColor("#9a3e31"));
    restartBg.on("pointerout", () => restartText.setColor("#202018"));

    const footer = this.add.rectangle(516, 680, 988, 52, 0x202018, 0.96);
    footer.setStrokeStyle(2, 0x85885f, 1);
    this.add
      .text(48, 662, "掌柜提示", {
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: "11px",
        color: "#d9ce78",
        fontStyle: "bold",
      })
      .setOrigin(0, 0);
    this.hintText = this.add
      .text(126, 673, "", {
        fontFamily: '"Noto Serif SC", "Songti SC", serif',
        fontSize: "16px",
        color: "#fff2d6",
        wordWrap: { width: 850 },
      })
      .setOrigin(0, 0.5);
  }

  private createHud() {
    this.add.text(30, 18, "叠叠客栈", {
      fontFamily: '"Noto Serif SC", "Songti SC", serif',
      fontSize: "28px",
      color: "#202018",
      fontStyle: "bold",
    });
    this.add.text(31, 50, "把烟火气，一张张叠起来", {
      fontFamily: "ui-sans-serif, system-ui, sans-serif",
      fontSize: "10px",
      color: "#5f6043",
      letterSpacing: 2,
    });

    this.phaseText = this.createHudChip(294, 38, 134, "辰时 · 开张", 0xb34230);
    this.coinHud = this.createHudChip(455, 38, 132, "钱串  10 文", 0x9c6b28);
    this.repHud = this.createHudChip(614, 38, 126, "口碑  0", 0x4c7255);
    this.servedHud = this.createHudChip(766, 38, 140, "客人  0 / 2", 0x3d6076);
  }

  private createHudChip(x: number, y: number, width: number, label: string, accent: number) {
    this.add.rectangle(x, y, width, 36, 0xfff4bf, 1).setStrokeStyle(2.5, 0x202018, 1);
    this.add.rectangle(x - width / 2 + 6, y, 6, 28, accent, 1);
    return this.add
      .text(x + 3, y, label, {
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: "13px",
        color: "#202018",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
  }

  private createGoalCard() {
    this.add.rectangle(1154, 142, 168, 52, 0xa6ad74, 1).setStrokeStyle(3, 0x202018, 1);
    this.add
      .text(1154, 132, "第一日账本", {
        fontFamily: '"Noto Serif SC", "Songti SC", serif',
        fontSize: "19px",
        color: "#202018",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.add
      .text(1154, 153, "把小摊变成客栈", {
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: "10px",
        color: "#42432e",
      })
      .setOrigin(0.5);

    const goalCopy = ["到菜市采买一次", "煮好两碗热汤面", "招待两位赶路人", "把面摊升级成客栈"];
    goalCopy.forEach((copy, index) => {
      const lineY = 204 + index * 51;
      this.add.circle(1081, lineY, 11, 0xfff4bf, 1).setStrokeStyle(2, 0x202018, 1);
      const line = this.add.text(1100, lineY, copy, {
        fontFamily: '"Noto Serif SC", "Songti SC", serif',
        fontSize: "13px",
        color: "#292a20",
        wordWrap: { width: 134 },
      });
      line.setOrigin(0, 0.5);
      this.goalLines.push(line);
    });

    this.add.line(1154, 415, -70, 0, 70, 0, 0x202018, 0.65).setLineWidth(2);
    this.add.text(1082, 437, "堆叠秘方", {
      fontFamily: "ui-sans-serif, system-ui, sans-serif",
      fontSize: "11px",
      color: "#833d32",
      fontStyle: "bold",
    });
    this.add.text(1082, 462, "采买", {
      fontFamily: "ui-sans-serif, system-ui, sans-serif",
      fontSize: "11px",
      color: "#735642",
      fontStyle: "bold",
    });
    this.add.text(1082, 482, "掌柜 + 钱串 + 菜市", {
      fontFamily: '"Noto Serif SC", "Songti SC", serif',
      fontSize: "12px",
      color: "#3c3027",
    });
    this.add.text(1082, 515, "下厨", {
      fontFamily: "ui-sans-serif, system-ui, sans-serif",
      fontSize: "11px",
      color: "#735642",
      fontStyle: "bold",
    });
    this.add.text(1082, 535, "掌柜 + 菜 + 面粉 + 灶", {
      fontFamily: '"Noto Serif SC", "Songti SC", serif',
      fontSize: "12px",
      color: "#3c3027",
    });
    this.add.text(1082, 568, "升店", {
      fontFamily: "ui-sans-serif, system-ui, sans-serif",
      fontSize: "11px",
      color: "#735642",
      fontStyle: "bold",
    });
    this.add.text(1082, 588, "掌柜 + 12 文 + 面摊", {
      fontFamily: '"Noto Serif SC", "Songti SC", serif',
      fontSize: "12px",
      color: "#3c3027",
    });
  }

  private dealOpeningHand() {
    this.addCard("stall", 145, 224);
    this.addCard("market", 342, 224);
    this.addCard("stove", 539, 224);
    this.addCard("owner", 195, 494);
    this.addCard("coin", 395, 494);
  }

  private addCard(
    kind: CardKind,
    x: number,
    y: number,
    override?: { title?: string; subtitle?: string },
  ) {
    const id = `${kind}-${++this.cardSerial}`;
    const spec = CARD_SPECS[kind];
    const container = this.add.container(x, y).setDepth(this.reserveCardDepths());
    const shadow = this.add.rectangle(5, 6, CARD_WIDTH, CARD_HEIGHT, 0x202018, 0.24);
    shadow.setStrokeStyle(0);
    const glow = this.add
      .rectangle(0, 0, CARD_WIDTH + 12, CARD_HEIGHT + 12, 0xe3c75f, 0.02)
      .setStrokeStyle(4, 0xe3c75f, 1)
      .setAlpha(0);
    const body = this.add.rectangle(0, 0, CARD_WIDTH, CARD_HEIGHT, spec.paper, 1);
    body.setStrokeStyle(3, 0x202018, 1);
    const stripe = this.add.rectangle(0, -72, CARD_WIDTH - 5, 22, spec.accent, 1);
    stripe.setStrokeStyle(2, 0x202018, 1);
    const artPlate = this.add.rectangle(0, -16, 108, 92, 0xfff8d6, 1);
    artPlate.setStrokeStyle(0);

    let art: Phaser.GameObjects.Image | Phaser.GameObjects.Container;
    if (spec.atlas && spec.frame !== undefined) {
      art = this.add.image(0, -16, spec.atlas, spec.frame).setDisplaySize(96, 90);
    } else {
      const coinIcon = this.add.container(0, -16);
      const halo = this.add.circle(0, 0, 43, 0xffef9d, 0.72);
      const outer = this.add.circle(0, 0, 31, 0xd3b65d, 1).setStrokeStyle(4, 0x202018, 1);
      const inner = this.add.circle(0, 0, 22, 0xffe891, 1).setStrokeStyle(2, 0x202018, 1);
      const hole = this.add.rectangle(0, 0, 11, 11, 0x202018, 1);
      const coinWord = this.add
        .text(0, 0, "文", {
          fontFamily: '"Noto Serif SC", "Songti SC", serif',
          fontSize: "15px",
          color: "#fff3b4",
          fontStyle: "bold",
        })
        .setOrigin(0.5);
      coinIcon.add([halo, outer, inner, hole, coinWord]);
      art = coinIcon;
    }

    const typeTag = this.add
      .text(-52, 43, spec.typeLabel, {
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: "8px",
        color: "#4b4b35",
        fontStyle: "bold",
      })
      .setOrigin(0, 0);
    const titleText = this.add
      .text(-53, -72, override?.title ?? spec.title, {
        fontFamily: '"Noto Serif SC", "Songti SC", serif',
        fontSize: "14px",
        color: "#202018",
        fontStyle: "bold",
        wordWrap: { width: 104 },
      })
      .setOrigin(0, 0.5);
    const divider = this.add.rectangle(-6, 52, 82, 2, 0x202018, 0.78);
    const subtitleText = this.add
      .text(-52, 58, override?.subtitle ?? spec.subtitle, {
        fontFamily: '"Noto Serif SC", "Songti SC", serif',
        fontSize: "8px",
        color: "#55523d",
        align: "left",
        wordWrap: { width: 82 },
        lineSpacing: 1,
      })
      .setOrigin(0, 0);
    const badgeCircle = this.add.circle(48, 65, 14, 0x202018, 1).setStrokeStyle(2, 0xffefb0, 1);
    const badge = this.add
      .text(48, 65, kind === "coin" ? `${this.coins}` : cardBadge(kind), {
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: "10px",
        color: "#fff8cf",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    container.add([
      shadow,
      glow,
      body,
      stripe,
      artPlate,
      art,
      typeTag,
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
      typeText: typeTag,
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
    this.tweens.add({
      targets: container,
      scale: 1,
      alpha: 1,
      duration: 260,
      ease: "Back.Out",
    });
    return card;
  }

  private enableCardInput(card: CardView) {
    if (card.gone || card.locked) return;
    // Phaser normalizes pointer coordinates by adding displayOriginX/Y before
    // invoking the callback. Containers therefore need a 0..width / 0..height
    // hit area. Using negative half extents shifts the active region up-left.
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
        if (!card || card.locked || card.gone || this.recipeRunning || this.summaryOpen) return;
        this.detach(card);
        card.container.setDepth(this.reserveCardDepths());
        card.container.input!.cursor = "grabbing";
        this.tweens.add({ targets: card.container, scale: 1.05, angle: 0, duration: 90 });
        this.hintText.setText(`拿起「${card.titleText.text}」——把它叠到另一张牌上试试。`);
      },
    );

    this.input.on(
      Phaser.Input.Events.DRAG,
      (_pointer: Phaser.Input.Pointer, object: Phaser.GameObjects.GameObject, dragX: number, dragY: number) => {
        const card = this.cardFromObject(object);
        if (!card || card.locked || this.recipeRunning) return;
        const halfWidth = (CARD_WIDTH * Math.abs(card.container.scaleX)) / 2;
        const halfHeight = (CARD_HEIGHT * Math.abs(card.container.scaleY)) / 2;
        card.container.setPosition(
          Phaser.Math.Clamp(dragX, BOARD_LEFT + halfWidth, BOARD_RIGHT - halfWidth),
          Phaser.Math.Clamp(dragY, BOARD_TOP + halfHeight, BOARD_BOTTOM - halfHeight),
        );
      },
    );

    this.input.on(
      Phaser.Input.Events.DRAG_END,
      (_pointer: Phaser.Input.Pointer, object: Phaser.GameObjects.GameObject) => {
        const card = this.cardFromObject(object);
        if (!card || card.locked || card.gone || this.recipeRunning) return;
        card.container.input!.cursor = "grab";
        this.tweens.add({ targets: card.container, scale: 1, angle: 0, duration: 110 });
        const target = this.findDropTarget(card);
        if (target) {
          card.stackTarget = target.id;
          card.stackRank = ++this.stackSerial;
          const root = this.findRoot(target);
          this.layoutPile(root);
          this.time.delayedCall(180, () => this.evaluatePile(root));
        } else {
          card.stackTarget = undefined;
          card.stackRank = 0;
          card.homeX = card.container.x;
          card.homeY = card.container.y;
          card.container.setDepth(this.reserveCardDepths());
          this.refreshGuidance();
        }
      },
    );
  }

  private cardFromObject(object: Phaser.GameObjects.GameObject) {
    const id = object.getData("cardId") as string | undefined;
    return id ? this.cards.get(id) : undefined;
  }

  private reserveCardDepths(count = 1) {
    const requested = Math.max(1, count);
    if (this.cardDepthSerial + requested >= CARD_DEPTH_CEILING) {
      const orderedCards = [...this.cards.values()]
        .filter((card) => !card.gone)
        .sort(
          (left, right) =>
            left.container.depth - right.container.depth || left.stackRank - right.stackRank,
        );
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
    const minimumOverlap = draggedBounds.width * draggedBounds.height * 0.14;

    this.cards.forEach((candidate) => {
      if (candidate.id === card.id || candidate.gone || candidate.locked) return;
      const candidateBounds = this.cardWorldBounds(candidate);
      const overlapWidth = Math.max(
        0,
        Math.min(draggedBounds.right, candidateBounds.right) -
          Math.max(draggedBounds.left, candidateBounds.left),
      );
      const overlapHeight = Math.max(
        0,
        Math.min(draggedBounds.bottom, candidateBounds.bottom) -
          Math.max(draggedBounds.top, candidateBounds.top),
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

  private detach(card: CardView) {
    const oldTarget = card.stackTarget;
    const dependents = [...this.cards.values()].filter(
      (candidate) => !candidate.gone && candidate.stackTarget === card.id,
    );
    dependents.forEach((candidate) => {
      candidate.stackTarget = oldTarget;
    });
    card.stackTarget = undefined;
    card.stackRank = 0;

    const oldTargetCard = oldTarget ? this.cards.get(oldTarget) : undefined;
    const remainingPile = oldTargetCard && !oldTargetCard.gone ? oldTargetCard : dependents[0];
    if (remainingPile) this.layoutPile(remainingPile);
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
      .sort((a, b) => a.stackRank - b.stackRank);
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
      const y = rootY + index * STACK_Y;
      member.container.setDepth(firstDepth + index);
      this.tweens.add({
        targets: member.container,
        x: rootX,
        y,
        angle: 0,
        duration: 160,
        ease: "Sine.Out",
      });
    });
  }

  private evaluatePile(card: CardView) {
    if (this.recipeRunning || this.summaryOpen) return;
    const root = this.findRoot(card);
    const pile = this.getPile(root);

    if (exactKinds(pile, ["owner", "coin", "market"])) {
      if (this.coins < 3) {
        this.showToast("钱不够", "菜农摇摇头：三文钱，一文都不能少。", 1900);
        this.scatterPile(pile);
        return;
      }
      this.runRecipe(root, pile, "讨价还价 · 采买中", 1050, () => this.resolvePurchase(pile));
      return;
    }

    if (exactKinds(pile, ["owner", "veg", "flour", "stove"])) {
      this.runRecipe(root, pile, "和面、烧水、下面", 1450, () => this.resolveCooking(pile));
      return;
    }

    if (exactKinds(pile, ["noodles", "guest"])) {
      this.runRecipe(root, pile, "热面上桌", 850, () => this.resolveServing(pile));
      return;
    }

    if (exactKinds(pile, ["owner", "coin", "stall"])) {
      if (this.served < 2) {
        this.showToast("还不到时候", "先招待两位客人，让街坊知道你的手艺。", 2100);
        this.scatterPile(pile);
        return;
      }
      if (this.coins < 12) {
        this.showToast("少了几文", `翻遍钱袋还差 ${12 - this.coins} 文。`, 2000);
        this.scatterPile(pile);
        return;
      }
      this.runRecipe(root, pile, "搭屋檐、挂灯笼", 1800, () => this.resolveUpgrade(pile));
      return;
    }

    const titles = pile.map((item) => `「${item.titleText.text}」`).join(" + ");
    this.hintText.setText(`${titles} 暂时凑不成一件事。抓走最上面的牌，再换一种叠法。`);
    this.pulsePile(pile, 0xd07a39);
  }

  private runRecipe(
    root: CardView,
    pile: CardView[],
    label: string,
    duration: number,
    resolve: () => void,
  ) {
    this.recipeRunning = true;
    pile.forEach((card) => {
      card.locked = true;
      card.container.disableInteractive();
    });
    this.clearHighlights();

    const y = Math.max(106, root.container.y - 108);
    const panel = this.add.container(root.container.x + 36, y).setDepth(4500);
    const back = this.add.rectangle(0, 0, 186, 48, 0x3b2b24, 0.97).setStrokeStyle(1.5, 0xc09a65, 1);
    const text = this.add
      .text(0, -8, label, {
        fontFamily: '"Noto Serif SC", "Songti SC", serif',
        fontSize: "13px",
        color: "#fff0d2",
      })
      .setOrigin(0.5);
    const track = this.add.rectangle(0, 12, 150, 7, 0x1e1714, 1);
    const fill = this.add.rectangle(-75, 12, 150, 7, 0xd9a84b, 1).setOrigin(0, 0.5).setScale(0, 1);
    panel.add([back, text, track, fill]);
    this.tweens.add({ targets: fill, scaleX: 1, duration, ease: "Sine.InOut" });
    this.tweens.add({
      targets: pile.map((item) => item.container),
      y: "+=2",
      yoyo: true,
      repeat: Math.max(2, Math.floor(duration / 180)),
      duration: 85,
      ease: "Sine.InOut",
    });

    this.time.delayedCall(duration, () => {
      panel.destroy(true);
      resolve();
      this.recipeRunning = false;
      this.refreshAll();
    });
  }

  private resolvePurchase(pile: CardView[]) {
    this.coins -= 3;
    this.spent += 3;
    this.purchases += 1;
    this.returnCards(pile);
    this.addCard("veg", 704, 474);
    this.addCard("flour", 862, 474);
    this.showToast("采买归来", "三文钱换来一篮青菜和一袋面粉。", 2100);
  }

  private resolveCooking(pile: CardView[]) {
    const veg = pile.find((card) => card.kind === "veg");
    const flour = pile.find((card) => card.kind === "flour");
    if (veg) this.removeCard(veg);
    if (flour) this.removeCard(flour);
    this.returnCards(pile.filter((card) => card.kind === "owner" || card.kind === "stove"));
    this.cooked += 1;
    this.addCard("noodles", 705, 378, {
      subtitle: this.cooked === 1 ? "第一碗，汤清面亮" : "第二碗，火候正好",
    });
    if (this.cooked === 1) {
      this.phaseText.setText("午时 · 来客");
      this.time.delayedCall(450, () => {
        this.addCard("guest", 882, 226, {
          title: "赶路客商",
          subtitle: "闻着汤香停下了脚",
        });
        this.showToast("门帘一响", "第一位客人来了：把热汤面叠到他身上。", 2300);
        this.refreshAll();
      });
    } else {
      this.showToast("又一碗出锅", "灶火正旺，别让客人等凉了。", 1700);
    }
  }

  private resolveServing(pile: CardView[]) {
    const root = pile[0];
    pile.forEach((card) => this.removeCard(card));
    this.coins += 8;
    this.earnings += 8;
    this.reputation += 1;
    this.served += 1;
    this.floatReward(root.container.x, root.container.y, "+8 文  ·  口碑 +1");

    if (this.served === 1) {
      this.phaseText.setText("未时 · 正忙");
      this.time.delayedCall(650, () => {
        this.addCard("guest", 884, 227, {
          title: "进城货郎",
          subtitle: "听客商说这里有热面",
        });
        this.showToast("口碑传开", "又有一位赶路人坐下。照方再做一碗。", 2300);
        this.refreshAll();
      });
    } else {
      this.phaseText.setText("酉时 · 收摊");
      this.time.delayedCall(280, () => {
        this.showToast("两桌皆欢", "赚够了！把小掌柜和钱串叠到露天面摊上。", 2800);
      });
    }
  }

  private resolveUpgrade(pile: CardView[]) {
    this.coins -= 12;
    this.spent += 12;
    this.reputation += 1;
    const stall = pile.find((card) => card.kind === "stall");
    this.returnCards(pile.filter((card) => card.kind === "owner" || card.kind === "coin"));
    if (stall) this.transformIntoInn(stall);
    this.upgraded = true;
    this.phaseText.setText("戌时 · 打烊");
    try {
      window.localStorage.setItem("stacked-inn-day-one", "complete");
    } catch {
      // Local completion is a convenience; the day still completes without storage.
    }
    this.showToast("面摊有了屋檐", "灯笼亮起，叠叠客栈的第一夜开始了。", 2500);
    this.time.delayedCall(1850, () => this.openSummary());
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
        duration: 420,
        ease: "Back.Out",
      });
    });
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
      duration: 240,
      ease: "Sine.In",
      onComplete: () => {
        card.container.destroy(true);
        this.cards.delete(card.id);
      },
    });
  }

  private transformIntoInn(card: CardView) {
    card.stackTarget = undefined;
    card.stackRank = 0;
    card.kind = "inn";
    card.locked = false;
    card.titleText.setText(CARD_SPECS.inn.title);
    card.subtitleText.setText(CARD_SPECS.inn.subtitle);
    card.typeText.setText(CARD_SPECS.inn.typeLabel);
    card.badge.setText(cardBadge("inn"));
    if (card.art instanceof Phaser.GameObjects.Image) {
      card.art.setTexture("scenes", 3);
    }
    card.container.setDepth(this.reserveCardDepths());
    this.tweens.add({
      targets: card.container,
      scale: 1.2,
      angle: { from: -2, to: 2 },
      yoyo: true,
      duration: 380,
      repeat: 1,
      ease: "Sine.InOut",
      onComplete: () => {
        card.container.setScale(1).setAngle(0);
        this.enableCardInput(card);
      },
    });
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
        duration: 420,
        delay: Phaser.Math.Between(0, 70),
        ease: "Back.Out",
      });
    });
    this.time.delayedCall(460, () => this.refreshAll());
  }

  private pulsePile(pile: CardView[], color: number) {
    pile.forEach((card) => {
      card.glow.setStrokeStyle(4, color, 1).setAlpha(0.9);
      this.tweens.add({
        targets: card.glow,
        alpha: 0,
        duration: 520,
        ease: "Sine.Out",
      });
    });
  }

  private showToast(title: string, body: string, lifetime: number) {
    if (this.summaryOpen) return;
    const toast = this.add.container(788, 113).setDepth(5000).setAlpha(0).setScale(0.94);
    const shadow = this.add.rectangle(4, 5, 430, 64, 0x3b281f, 0.18);
    const panel = this.add.rectangle(0, 0, 430, 64, 0xf7ebd2, 0.98).setStrokeStyle(1.5, 0x6b4933, 0.9);
    const seal = this.add.circle(-191, 0, 15, 0xaa3f30, 1);
    const sealText = this.add
      .text(-191, 0, "栈", {
        fontFamily: '"Noto Serif SC", "Songti SC", serif',
        fontSize: "13px",
        color: "#fff0d2",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    const titleText = this.add.text(-167, -20, title, {
      fontFamily: '"Noto Serif SC", "Songti SC", serif',
      fontSize: "14px",
      color: "#9d392c",
      fontStyle: "bold",
    });
    const bodyText = this.add.text(-167, 4, body, {
      fontFamily: '"Noto Serif SC", "Songti SC", serif',
      fontSize: "12px",
      color: "#47362c",
      wordWrap: { width: 360 },
    });
    toast.add([shadow, panel, seal, sealText, titleText, bodyText]);
    this.tweens.add({ targets: toast, alpha: 1, scale: 1, y: 120, duration: 220, ease: "Back.Out" });
    this.time.delayedCall(lifetime, () => {
      if (!toast.active) return;
      this.tweens.add({
        targets: toast,
        alpha: 0,
        y: 102,
        duration: 220,
        onComplete: () => toast.destroy(true),
      });
    });
  }

  private floatReward(x: number, y: number, copy: string) {
    const reward = this.add
      .text(x, y - 70, copy, {
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: "16px",
        color: "#fff3cf",
        backgroundColor: "#6d492e",
        padding: { x: 10, y: 6 },
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(5200);
    this.tweens.add({
      targets: reward,
      y: reward.y - 54,
      alpha: 0,
      duration: 1150,
      ease: "Sine.Out",
      onComplete: () => reward.destroy(),
    });
  }

  private refreshAll() {
    this.coinHud.setText(`钱串  ${this.coins} 文`);
    this.repHud.setText(`口碑  ${this.reputation}`);
    this.servedHud.setText(`客人  ${this.served} / 2`);
    this.cards.forEach((card) => {
      if (card.kind === "coin") {
        card.badge.setText(`${this.coins}`);
        card.subtitleText.setText(`${this.coins} 文钱 · 可堆叠消费`);
      }
    });
    this.updateGoals();
    this.refreshGuidance();
  }

  private updateGoals() {
    const states = [this.purchases >= 1, this.cooked >= 2, this.served >= 2, this.upgraded];
    states.forEach((done, index) => {
      const line = this.goalLines[index];
      line.setText(`${done ? "✓" : "○"}  ${line.text.replace(/^[✓○]\s+/, "")}`);
      line.setColor(done ? "#4d7251" : "#4a382c");
      line.setAlpha(done ? 0.72 : 1);
    });
  }

  private refreshGuidance() {
    if (this.recipeRunning || this.summaryOpen || this.upgraded) return;
    const has = (kind: CardKind) => [...this.cards.values()].some((card) => card.kind === kind && !card.gone);

    if (this.served >= 2) {
      this.setGuidance(
        ["owner", "coin", "stall"],
        "最后一步：把「小掌柜」与「钱串」叠到「露天面摊」上，花 12 文搭出客栈。",
      );
    } else if (has("noodles") && has("guest")) {
      this.setGuidance(["noodles", "guest"], "客人正饿：把「热汤面」直接叠到「客人」身上。");
    } else if (has("veg") && has("flour")) {
      this.setGuidance(
        ["owner", "veg", "flour", "stove"],
        "该下厨了：把「小掌柜」「青菜」「面粉」都叠到「简陋灶台」上。",
      );
    } else {
      this.setGuidance(
        ["owner", "coin", "market"],
        "先采买：把「小掌柜」和「钱串」依次叠到「清晨菜市」上。",
      );
    }
  }

  private setGuidance(kinds: CardKind[], copy: string) {
    this.activeHintKinds = kinds;
    this.hintText.setText(copy);
    this.cards.forEach((card) => {
      const active = kinds.includes(card.kind) && !card.gone;
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
    this.activeHintKinds = [];
    this.cards.forEach((card) => {
      this.tweens.killTweensOf(card.glow);
      card.glow.setAlpha(0);
    });
  }

  private openSummary() {
    if (this.summaryOpen) return;
    this.summaryOpen = true;
    this.clearHighlights();
    this.cards.forEach((card) => card.container.disableInteractive());

    const curtain = this.add.container(640, 360).setDepth(9000).setAlpha(0);
    const shade = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x251c18, 0.72)
      .setInteractive();
    const shadow = this.add.rectangle(8, 11, 548, 566, 0x241712, 0.35);
    const paper = this.add.rectangle(0, 0, 548, 566, 0xf4e8cf, 1).setStrokeStyle(3, 0x4b3428, 1);
    const redTop = this.add.rectangle(0, -265, 542, 30, 0xa33d2f, 1);
    const title = this.add
      .text(0, -225, "第一日 · 收账", {
        fontFamily: '"Noto Serif SC", "Songti SC", serif',
        fontSize: "31px",
        color: "#392a22",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    const subtitle = this.add
      .text(0, -184, "一块布棚，终于叠成了一盏门灯。", {
        fontFamily: '"Noto Serif SC", "Songti SC", serif',
        fontSize: "15px",
        color: "#745d4b",
      })
      .setOrigin(0.5);
    const rule = this.add.rectangle(0, -153, 436, 1, 0x7b5b43, 0.35);

    const statBack = this.add.rectangle(-116, -82, 202, 116, 0xe5d0aa, 0.76).setStrokeStyle(1, 0x8a684b, 0.5);
    const statText = this.add
      .text(-116, -83, `营业进账\n${this.earnings} 文`, {
        fontFamily: '"Noto Serif SC", "Songti SC", serif',
        fontSize: "17px",
        color: "#3e3027",
        align: "center",
        lineSpacing: 8,
      })
      .setOrigin(0.5);
    const guestBack = this.add.rectangle(116, -82, 202, 116, 0xd9e0d2, 0.82).setStrokeStyle(1, 0x61765f, 0.5);
    const guestText = this.add
      .text(116, -83, `满意客人\n${this.served} 位`, {
        fontFamily: '"Noto Serif SC", "Songti SC", serif',
        fontSize: "17px",
        color: "#354437",
        align: "center",
        lineSpacing: 8,
      })
      .setOrigin(0.5);

    const unlocked = this.add.text(-213, 8, "今日解锁", {
      fontFamily: "ui-sans-serif, system-ui, sans-serif",
      fontSize: "11px",
      color: "#9b3c2e",
      fontStyle: "bold",
    });
    const unlockedTitle = this.add.text(-213, 31, "一间小客栈", {
      fontFamily: '"Noto Serif SC", "Songti SC", serif',
      fontSize: "21px",
      color: "#382a22",
      fontStyle: "bold",
    });
    const unlockedBody = this.add.text(-213, 64, `花出 ${this.spent} 文 · 余下 ${this.coins} 文 · 口碑 ${this.reputation}\n明日开始，客人会住宿，也会有人来应聘伙计。`, {
      fontFamily: '"Noto Serif SC", "Songti SC", serif',
      fontSize: "13px",
      color: "#6f5b4a",
      lineSpacing: 6,
      wordWrap: { width: 426 },
    });

    const replayBg = this.add
      .rectangle(-112, 181, 188, 58, 0xa23c2e, 1)
      .setStrokeStyle(2, 0x4a2b23, 1)
      .setInteractive({ useHandCursor: true });
    const replayText = this.add
      .text(-112, 181, "↻  再摆一天", {
        fontFamily: '"Noto Serif SC", "Songti SC", serif',
        fontSize: "16px",
        color: "#fff0d4",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    const tomorrowBg = this.add
      .rectangle(112, 181, 188, 58, 0xe0c99f, 1)
      .setStrokeStyle(2, 0x654937, 1)
      .setInteractive({ useHandCursor: true });
    const tomorrowText = this.add
      .text(112, 181, "翻看明日账页", {
        fontFamily: '"Noto Serif SC", "Songti SC", serif',
        fontSize: "16px",
        color: "#45332a",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.enableHitAreaDebug(shade, 0x4777cc);
    this.enableHitAreaDebug(replayBg, 0x2f8f2f);
    this.enableHitAreaDebug(tomorrowBg, 0x2f8f2f);
    const foot = this.add
      .text(0, 242, "第一日流程完成", {
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: "11px",
        color: "#917964",
        letterSpacing: 2,
      })
      .setOrigin(0.5);

    curtain.add([
      shade,
      shadow,
      paper,
      redTop,
      title,
      subtitle,
      rule,
      statBack,
      statText,
      guestBack,
      guestText,
      unlocked,
      unlockedTitle,
      unlockedBody,
      replayBg,
      replayText,
      tomorrowBg,
      tomorrowText,
      foot,
    ]);
    this.completionCurtain = curtain;

    replayBg.on("pointerover", () => replayBg.setFillStyle(0xb84a38));
    replayBg.on("pointerout", () => replayBg.setFillStyle(0xa23c2e));
    replayBg.on("pointerdown", () => this.scene.restart());

    tomorrowBg.on("pointerover", () => tomorrowBg.setFillStyle(0xead9ba));
    tomorrowBg.on("pointerout", () => tomorrowBg.setFillStyle(0xe0c99f));
    tomorrowBg.on("pointerdown", () => {
      tomorrowBg.disableInteractive();
      tomorrowText.setText("第二日 · 招人手");
      unlockedTitle.setText("小伙计阿满");
      unlockedBody.setText("明早，他会抱着账簿来敲门。\n把伙计叠到灶台、柜台或客房上，就能同时处理多份生意。\n\n—— 第一版至此，敬请期待第二日。 ");
      this.tweens.add({ targets: [unlockedTitle, unlockedBody], alpha: { from: 0.2, to: 1 }, duration: 420 });
    });

    this.tweens.add({ targets: curtain, alpha: 1, duration: 420, ease: "Sine.Out" });
  }
}

export function createInnGame(parent: HTMLElement) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: "#e7d3ae",
    transparent: false,
    scene: [InnScene],
    render: {
      antialias: true,
      pixelArt: false,
      roundPixels: true,
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
    },
    input: {
      activePointers: 3,
    },
  });
}
