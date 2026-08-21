import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const gameSource = await readFile(
  new URL("../app/game/deckInnGame.ts", import.meta.url),
  "utf8",
);
const globalStyles = await readFile(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);

test("container hit areas use Phaser's top-left local input coordinates", () => {
  assert.match(
    gameSource,
    /containerHitArea\(width: number, height: number\)[\s\S]*?new Phaser\.Geom\.Rectangle\(0, 0, width, height\)/,
  );
  assert.doesNotMatch(
    gameSource,
    /new Phaser\.Geom\.Rectangle\(\s*-(?:width|height|\d+)\s*\//,
  );
  assert.ok(
    (gameSource.match(/this\.containerHitArea\(/g) ?? []).length >= 5,
    "every interactive card container should use the shared hit-area helper",
  );
});

test("high-DPI rendering preserves the logical camera coordinate system", () => {
  assert.match(gameSource, /\.setZoom\(RENDER_SCALE\)/);
  assert.match(
    gameSource,
    /\.centerOn\(GAME_WIDTH \/ 2, GAME_HEIGHT \/ 2\)/,
  );
  assert.ok(
    (gameSource.match(/width: GAME_WIDTH \* RENDER_SCALE/g) ?? []).length >= 2,
  );
  assert.ok(
    (gameSource.match(/height: GAME_HEIGHT \* RENDER_SCALE/g) ?? []).length >= 2,
  );
});

test("mobile hand uses one dynamic fan without pagination", () => {
  assert.match(gameSource, /const HAND_FAN_MAX_SPAN = 292;/);
  assert.match(gameSource, /const MAX_HAND_SIZE = 7;/);
  assert.match(gameSource, /encounter\.hand\.forEach\(\(cardId, handIndex\)/);
  assert.match(gameSource, /Math\.min\(HAND_FAN_MAX_SPAN, \(handCount - 1\) \* 112\)/);
  assert.match(gameSource, /setRotation\(cardRotation\)/);
  assert.doesNotMatch(gameSource, /handPage|createHandPageButton|pageSize/);
  assert.ok(
    (gameSource.match(/this\.createCard\(\{/g) ?? []).length <= 3,
    "full vertical cards should be reserved for the hand and end-state hero",
  );
  assert.doesNotMatch(gameSource, /fontSize: "[1-8]px"/);
  assert.match(
    globalStyles,
    /@media \(max-width: 720px\)[\s\S]*?\.site-header, \.site-footer \{ display: none; \}/,
  );
});

test("the lower hand layout exposes live discard and draw pile viewers", () => {
  assert.match(gameSource, /createHudChip\(320, 35, 72, 0xa74d3f, "招"/);
  assert.match(gameSource, /createHudChip\(393, 35, 68, 0x607b69, "组"/);
  assert.match(gameSource, /this\.createPileButton\("discard", 39, 779, encounter\.discardPile\.length\)/);
  assert.match(gameSource, /this\.createPileButton\("draw", 391, 779, encounter\.drawPile\.length\)/);
  assert.match(gameSource, /x: 140, y: 779, width: 144, height: 54/);
  assert.match(gameSource, /x: 290, y: 779, width: 144, height: 54/);
  assert.match(gameSource, /private createPileButton\(kind: PileKind/);
  assert.match(gameSource, /private openPileViewer\(kind: PileKind/);
  assert.match(gameSource, /private closePileViewer\(\)/);
  assert.match(gameSource, /kind === "discard"\s*\? encounter\?\.discardPile \?\? \[\]/);
  assert.match(gameSource, /只显示构成，抽取顺序未知/);
  assert.match(gameSource, /const counts = new Map<string, number>\(\)/);
  assert.match(gameSource, /`一牌两用 · 上限 \$\{MAX_HAND_SIZE\}`/);
  assert.doesNotMatch(gameSource, /const label = discard \? "弃牌" : "抽牌"/);
  assert.doesNotMatch(gameSource, /const unit = this\.text\(13, 3, "张"/);
  assert.doesNotMatch(gameSource, /const action = this\.text\(13, 16, "查看"/);
  assert.match(gameSource, /this\.selectedAction = undefined;[\s\S]*?this\.clearTargetHighlights\(\);[\s\S]*?this\.actionLocked = true;/);
});

test("the top-right card deck chip opens a complete deck composition viewer", () => {
  assert.match(gameSource, /type PileKind = "discard" \| "draw" \| "deck"/);
  assert.match(gameSource, /this\.openPileViewer\("deck"\)/);
  assert.match(gameSource, /this\.deckText\.setText\(`卡组 \$\{run\.deck\.length\}`\)/);
  assert.match(gameSource, /const hit = this\.add\.rectangle\(x, y, width, 40/);
  assert.match(gameSource, /kind === "deck"\s*\? this\.save\.run\.deck/);
  assert.match(gameSource, /kind === "deck" \? "卡组"/);
  assert.match(gameSource, /this\.deckTagSummary\(\) \|\| "尚未形成牌型"/);
  assert.match(gameSource, /`卡组中 \$\{selected\.count\}张`/);
  assert.match(gameSource, /差事：\$\{this\.staffJobDescription\(selected\.cardId\)\}/);
});

test("all card collection grids keep a safe horizontal inset", () => {
  assert.match(gameSource, /const startX = 76;/);
  assert.match(gameSource, /const gapX = 92;/);
  assert.match(gameSource, /const tileWidth = 82;/);
  assert.match(gameSource, /const tileHitWidth = 86;/);
  assert.match(gameSource, /const titleLimit = upgradedMark \? 3 : 4;/);
  assert.doesNotMatch(gameSource, /const startX = 64;/);
  assert.doesNotMatch(gameSource, /const gapX = 100;/);

  const panelLeft = 20;
  const panelRight = 410;
  const selectedScale = 1.045;
  const firstCenter = 76;
  const lastCenter = 76 + 3 * 92;
  const halfSelectedHit = (86 * selectedScale) / 2;
  assert.ok(firstCenter - halfSelectedHit - panelLeft >= 10, "left inset should survive selection scale");
  assert.ok(panelRight - (lastCenter + halfSelectedHit) >= 10, "right inset should survive selection scale");
});

test("hand size, left-edge information, and right-to-left layering are enforced", () => {
  assert.match(gameSource, /encounter\.hand\.length >= MAX_HAND_SIZE/);
  assert.match(gameSource, /encounter\.discardPile\.push\(card\);[\s\S]*?overflow \+= 1/);
  assert.match(gameSource, /parsed\.encounter\.hand\.splice\(MAX_HAND_SIZE\)/);
  assert.match(gameSource, /const HAND_FAN_BASE_DEPTH = 100;/);
  assert.match(gameSource, /\.setDepth\(HAND_FAN_BASE_DEPTH \+ handIndex\)/);
  assert.match(gameSource, /this\.handLayer\?\.add\(card\.container\)/);
  assert.match(gameSource, /this\.handLayer\.moveTo\(card\.container, handIndex\)/);
  assert.match(gameSource, /card\.container\.parentContainer\?\.bringToTop\(card\.container\)/);
  assert.match(gameSource, /const badgeX = -width \/ 2 \+ 13;/);
  assert.match(gameSource, /const title = this\.text\(-width \/ 2 \+ 28/);
  assert.match(gameSource, /const artX = width <= 120 \? -18 : 0;/);
});

test("shader beautification keeps a single sharp source sample and supports WebGL fallback", () => {
  assert.match(gameSource, /class InkPaperPostFXPipeline extends Phaser\.Renderer\.WebGL\.Pipelines\.PostFXPipeline/);
  assert.equal(
    (gameSource.match(/texture2D\(uMainSampler, outTexCoord\)/g) ?? []).length,
    1,
    "post shader must not blur text with neighboring texture samples",
  );
  assert.match(gameSource, /paperHash\(paperCell\)/);
  assert.match(gameSource, /instanceof Phaser\.Renderer\.WebGL\.WebGLRenderer/);
  assert.match(gameSource, /addPostPipeline\("InkPaperPostFX", InkPaperPostFXPipeline\)/);
  assert.match(gameSource, /setPostPipeline\("InkPaperPostFX"\)/);
});

test("core mobile interactions have explicit motion feedback", () => {
  assert.match(gameSource, /const MOTION_ENABLED =/);
  assert.match(gameSource, /const animateDeal = MOTION_ENABLED && this\.handMotionPending/);
  assert.match(gameSource, /setRotation\(Phaser\.Math\.Clamp\(deltaX \* 0\.014, -0\.12, 0\.12\)\)/);
  assert.match(gameSource, /private actionImpact\(/);
  assert.match(gameSource, /scaleX: valid \? 1\.012 : 1/);
});

test("enhancement switching stays anchored while labor gains announce themselves", () => {
  assert.ok(
    (gameSource.match(/const detailContent = this\.add\.container\(0, 0\)/g) ?? []).length >= 2,
    "enhancement and pile viewers should animate only their detail content",
  );
  assert.match(gameSource, /if \(MOTION_ENABLED && preserveState\) \{[\s\S]*?targets: detailContent/);
  assert.match(gameSource, /if \(MOTION_ENABLED && !preserveState\) \{/);
  assert.ok(
    (gameSource.match(/if \(MOTION_ENABLED && !preserveState\) \{/g) ?? []).length >= 2,
    "both viewers should keep their outer layer anchored while switching",
  );
  assert.doesNotMatch(gameSource, /duration: preserveState \?/);
  assert.match(gameSource, /`行动 \$\{encounter\.labor\}\/\$\{this\.maxLabor\(\)\}`/);
  assert.match(gameSource, /private gainLabor\(amount: number, reason: string\)/);
  assert.match(gameSource, /private refillLabor\(reason: string\)/);
  assert.match(gameSource, /private animateLaborGain\(/);
  assert.match(gameSource, /`\+\$\{gained\} 行动`/);
  assert.match(gameSource, /this\.gainLabor\(1, "烟火成章"\)/);
  assert.match(gameSource, /this\.gainLabor\(1, "周转成章"\)/);
  assert.match(gameSource, /this\.gainLabor\(1, "跑堂返还"\)/);
});

test("dual-use cards build a persistent staff pipeline and a breakable three-step route", () => {
  assert.match(gameSource, /type TargetKind = [^;]*"staff"/);
  assert.match(gameSource, /staffJobs: Partial<Record<StaffId, string>>/);
  assert.match(gameSource, /routeProgress: number/);
  assert.match(gameSource, /staffJobs: \{\}/);
  assert.match(gameSource, /routeProgress: 0/);
  assert.match(gameSource, /private renderStaffJobSlots\(encounter: EncounterState\)/);
  assert.match(gameSource, /registerTarget\(`staff:\$\{staffId\}`, "staff"/);
  assert.match(gameSource, /if \(target\.kind === "staff"\) \{/);
  assert.match(gameSource, /private assignStaffJob\(cardId: string, handIndex: number, staffId: StaffId\)/);
  assert.match(gameSource, /encounter\.hand\.splice\(handIndex, 1\)/);
  assert.match(gameSource, /if \(previous\) encounter\.discardPile\.push\(previous\)/);
  assert.match(gameSource, /encounter\.labor -= 1/);
  assert.match(gameSource, /private runStaffJobs\(\)/);
  assert.match(gameSource, /for \(const staffId of this\.save\.run\.staff\)/);
  assert.match(gameSource, /def\.tag === "采办"/);
  assert.match(gameSource, /def\.tag === "烹饪"/);
  assert.match(gameSource, /def\.tag === "跑堂"/);
  assert.match(gameSource, /def\.tag === "人情"/);
  assert.match(gameSource, /def\.tag === "整理"/);
  assert.match(gameSource, /def\.tag === "账房"/);
  assert.match(gameSource, /def\.tag === "客房"/);
  assert.ok(
    (gameSource.match(/this\.spawnCurrentGuests\(\);\s*if \(!this\.runStaffJobs\(\)\) return;/g) ?? []).length >= 2,
    "staff jobs should run at both ordinary tick changes and boss phase changes",
  );
  assert.match(gameSource, /route_fire: \["采办", "烹饪", "跑堂"\]/);
  assert.match(gameSource, /route_hospitality: \["人情", "跑堂", "账房"\]/);
  assert.match(gameSource, /route_order: \["整理", "账房", "采办"\]/);
  assert.match(gameSource, /private advanceRouteProgress\(tag: CardTag\)/);
  assert.match(gameSource, /encounter\.routeProgress = tag === sequence\[0\] \? 1 : 0/);
  assert.match(gameSource, /章法断章/);
  assert.match(gameSource, /排班牌不推进章法/);
  assert.match(gameSource, /差事：\$\{this\.staffJobShort\(cardId\)\}/);
  assert.doesNotMatch(gameSource, /finishRouteAction/);
  assert.doesNotMatch(gameSource, /hospitalityPrimed/);
});

test("staff assignment slots keep names and compact effects inside their cards", () => {
  assert.match(gameSource, /private staffSlotJobShort\(cardId: string\)/);
  assert.match(gameSource, /采办: `料\+\$\{power\}`/);
  assert.match(gameSource, /烹饪: `菜\+\$\{power\}`/);
  assert.match(gameSource, /账房: `钱\+\$\{power\}`/);
  assert.match(gameSource, /this\.add\.rectangle\(0, 0, 60, 34/);
  assert.match(gameSource, /this\.text\(2, -8, this\.staffName\(staffId\)/);
  assert.match(gameSource, /this\.text\(2, 8, def && cardId \? this\.staffSlotJobShort\(cardId\)/);
  assert.ok(
    (gameSource.match(/\}\)\.setOrigin\(0\.5\);/g) ?? []).length >= 2,
    "both staff-slot text rows should be centered",
  );
  assert.match(gameSource, /container\.setSize\(62, 40\)/);
  assert.match(gameSource, /registerTarget\(`staff:\$\{staffId\}`, "staff", container, glow, 62, 40/);
  assert.doesNotMatch(gameSource, /`\$\{def\.glyph\}·\$\{this\.staffJobShort\(cardId\)\}`/);
});

test("guest cards use one aligned identity grid instead of a pasted square portrait", () => {
  assert.match(gameSource, /const GUEST_CARD_GRID = \{/);
  assert.match(gameSource, /portraitX: -145,/);
  assert.match(gameSource, /contentLeft: -91,/);
  assert.match(gameSource, /contentRight: 184,/);
  assert.match(gameSource, /tabInset: 5,/);
  assert.match(gameSource, /twoTabGap: 12,/);
  assert.match(gameSource, /threeTabGap: 9,/);
  assert.match(gameSource, /private maskGuestPortrait\(/);
  assert.match(gameSource, /maskSource\.fillStyle\(0xffffff, 1\)\.fillCircle\(0, 0, radius\)/);
  assert.match(gameSource, /portrait\.setMask\(mask\)/);
  assert.match(gameSource, /const portraitMat = this\.add\.rectangle\(/);
  assert.match(gameSource, /const patienceBg = this\.add\.rectangle\(/);
  assert.match(gameSource, /const rewardBg = this\.add\.rectangle\(/);
  assert.match(gameSource, /const subtitle = this\.text\(GUEST_CARD_GRID\.contentLeft/);
  assert.match(gameSource, /const intentBg = this\.add\.rectangle\([\s\S]*?GUEST_CARD_GRID\.contentLeft \+ GUEST_CARD_GRID\.contentRight/);
  assert.match(gameSource, /container\.setSize\(GUEST_CARD_GRID\.panelWidth, panelHeight\)/);
  assert.doesNotMatch(gameSource, /const portraitWash =/);
  assert.doesNotMatch(gameSource, /const portraitHalo =/);
});

test("guest seat tabs stay aligned, distinguish duplicate guests, and switch without a page jump", () => {
  assert.match(gameSource, /const tabUsableWidth = GUEST_CARD_GRID\.panelWidth - GUEST_CARD_GRID\.tabInset \* 2/);
  assert.match(gameSource, /const tabWidth = \(tabUsableWidth - tabGap \* \(encounter\.guests\.length - 1\)\) \/ encounter\.guests\.length/);
  assert.match(gameSource, /const tabX = tabLeft \+ tabWidth \/ 2 \+ index \* \(tabWidth \+ tabGap\)/);
  assert.match(gameSource, /const seatBg = this\.add\.circle/);
  assert.match(gameSource, /String\(index \+ 1\)/);
  assert.match(gameSource, /const patienceChip = this\.add\.rectangle/);
  assert.match(gameSource, /const activeBridge = this\.add\.rectangle/);
  assert.match(gameSource, /this\.guestFocusMotionPending = true/);
  assert.match(gameSource, /const detailContent = this\.add\.container\(0, 0/);
  assert.match(gameSource, /targets: detailContent,[\s\S]*?duration: 125/);
  assert.match(gameSource, /`\$\{urgent \? "急迫 · " : ""\}下一刻：\$\{this\.intentPreview\(focused\)\}`/);
  assert.doesNotMatch(gameSource, /const tabXs =/);
});

test("card inks and actionable target cues share one readable color language", () => {
  assert.match(gameSource, /const CARD_TAG_ACCENTS: Record<CardTag, number>/);
  assert.match(gameSource, /const TARGET_BASE_ACCENTS: Record<TargetKind, number>/);
  assert.match(gameSource, /accent: this\.cardVisualAccent\(def\)/);
  assert.match(
    gameSource,
    /return def\.target === "any" \? def\.accent : TARGET_BASE_ACCENTS\[def\.target\]/,
  );
  assert.doesNotMatch(gameSource, /detailAccent/);
  assert.match(gameSource, /29, options\.accent, 0\.18/);
  assert.match(gameSource, /Math\.min\(24, width \* 0\.27\), options\.accent, 0\.2/);
  assert.match(gameSource, /Math\.min\(18, width \* 0\.2\), options\.accent, 0\.92/);
  assert.ok(
    (gameSource.match(/color: colorToCss\(options\.accent\)/g) ?? []).length >= 2,
    "card metadata and reward metadata should use the same target ink",
  );
  assert.match(gameSource, /setStrokeStyle\(1\.5, options\.accent, 1\)/);
  assert.doesNotMatch(gameSource, /0xffe997|0xffe492/);
  assert.match(gameSource, /active \? TARGET_BASE_ACCENTS\.guest : 0x202018/);
  assert.match(gameSource, /panelHeight - 12, TARGET_BASE_ACCENTS\.guest, 1/);
  assert.match(gameSource, /private paintTargetCue\(target: TargetView, accent: number\)/);
  assert.match(gameSource, /private drawTargetCorners\(/);
  assert.match(gameSource, /cueWash\.setFillStyle\(accent, 0\.105\)/);
  assert.match(gameSource, /setStrokeStyle\(4, accent, 0\.98\)/);
  assert.match(gameSource, /return !this\.actionError\(selected\.cardId, target, selected\.basic\)/);
  assert.match(gameSource, /repeat: valid \? -1 : 0/);
  assert.match(gameSource, /this\.setCardSelectionCue\(card, true\)/);
});

test("the top enhancement drawer exposes every persistent and card upgrade effect", () => {
  assert.match(gameSource, /this\.enhancementText = this\.text\(8, 0, "强化 0"/);
  assert.match(gameSource, /this\.dayText = this\.text\(15, 54/);
  assert.match(gameSource, /private currentEnhancements\(\): EnhancementItem\[\]/);
  assert.match(gameSource, /\.\.\.run\.relics/);
  assert.match(gameSource, /run\.staff\.includes\("aman"\)/);
  assert.match(gameSource, /run\.staff\.includes\("xiaomei"\)/);
  assert.match(gameSource, /if \(run\.roomUnlocked\)/);
  assert.match(gameSource, /if \(run\.prepared\)/);
  assert.match(gameSource, /const upgradedCounts = new Map<string, number>\(\)/);
  assert.match(gameSource, /const UPGRADE_EFFECTS: Record<string, string>/);
  assert.match(gameSource, /private openEnhancementPanel\(/);
  assert.match(gameSource, /private closeEnhancementPanel\(\)/);
  assert.match(gameSource, /点小图标查看详情/);
  assert.match(gameSource, /if \(upgraded\) this\.drawCards\(1\)/);
  assert.match(gameSource, /targetGuest\.care = Math\.max\(0, targetGuest\.care - 1 - boost\)/);
});

test("guest labels, tabs, panels, and facilities have non-overlapping vertical bands", () => {
  const value = (key) => {
    const match = gameSource.match(new RegExp(`${key}: (\\d+)`));
    assert.ok(match, `missing ${key}`);
    return Number(match[1]);
  };
  const labelBottom = value("guestLabelY") + 13;
  const tabTop = value("guestTabY") - value("guestTabHeight") / 2;
  const tabBottom = value("guestTabY") + value("guestTabHeight") / 2;
  const multiPanelTop = value("guestMultiPanelY") - value("guestMultiPanelHeight") / 2;
  const multiPanelBottom = value("guestMultiPanelY") + value("guestMultiPanelHeight") / 2;
  const singlePanelBottom = value("guestSinglePanelY") + value("guestSinglePanelHeight") / 2;
  const facilityLabelY = value("facilityLabelY");

  assert.ok(labelBottom <= tabTop, "guest heading must end before the tab row");
  assert.ok(tabBottom < multiPanelTop, "guest tabs must end before the focused panel");
  assert.ok(multiPanelBottom < facilityLabelY, "multi-guest panel must end before facilities");
  assert.ok(singlePanelBottom < facilityLabelY, "single-guest panel must end before facilities");
  assert.match(globalStyles, /\.canvas-frame::after \{\s*display: none;/);
});
