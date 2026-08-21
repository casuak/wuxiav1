import * as Phaser from "phaser";

const WIDTH = 430;
const HEIGHT = 860;
const FONT = '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif';
const RENDER_SCALE = typeof window === "undefined"
  ? 1
  : Math.min(3, Math.max(1, Math.ceil(window.devicePixelRatio || 1)));
const TEXT_RESOLUTION = Math.max(2, RENDER_SCALE);
const PAPER = 0xfff2bf;
const INK = 0x202018;
const MODE_INK_FRAGMENT_SHADER = `
#define SHADER_NAME TEN_DAY_INN_MODE_INK
precision mediump float;
uniform sampler2D uMainSampler;
uniform vec2 uResolution;
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
  color += vec3((paperHash(paperCell) - 0.5) * 0.013);
  gl_FragColor = vec4(clamp(color, 0.0, 1.0), source.a);
}
`;

class ModeInkPostFX extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game: Phaser.Game) {
    super({
      game,
      name: "ModeInkPostFX",
      renderTarget: true,
      fragShader: MODE_INK_FRAGMENT_SHADER,
    });
  }

  onPreRender() {
    this.set2f("uResolution", this.renderer.width, this.renderer.height);
  }
}

const colorCss = (color: number) => "#" + color.toString(16).padStart(6, "0");

class ModeUiScene extends Phaser.Scene {
  protected text(
    x: number,
    y: number,
    copy: string,
    style?: Phaser.Types.GameObjects.Text.TextStyle,
  ) {
    return this.add.text(x, y, copy, {
      fontFamily: FONT,
      color: "#202018",
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
      if (!pipelines.postPipelineClasses.has("ModeInkPostFX")) {
        pipelines.addPostPipeline("ModeInkPostFX", ModeInkPostFX);
      }
      this.cameras.main.setPostPipeline("ModeInkPostFX");
    }
  }

  protected drawPaperBackground() {
    this.cameras.main.setBackgroundColor("#969b62");
    const graphics = this.add.graphics();
    graphics.fillStyle(0x969b62, 1).fillRect(0, 0, WIDTH, HEIGHT);
    for (let y = 0; y < HEIGHT; y += 28) {
      for (let x = 0; x < WIDTH; x += 28) {
        graphics.fillStyle(((x + y) / 28) % 2 === 0 ? 0xb0b473 : 0x899158, 0.2);
        graphics.fillRect(x, y, 28, 28);
      }
    }
    graphics.fillStyle(0xc9b96c, 1).fillRect(0, 0, WIDTH, 72);
    graphics.fillStyle(INK, 1).fillRect(0, 70, WIDTH, 3);
    graphics.fillStyle(PAPER, 0.96).fillRoundedRect(8, 78, 414, 730, 12);
    graphics.lineStyle(2.5, INK, 1).strokeRoundedRect(8, 78, 414, 730, 12);
    graphics.fillStyle(INK, 0.97).fillRoundedRect(8, 814, 414, 38, 8);
    graphics.fillStyle(0xa54b3b, 1).fillRoundedRect(14, 820, 4, 25, 2);
  }
}

export class InnModeSelectScene extends ModeUiScene {
  constructor() {
    super("inn-mode-select");
  }

  create() {
    this.setupCamera();
    this.drawPaperBackground();
    const layer = this.add.container(0, 0);
    layer.add(this.text(18, 12, "十日客栈", { fontSize: "21px", fontStyle: "bold" }));
    layer.add(this.text(18, 51, "选择玩法 · 两套牌局互不覆盖", {
      fontSize: "10px", fontStyle: "bold", color: "#55563b",
    }));
    layer.add(this.text(28, 100, "这次想经营，还是过招？", {
      fontSize: "18px", fontStyle: "bold",
    }));
    layer.add(this.text(28, 132, "经营存档会原样保留；江湖模式每次都是一场独立实战。", {
      fontSize: "10px", fontStyle: "bold", color: "#5c5b43",
      wordWrap: { width: 360 },
    }));

    this.addModeCard(layer, 215, 282, {
      title: "十日经营",
      label: "原模式",
      glyph: "栈",
      accent: 0x87935f,
      summary: "接客、排班、构筑经营牌组；用十天把小摊撑成大客栈。",
      features: "随机客局 · 三条章法 · 小挑战与大席",
      onTap: () => this.scene.start("inn-deckbuilder"),
    });
    this.addModeCard(layer, 215, 558, {
      title: "江湖过招",
      label: "回合制",
      glyph: "武",
      accent: 0xa45142,
      summary: "拳师或剑客一对一；读敌招、控脚步、搓招式，点燃三门职业绝技。",
      features: "双职业卡池 · 相对距离 · 公开博弈 · 三绝式",
      onTap: () => this.scene.start("inn-duel"),
    });

    layer.add(this.text(215, 752, "两种模式共用同一套手机竖屏交互", {
      fontSize: "10px", fontStyle: "bold", color: "#676246",
    }).setOrigin(0.5));
    layer.add(this.text(24, 825, "点选一种玩法开始；随时可从顶部返回模式选择。", {
      fontSize: "10px", fontStyle: "bold", color: "#fff3c8",
    }));
  }

  private addModeCard(
    layer: Phaser.GameObjects.Container,
    x: number,
    y: number,
    options: {
      title: string;
      label: string;
      glyph: string;
      accent: number;
      summary: string;
      features: string;
      onTap: () => void;
    },
  ) {
    const group = this.add.container(x, y);
    const shadow = this.add.rectangle(4, 6, 382, 238, INK, 0.22);
    const body = this.add.rectangle(0, 0, 382, 238, 0xfff1bd, 1)
      .setStrokeStyle(2.5, INK, 1)
      .setInteractive({ useHandCursor: true });
    const wash = this.add.rectangle(0, 0, 374, 230, options.accent, 0.055);
    const rail = this.add.rectangle(-183, 0, 8, 218, options.accent, 1);
    const halo = this.add.circle(-126, -48, 43, options.accent, 0.16);
    const seal = this.add.circle(-126, -48, 32, options.accent, 0.96).setStrokeStyle(2, INK, 1);
    const glyph = this.text(-126, -48, options.glyph, {
      fontSize: "24px", fontStyle: "bold", color: "#fff2bf",
    }).setOrigin(0.5);
    const tag = this.add.rectangle(130, -88, 72, 23, options.accent, 0.94).setStrokeStyle(1.5, INK, 0.9);
    const tagText = this.text(130, -88, options.label, {
      fontSize: "10px", fontStyle: "bold", color: "#fff2bf",
    }).setOrigin(0.5);
    const title = this.text(-68, -79, options.title, { fontSize: "22px", fontStyle: "bold" });
    const summary = this.text(-68, -35, options.summary, {
      fontSize: "12px", fontStyle: "bold", color: "#4f4e39",
      wordWrap: { width: 220, useAdvancedWrap: true }, maxLines: 3, lineSpacing: 3,
    });
    const rule = this.add.rectangle(0, 58, 338, 50, options.accent, 0.1)
      .setStrokeStyle(1.5, options.accent, 0.75);
    const ruleText = this.text(-158, 58, options.features, {
      fontSize: "10px", fontStyle: "bold", color: colorCss(options.accent),
      wordWrap: { width: 316 }, maxLines: 2,
    }).setOrigin(0, 0.5);
    const enter = this.text(155, 94, "进入 ›", {
      fontSize: "12px", fontStyle: "bold", color: colorCss(options.accent),
    }).setOrigin(1, 0.5);
    group.add([
      shadow, body, wash, rail, halo, seal, glyph, tag, tagText, title, summary, rule, ruleText, enter,
    ]);
    layer.add(group);
    body.on("pointerdown", () => group.setScale(0.985));
    body.on("pointerout", () => group.setScale(1));
    body.on("pointerup", () => {
      group.setScale(1);
      options.onTap();
    });
  }
}

export { DuelInnScene } from "./duelCombatScene";
