import { createPlayState, stepGame } from '../../../src/game/engine.js'
import { TICK_MS } from '../config.js'

function emptyInput() {
  return { turn: null, move: false, fire: false, toggleWeapon: false, useSkill: false }
}

function toEngineInput(p1, p2) {
  return {
    turn: p1.turn || null,
    move: !!p1.move,
    fire: !!p1.fire,
    toggleWeapon: !!p1.toggleWeapon,
    useSkill: !!p1.useSkill,
    p2: {
      turn: p2.turn || null,
      move: !!p2.move,
      fire: !!p2.fire,
      toggleWeapon: !!p2.toggleWeapon,
      useSkill: !!p2.useSkill,
    },
  }
}

export function createGameSession(room, emit) {
  const state = createPlayState(room.mapConfig)
  const slotInputs = [emptyInput(), emptyInput()]
  let timer = null
  let last = Date.now()

  function tick() {
    const now = Date.now()
    const dt = Math.min(80, Math.max(10, now - last))
    last = now
    const input = toEngineInput(slotInputs[0], slotInputs[1])
    stepGame(state, dt, input)
    slotInputs[0].toggleWeapon = false
    slotInputs[0].useSkill = false
    slotInputs[1].toggleWeapon = false
    slotInputs[1].useSkill = false
    emit('game:state', { roomId: room.id, state })
    if (state.won || state.lost) {
      room.status = 'waiting'
      room.players.forEach((p) => {
        p.ready = false
      })
      emit('game:end', { roomId: room.id, state })
      stop()
    }
  }

  function start() {
    if (timer) return
    last = Date.now()
    timer = setInterval(tick, TICK_MS)
  }

  function stop() {
    if (!timer) return
    clearInterval(timer)
    timer = null
  }

  function setInput(slot, nextInput) {
    if (slot < 0 || slot > 1) return
    slotInputs[slot] = {
      ...slotInputs[slot],
      turn: typeof nextInput.turn === 'string' ? nextInput.turn : null,
      move: !!nextInput.move,
      fire: !!nextInput.fire,
      toggleWeapon: !!nextInput.toggleWeapon || slotInputs[slot].toggleWeapon,
      useSkill: !!nextInput.useSkill || slotInputs[slot].useSkill,
    }
  }

  return { state, start, stop, setInput }
}
