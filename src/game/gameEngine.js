import {
  VIEW,
  GROUND_Y,
  PLAYER,
  PHYSICS,
  SPEED,
  HEALTH,
  SCORE,
  SPAWN,
  OBSTACLES,
} from './config.js'

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const lerp = (a, b, t) => a + (b - a) * t
const rand = (a, b) => a + Math.random() * (b - a)

// 결정적인 의사난수: 배경 크럼블 같은 장식용 위치 계산에 사용
const hash = (n) => {
  const s = Math.sin(n * 127.1) * 43758.5453
  return s - Math.floor(s)
}

function createPlayer() {
  return {
    x: PLAYER.x,
    y: GROUND_Y, // 발 위치(맨 아래)
    vy: 0,
    onGround: true,
    jumps: 0,
    sliding: false,
    slideTimer: 0,
    invuln: 0,
    runPhase: 0,
  }
}

// 난이도(0~1)에 따라 등장하는 장애물 구성. d는 파동 내 간격 단위.
function planWave(diff) {
  const r = Math.random()
  if (diff < 0.06) return [{ t: 'spike' }]

  if (diff < 0.2) {
    if (r < 0.45) return [{ t: 'spike' }]
    if (r < 0.75) return [{ t: 'block' }]
    return [{ t: 'spike' }, { t: 'spike', d: 2 }]
  }

  if (diff < 0.45) {
    if (r < 0.25) return [{ t: 'spike' }, { t: 'spike', d: 2 }]
    if (r < 0.45) return [{ t: 'block' }, { t: 'spike', d: 3 }]
    if (r < 0.62) return [{ t: 'flyer' }]
    if (r < 0.78) return [{ t: 'pit' }]
    return [{ t: 'spike' }, { t: 'block', d: 3 }]
  }

  if (diff < 0.72) {
    if (r < 0.2) return [{ t: 'spike' }, { t: 'spike', d: 1.6 }, { t: 'spike', d: 3.2 }]
    if (r < 0.4) return [{ t: 'pit' }, { t: 'block', d: 5 }]
    if (r < 0.58) return [{ t: 'flyer' }, { t: 'spike', d: 3 }]
    if (r < 0.74) return [{ t: 'block' }, { t: 'block', d: 3.4 }]
    return [{ t: 'pit' }, { t: 'flyer', d: 6 }]
  }

  if (r < 0.22) return [{ t: 'spike' }, { t: 'spike', d: 1.5 }, { t: 'spike', d: 3 }, { t: 'spike', d: 4.5 }]
  if (r < 0.42) return [{ t: 'pit' }, { t: 'spike', d: 5 }]
  if (r < 0.6) return [{ t: 'flyer' }, { t: 'flyer', d: 4.5 }]
  if (r < 0.78) return [{ t: 'block' }, { t: 'spike', d: 3 }, { t: 'spike', d: 4.4 }]
  return [{ t: 'pit' }, { t: 'block', d: 5.5 }]
}

export class Game {
  constructor({ onHud, onGameOver } = {}) {
    this.onHud = onHud ?? (() => {})
    this.onGameOver = onGameOver ?? (() => {})
    this.best = 0
    this.reset()
  }

  reset() {
    this.status = 'ready' // ready | running | paused | over
    this.player = createPlayer()
    this.obstacles = []
    this.pickups = []
    this.particles = []
    this.rings = []
    this.scoreRaw = 0
    this.score = 0
    this.distance = 0
    this.combo = 1
    this.comboTimer = 0
    this.health = HEALTH.start
    this.speed = SPEED.base
    this.time = 0
    this.scrollX = 0
    this.shake = 0
    this.hurtFlash = 0
    this.waveTimer = 1.2
    this.pickupTimer = 1.6
    this.hudTimer = 0
    // 구덩이에서 복구한 뒤 잠깐(초 단위) 판정을 유예한다
    this.pitGraceUntil = -Infinity
  }

  start() {
    if (this.status === 'ready' || this.status === 'over') {
      this.reset()
      this.status = 'running'
      this.emitHud(true)
    }
  }

  pause() {
    if (this.status === 'running') {
      this.status = 'paused'
      this.emitHud(true)
    }
  }

  resume() {
    if (this.status === 'paused') {
      this.status = 'running'
      this.emitHud(true)
    }
  }

  togglePause() {
    if (this.status === 'paused') this.resume()
    else this.pause()
  }

  jump() {
    if (this.status !== 'running') return
    const p = this.player
    if (p.onGround) {
      p.vy = PHYSICS.jumpVelocity
      p.onGround = false
      p.jumps = 1
      p.sliding = false
      this.burst(p.x + 10, GROUND_Y, '#e8bd86', 7)
    } else if (p.jumps < 2) {
      p.vy = PHYSICS.doubleJumpVelocity
      p.jumps = 2
      this.rings.push({ x: p.x + PLAYER.w / 2, y: p.y - 16, life: 0.32, max: 0.32 })
    }
  }

  slide() {
    if (this.status !== 'running') return
    const p = this.player
    if (p.onGround && !p.sliding) {
      p.sliding = true
      p.slideTimer = PHYSICS.slideDuration
      this.burst(p.x + 16, GROUND_Y, '#e8bd86', 6)
    }
  }

  // ---------------------------------------------------------------- update

  update(rawDt) {
    if (!(rawDt > 0)) return
    const dt = Math.min(rawDt, 1 / 30)
    this.time += dt
    this.hudTimer -= dt
    this.shake = Math.max(0, this.shake - dt * 3.2)
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 3)
    this.updateParticles(dt)

    if (this.status === 'ready') {
      // 시작 화면에서는 천천히 흐르는 배경만 보여준다.
      this.speed = 140
      this.scrollX += this.speed * dt
      this.player.runPhase += this.speed * dt * 0.05
      this.emitHud()
      return
    }
    if (this.status !== 'running') {
      this.emitHud()
      return
    }

    this.speed =
      SPEED.base + Math.min(SPEED.max - SPEED.base, this.distance * SPEED.perMeter)
    const moved = this.speed * dt
    this.scrollX += moved

    this.distance += moved / 100
    this.scoreRaw += (moved / 100) * SCORE.perMeter * this.combo
    this.score = Math.floor(this.scoreRaw)

    if (this.comboTimer > 0) {
      this.comboTimer -= dt
      if (this.comboTimer <= 0) this.combo = 1
    }

    // 체력은 시간이 흐를수록 조금씩 더 빠르게 깎인다.
    const drain = HEALTH.drainPerSec + this.distance * HEALTH.drainPerMeter
    this.health -= drain * dt
    if (this.health <= 0) {
      this.health = 0
      this.gameOver()
      return
    }

    this.updatePlayer(dt, moved)
    this.updateSpawns(dt)
    this.updateCollisions(dt, moved)
    this.obstacles = this.obstacles.filter((o) => o.x + o.w > -40)
    this.pickups = this.pickups.filter((c) => !c.taken && c.x > -60)
    this.emitHud()
  }

  updatePlayer(dt, moved) {
    const p = this.player
    p.invuln = Math.max(0, p.invuln - dt)
    if (p.sliding) {
      p.slideTimer -= dt
      if (p.slideTimer <= 0) p.sliding = false
    }

    p.vy = Math.min(p.vy + PHYSICS.gravity * dt, PHYSICS.maxFallSpeed)
    p.y += p.vy * dt

    if (!this.isOverPit() && p.y >= GROUND_Y) {
      p.y = GROUND_Y
      p.vy = 0
      if (!p.onGround) this.burst(p.x + 12, GROUND_Y, '#e8bd86', 6)
      p.onGround = true
      p.jumps = 0
    } else {
      p.onGround = false
    }

    p.runPhase += this.speed * dt * 0.05
    if (p.onGround && !p.sliding && Math.random() < dt * 24) {
      this.burst(p.x + 6, GROUND_Y, '#e8c79a', 1)
    }
    void moved

    // 구덩이에 빠진 경우: 체력을 잃고 다시 지면으로 복구
    if (p.y > VIEW.height + 30) {
      const cx = p.x + PLAYER.w / 2
      // 방금 빠진 구덩이만 무해하게 표시해 같은 구덩이에 다시 떨어지지 않게 한다
      for (const o of this.obstacles) {
        if (o.type === 'pit' && !o.harmless && cx > o.x - 24 && cx < o.x + o.w + 24) {
          o.harmless = true
        }
      }
      // 플레이어 x는 고정이라 x 기반 유예는 영원히 안 풀린다 → 시간 기반 사용
      this.pitGraceUntil = this.time + 1
      this.damage(HEALTH.pitDamage, p.x + PLAYER.w / 2, GROUND_Y - 20)
      p.y = GROUND_Y
      p.vy = 0
      p.onGround = true
      p.jumps = 0
      p.sliding = false
    }
  }

  updateSpawns(dt) {
    this.waveTimer -= dt
    if (this.waveTimer <= 0) {
      this.spawnWave()
      const diff = clamp(this.distance / SPAWN.difficultyDistance, 0, 1)
      this.waveTimer =
        lerp(SPAWN.timeGapStart, SPAWN.timeGapEnd, diff) * rand(0.9, 1.15)
    }

    this.pickupTimer -= dt
    if (this.pickupTimer <= 0) {
      this.spawnPickupTrail()
      this.pickupTimer = rand(2.4, 3.8)
    }
  }

  spawnWave() {
    const diff = clamp(this.distance / SPAWN.difficultyDistance, 0, 1)
    const startX = VIEW.width + SPAWN.offscreenPad
    const unit = this.speed * 0.15
    for (const step of planWave(diff)) {
      const def = OBSTACLES[step.t]
      this.obstacles.push({
        type: step.t,
        x: startX + (step.d ?? 0) * unit,
        y: def.y,
        w: def.w,
        h: def.h,
        passed: false,
        harmless: false,
      })
    }
  }

  spawnPickupTrail() {
    const startX = VIEW.width + SPAWN.offscreenPad
    const count = 2 + Math.floor(Math.random() * 2)
    const gap = this.speed * 0.22
    const lift = Math.random() < 0.5 ? rand(55, 115) : 0
    for (let i = 0; i < count; i += 1) {
      const t = count === 1 ? 0 : i / (count - 1)
      this.pickups.push({
        x: startX + i * gap,
        y: GROUND_Y - 62 - Math.sin(t * Math.PI) * lift,
        r: 14,
        taken: false,
        phase: rand(0, Math.PI * 2),
      })
    }
  }

  updateCollisions(dt, moved) {
    const rect = this.playerRect()

    for (const o of this.obstacles) {
      o.x -= moved
      if (o.type === 'pit') {
        if (!o.passed && o.x + o.w < rect.x) o.passed = true
        continue
      }
      if (this.overlaps(rect, o)) {
        o.passed = true
        if (this.damage(HEALTH.hitDamage, rect.x + rect.w / 2, rect.y + rect.h / 2)) break
        continue
      }
      if (!o.passed && o.x + o.w < rect.x) {
        o.passed = true
        const gapY = Math.min(
          Math.abs(o.y - (rect.y + rect.h)),
          Math.abs(rect.y - (o.y + o.h)),
        )
        if (gapY < 58) this.nearMiss(o)
      }
    }

    for (const c of this.pickups) {
      c.x -= moved
      if (c.taken) continue
      const dx = c.x - (rect.x + rect.w / 2)
      const dy = c.y - (rect.y + rect.h / 2)
      const reach = c.r + 20
      if (dx * dx + dy * dy < reach * reach) {
        c.taken = true
        this.scoreRaw += SCORE.pickup * this.combo
        this.health = Math.min(HEALTH.max, this.health + SCORE.pickupHeal)
        this.comboTimer = SCORE.comboWindow
        this.burst(c.x, c.y, '#ffd08a', 12)
      }
    }

    if (this.status === 'over') {
      this.score = Math.floor(this.scoreRaw)
    }
    void dt
  }

  nearMiss(o) {
    this.scoreRaw += SCORE.nearMiss
    this.combo = clamp(this.combo + SCORE.comboStep, 1, SCORE.comboMax)
    this.comboTimer = SCORE.comboWindow
    this.rings.push({ x: o.x, y: o.y + o.h / 2, life: 0.34, max: 0.34 })
  }

  damage(amount, x, y) {
    const p = this.player
    if (p.invuln > 0 || this.status !== 'running') return false
    this.health -= amount
    p.invuln = HEALTH.invulnTime
    this.combo = 1
    this.comboTimer = 0
    this.shake = 1
    this.hurtFlash = 1
    this.burst(x, y, '#ff8a5b', 16)
    if (this.health <= 0) {
      this.health = 0
      this.gameOver()
    }
    return true
  }

  gameOver() {
    if (this.status === 'over') return
    this.status = 'over'
    this.score = Math.floor(this.scoreRaw)
    this.burst(
      this.player.x + PLAYER.w / 2,
      this.player.y - 20,
      '#ffd27a',
      26,
    )
    this.onGameOver({
      score: this.score,
      distance: Math.floor(this.distance),
      best: Math.max(this.best, this.score),
    })
    this.emitHud(true)
  }

  playerRect() {
    const p = this.player
    const h = p.sliding ? PLAYER.slideH : PLAYER.h
    return { x: p.x, y: p.y - h, w: PLAYER.w, h }
  }

  isOverPit() {
    if (this.time < this.pitGraceUntil) return false
    const p = this.player
    const cx = p.x + PLAYER.w / 2
    for (const o of this.obstacles) {
      if (o.type !== 'pit' || o.harmless) continue
      if (cx > o.x && cx < o.x + o.w) return true
    }
    return false
  }

  overlaps(a, b) {
    return (
      a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
    )
  }

  // ------------------------------------------------------------- particles

  burst(x, y, color, count) {
    for (let i = 0; i < count; i += 1) {
      const angle = rand(0, Math.PI * 2)
      const speed = rand(40, 220)
      const life = rand(0.3, 0.7)
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 60,
        life,
        max: life,
        size: rand(2, 5),
        color,
      })
    }
  }

  updateParticles(dt) {
    for (const q of this.particles) {
      q.life -= dt
      q.x += q.vx * dt
      q.y += q.vy * dt
      q.vy += 900 * dt
    }
    this.particles = this.particles.filter((q) => q.life > 0)

    for (const r of this.rings) r.life -= dt
    this.rings = this.rings.filter((r) => r.life > 0)
  }

  // ------------------------------------------------------------------- hud

  emitHud(force = false) {
    if (!force && this.hudTimer > 0) return
    this.hudTimer = 0.07
    this.onHud({
      status: this.status,
      health: this.health,
      healthPct: clamp(this.health / HEALTH.max, 0, 1),
      score: this.score,
      best: Math.max(this.best, this.score),
      distance: Math.floor(this.distance),
      combo: this.combo,
    })
  }

  // ---------------------------------------------------------------- render

  render(ctx) {
    ctx.clearRect(0, 0, VIEW.width, VIEW.height)
    ctx.save()

    if (this.shake > 0) {
      const s = this.shake * this.shake * 8
      ctx.translate(
        hash(this.time * 91) * s * 2 - s,
        hash(this.time * 57 + 7) * s * 2 - s,
      )
    }

    this.drawSky(ctx)
    this.drawHills(ctx)
    this.drawGround(ctx)
    this.drawPickups(ctx)
    this.drawObstacles(ctx)
    this.drawPlayer(ctx)
    this.drawPits(ctx)
    this.drawParticles(ctx)
    this.drawVignette(ctx)

    ctx.restore()
  }

  drawSky(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y)
    g.addColorStop(0, '#ffe9c2')
    g.addColorStop(0.55, '#ffd8a0')
    g.addColorStop(1, '#ffc887')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, VIEW.width, GROUND_Y)

    ctx.fillStyle = 'rgba(255, 232, 180, 0.55)'
    ctx.beginPath()
    ctx.arc(790, 92, 64, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255, 247, 224, 0.9)'
    ctx.beginPath()
    ctx.arc(790, 92, 40, 0, Math.PI * 2)
    ctx.fill()

    const period = VIEW.width + 260
    for (let i = 0; i < 6; i += 1) {
      const x =
        (((i * 197 + 60 - this.scrollX * 0.18) % period) + period) % period - 130
      const y = 52 + hash(i * 3.7) * 130
      this.drawCloud(ctx, x, y, 0.7 + hash(i * 9.1) * 0.55)
    }
  }

  drawCloud(ctx, x, y, s) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)'
    ctx.beginPath()
    ctx.ellipse(x, y, 44 * s, 20 * s, 0, 0, Math.PI * 2)
    ctx.ellipse(x + 28 * s, y - 12 * s, 30 * s, 22 * s, 0, 0, Math.PI * 2)
    ctx.ellipse(x - 28 * s, y - 6 * s, 26 * s, 17 * s, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  drawHills(ctx) {
    this.drawHillLayer(ctx, this.scrollX * 0.22, 258, '#f4bb80', 58, 3)
    this.drawHillLayer(ctx, this.scrollX * 0.45, 306, '#e0965b', 42, 6)
  }

  drawHillLayer(ctx, offset, baseY, color, amp, freq) {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(0, GROUND_Y)
    for (let x = 0; x <= VIEW.width; x += 8) {
      const y =
        baseY + Math.sin(((x + offset) / (VIEW.width + 200)) * Math.PI * 2 * freq) * amp
      ctx.lineTo(x, y)
    }
    ctx.lineTo(VIEW.width, GROUND_Y)
    ctx.closePath()
    ctx.fill()
  }

  drawGround(ctx) {
    ctx.fillStyle = '#c98a4b'
    ctx.fillRect(0, GROUND_Y, VIEW.width, VIEW.height - GROUND_Y)

    ctx.fillStyle = '#f0c07d'
    ctx.fillRect(0, GROUND_Y, VIEW.width, 9)
    ctx.fillStyle = 'rgba(255, 224, 176, 0.55)'
    ctx.fillRect(0, GROUND_Y, VIEW.width, 3)

    const tile = 70
    const first = Math.floor(this.scrollX / tile) - 1
    ctx.fillStyle = 'rgba(146, 88, 38, 0.35)'
    for (let i = 0; i < Math.ceil(VIEW.width / tile) + 3; i += 1) {
      const c = first + i
      const x = c * tile - this.scrollX + hash(c) * 34
      const y = GROUND_Y + 34 + hash(c + 50) * (VIEW.height - GROUND_Y - 48)
      ctx.beginPath()
      ctx.arc(x, y, 3 + hash(c + 9) * 2.4, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  drawPits(ctx) {
    for (const o of this.obstacles) {
      if (o.type !== 'pit') continue
      const g = ctx.createLinearGradient(0, o.y - 6, 0, VIEW.height)
      g.addColorStop(0, '#57331d')
      g.addColorStop(1, '#24130a')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.moveTo(o.x + 7, o.y - 6)
      ctx.lineTo(o.x + o.w - 7, o.y - 6)
      ctx.lineTo(o.x + o.w, o.y + 16)
      ctx.lineTo(o.x + o.w, VIEW.height)
      ctx.lineTo(o.x, VIEW.height)
      ctx.lineTo(o.x, o.y + 16)
      ctx.closePath()
      ctx.fill()

      ctx.strokeStyle = 'rgba(255, 240, 214, 0.35)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(o.x + 8, o.y - 5)
      ctx.lineTo(o.x + o.w - 8, o.y - 5)
      ctx.stroke()
    }
  }

  drawObstacles(ctx) {
    for (const o of this.obstacles) {
      if (o.type === 'pit') continue
      if (o.type === 'spike') this.drawSpike(ctx, o)
      else if (o.type === 'block') this.drawBlock(ctx, o)
      else this.drawFlyer(ctx, o)
    }
  }

  drawSpike(ctx, o) {
    const cx = o.x + o.w / 2
    ctx.fillStyle = '#6b3b1f'
    ctx.beginPath()
    ctx.moveTo(cx, o.y)
    ctx.lineTo(o.x + o.w, o.y + o.h)
    ctx.lineTo(o.x, o.y + o.h)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = 'rgba(255, 224, 176, 0.5)'
    ctx.beginPath()
    ctx.moveTo(cx, o.y + 2)
    ctx.lineTo(cx + o.w * 0.26, o.y + o.h)
    ctx.lineTo(cx, o.y + o.h)
    ctx.closePath()
    ctx.fill()
  }

  drawBlock(ctx, o) {
    ctx.fillStyle = '#7a4526'
    ctx.beginPath()
    ctx.roundRect(o.x, o.y, o.w, o.h, 8)
    ctx.fill()
    ctx.fillStyle = 'rgba(255, 224, 176, 0.28)'
    ctx.beginPath()
    ctx.roundRect(o.x + 4, o.y + 4, o.w - 8, o.h * 0.42, 6)
    ctx.fill()
    ctx.fillStyle = 'rgba(58, 30, 14, 0.45)'
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath()
      ctx.arc(o.x + 11 + i * 14, o.y + o.h * 0.72, 4, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  drawFlyer(ctx, o) {
    const cx = o.x + o.w / 2
    const cy = o.y + o.h / 2
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(Math.sin(this.time * 2) * 0.35)
    ctx.fillStyle = '#8a5a33'
    ctx.beginPath()
    ctx.roundRect(-o.w / 2 + 8, -9, o.w - 16, 18, 9)
    ctx.fill()
    ctx.fillStyle = '#c58f5a'
    ctx.beginPath()
    ctx.roundRect(-o.w / 2 + 8, -9, o.w - 16, 7, 4)
    ctx.fill()
    ctx.fillStyle = '#6b3b1f'
    ctx.beginPath()
    ctx.roundRect(-o.w / 2, -4, 10, 8, 4)
    ctx.roundRect(o.w / 2 - 10, -4, 10, 8, 4)
    ctx.fill()
    ctx.strokeStyle = 'rgba(107, 59, 31, 0.65)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, -9)
    ctx.lineTo(0, -(o.y + o.h / 2))
    ctx.stroke()
    ctx.restore()
  }

  drawPickups(ctx) {
    for (const c of this.pickups) {
      if (c.taken) continue
      const bob = Math.sin(this.time * 3 + c.phase) * 4
      ctx.save()
      ctx.globalAlpha = 0.28
      ctx.fillStyle = '#ffe9a8'
      ctx.beginPath()
      ctx.arc(c.x, c.y + bob, c.r * 1.9, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      this.drawCookie(ctx, c.x, c.y + bob, c.r, false)
    }
  }

  drawPlayer(ctx) {
    const p = this.player
    const rect = this.playerRect()
    const cx = rect.x + rect.w / 2
    const cy = rect.y + rect.h / 2
    const sliding = p.sliding
    const r = sliding ? 19 : 21
    const bob = p.onGround && !sliding ? Math.sin(p.runPhase * 2) * 1.6 : 0

    ctx.save()
    if (p.invuln > 0) {
      ctx.globalAlpha = Math.floor(this.time * 18) % 2 === 0 ? 0.35 : 0.92
    }

    // 스카프 (뒤쪽)
    const wave = Math.sin(this.time * 12) * 5
    ctx.fillStyle = '#d94b4b'
    ctx.beginPath()
    ctx.moveTo(cx - 12, cy - 8 + bob)
    ctx.quadraticCurveTo(cx - 26, cy - 6 + wave, cx - 40, cy - 18 + wave)
    ctx.quadraticCurveTo(cx - 26, cy + 2 + wave, cx - 12, cy + 4 + bob)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#c13c3c'
    ctx.beginPath()
    ctx.moveTo(cx - 10, cy - 2 + bob)
    ctx.quadraticCurveTo(cx - 20, cy + 8 + wave * 0.6, cx - 30, cy + 3 + wave * 0.6)
    ctx.quadraticCurveTo(cx - 20, cy + 14, cx - 10, cy + 8 + bob)
    ctx.closePath()
    ctx.fill()

    if (p.onGround && !sliding) {
      const swing = Math.sin(p.runPhase) * 6
      ctx.fillStyle = '#a9702f'
      ctx.beginPath()
      ctx.ellipse(cx - 8, cy + r + 3 + swing * 0.4, 6, 7.5, 0, 0, Math.PI * 2)
      ctx.ellipse(cx + 8, cy + r + 3 - swing * 0.4, 6, 7.5, 0, 0, Math.PI * 2)
      ctx.fill()
    } else if (!sliding) {
      ctx.fillStyle = '#a9702f'
      ctx.beginPath()
      ctx.ellipse(cx - 9, cy + r - 3, 6.5, 5, -0.4, 0, Math.PI * 2)
      ctx.ellipse(cx + 9, cy + r - 3, 6.5, 5, 0.4, 0, Math.PI * 2)
      ctx.fill()
    }

    this.drawCookie(ctx, cx, cy + bob, r, sliding)
    ctx.restore()
  }

  drawCookie(ctx, cx, cy, r, sliding) {
    const sx = sliding ? 1.14 : 1
    const sy = sliding ? 0.82 : 1

    ctx.fillStyle = '#d99a52'
    ctx.beginPath()
    ctx.ellipse(cx, cy + 2, r * sx, r * sy, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#efb878'
    ctx.beginPath()
    ctx.ellipse(cx, cy - 1, (r - 2.5) * sx, (r - 3) * sy, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#b9762f'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.ellipse(cx, cy, r * sx, r * sy, 0, 0, Math.PI * 2)
    ctx.stroke()

    const chips = [
      [-0.58, -0.42],
      [0.52, -0.5],
      [-0.64, 0.36],
      [0.6, 0.3],
      [0.04, 0.62],
      [-0.16, -0.78],
      [0.74, -0.06],
    ]
    ctx.fillStyle = '#6b3b1f'
    for (const [dx, dy] of chips) {
      ctx.beginPath()
      ctx.ellipse(
        cx + dx * r * sx,
        cy + dy * r * sy,
        r * 0.17,
        r * 0.13,
        dx * 1.4,
        0,
        Math.PI * 2,
      )
      ctx.fill()
    }

    if (r < 16) return

    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(cx - 7, cy - 5, 5, 0, Math.PI * 2)
    ctx.arc(cx + 7, cy - 5, 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#33210f'
    ctx.beginPath()
    ctx.arc(cx - 6, cy - 4, 2.4, 0, Math.PI * 2)
    ctx.arc(cx + 8, cy - 4, 2.4, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255, 138, 108, 0.5)'
    ctx.beginPath()
    ctx.arc(cx - 14, cy + 3, 4.4, 0, Math.PI * 2)
    ctx.arc(cx + 14, cy + 3, 4.4, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#33210f'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(cx + 1, cy + 2, 5, 0.15 * Math.PI, 0.85 * Math.PI)
    ctx.stroke()
  }

  drawParticles(ctx) {
    for (const r of this.rings) {
      const t = 1 - r.life / r.max
      ctx.strokeStyle = `rgba(255, 235, 180, ${(1 - t) * 0.8})`
      ctx.lineWidth = 3 * (1 - t) + 1
      ctx.beginPath()
      ctx.arc(r.x, r.y, 8 + t * 26, 0, Math.PI * 2)
      ctx.stroke()
    }

    for (const q of this.particles) {
      ctx.globalAlpha = Math.max(0, q.life / q.max)
      ctx.fillStyle = q.color
      ctx.beginPath()
      ctx.arc(q.x, q.y, q.size * (0.4 + (q.life / q.max) * 0.6), 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  drawVignette(ctx) {
    const pct = (this.health / HEALTH.max) * 100
    const low = pct < HEALTH.lowPercent ? (0.22 + 0.14 * Math.sin(this.time * 6)) : 0
    const intensity = this.hurtFlash * 0.7 + low
    if (intensity <= 0.01) return
    const g = ctx.createRadialGradient(
      VIEW.width / 2,
      VIEW.height / 2,
      VIEW.height * 0.3,
      VIEW.width / 2,
      VIEW.height / 2,
      VIEW.height * 0.85,
    )
    g.addColorStop(0, 'rgba(200, 30, 30, 0)')
    g.addColorStop(1, `rgba(190, 26, 26, ${Math.min(0.85, intensity)})`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, VIEW.width, VIEW.height)
  }
}
