import { useCallback, useEffect, useRef, useState } from 'react'
import { Game } from '../game/gameEngine.js'
import { HEALTH, VIEW } from '../game/config.js'
import './RunnerGame.css'

const BEST_KEY = 'cookierun.best'

function readBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY) || 0)
  } catch {
    return 0
  }
}

function writeBest(score) {
  try {
    if (score > readBest()) localStorage.setItem(BEST_KEY, String(score))
  } catch {
    // 저장소 접근이 안 되면 무시
  }
}

const JUMP_KEYS = new Set(['Space', 'ArrowUp', 'KeyW', 'Enter'])
const SLIDE_KEYS = new Set(['ArrowDown', 'KeyS'])
const PAUSE_KEYS = new Set(['KeyP', 'Escape'])

export default function RunnerGame() {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const gameRef = useRef(null)

  const [hud, setHud] = useState({
    status: 'ready',
    health: HEALTH.start,
    healthPct: 1,
    score: 0,
    best: 0,
    distance: 0,
    combo: 1,
  })

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    const ctx = canvas.getContext('2d')

    const game = new Game({
      onHud: setHud,
      onGameOver: ({ score, best }) => {
        writeBest(score)
        setHud((h) => (h.best < best ? { ...h, best } : h))
      },
    })
    game.best = readBest()
    gameRef.current = game
    game.emitHud(true)

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const resize = () => {
      const width = Math.max(320, Math.round(wrap.clientWidth))
      const height = Math.round((width * VIEW.height) / VIEW.width)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(
        canvas.width / VIEW.width,
        0,
        0,
        canvas.height / VIEW.height,
        0,
        0,
      )
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(wrap)

    let raf = 0
    let last = performance.now()
    const frame = (now) => {
      const dt = (now - last) / 1000
      last = now
      game.update(dt)
      game.render(ctx)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    const onKeyDown = (e) => {
      if (JUMP_KEYS.has(e.code) || SLIDE_KEYS.has(e.code)) e.preventDefault()
      if (JUMP_KEYS.has(e.code)) {
        if (game.status === 'ready' || game.status === 'over') game.start()
        else game.jump()
      } else if (SLIDE_KEYS.has(e.code)) {
        if (game.status === 'ready' || game.status === 'over') game.start()
        game.slide()
      } else if (PAUSE_KEYS.has(e.code)) {
        game.togglePause()
      }
    }
    const onVisibility = () => {
      if (document.hidden) game.pause()
    }

    window.addEventListener('keydown', onKeyDown)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      window.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  const handlePointerDown = useCallback(() => {
    const game = gameRef.current
    if (!game) return
    if (game.status === 'ready' || game.status === 'over') game.start()
    else if (game.status === 'paused') game.resume()
    else game.jump()
  }, [])

  // 게임오버/시작/일시정지 화면에서 버튼 밖 어디를 눌러도 재시작·재개된다.
  // (오버레이가 캔버스를 덮고 있어 캔버스의 pointerdown 이벤트가 닿지 않으므로 별도 처리)
  const handleOverlayPointerDown = useCallback(
    (e) => {
      if (e.target.closest('.panel')) return
      handlePointerDown()
    },
    [handlePointerDown],
  )

  // 버튼 클릭 후 포커스를 떼어, 다음 Space 입력이 버튼을 다시 누르지 않게 한다
  const handleButtonClick = useCallback(
    (e) => {
      e.currentTarget.blur()
      handlePointerDown()
    },
    [handlePointerDown],
  )

  const status = hud.status
  const healthClass =
    hud.healthPct <= 0.15 ? 'critical' : hud.healthPct <= 0.3 ? 'low' : ''

  return (
    <div className="runner-game">
      <div className="stage" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          aria-label="Cookie Runner 게임 화면"
        />

        <div className="hud">
          <div className="health">
            <div className="health-head">
              <span className="health-title">🍪 체력</span>
              <span className="health-value">
                {Math.max(0, Math.ceil(hud.health))} / {HEALTH.max}
              </span>
            </div>
            <div
              className="health-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={HEALTH.max}
              aria-valuenow={Math.round(hud.health)}
            >
              <div
                className={`health-fill ${healthClass}`}
                style={{ width: `${hud.healthPct * 100}%` }}
              />
            </div>
          </div>

          <div className="score-box">
            <span className="score-label">SCORE</span>
            <strong className="score-value">{hud.score.toLocaleString()}</strong>
            <span className="score-best">BEST {hud.best.toLocaleString()}</span>
          </div>
        </div>

        {hud.combo > 1 && status === 'running' && (
          <div className="combo">x{hud.combo.toFixed(2)}</div>
        )}

        {status === 'ready' && (
          <div className="overlay" onPointerDown={handleOverlayPointerDown}>
            <div className="panel">
              <h2 className="panel-title">COOKIE RUN</h2>
              <p className="panel-text">
                체력은 시간이 흐를수록 천천히 닳습니다.
                <br />
                장애물을 피해 최대한 멀리 달리세요.
              </p>
              <button type="button" className="btn" onClick={handleButtonClick}>
                달리기 시작
              </button>
              <p className="panel-hint">
                화면 아무 곳이나 눌러도 시작 · Space · ↑ 로 점프 (두 번 가능), ↓ 로 슬라이드
              </p>
            </div>
          </div>
        )}

        {status === 'paused' && (
          <div className="overlay" onPointerDown={handleOverlayPointerDown}>
            <div className="panel">
              <h2 className="panel-title">일시정지</h2>
              <p className="panel-text">체력은 멈춰 있어요.</p>
              <button type="button" className="btn" onClick={handleButtonClick}>
                계속 달리기
              </button>
              <p className="panel-hint">화면 아무 곳이나 눌러도 재개 · P 또는 Esc</p>
            </div>
          </div>
        )}

        {status === 'over' && (
          <div className="overlay" onPointerDown={handleOverlayPointerDown}>
            <div className="panel">
              <h2 className="panel-title danger">GAME OVER</h2>
              <p className="panel-text">
                체력이 바닥났어요. 기록은 남아 있어요.
              </p>
              <div className="result">
                <div>
                  <span>점수</span>
                  <strong>{hud.score.toLocaleString()}</strong>
                </div>
                <div>
                  <span>거리</span>
                  <strong>{hud.distance}m</strong>
                </div>
                <div>
                  <span>최고</span>
                  <strong>{hud.best.toLocaleString()}</strong>
                </div>
              </div>
              <button type="button" className="btn" onClick={handleButtonClick}>
                다시 달리기
              </button>
              <p className="panel-hint">화면 아무 곳이나 누르거나 Space 키로 재시작</p>
            </div>
          </div>
        )}
      </div>

      <ul className="controls">
        <li>
          <kbd>Space</kbd> / <kbd>↑</kbd> 점프 (두 번)
        </li>
        <li>
          <kbd>↓</kbd> 슬라이드
        </li>
        <li>
          <kbd>P</kbd> 일시정지
        </li>
        <li>쿠키를 먹으면 체력이 조금 회복돼요</li>
      </ul>
    </div>
  )
}
