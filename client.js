/**
 * ASCII Thunder — a character-cell vertical shooter drawn over the
 * conversation area.
 *
 * The chat underneath is never touched: the game is a canvas layer in
 * `shell.overlay`, aligned to the conversation box, and removing the layer
 * restores everything exactly as it was.
 *
 * Rendering runs at the display refresh rate on a canvas with the code font,
 * so gameplay is smooth without rewriting any DOM.
 */
window.__ModuleLoader__.load({
  id: '@pndspnds/dsh-airplane-battle',
  factory(require) {
    'use strict'

    const React = require('react')

    /* #region game-engine */
    function createAsciiThunder() {
      'use strict'

      const STYLE_ID = 'ascii-thunder-style'
      const HI_KEY = 'dsh.ascii-thunder.hi'
      const MAX_DT = 0.05

      const PALETTE = {
        frame: '#2f7181',
        hud: '#3fd0c9',
        dim: '#4d8496',
        white: '#eaf7ff',
        player: '#5ef1ff',
        pbullet: '#ffe066',
        pierce: '#fff2b0',
        missile: '#a8ffcf',
        scout: '#ff5f6d',
        sine: '#ff9a3c',
        diver: '#ff8ad8',
        turret: '#f072ef',
        laserEnemy: '#ff4d7a',
        elite: '#ffb347',
        ebullet: '#ff7fa8',
        beam: '#ff2e63',
        boom: '#ffd166',
        star: '#22405c',
        power: '#78f58c',
        boss: '#ff3d6e',
        warn: '#ff4646'
      }
      const CI = {}
      const CS = []
      Object.keys(PALETTE).forEach((name, index) => {
        CI[name] = index
        CS[index] = PALETTE[name]
      })

      const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
      const rand = (a, b) => a + Math.random() * (b - a)
      const randInt = (a, b) => Math.floor(rand(a, b + 1))
      const pad = (value, size) => {
        let text = String(Math.max(0, Math.floor(value)))
        while (text.length < size) text = '0' + text
        return text
      }

      const readBest = () => {
        try {
          const raw = window.localStorage.getItem(HI_KEY)
          const value = raw === null ? 0 : Number(raw)
          return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
        } catch (error) {
          return 0
        }
      }
      const writeBest = value => {
        try {
          window.localStorage.setItem(HI_KEY, String(value))
        } catch (error) {
          /* storage is optional */
        }
      }

      const SHIP = ['  ^  ', ' / \\ ', '<===>']
      const SPRITES = {
        scout: ['<v>'],
        sine: ['<s>'],
        diver: ['<@>'],
        turret: [' [W] ', '^|_|^'],
        laser: ['[L]', ' | '],
        elite: [' /X\\ ', '<X X>', ' \\X/ ']
      }
      const BOSS_ART = [
        ['  /^^^^^^^\\  ', ' < (o) (o) > ', '  \\  ===  /  ', '   \\_/ \\_/   ', '    V   V    '],
        ['  /^^^^^^^\\  ', ' < (*) (*) > ', '  \\ \\___/ /  ', '  _\\_/ \\_/_  ', ' / V     V \\ ']
      ]
      const FOOTER = '[WASD/ARROWS] MOVE   [X] BOMB   [P] PAUSE   [ESC] EXIT'

      class World {
        constructor(cols, rows) {
          this.cols = cols
          this.rows = rows
          this.hi = readBest()
          this.reset()
        }

        get fieldTop() {
          return 2
        }

        get fieldBottom() {
          return this.rows - 2
        }

        get fieldH() {
          return this.rows - 4
        }

        reset() {
          this.t = 0
          this.score = 0
          this.lives = 3
          this.wave = 1
          this.waveT = 22
          this.scoreFlash = 0
          this.hitFlash = 0
          this.phase = 'play'
          this.banner = { text: 'WAVE 01', t: 1.8 }
          this.player = {
            x: this.cols / 2,
            y: this.fieldBottom - 3,
            power: 1,
            wingmen: 0,
            shield: 0,
            bombs: 2,
            sub: 'missile',
            fireT: 0,
            subT: 0,
            invuln: 2,
            alive: true
          }
          this.bullets = []
          this.enemies = []
          this.ebullets = []
          this.beams = []
          this.items = []
          this.fx = []
          this.boss = null
          this.bossQueued = false
          this.spawnT = 1.6
          this.stars = this.makeStars()
          this.arriveT = 0
        }

        resize(cols, rows) {
          if (cols === this.cols && rows === this.rows) return
          const oldCols = this.cols
          const oldRows = this.rows
          this.cols = cols
          this.rows = rows
          const sx = cols / oldCols
          const sy = (rows - 4) / (oldRows - 4)
          this.player.x = clamp(this.player.x * sx, 1, cols - 2)
          this.player.y = clamp(this.fieldTop + (this.player.y - 2) * sy, this.fieldTop + 1, this.fieldBottom - 1)
          for (const enemy of this.enemies) {
            enemy.x *= sx
            enemy.y = 2 + (enemy.y - 2) * sy
          }
          for (const bullet of this.bullets) {
            bullet.x *= sx
            bullet.y = 2 + (bullet.y - 2) * sy
          }
          for (const bullet of this.ebullets) {
            bullet.x *= sx
            bullet.y = 2 + (bullet.y - 2) * sy
          }
          if (this.boss) {
            this.boss.x = clamp(this.boss.x * sx, 9, cols - 9)
            this.boss.homeX = clamp(this.boss.homeX * sx, 9, cols - 9)
          }
          this.stars = this.makeStars()
        }

        makeStars() {
          const stars = []
          const count = Math.round(this.cols * this.fieldH / 26)
          for (let i = 0; i < count; i += 1) {
            const layer = Math.random() < 0.6 ? 0 : Math.random() < 0.75 ? 1 : 2
            stars.push({
              x: rand(1, this.cols - 2),
              y: rand(this.fieldTop, this.fieldBottom),
              ch: layer === 0 ? '.' : layer === 1 ? '·' : '+',
              sp: layer === 0 ? 2.2 : layer === 1 ? 5 : 9,
              color: CI.star
            })
          }
          return stars
        }

        /* ---------------------------------------------------------------- */
        /* update                                                           */
        /* ---------------------------------------------------------------- */

        update(dt, input) {
          if (this.arriveT > 0) {
            this.arriveT = Math.max(0, this.arriveT - dt)
            this.stepStars(dt)
            this.stepPlayer(dt, { dirX: 0, dirY: 0, bomb: false })
            for (const enemy of this.enemies) enemy.y += enemy.vy * dt
            return
          }
          if (this.phase === 'paused' || this.phase === 'over') {
            this.stepStars(dt * 0.15)
            this.stepFx(dt)
            return
          }
          this.t += dt
          if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt)
          if (this.scoreFlash > 0) this.scoreFlash = Math.max(0, this.scoreFlash - dt)
          if (this.banner && this.banner.t > 0) this.banner.t -= dt
          this.stepStars(dt)
          this.stepPlayer(dt, input)
          if (input.bomb) {
            input.bomb = false
            this.useBomb()
          }
          if (this.boss) this.stepBoss(dt)
          else {
            this.spawnT -= dt
            if (this.spawnT <= 0) this.spawnFormation()
          }
          this.stepBullets(dt)
          this.stepEnemies(dt)
          this.stepEnemyBullets(dt)
          this.stepBeams(dt)
          this.stepItems(dt)
          this.collide()
          this.stepFx(dt)
          this.stepWave(dt)
        }

        stepStars(dt) {
          for (const star of this.stars) {
            star.y += star.sp * dt
            if (star.y > this.fieldBottom) {
              star.y = this.fieldTop
              star.x = rand(1, this.cols - 2)
            }
          }
        }

        stepPlayer(dt, input) {
          const p = this.player
          if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt)
          const speed = 17
          if (input.pointer && Number.isFinite(input.px)) {
            p.x += (input.px - p.x) * Math.min(1, dt * 22)
            p.y += (input.py - p.y) * Math.min(1, dt * 22)
          } else {
            p.x += (input.dirX || 0) * speed * dt
            p.y += (input.dirY || 0) * speed * dt
          }
          p.x = clamp(p.x, 1.5, this.cols - 2.5)
          p.y = clamp(p.y, this.fieldTop + 1, this.fieldBottom - 1)

          p.fireT -= dt
          if (p.fireT <= 0) {
            p.fireT = 0.105
            this.shootMain()
          }
          p.subT -= dt
          if (p.subT <= 0) {
            if (p.sub === 'missile') {
              p.subT = 0.95
              this.shootMissile()
            } else {
              p.subT = 0.42
              this.shootPierce()
            }
          }
        }

        /* ---------------------------------------------------------------- */
        /* player weapons                                                   */
        /* ---------------------------------------------------------------- */

        addBullet(x, y, vx, vy, opts) {
          this.bullets.push(Object.assign({
            x, y, vx, vy, dmg: 1, ch: '|', color: CI.pbullet, pierce: 0, homing: false, hit: false
          }, opts))
        }

        shootMain() {
          const p = this.player
          const v = -46
          if (p.power === 1) {
            this.addBullet(p.x, p.y - 1, 0, v, {})
            return
          }
          if (p.power === 2) {
            this.addBullet(p.x - 0.7, p.y - 1, 0, v, {})
            this.addBullet(p.x + 0.7, p.y - 1, 0, v, {})
            return
          }
          if (p.power === 3) {
            this.addBullet(p.x, p.y - 1.2, 0, v, {})
            this.addBullet(p.x - 0.9, p.y - 0.6, -8, v * 0.96, { ch: '/' })
            this.addBullet(p.x + 0.9, p.y - 0.6, 8, v * 0.96, { ch: '\\' })
            return
          }
          if (p.power === 4) {
            this.addBullet(p.x - 0.5, p.y - 1.2, 0, v, {})
            this.addBullet(p.x + 0.5, p.y - 1.2, 0, v, {})
            this.addBullet(p.x - 1.4, p.y - 0.4, -11, v * 0.92, { ch: '/' })
            this.addBullet(p.x + 1.4, p.y - 0.4, 11, v * 0.92, { ch: '\\' })
            return
          }
          this.addBullet(p.x, p.y - 1.4, 0, v, { dmg: 2, ch: 'I' })
          this.addBullet(p.x - 1.2, p.y - 0.8, -9, v * 0.95, { ch: '/' })
          this.addBullet(p.x + 1.2, p.y - 0.8, 9, v * 0.95, { ch: '\\' })
          this.addBullet(p.x - 2, p.y - 0.2, -18, v * 0.85, { ch: '/' })
          this.addBullet(p.x + 2, p.y - 0.2, 18, v * 0.85, { ch: '\\' })
          if (Math.floor(this.t * 10) % 3 === 0) this.addBullet(p.x, p.y + 1.2, 0, 30, { ch: 'v', dmg: 1 })
        }

        shootMissile() {
          const p = this.player
          this.addBullet(p.x - 1.8, p.y, 0, -22, { homing: true, dmg: 3, ch: 'm', color: CI.missile })
          this.addBullet(p.x + 1.8, p.y, 0, -22, { homing: true, dmg: 3, ch: 'm', color: CI.missile })
        }

        shootPierce() {
          const p = this.player
          this.addBullet(p.x, p.y - 1.6, 0, -58, { pierce: 3, dmg: 2, ch: '¦', color: CI.pierce })
        }

        useBomb() {
          const p = this.player
          if (p.bombs <= 0) return
          p.bombs -= 1
          this.hitFlash = 0.25
          this.ebullets = []
          this.beams = []
          for (const enemy of this.enemies) this.damageEnemy(enemy, 10)
          if (this.boss) this.damageBoss(24)
          p.invuln = Math.max(p.invuln, 1.6)
          this.purgeEnemies()
        }

        /* ---------------------------------------------------------------- */
        /* enemies                                                          */
        /* ---------------------------------------------------------------- */

        spawnFormation() {
          const wave = this.wave
          const roll = Math.random()
          const width = this.cols
          if (wave >= 3 && roll > 0.9) this.spawnEnemy('elite', width / 2)
          else if (wave >= 2 && roll > 0.78) {
            this.spawnEnemy('laser', rand(6, width - 6))
          } else if (wave >= 1 && roll > 0.62) {
            this.spawnEnemy('turret', rand(5, width - 5))
          } else if (roll > 0.34) {
            const base = rand(6, width - 6)
            for (let i = -2; i <= 2; i += 1) {
              this.spawnEnemy(i % 2 === 0 ? 'scout' : 'diver', base + i * 2.4, -1 - Math.abs(i) * 0.8)
            }
          } else {
            const base = rand(5, width - 5)
            for (let i = 0; i < 4; i += 1) {
              this.spawnEnemy('sine', base + i * 2.6, -1 - i * 1.4)
            }
          }
          const base = Math.max(0.85, 2.6 - wave * 0.13)
          this.spawnT = base + rand(0, 0.5)
        }

        spawnEnemy(type, x, y) {
          const wave = this.wave
          const scale = 1 + wave * 0.035
          const table = {
            scout: { hp: 3, vy: 7, score: 20 },
            sine: { hp: 4, vy: 5.4, score: 30 },
            diver: { hp: 5, vy: 9, score: 40 },
            turret: { hp: 14, vy: 2.6, score: 90 },
            laser: { hp: 18, vy: 3.2, score: 120 },
            elite: { hp: 34, vy: 2.2, score: 220 }
          }
          const spec = table[type]
          this.enemies.push({
            type,
            x,
            y: y === undefined ? -2 : y,
            vy: spec.vy * scale,
            hp: spec.hp + Math.floor(wave * 0.8),
            maxHp: spec.hp + Math.floor(wave * 0.8),
            score: spec.score,
            t: rand(0, 3),
            fireT: rand(0.8, 2),
            dir: Math.random() < 0.5 ? -1 : 1,
            hitT: 0,
            dead: false
          })
        }

        stepEnemies(dt) {
          const p = this.player
          for (const enemy of this.enemies) {
            enemy.t += dt
            if (enemy.hitT > 0) enemy.hitT -= dt
            enemy.y += enemy.vy * dt
            const hold = this.fieldTop + 3
            if (enemy.type === 'sine') enemy.x += Math.sin(enemy.t * 2.2) * 6 * dt
            else if (enemy.type === 'diver') {
              const dx = p.x - enemy.x
              enemy.x += clamp(dx, -6, 6) * dt
            } else if (enemy.type === 'turret') {
              if (enemy.y > hold) {
                enemy.y = hold + Math.sin(enemy.t) * 0.6
                enemy.x += Math.sin(enemy.t * 0.8) * 3 * dt
              }
            } else if (enemy.type === 'laser' || enemy.type === 'elite') {
              if (enemy.y > hold - 1) enemy.y = hold - 1
              enemy.x += enemy.dir * (enemy.type === 'elite' ? 5 : 2.4) * dt
              if (enemy.x < 7 || enemy.x > this.cols - 7) enemy.dir *= -1
            }
            enemy.x = clamp(enemy.x, 2, this.cols - 3)
            if (enemy.y > this.fieldBottom + 2) enemy.dead = true

            enemy.fireT -= dt
            if (enemy.fireT > 0) continue
            if (enemy.type === 'scout' && enemy.y > 2) {
              enemy.fireT = 2.6
              this.fireAimed(enemy.x, enemy.y + 1, 9 + this.wave * 0.4)
            } else if (enemy.type === 'sine' && enemy.y > 3) {
              enemy.fireT = 2.2
              this.fireAimed(enemy.x, enemy.y + 1, 8 + this.wave * 0.35)
            } else if (enemy.type === 'diver' && enemy.y > 3) {
              enemy.fireT = 3
              this.fireAimed(enemy.x, enemy.y + 1, 10 + this.wave * 0.4)
            } else if (enemy.type === 'turret') {
              enemy.fireT = 1.7
              this.fireFan(enemy.x, enemy.y + 1.5, 9 + this.wave * 0.4, 3, 0.5, Math.PI / 2)
            } else if (enemy.type === 'laser') {
              enemy.fireT = 3.4
              this.spawnBeam(enemy.x, enemy.y + 1.2)
            } else if (enemy.type === 'elite') {
              enemy.fireT = 2.2
              this.fireRing(enemy.x, enemy.y + 1.5, 7 + this.wave * 0.3, 14, enemy.t)
            }
          }
          this.purgeEnemies()
        }

        purgeEnemies() {
          this.enemies = this.enemies.filter(enemy => !enemy.dead)
        }

        damageEnemy(enemy, amount) {
          enemy.hp -= amount
          enemy.hitT = 0.06
          if (enemy.hp > 0) return
          enemy.dead = true
          this.score += enemy.score
          this.scoreFlash = 0.12
          this.explode(enemy.x, enemy.y, 1)
          if (Math.random() < (enemy.type === 'elite' ? 0.8 : 0.12)) this.dropItem(enemy.x, enemy.y)
        }

        dropItem(x, y) {
          const roll = Math.random()
          let type = 'P'
          if (roll > 0.72) type = 'S'
          else if (roll > 0.6) type = 'B'
          else if (roll > 0.48) type = 'W'
          else if (roll > 0.36) type = 'M'
          else if (roll > 0.24) type = 'A'
          else if (roll > 0.1) type = 'C'
          this.items.push({ x, y, type, t: 0 })
        }

        stepItems(dt) {
          const p = this.player
          for (const item of this.items) {
            item.y += 4.2 * dt
            item.t += dt
            if (Math.abs(item.x - p.x) < 1.6 && Math.abs(item.y - p.y) < 1.4) {
              item.dead = true
              this.collect(item.type)
            }
          }
          this.items = this.items.filter(item => !item.dead && item.y < this.fieldBottom + 2)
        }

        collect(type) {
          const p = this.player
          if (type === 'P') p.power = Math.min(5, p.power + 1)
          else if (type === 'W') p.wingmen = Math.min(2, p.wingmen + 1)
          else if (type === 'S') p.shield = Math.min(2, p.shield + 1)
          else if (type === 'B') p.bombs = Math.min(5, p.bombs + 1)
          else if (type === 'M') p.sub = 'missile'
          else if (type === 'A') p.sub = 'pierce'
          else this.score += 100
          this.scoreFlash = 0.1
        }

        /* ---------------------------------------------------------------- */
        /* boss                                                             */
        /* ---------------------------------------------------------------- */

        spawnBoss() {
          const hp = 260 + this.wave * 70
          this.boss = {
            x: this.cols / 2,
            homeX: this.cols / 2,
            y: -6,
            hp,
            maxHp: hp,
            t: 0,
            fireT: 1.6,
            pattern: 0,
            patternT: 7,
            phase: 1,
            dir: 1
          }
          this.banner = { text: '!! WARNING !!', t: 2 }
        }

        stepBoss(dt) {
          const boss = this.boss
          boss.t += dt
          if (boss.hitT > 0) boss.hitT = Math.max(0, boss.hitT - dt)
          if (boss.hp < boss.maxHp * 0.5 && boss.phase === 1) {
            boss.phase = 2
            boss.patternT = 0
            this.banner = { text: 'RAGE MODE', t: 1.4 }
          }
          const targetY = this.fieldTop + 4
          if (boss.y < targetY) boss.y += 6 * dt
          boss.homeX += Math.sin(boss.t * 0.3) * 2 * dt
          boss.homeX = clamp(boss.homeX, 10, this.cols - 10)
          boss.x = clamp(boss.homeX + Math.sin(boss.t * 0.55) * (this.cols * 0.22), 10, this.cols - 10)

          boss.patternT -= dt
          if (boss.patternT <= 0) {
            boss.patternT = boss.phase === 2 ? 5 : 7
            boss.pattern = (boss.pattern + 1) % 4
          }
          boss.fireT -= dt
          if (boss.fireT > 0) return
          const p = this.player
          const speed = 9 + this.wave * 0.35
          if (boss.pattern === 0) {
            boss.fireT = boss.phase === 2 ? 0.55 : 0.8
            this.fireFan(boss.x, boss.y + 3, speed, boss.phase === 2 ? 7 : 5, 0.72, Math.PI / 2)
          } else if (boss.pattern === 1) {
            boss.fireT = 1.7
            this.fireRing(boss.x, boss.y + 2, speed * 0.9, 18, boss.t)
          } else if (boss.pattern === 2) {
            boss.fireT = 0.09
            const angle = boss.t * 2.6
            this.ebullets.push({ x: boss.x, y: boss.y + 2, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, ch: 'o' })
            this.ebullets.push({ x: boss.x, y: boss.y + 2, vx: Math.cos(angle + Math.PI) * speed, vy: Math.sin(angle + Math.PI) * speed, ch: 'o' })
          } else {
            boss.fireT = 2.6
            this.spawnBeam(boss.x - 5, boss.y + 2)
            this.spawnBeam(boss.x + 5, boss.y + 2)
            this.fireAimed(boss.x, boss.y + 2, speed + 2)
          }
          void p
        }

        damageBoss(amount) {
          const boss = this.boss
          boss.hp -= amount
          boss.hitT = 0.06
          if (boss.hp > 0) return
          this.score += 800 + this.wave * 100
          for (let i = 0; i < 8; i += 1) this.explode(boss.x + rand(-7, 7), boss.y + rand(-2, 3), 2)
          this.boss = null
          this.banner = { text: 'BOSS DOWN', t: 1.6 }
          this.dropItem(boss.x, boss.y + 2)
          this.dropItem(boss.x - 3, boss.y + 2)
          this.dropItem(boss.x + 3, boss.y + 2)
        }

        /* ---------------------------------------------------------------- */
        /* bullets                                                          */
        /* ---------------------------------------------------------------- */

        fireAimed(x, y, speed) {
          const p = this.player
          const dx = p.x - x
          const dy = p.y - y
          const len = Math.hypot(dx, dy) || 1
          this.ebullets.push({ x, y, vx: (dx / len) * speed, vy: (dy / len) * speed, ch: '·' })
        }

        fireFan(x, y, speed, count, spread, dir) {
          const step = count > 1 ? spread / (count - 1) : 0
          const start = dir - spread / 2
          for (let i = 0; i < count; i += 1) {
            const angle = start + step * i
            this.ebullets.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, ch: '*' })
          }
        }

        fireRing(x, y, speed, count, phase) {
          for (let i = 0; i < count; i += 1) {
            const angle = phase + (Math.PI * 2 * i) / count
            this.ebullets.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, ch: 'o' })
          }
        }

        spawnBeam(x, y) {
          this.beams.push({ x, y, t: 0, warn: 0.9, live: 0.7 })
        }

        stepBullets(dt) {
          const p = this.player
          for (const bullet of this.bullets) {
            if (bullet.homing) {
              let best = null
              let bestD = Infinity
              for (const enemy of this.enemies) {
                const d = (enemy.x - bullet.x) ** 2 + (enemy.y - bullet.y) ** 2
                if (d < bestD) {
                  bestD = d
                  best = enemy
                }
              }
              if (this.boss) {
                const d = (this.boss.x - bullet.x) ** 2 + (this.boss.y - bullet.y) ** 2
                if (d < bestD) best = this.boss
              }
              if (best) {
                const dx = best.x - bullet.x
                const dy = best.y - bullet.y
                const len = Math.hypot(dx, dy) || 1
                const speed = Math.hypot(bullet.vx, bullet.vy)
                const turn = 3.4 * dt
                bullet.vx += (dx / len) * speed * turn
                bullet.vy += (dy / len) * speed * turn
                const current = Math.hypot(bullet.vx, bullet.vy) || 1
                bullet.vx = (bullet.vx / current) * speed
                bullet.vy = (bullet.vy / current) * speed
              }
            }
            bullet.x += bullet.vx * dt
            bullet.y += bullet.vy * dt
            if (bullet.y < 1 || bullet.y > this.rows || bullet.x < 0 || bullet.x > this.cols) bullet.dead = true
          }
          this.bullets = this.bullets.filter(bullet => !bullet.dead)
          void p
        }

        stepEnemyBullets(dt) {
          for (const bullet of this.ebullets) {
            bullet.x += bullet.vx * dt
            bullet.y += bullet.vy * dt
            if (bullet.y > this.rows + 2 || bullet.y < -3 || bullet.x < -3 || bullet.x > this.cols + 3) bullet.dead = true
          }
          this.ebullets = this.ebullets.filter(bullet => !bullet.dead)
        }

        stepBeams(dt) {
          for (const beam of this.beams) {
            beam.t += dt
            if (beam.t > beam.warn + beam.live) beam.dead = true
          }
          this.beams = this.beams.filter(beam => !beam.dead)
        }

        stepFx(dt) {
          for (const effect of this.fx) {
            effect.t += dt
            effect.x += effect.vx * dt
            effect.y += effect.vy * dt
            effect.vy += effect.g * dt
          }
          this.fx = this.fx.filter(effect => effect.t < effect.life)
        }

        explode(x, y, size) {
          const count = size > 1 ? 14 : 6
          for (let i = 0; i < count; i += 1) {
            const angle = rand(0, Math.PI * 2)
            const speed = rand(4, 16) * size
            this.fx.push({
              x,
              y,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              g: 18,
              t: 0,
              life: rand(0.25, 0.55),
              seed: randInt(0, 3)
            })
          }
        }

        /* ---------------------------------------------------------------- */
        /* collisions                                                       */
        /* ---------------------------------------------------------------- */

        collide() {
          const p = this.player
          for (const bullet of this.bullets) {
            if (bullet.dead) continue
            for (const enemy of this.enemies) {
              if (enemy.dead) continue
              if (Math.abs(bullet.x - enemy.x) < 2.1 && Math.abs(bullet.y - enemy.y) < 1.4) {
                this.damageEnemy(enemy, bullet.dmg)
                if (bullet.pierce > 0) bullet.pierce -= 1
                else bullet.dead = true
                if (bullet.dead) break
              }
            }
            if (bullet.dead) continue
            const boss = this.boss
            if (boss && Math.abs(bullet.x - boss.x) < 7 && Math.abs(bullet.y - boss.y) < 3) {
              this.damageBoss(bullet.dmg)
              if (bullet.pierce > 0) bullet.pierce -= 1
              else bullet.dead = true
            }
          }
          this.bullets = this.bullets.filter(bullet => !bullet.dead)
          this.purgeEnemies()

          if (p.invuln > 0) return
          const hitR = 0.55
          for (const bullet of this.ebullets) {
            if (Math.abs(bullet.x - p.x) < hitR && Math.abs(bullet.y - p.y) < hitR) {
              bullet.dead = true
              this.hurtPlayer()
              return
            }
          }
          for (const beam of this.beams) {
            if (beam.t < beam.warn || beam.dead) continue
            if (Math.abs(beam.x - p.x) < 0.8 && p.y > beam.y) {
              this.hurtPlayer()
              return
            }
          }
          for (const enemy of this.enemies) {
            if (Math.abs(enemy.x - p.x) < 2.2 && Math.abs(enemy.y - p.y) < 1.6) {
              enemy.dead = true
              this.explode(enemy.x, enemy.y, 1)
              this.hurtPlayer()
              return
            }
          }
          if (this.boss && Math.abs(this.boss.x - p.x) < 7.5 && Math.abs(this.boss.y - p.y) < 3) this.hurtPlayer()
        }

        hurtPlayer() {
          const p = this.player
          if (p.shield > 0) {
            p.shield -= 1
            p.invuln = 1.2
            this.hitFlash = 0.15
            this.explode(p.x, p.y, 1)
            return
          }
          this.lives -= 1
          p.power = Math.max(1, p.power - 1)
          p.invuln = 2
          this.hitFlash = 0.3
          this.explode(p.x, p.y, 2)
          for (const bullet of this.ebullets) {
            if (Math.abs(bullet.x - p.x) < 5 && Math.abs(bullet.y - p.y) < 5) bullet.dead = true
          }
          this.ebullets = this.ebullets.filter(bullet => !bullet.dead)
          if (this.lives <= 0) this.gameOver()
        }

        gameOver() {
          this.phase = 'over'
          if (this.score > this.hi) {
            this.hi = this.score
            writeBest(this.hi)
          }
        }

        stepWave(dt) {
          if (this.boss) return
          this.waveT -= dt
          if (this.waveT > 0) return
          this.wave += 1
          this.waveT = 22
          this.banner = { text: 'WAVE ' + pad(this.wave, 2), t: 1.6 }
          if (this.wave % 4 === 0) this.spawnBoss()
        }
      }
      /* #endregion world */

      const FONT_FALLBACK = 'Consolas, "Cascadia Mono", "Courier New", monospace'
      const BG = '#03070c'

      function layoutFor(w, h, family) {
        let fontPx = clamp(Math.round(h / 27 / 1.1), 13, 28)
        let cellW = Math.round(fontPx * 0.6 * 10) / 10
        let cols = Math.floor(w / cellW)
        if (cols > 80) {
          fontPx = clamp(Math.round(w / 80 / 0.6), 13, 30)
          cellW = Math.round(fontPx * 0.6 * 10) / 10
          cols = Math.floor(w / cellW)
        }
        const cellH = Math.max(10, Math.round(fontPx * 1.1))
        cols = clamp(cols, 34, 82)
        const rows = clamp(Math.floor(h / cellH), 20, 46)
        const ox = Math.round((w - cols * cellW) / 2)
        const oy = Math.round((h - rows * cellH) / 2)
        return { fontPx, font: '600 ' + fontPx + 'px ' + family, cellW, cellH, cols, rows, ox, oy, w, h }
      }

      function easeOut(x) {
        const t = clamp(x, 0, 1)
        return 1 - (1 - t) * (1 - t)
      }

      function mount(container, options) {
        const opts = options || {}
        const doc = container.ownerDocument || document
        const view = doc.defaultView || window
        ensureStyle(doc)

        const canvas = doc.createElement('canvas')
        canvas.className = 'at-canvas'
        canvas.setAttribute('role', 'application')
        canvas.setAttribute('aria-label', opts.label || 'ASCII shooter')
        container.appendChild(canvas)

        const ctx = canvas.getContext('2d')
        const family = opts.fontFamily || FONT_FALLBACK
        const dpr = Math.min(2, view.devicePixelRatio || 1)

        const world = new World(44, 26)
        let layout = layoutFor(opts.width || 800, opts.height || 600, family)
        let disposed = false
        let raf = 0
        let last = view.performance ? view.performance.now() : Date.now()
        let scale = 1

        const samples = Array.isArray(opts.samples) ? opts.samples : []
        const intro = {
          active: samples.length > 0,
          t: 0,
          parts: samples.map(sample => ({
            x: sample.x,
            y: sample.y,
            ch: sample.ch,
            font: sample.font,
            color: sample.color,
            vx: 0,
            vy: 0,
            released: false,
            alpha: 1,
            jitter: 0
          })),
          scan: 0
        }
        if (!intro.active) world.arriveT = 0.5

        const input = { dirX: 0, dirY: 0, bomb: false, pointer: false, px: 0, py: 0 }
        const held = { left: false, right: false, up: false, down: false }
        let pointerArmed = false
        let pointerOrigin = null
        let pointerFire = false

        const resize = (w, h) => {
          width = Math.max(60, Math.round(w))
          height = Math.max(60, Math.round(h))
          canvas.width = Math.round(width * dpr)
          canvas.height = Math.round(height * dpr)
          canvas.style.width = width + 'px'
          canvas.style.height = height + 'px'
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
          layout = layoutFor(width, height, family)
          ctx.font = layout.font
          ctx.textBaseline = 'top'
          ctx.textAlign = 'left'
          scale = layout.fontPx / 22
          world.resize(layout.cols, layout.rows)
        }
        let width = 0
        let height = 0
        resize(opts.width || container.clientWidth || 800, opts.height || container.clientHeight || 600)

        /* ------------------------------ drawing ------------------------ */

        const cellX = cx => layout.ox + cx * layout.cellW
        const cellY = cy => layout.oy + cy * layout.cellH + (layout.cellH - layout.fontPx) / 2

        const glyph = (ch, cx, cy, color, alpha) => {
          ctx.globalAlpha = alpha === undefined ? 1 : alpha
          ctx.fillStyle = color
          ctx.fillText(ch, cellX(cx), cellY(cy))
        }

        const text = (value, cx, cy, color) => {
          ctx.globalAlpha = 1
          ctx.fillStyle = color
          for (let i = 0; i < value.length; i += 1) ctx.fillText(value[i], cellX(cx + i), cellY(cy))
        }

        const sprite = (lines, cx, cy, color, alpha) => {
          ctx.globalAlpha = alpha === undefined ? 1 : alpha
          ctx.fillStyle = color
          for (let row = 0; row < lines.length; row += 1) {
            const line = lines[row]
            const startX = cx - Math.floor(line.length / 2)
            for (let col = 0; col < line.length; col += 1) {
              if (line[col] === ' ') continue
              ctx.fillText(line[col], cellX(startX + col), cellY(cy + (row - Math.floor(lines.length / 2))))
            }
          }
        }

        const bracket = (cx, cy, width, height, color) => {
          ctx.globalAlpha = 1
          ctx.fillStyle = color
          ctx.fillText('┌', cellX(cx), cellY(cy))
          ctx.fillText('┐', cellX(cx + width - 1), cellY(cy))
          ctx.fillText('└', cellX(cx), cellY(cy + height - 1))
          ctx.fillText('┘', cellX(cx + width - 1), cellY(cy + height - 1))
          for (let i = 1; i < width - 1; i += 1) {
            ctx.fillText('─', cellX(cx + i), cellY(cy))
            ctx.fillText('─', cellX(cx + i), cellY(cy + height - 1))
          }
          for (let j = 1; j < height - 1; j += 1) {
            ctx.fillText('│', cellX(cx), cellY(cy + j))
            ctx.fillText('│', cellX(cx + width - 1), cellY(cy + j))
          }
        }

        const drawBackground = () => {
          const gradient = ctx.createRadialGradient(
            width / 2, height * 0.35, 20, width / 2, height * 0.35, Math.max(width, height) * 0.75
          )
          gradient.addColorStop(0, '#071521')
          gradient.addColorStop(0.65, '#040a12')
          gradient.addColorStop(1, '#02050a')
          ctx.globalAlpha = 1
          ctx.fillStyle = gradient
          ctx.fillRect(0, 0, width, height)
        }

        const drawStars = () => {
          ctx.globalAlpha = 1
          for (const star of world.stars) {
            ctx.fillStyle = CS[star.color]
            ctx.fillText(star.ch, cellX(star.x), cellY(star.y))
          }
        }

        const makeRow = (top) => {
          const cells = new Array(layout.cols)
          for (let i = 0; i < layout.cols; i += 1) cells[i] = { ch: '─', color: PALETTE.frame }
          cells[0] = { ch: top ? '┌' : '└', color: PALETTE.frame }
          cells[layout.cols - 1] = { ch: top ? '┐' : '┘', color: PALETTE.frame }
          return cells
        }

        const rowText = (cells, x, value, color) => {
          for (let i = 0; i < value.length; i += 1) {
            const index = Math.round(x) + i
            if (index > 0 && index < layout.cols - 1) cells[index] = { ch: value[i], color }
          }
        }

        const paintRow = (cells, y) => {
          ctx.globalAlpha = 1
          for (let i = 0; i < layout.cols; i += 1) {
            ctx.fillStyle = cells[i].color
            ctx.fillText(cells[i].ch, cellX(i), cellY(y))
          }
        }

        const drawFrame = () => {
          const top = makeRow(true)
          let x = 2
          const seg = (value, color) => {
            rowText(top, x, value, color)
            x += value.length
          }
          seg('SCORE ', PALETTE.dim)
          seg(pad(world.score, 6), PALETTE.white)
          seg('   WAVE ', PALETTE.dim)
          seg(pad(world.wave, 2), PALETTE.hud)
          const hi = 'HI ' + pad(world.hi, 6)
          rowText(top, layout.cols - 2 - hi.length, hi, PALETTE.dim)
          const title = ' ASCII THUNDER '
          if (x + title.length + 2 < layout.cols - 2 - hi.length) {
            rowText(top, Math.round((layout.cols - title.length) / 2), title, PALETTE.hud)
          }
          paintRow(top, 0)

          const bottom = makeRow(false)
          const hint = FOOTER.length > layout.cols - 4 ? FOOTER.slice(0, layout.cols - 4) : FOOTER
          rowText(bottom, 2, hint, PALETTE.dim)
          paintRow(bottom, layout.rows - 1)

          ctx.globalAlpha = 1
          ctx.fillStyle = PALETTE.frame
          for (let y = 1; y < layout.rows - 1; y += 1) {
            ctx.fillText('│', cellX(0), cellY(y))
            ctx.fillText('│', cellX(layout.cols - 1), cellY(y))
          }
        }

        const drawStatus = () => {
          const p = world.player
          const cells = new Array(layout.cols)
          for (let i = 0; i < layout.cols; i += 1) cells[i] = { ch: ' ', color: PALETTE.dim }
          let x = 2
          const seg = (value, color) => {
            rowText(cells, x, value, color)
            x += value.length
          }
          seg('PWR ' + p.power, PALETTE.hud)
          seg('  WING ' + p.wingmen, PALETTE.power)
          seg('  SHD ' + p.shield, PALETTE.player)
          seg('  BOMB ' + p.bombs, PALETTE.boom)
          seg('  ' + (p.sub === 'missile' ? 'MISSILE' : 'PIERCE'), PALETTE.missile)
          const lives = Array.from({ length: Math.max(0, world.lives) }, () => '▲').join(' ')
          rowText(cells, layout.cols - 2 - lives.length, lives, PALETTE.player)
          if (world.boss) {
            const boss = world.boss
            const ratio = Math.max(0, boss.hp / boss.maxHp)
            const filled = clamp(Math.round(ratio * 12), 0, 12)
            const barX = Math.round((layout.cols - 17) / 2)
            rowText(cells, barX, 'BOSS ', PALETTE.boss)
            for (let i = 0; i < 12; i += 1) {
              rowText(cells, barX + 5 + i, i < filled ? '█' : '░', i < filled ? PALETTE.boss : PALETTE.dim)
            }
          }
          paintRow(cells, 1)
        }

        const drawFooter = () => {
          const hint = FOOTER
          const max = layout.cols - 4
          const value = hint.length > max ? hint.slice(0, max) : hint
          text(value, 2, layout.rows - 1, PALETTE.dim)
        }

        const drawPlayer = () => {
          const p = world.player
          if (p.invuln > 0 && Math.floor(world.t * 14) % 2 === 0) return
          let offset = 0
          if (world.arriveT > 0) offset = easeOut(world.arriveT / 0.55) * 12
          sprite(SHIP, p.x, p.y + offset, PALETTE.player)
          if (p.shield > 0) {
            ctx.globalAlpha = 0.8
            ctx.fillStyle = PALETTE.power
            ctx.fillText('(', cellX(p.x - 3), cellY(p.y + offset))
            ctx.fillText(')', cellX(p.x + 3), cellY(p.y + offset))
          }
          for (let i = 0; i < p.wingmen; i += 1) {
            const side = i === 0 ? -2.2 : 2.2
            ctx.globalAlpha = 1
            ctx.fillStyle = PALETTE.power
            ctx.fillText('·', cellX(p.x + side), cellY(p.y + offset + 0.4))
          }
        }

        const drawEnemies = () => {
          for (const enemy of world.enemies) {
            let offset = 0
            if (world.arriveT > 0) offset = -easeOut(world.arriveT / 0.55) * 10
            const art = SPRITES[enemy.type]
            const flash = enemy.hitT > 0
            sprite(art, enemy.x, enemy.y + offset, flash ? PALETTE.white : PALETTE[enemy.type === 'laser' ? 'laserEnemy' : enemy.type])
          }
          if (world.boss) {
            const boss = world.boss
            const art = BOSS_ART[boss.phase === 2 ? 1 : 0]
            const flash = boss.hitT > 0
            for (let row = 0; row < art.length; row += 1) {
              const line = art[row]
              const startX = Math.round(boss.x - line.length / 2)
              ctx.globalAlpha = 1
              for (let col = 0; col < line.length; col += 1) {
                if (line[col] === ' ') continue
                ctx.fillStyle = flash ? PALETTE.white : (boss.phase === 2 ? PALETTE.warn : PALETTE.boss)
                ctx.fillText(line[col], cellX(startX + col), cellY(boss.y + row - 2))
              }
            }
          }
        }

        const drawBullets = () => {
          for (const bullet of world.bullets) {
            ctx.globalAlpha = 1
            ctx.fillStyle = CS[bullet.color]
            ctx.fillText(bullet.ch, cellX(bullet.x), cellY(bullet.y))
          }
          for (const bullet of world.ebullets) {
            ctx.globalAlpha = 1
            ctx.fillStyle = PALETTE.ebullet
            ctx.fillText(bullet.ch, cellX(bullet.x), cellY(bullet.y))
          }
        }

        const drawBeams = () => {
          for (const beam of world.beams) {
            const warning = beam.t < beam.warn
            ctx.globalAlpha = warning ? 0.35 + 0.25 * Math.sin(beam.t * 30) : 0.9
            ctx.fillStyle = warning ? PALETTE.warn : PALETTE.beam
            const ch = warning ? '¦' : '║'
            for (let y = Math.round(beam.y); y < layout.rows - 1; y += 1) {
              ctx.fillText(ch, cellX(beam.x), cellY(y))
            }
          }
        }

        const drawItems = () => {
          for (const item of world.items) {
            const blink = Math.floor(item.t * 6) % 2 === 0
            ctx.globalAlpha = blink ? 1 : 0.55
            ctx.fillStyle = item.type === 'C' ? PALETTE.hud : PALETTE.power
            ctx.fillText(item.type, cellX(item.x), cellY(item.y))
          }
        }

        const drawFx = () => {
          const chars = ['*', '+', 'x', '·']
          for (const effect of world.fx) {
            const step = Math.min(chars.length - 1, Math.floor((effect.t / effect.life) * chars.length))
            ctx.globalAlpha = 1 - effect.t / effect.life
            ctx.fillStyle = PALETTE.boom
            ctx.fillText(chars[(step + effect.seed) % chars.length], cellX(effect.x), cellY(effect.y))
          }
          ctx.globalAlpha = 1
        }

        const drawBanner = () => {
          if (!world.banner || world.banner.t <= 0) return
          const value = world.banner.text
          const x = Math.round((layout.cols - value.length) / 2)
          const y = Math.round(layout.rows / 2) - 4
          const color = value.indexOf('!!') === 0 || value === 'RAGE MODE' ? PALETTE.warn : PALETTE.hud
          text(value, x, y, color)
        }

        const drawPaused = () => {
          const w = Math.min(34, layout.cols - 4)
          const h = 6
          const x = Math.floor((layout.cols - w) / 2)
          const y = Math.floor(layout.rows / 2) - 3
          ctx.globalAlpha = 0.92
          ctx.fillStyle = BG
          ctx.fillRect(cellX(x) + 2, cellY(y) + 2, (w - 1) * layout.cellW, (h - 1) * layout.cellH)
          bracket(x, y, w, h, PALETTE.frame)
          const lines = ['||  PAUSED  ||', '[P] RESUME   [ESC] EXIT']
          text(lines[0], x + Math.floor((w - lines[0].length) / 2), y + 2, PALETTE.hud)
          text(lines[1], x + Math.floor((w - lines[1].length) / 2), y + 4, PALETTE.dim)
        }

        const drawGameOver = () => {
          const w = Math.min(38, layout.cols - 4)
          const h = 8
          const x = Math.floor((layout.cols - w) / 2)
          const y = Math.floor(layout.rows / 2) - 4
          ctx.globalAlpha = 0.94
          ctx.fillStyle = BG
          ctx.fillRect(cellX(x) + 2, cellY(y) + 2, (w - 1) * layout.cellW, (h - 1) * layout.cellH)
          bracket(x, y, w, h, PALETTE.frame)
          const rows = [
            ['G A M E   O V E R', PALETTE.warn],
            ['SCORE ' + pad(world.score, 6) + '  BEST ' + pad(world.hi, 6), PALETTE.white],
            ['[R] RETRY   [ESC] EXIT', PALETTE.dim]
          ]
          rows.forEach((row, index) => {
            text(row[0], x + Math.floor((w - row[0].length) / 2), y + 2 + index * 2, row[1])
          })
        }

        /* ------------------------------ intro -------------------------- */

        const drawIntro = dt => {
          intro.t += dt * (opts.introSpeed || 1)
          const t = intro.t
          const fade = clamp(t / 0.16, 0, 1)
          ctx.globalAlpha = 1
          ctx.fillStyle = BG
          ctx.fillRect(0, 0, width, height)

          const scanY = height * (1 - clamp((t - 0.2) / 0.55, 0, 1))
          if (t > 0.2) {
            ctx.globalAlpha = 0.5
            ctx.fillStyle = '#0d2b3d'
            for (let x = 0; x < width; x += layout.cellW * 2) {
              ctx.fillText('▔', x, scanY)
            }
          }

          for (const part of intro.parts) {
            if (!part.released && t > 0.2 && part.y > scanY) {
              part.released = true
              part.vx = rand(-40, 40)
              part.vy = rand(-70, -10)
              part.jitter = rand(0.1, 0.35)
            }
            if (part.released) {
              part.vy += 620 * dt
              part.x += part.vx * dt
              part.y += part.vy * dt
              part.alpha = Math.max(0, part.alpha - dt * 1.7)
              if (part.alpha <= 0) continue
              part.ch = Math.random() < 0.35 ? '*+x·'[randInt(0, 3)] : part.ch
            }
            ctx.globalAlpha = part.alpha * Math.max(fade, 0.25)
            ctx.font = part.font
            ctx.fillStyle = part.color
            ctx.fillText(part.ch, part.x, part.y)
          }
          ctx.font = layout.font

          if (t > 0.78) {
            const arrive = clamp((t - 0.78) / 0.45, 0, 1)
            ctx.globalAlpha = arrive
            ctx.fillStyle = PALETTE.frame
            for (const star of world.stars) ctx.fillText(star.ch, cellX(star.x), cellY(star.y))
            ctx.globalAlpha = 1
          }
          if (t > 0.95) {
            intro.active = false
            world.phase = 'play'
            world.arriveT = 0.55
            world.banner = { text: 'WAVE 01', t: 1.6 }
            world.spawnT = 1.4
          }
        }

        /* ------------------------------ loop --------------------------- */

        const render = dt => {
          drawBackground()
          if (intro.active) {
            drawIntro(dt)
            return
          }
          const clipTop = layout.oy + 2 * layout.cellH
          const clipBottom = layout.oy + (layout.rows - 1) * layout.cellH
          ctx.save()
          ctx.beginPath()
          ctx.rect(layout.ox, clipTop, layout.cols * layout.cellW, clipBottom - clipTop)
          ctx.clip()
          drawStars()
          drawEnemies()
          drawItems()
          drawBeams()
          drawBullets()
          drawPlayer()
          drawFx()
          ctx.restore()
          drawFrame()
          drawStatus()
          drawFooter()
          drawBanner()
          if (world.hitFlash > 0) {
            ctx.globalAlpha = Math.min(0.5, world.hitFlash * 2)
            ctx.fillStyle = '#ff6b8a'
            ctx.fillRect(0, 0, width, height)
            ctx.globalAlpha = 1
          }
          if (world.phase === 'paused') drawPaused()
          if (world.phase === 'over') drawGameOver()
        }

        const frame = now => {
          if (disposed) return
          raf = view.requestAnimationFrame(frame)
          const dt = Math.min(MAX_DT, (now - last) / 1000)
          last = now
          if (doc.hidden === true) return
          syncInput()
          if (!intro.active) world.update(dt, input)
          render(dt)
        }

        /* ------------------------------ input -------------------------- */

        const syncInput = () => {
          input.dirX = (held.left ? -1 : 0) + (held.right ? 1 : 0)
          input.dirY = (held.up ? -1 : 0) + (held.down ? 1 : 0)
        }

        const isTyping = target => {
          if (!target || !target.tagName) return false
          const tag = target.tagName
          return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable === true
        }

        const onKeyDown = event => {
          if (isTyping(event.target)) return
          const key = event.key
          if (key === 'Escape') {
            event.preventDefault()
            exit()
            return
          }
          if (key === 'p' || key === 'P') {
            event.preventDefault()
            if (world.phase === 'play') world.phase = 'paused'
            else if (world.phase === 'paused') world.phase = 'play'
            return
          }
          if (key === 'r' || key === 'R') {
            event.preventDefault()
            world.reset()
            world.phase = 'play'
            world.arriveT = 0
            return
          }
          if (key === 'x' || key === 'X') {
            event.preventDefault()
            if (!event.repeat) input.bomb = true
            return
          }
          if (key === 'ArrowLeft' || key === 'a' || key === 'A') { event.preventDefault(); held.left = true; takeKeyboard(); return }
          if (key === 'ArrowRight' || key === 'd' || key === 'D') { event.preventDefault(); held.right = true; takeKeyboard(); return }
          if (key === 'ArrowUp' || key === 'w' || key === 'W') { event.preventDefault(); held.up = true; takeKeyboard(); return }
          if (key === 'ArrowDown' || key === 's' || key === 'S') { event.preventDefault(); held.down = true; takeKeyboard() }
        }

        const onKeyUp = event => {
          const key = event.key
          if (key === 'ArrowLeft' || key === 'a' || key === 'A') held.left = false
          else if (key === 'ArrowRight' || key === 'd' || key === 'D') held.right = false
          else if (key === 'ArrowUp' || key === 'w' || key === 'W') held.up = false
          else if (key === 'ArrowDown' || key === 's' || key === 'S') held.down = false
        }

        const takeKeyboard = () => {
          pointerArmed = false
          pointerOrigin = null
          input.pointer = false
        }

        const onPointerMove = event => {
          if (world.phase !== 'play' || intro.active) return
          if (event.pointerType === 'touch') return
          if (!pointerArmed) {
            if (pointerOrigin === null) {
              pointerOrigin = { x: event.clientX, y: event.clientY }
              return
            }
            if (Math.hypot(event.clientX - pointerOrigin.x, event.clientY - pointerOrigin.y) < 16) return
            pointerArmed = true
          }
          const rect = canvas.getBoundingClientRect()
          input.pointer = true
          input.px = (event.clientX - rect.left - layout.ox) / layout.cellW
          input.py = (event.clientY - rect.top - layout.oy) / layout.cellH
        }

        const onPointerDown = event => {
          if (world.phase === 'over') {
            world.reset()
            world.phase = 'play'
            return
          }
          if (world.phase === 'paused') {
            world.phase = 'play'
            return
          }
          if (event.pointerType !== 'mouse') onPointerMove(event)
        }

        const exit = () => {
          if (typeof opts.onExit === 'function') opts.onExit()
        }

        const onVisibility = () => {
          last = view.performance ? view.performance.now() : Date.now()
          if (doc.hidden === true && world.phase === 'play') world.phase = 'paused'
        }

        view.addEventListener('keydown', onKeyDown)
        view.addEventListener('keyup', onKeyUp)
        doc.addEventListener('visibilitychange', onVisibility)
        canvas.addEventListener('pointermove', onPointerMove)
        canvas.addEventListener('pointerdown', onPointerDown)
        // The chat underneath must not scroll while it is covered.
        const onWheel = event => event.preventDefault()
        canvas.addEventListener('wheel', onWheel, { passive: false })
        if (typeof view.requestAnimationFrame === 'function') raf = view.requestAnimationFrame(frame)

        return {
          resize,
          world,
          dispose() {
            if (disposed) return
            disposed = true
            if (raf) view.cancelAnimationFrame(raf)
            view.removeEventListener('keydown', onKeyDown)
            view.removeEventListener('keyup', onKeyUp)
            doc.removeEventListener('visibilitychange', onVisibility)
            canvas.removeEventListener('pointermove', onPointerMove)
            canvas.removeEventListener('pointerdown', onPointerDown)
            canvas.removeEventListener('wheel', onWheel)
            if (canvas.parentNode) canvas.parentNode.removeChild(canvas)
          }
        }
      }

      /* ------------------------------ style -------------------------- */

      function styleText() {
        return [
          '.at-layer{position:absolute;z-index:1;overflow:hidden;border-radius:12px;',
          'box-shadow:0 0 0 1px rgba(64,150,180,.18),0 24px 60px rgba(0,0,0,.55);}',
          '.at-canvas{display:block;outline:none;cursor:crosshair;touch-action:none;}',
          '.at-ball-root{position:absolute;z-index:3;width:44px;height:44px;}',
          '.at-ball{position:relative;width:44px;height:44px;padding:0;border-radius:50%;cursor:grab;',
          'border:1px solid rgba(94,241,255,.5);color:#5ef1ff;font:600 15px/42px var(--ds-font-family-code,Consolas,monospace);',
          'text-align:center;background:radial-gradient(circle at 34% 28%,rgba(28,84,116,.96),rgba(5,14,24,.98));',
          'box-shadow:0 0 0 1px rgba(3,9,16,.9),0 6px 18px rgba(0,0,0,.45),0 0 16px rgba(94,241,255,.22);',
          'transition:transform .15s ease,box-shadow .2s ease,border-color .2s ease;user-select:none;touch-action:none;}',
          '.at-ball:hover{transform:scale(1.07);box-shadow:0 0 0 1px rgba(3,9,16,.9),0 8px 22px rgba(0,0,0,.5),0 0 26px rgba(94,241,255,.5);}',
          '.at-ball:active{cursor:grabbing;transform:scale(1.02);}',
          '.at-ball:focus-visible{outline:2px solid rgba(94,241,255,.75);outline-offset:2px;}',
          '.at-ball[data-active="true"]{border-color:rgba(255,209,102,.85);color:#ffd166;',
          'box-shadow:0 0 0 1px rgba(3,9,16,.9),0 6px 18px rgba(0,0,0,.45),0 0 20px rgba(255,209,102,.32);}',
          '.at-ball-tip{position:absolute;right:54px;top:9px;padding:4px 8px;border-radius:6px;white-space:nowrap;',
          'font:500 12px/1.4 var(--dsw-font-family,system-ui,sans-serif);color:#cfeeff;',
          'background:rgba(6,16,26,.94);border:1px solid rgba(94,241,255,.28);box-shadow:0 6px 18px rgba(0,0,0,.4);',
          'pointer-events:none;}'
        ].join('')
      }

      function ensureStyle(doc) {
        const target = doc || document
        if (target.getElementById(STYLE_ID)) return () => {}
        const node = target.createElement('style')
        node.id = STYLE_ID
        node.textContent = styleText()
        target.head.appendChild(node)
        return () => {
          if (node.parentNode) node.parentNode.removeChild(node)
        }
      }

      return { mount, ensureStyle, styleText, World }
    }
    /* #endregion game-engine */

    const GAME = createAsciiThunder()
    const h = React.createElement

    const NS = 'asciiThunder'
    const BALL_POS_KEY = 'dsh.ascii-thunder.ball'
    const BALL_SIZE = 44

    const clampValue = (value, min, max) => (value < min ? min : value > max ? max : value)

    const readBallPos = () => {
      try {
        const raw = window.localStorage.getItem(BALL_POS_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        if (parsed === null || typeof parsed !== 'object') return null
        if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return null
        return { x: parsed.x, y: parsed.y }
      } catch (error) {
        return null
      }
    }

    const writeBallPos = position => {
      try {
        if (position === null) window.localStorage.removeItem(BALL_POS_KEY)
        else window.localStorage.setItem(BALL_POS_KEY, JSON.stringify(position))
      } catch (error) {
        /* storage is optional */
      }
    }

    /** The visible conversation scrollport, or null when another panel is shown. */
    const findConversation = () => {
      const nodes = document.querySelectorAll('[data-conversation-scroll]')
      let best = null
      let bestArea = 0
      for (let i = 0; i < nodes.length; i += 1) {
        const node = nodes[i]
        const rect = node.getBoundingClientRect()
        if (rect.width < 120 || rect.height < 120) continue
        const style = window.getComputedStyle(node)
        if (style.display === 'none' || style.visibility === 'hidden') continue
        const area = rect.width * rect.height
        if (area > bestArea) {
          bestArea = area
          best = node
        }
      }
      return best
    }

    /** Resolve the code font stack to a concrete list a canvas can parse. */
    const readCodeFont = () => {
      try {
        const probe = document.createElement('span')
        probe.style.cssText = 'position:absolute;left:-9999px;top:0;font-family:var(--ds-font-family-code,Consolas,monospace)'
        document.body.appendChild(probe)
        const family = window.getComputedStyle(probe).fontFamily
        probe.remove()
        if (family && family.length > 0) return family
      } catch (error) {
        /* fall through */
      }
      return 'Consolas, "Cascadia Mono", monospace'
    }

    /**
     * Read every visible character of the conversation so the intro can
     * dissolve what the user is looking at. Read-only: nothing is removed,
     * moved, or restyled.
     */
    const captureText = (target, rect) => {
      const samples = []
      if (!target) return samples
      const range = document.createRange()
      const styles = new Map()
      const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, null)
      let budget = 1500
      let scanned = 0
      let node = walker.nextNode()
      while (node && budget > 0 && scanned < 30000) {
        const value = node.nodeValue || ''
        const parent = node.parentElement
        if (!parent || value.length === 0) {
          node = walker.nextNode()
          continue
        }
        let style = styles.get(parent)
        if (style === undefined) {
          const computed = window.getComputedStyle(parent)
          style = {
            font: computed.font || (computed.fontWeight + ' ' + computed.fontSize + ' ' + computed.fontFamily),
            color: computed.color || 'rgb(200, 220, 235)'
          }
          styles.set(parent, style)
        }
        for (let i = 0; i < value.length && budget > 0; i += 1) {
          const ch = value[i]
          scanned += 1
          if (ch === ' ' || ch === '\n' || ch === '\t' || ch === '\u00a0') continue
          range.setStart(node, i)
          range.setEnd(node, i + 1)
          const box = range.getBoundingClientRect()
          if (box.width === 0 || box.height === 0) continue
          if (box.bottom < rect.top || box.top > rect.bottom) continue
          samples.push({
            x: box.left - rect.left,
            y: box.top - rect.top,
            ch,
            font: style.font,
            color: style.color
          })
          budget -= 1
        }
        node = walker.nextNode()
      }
      return samples
    }

    function ThunderOverlay(props) {
      const { ctx, t } = props
      const [open, setOpen] = React.useState(false)
      const [rect, setRect] = React.useState(null)
      const [position, setPosition] = React.useState(readBallPos)
      const [hover, setHover] = React.useState(false)

      const rootRef = React.useRef(null)
      const hostRef = React.useRef(null)
      const gameRef = React.useRef(null)
      const samplesRef = React.useRef([])
      const rectRef = React.useRef(null)
      const positionRef = React.useRef(position)
      const dragRef = React.useRef(null)
      const suppressClick = React.useRef(false)

      positionRef.current = position
      rectRef.current = rect

      const commitPosition = next => {
        positionRef.current = next
        setPosition(next)
      }

      const start = target => {
        const box = measure(target)
        if (!box || box.width < 120 || box.height < 120) return
        samplesRef.current = captureText(target, target.getBoundingClientRect())
        setRect(box)
        setOpen(true)
      }

      const measure = target => {
        const parent = rootRef.current && rootRef.current.parentElement
        if (!parent) return null
        const box = target.getBoundingClientRect()
        const base = parent.getBoundingClientRect()
        return {
          left: box.left - base.left,
          top: box.top - base.top,
          width: box.width,
          height: box.height
        }
      }

      const toggle = () => {
        if (open) {
          setOpen(false)
          return
        }
        const target = findConversation()
        if (target) {
          start(target)
          return
        }
        try {
          ctx.layout.selectPanel(null)
        } catch (error) {
          return
        }
        window.setTimeout(() => {
          const retry = findConversation()
          if (retry) start(retry)
        }, 140)
      }

      React.useEffect(() => {
        if (!open) return undefined
        const host = hostRef.current
        const box = rectRef.current
        if (!host || !box) return undefined
        const game = GAME.mount(host, {
          width: box.width,
          height: box.height,
          samples: samplesRef.current,
          fontFamily: readCodeFont(),
          label: t('scene'),
          onExit: () => setOpen(false)
        })
        gameRef.current = game
        return () => {
          gameRef.current = null
          game.dispose()
        }
      }, [open])

      React.useEffect(() => {
        const game = gameRef.current
        if (!open || !rect || !game) return
        game.resize(rect.width, rect.height)
      }, [open, rect])

      React.useEffect(() => {
        if (!open) return undefined
        const sync = () => {
          const target = findConversation()
          if (!target) {
            setOpen(false)
            return
          }
          const box = measure(target)
          if (!box) return
          setRect(previous => {
            if (
              previous
              && Math.abs(previous.left - box.left) < 0.5
              && Math.abs(previous.top - box.top) < 0.5
              && Math.abs(previous.width - box.width) < 0.5
              && Math.abs(previous.height - box.height) < 0.5
            ) return previous
            return box
          })
        }
        const timer = window.setInterval(sync, 200)
        window.addEventListener('resize', sync)
        return () => {
          window.clearInterval(timer)
          window.removeEventListener('resize', sync)
        }
      }, [open])

      React.useEffect(() => {
        const onKeyDown = event => {
          if (event.key !== 'Escape' || !open) return
          setOpen(false)
        }
        window.addEventListener('keydown', onKeyDown, true)
        return () => window.removeEventListener('keydown', onKeyDown, true)
      }, [open])

      React.useEffect(() => {
        const onResize = () => {
          const root = rootRef.current
          const parent = root && root.parentElement
          const current = positionRef.current
          if (!parent || !current) return
          const next = {
            x: clampValue(current.x, 2, Math.max(2, parent.clientWidth - BALL_SIZE - 2)),
            y: clampValue(current.y, 2, Math.max(2, parent.clientHeight - BALL_SIZE - 2))
          }
          if (next.x !== current.x || next.y !== current.y) commitPosition(next)
        }
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
      }, [])

      const onPointerDown = event => {
        const root = rootRef.current
        const parent = root && root.parentElement
        if (!root || !parent) return
        const parentRect = parent.getBoundingClientRect()
        const box = root.getBoundingClientRect()
        dragRef.current = {
          id: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          originX: box.left - parentRect.left,
          originY: box.top - parentRect.top,
          moved: false
        }
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch (error) {
          /* capture is best effort */
        }
      }

      const onPointerMove = event => {
        const drag = dragRef.current
        if (!drag || drag.id !== event.pointerId) return
        const dx = event.clientX - drag.startX
        const dy = event.clientY - drag.startY
        if (!drag.moved && Math.hypot(dx, dy) < 5) return
        if (!drag.moved) {
          drag.moved = true
          setHover(false)
        }
        const root = rootRef.current
        const parent = root && root.parentElement
        if (!parent) return
        commitPosition({
          x: clampValue(drag.originX + dx, 2, Math.max(2, parent.clientWidth - BALL_SIZE - 2)),
          y: clampValue(drag.originY + dy, 2, Math.max(2, parent.clientHeight - BALL_SIZE - 2))
        })
      }

      const onPointerUp = event => {
        const drag = dragRef.current
        dragRef.current = null
        if (!drag || drag.id !== event.pointerId) return
        if (drag.moved) {
          suppressClick.current = true
          writeBallPos(positionRef.current)
          window.setTimeout(() => {
            suppressClick.current = false
          }, 0)
        }
      }

      const onClick = event => {
        if (suppressClick.current) return
        if (event.detail > 1) return
        toggle()
      }

      const onContextMenu = event => {
        event.preventDefault()
        commitPosition(null)
        writeBallPos(null)
      }

      const ballStyle = position === null
        ? { right: '18px', top: '42%' }
        : { left: position.x + 'px', top: position.y + 'px' }

      const layer = open && rect
        ? h('div', {
          className: 'at-layer',
          style: {
            left: rect.left + 'px',
            top: rect.top + 'px',
            width: rect.width + 'px',
            height: rect.height + 'px'
          }
        }, h('div', { ref: hostRef, style: { position: 'absolute', inset: 0 } }))
        : null

      return h(
        React.Fragment,
        null,
        layer,
        h(
          'div',
          {
            ref: rootRef,
            className: 'at-ball-root',
            style: ballStyle,
            onPointerEnter: () => setHover(true),
            onPointerLeave: () => setHover(false)
          },
          h(
            'button',
            {
              type: 'button',
              className: 'at-ball',
              'data-active': open ? 'true' : 'false',
              title: t(open ? 'tipExit' : 'tipPlay'),
              'aria-label': t(open ? 'tipExit' : 'tipPlay'),
              onPointerDown,
              onPointerMove,
              onPointerUp,
              onPointerCancel: onPointerUp,
              onClick,
              onContextMenu
            },
            open ? '×' : '▲'
          ),
          hover && !open ? h('div', { className: 'at-ball-tip' }, t('tipPlay')) : null
        )
      )
    }

    return {
      inject: ['slots', 'layout', 'locale'],
      apply(ctx) {
        ctx.effect(() => GAME.ensureStyle(document), 'ascii-thunder: stylesheet')
        ctx.effect(
          () =>
            ctx.locale.register(NS, {
              en: {
                tipPlay: 'ASCII Thunder — take over this conversation',
                tipExit: 'Back to the conversation',
                scene: 'ASCII Thunder'
              },
              zh: {
                tipPlay: '字符雷霆 · 开打',
                tipExit: '返回对话',
                scene: '字符雷霆空战场景'
              }
            }),
          'ascii-thunder: locale'
        )
        const t = ctx.locale.bind(NS)
        const Entry = () => h(ThunderOverlay, { ctx, t })
        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register({ name: 'shell.overlay', id: 'ascii-thunder.ball', order: 40 }, Entry)
        )
      }
    }

  }
})
