// 게임 전체에서 쓰는 튜닝값을 한곳에 모아둡니다.
export const VIEW = { width: 960, height: 540 }
export const GROUND_Y = 420

export const PLAYER = {
  x: 190,
  w: 40,
  h: 44,
  slideH: 24,
}

export const PHYSICS = {
  gravity: 2800,
  jumpVelocity: -1010,
  doubleJumpVelocity: -880,
  slideDuration: 0.5,
  maxFallSpeed: 1600,
}

export const SPEED = {
  base: 340,
  max: 780,
  perMeter: 1.15,
}

export const HEALTH = {
  max: 100,
  start: 100,
  drainPerSec: 1.6, // 체력이 천천히 깎이는 기본 속도
  drainPerMeter: 0.0035, // 달릴수록 추가로 깎이는 속도
  hitDamage: 22,
  pitDamage: 30,
  invulnTime: 1.15,
  lowPercent: 30,
}

export const SCORE = {
  perMeter: 1,
  nearMiss: 12,
  pickup: 60,
  pickupHeal: 4,
  comboStep: 0.25,
  comboMax: 4,
  comboWindow: 2.6,
}

export const SPAWN = {
  timeGapStart: 1.55, // 초반: 넉넉하게
  timeGapEnd: 0.9, // 후반: 빡빡하게
  offscreenPad: 60,
  difficultyDistance: 1800,
}

// type별 히트박스 (y는 윗면, h는 높이). pit은 h가 0인 함정 구간.
export const OBSTACLES = {
  spike: { w: 30, h: 34, y: GROUND_Y - 34 },
  block: { w: 50, h: 64, y: GROUND_Y - 64 },
  flyer: { w: 48, h: 60, y: GROUND_Y - 96 },
  pit: { w: 80, h: 0, y: GROUND_Y },
}
