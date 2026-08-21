"use client";

import { useEffect, useRef, useState } from "react";

export default function GameClient() {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<{ destroy: (removeCanvas: boolean, noReturn?: boolean) => void } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function boot() {
      if (!hostRef.current || gameRef.current) return;
      const { createDeckInnGame } = await import("./game/deckInnGame");
      if (!active || !hostRef.current) return;
      gameRef.current = createDeckInnGame(hostRef.current);
      setLoading(false);
    }

    void boot();
    return () => {
      active = false;
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return (
    <div className="canvas-frame">
      {loading ? (
        <div className="loading-card" role="status">
          <span className="loading-steam" aria-hidden="true">〰</span>
          <strong>正摆开柜台与擂台……</strong>
          <small>十日经营 / 江湖过招 · 双玩法</small>
        </div>
      ) : null}
      <div ref={hostRef} className="phaser-host" aria-label="可交互卡牌游戏画布" />
    </div>
  );
}
