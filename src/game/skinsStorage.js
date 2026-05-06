const KEY = 'tank-battle-skins-v1'

/**
 * @typedef {{ player: string | null, enemy: string | null, battlefield: string | null, battlefieldMask: number }} TankSkins
 */

/** @returns {TankSkins} */
export function loadSkins() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { player: null, enemy: null, battlefield: null, battlefieldMask: 0.22 }
    const o = JSON.parse(raw)
    const mask = Number.isFinite(Number(o.battlefieldMask)) ? Number(o.battlefieldMask) : 0.22
    return {
      player: typeof o.player === 'string' ? o.player : null,
      enemy: typeof o.enemy === 'string' ? o.enemy : null,
      battlefield: typeof o.battlefield === 'string' ? o.battlefield : null,
      battlefieldMask: Math.min(0.7, Math.max(0, mask)),
    }
  } catch {
    return { player: null, enemy: null, battlefield: null, battlefieldMask: 0.22 }
  }
}

/** @param {TankSkins} skins */
export function saveSkins(skins) {
  localStorage.setItem(
    KEY,
    JSON.stringify({
      player: skins.player,
      enemy: skins.enemy,
      battlefield: skins.battlefield,
      battlefieldMask: Math.min(0.7, Math.max(0, Number(skins.battlefieldMask) || 0.22)),
    }),
  )
}

/** @param {File} file @returns {Promise<string>} */
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = () => reject(fr.error)
    fr.readAsDataURL(file)
  })
}
