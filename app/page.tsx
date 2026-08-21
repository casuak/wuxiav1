import GameClient from "./GameClient";

export default function Home() {
  return (
    <main className="game-page">
      <header className="site-header" aria-label="游戏标题">
        <div className="brand-lockup">
          <span className="brand-seal" aria-hidden="true">栈</span>
          <div>
            <p className="eyebrow">十日经营 · 江湖过招</p>
            <h1>十日客栈</h1>
          </div>
        </div>
        <p className="day-badge">经营 / 回合制 1v1</p>
      </header>

      <section className="game-shell" aria-label="十日客栈游戏区域">
        <GameClient />
      </section>

      <footer className="site-footer">
        <p>经营客栈，或选择拳师、剑客，用距离、招式谱与终结技打一场回合制实战。</p>
        <p>原创原型 · TypeScript + Phaser</p>
      </footer>
    </main>
  );
}
