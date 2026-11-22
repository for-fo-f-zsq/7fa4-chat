/**
 * GraphEditor 保守物理布局引擎（纯函数，无 Vue 依赖）。
 *
 * 力学模型：
 * 1. 两两保守排斥势能（软化平方反比，无 r→0 奇点）：
 *    V_r(r) = k_r / sqrt(r^2 + eps^2)
 *    F_{ab} = k_r * (r_a - r_b) / (r^2 + eps^2)^(3/2) = -F_{ba}
 * 2. 显式胡克弹簧边：
 *    V_s(e) = 0.5 * k_e * (d - L_e)^2
 *    F_a = k_e * (d - L_e) * u_{ab} = -F_b
 * 3. Velocity-Verlet 保辛积分 + Strang 分裂粘性阻力 (-gamma * v)：
 *    当 gamma = 0 时严格退化为标准 Velocity-Verlet，总动量与总机械能守恒。
 */

export const DEFAULT_PHYSICS_PARAMS = Object.freeze({
  repulsion: 1.0,
  stiffness: 1.0,
  restLength: 120,
  damping: 1.2,
  dt: 0.04,
  softening: 24,
  repulsionScale: 220000
})

export function nodeMass(node) {
  const m = Number(node?.mass)
  return Number.isFinite(m) && m > 0 ? m : 1
}

export function edgeRestLength(edge, defaultRestLength = DEFAULT_PHYSICS_PARAMS.restLength) {
  if (edge && edge.restLength !== undefined && edge.restLength !== null && edge.restLength !== '') {
    const val = Number(edge.restLength)
    if (Number.isFinite(val) && val > 0) return val
  }
  return defaultRestLength
}

export function edgeStiffness(edge, defaultStiffness = DEFAULT_PHYSICS_PARAMS.stiffness) {
  if (edge && edge.stiffness !== undefined && edge.stiffness !== null && edge.stiffness !== '') {
    const val = Number(edge.stiffness)
    if (Number.isFinite(val) && val >= 0) return val
  }
  return defaultStiffness
}

function resolveParams(params = {}) {
  return {
    repulsion: Math.max(0, Number(params.repulsion ?? DEFAULT_PHYSICS_PARAMS.repulsion) || 0),
    stiffness: Math.max(0, Number(params.stiffness ?? DEFAULT_PHYSICS_PARAMS.stiffness) || 0),
    restLength: Math.max(1, Number(params.restLength ?? DEFAULT_PHYSICS_PARAMS.restLength) || DEFAULT_PHYSICS_PARAMS.restLength),
    damping: Math.max(0, Number(params.damping ?? DEFAULT_PHYSICS_PARAMS.damping) || 0),
    dt: Math.max(1e-4, Number(params.dt ?? DEFAULT_PHYSICS_PARAMS.dt) || DEFAULT_PHYSICS_PARAMS.dt),
    softening: Math.max(1e-3, Number(params.softening ?? DEFAULT_PHYSICS_PARAMS.softening) || DEFAULT_PHYSICS_PARAMS.softening),
    repulsionScale: Math.max(0, Number(params.repulsionScale ?? DEFAULT_PHYSICS_PARAMS.repulsionScale) || DEFAULT_PHYSICS_PARAMS.repulsionScale)
  }
}

/**
 * 计算所有节点受保守力（排斥力 + 弹簧力），严格满足 F_ab = -F_ba。
 */
export function computeConservativeForces(nodes, edges, params = {}) {
  const p = resolveParams(params)
  const nCount = nodes.length
  const fx = new Float64Array(nCount)
  const fy = new Float64Array(nCount)
  const indexById = new Map()
  for (let i = 0; i < nCount; i++) {
    indexById.set(nodes[i].id, i)
  }

  const kr = p.repulsion * p.repulsionScale
  const eps2 = p.softening * p.softening

  if (kr > 0) {
    for (let i = 0; i < nCount; i++) {
      const a = nodes[i]
      for (let j = i + 1; j < nCount; j++) {
        const b = nodes[j]
        const dx = a.x - b.x
        const dy = a.y - b.y
        const r2Soft = dx * dx + dy * dy + eps2
        const s = kr / (r2Soft * Math.sqrt(r2Soft))
        const fpx = s * dx
        const fpy = s * dy
        fx[i] += fpx
        fy[i] += fpy
        fx[j] -= fpx
        fy[j] -= fpy
      }
    }
  }

  for (const e of edges) {
    const ia = indexById.get(e.u)
    const ib = indexById.get(e.v)
    if (ia === undefined || ib === undefined || ia === ib) continue
    const a = nodes[ia]
    const b = nodes[ib]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const d = Math.hypot(dx, dy)
    if (d <= 1e-12) continue
    const le = edgeRestLength(e, p.restLength)
    const ke = edgeStiffness(e, p.stiffness)
    if (ke === 0) continue
    const fMag = ke * (d - le)
    const fsx = (fMag * dx) / d
    const fsy = (fMag * dy) / d
    fx[ia] += fsx
    fy[ia] += fsy
    fx[ib] -= fsx
    fy[ib] -= fsy
  }

  return { fx, fy }
}

/**
 * 执行一步 Velocity-Verlet 保辛积分（带 Strang 分裂指数阻尼）。
 */
export function stepVelocityVerlet(nodes, edges, params = {}, options = {}) {
  const p = resolveParams(params)
  const nCount = nodes.length
  if (!nCount) {
    return { maxSpeed: 0, maxForce: 0, kineticEnergy: 0 }
  }

  const pinnedNode = options.pinnedNode || null
  const dt = p.dt
  const halfDt = 0.5 * dt
  const gamma = p.damping

  // 1. Strang 第一段半步阻尼（gamma = 0 时严格为 1）
  if (gamma > 0) {
    for (let i = 0; i < nCount; i++) {
      const n = nodes[i]
      if (n === pinnedNode) continue
      const c = Math.exp((-gamma * halfDt) / nodeMass(n))
      n.vx = (n.vx || 0) * c
      n.vy = (n.vy || 0) * c
    }
  }

  // 2. 当前时刻保守力 + 半步速度更新 + 全步位置更新
  const { fx: fx1, fy: fy1 } = computeConservativeForces(nodes, edges, p)
  for (let i = 0; i < nCount; i++) {
    const n = nodes[i]
    if (n === pinnedNode) {
      n.vx = 0
      n.vy = 0
      continue
    }
    const invM = 1 / nodeMass(n)
    const vxHalf = (n.vx || 0) + fx1[i] * invM * halfDt
    const vyHalf = (n.vy || 0) + fy1[i] * invM * halfDt
    n.x += vxHalf * dt
    n.y += vyHalf * dt
    n.vx = vxHalf
    n.vy = vyHalf
  }

  // 3. 新位置保守力 + 后半步速度更新
  const { fx: fx2, fy: fy2 } = computeConservativeForces(nodes, edges, p)
  let maxSpeed = 0
  let maxForce = 0
  let kineticEnergy = 0

  for (let i = 0; i < nCount; i++) {
    const n = nodes[i]
    if (n === pinnedNode) {
      n.vx = 0
      n.vy = 0
      continue
    }
    const m = nodeMass(n)
    const invM = 1 / m
    let vx = (n.vx || 0) + fx2[i] * invM * halfDt
    let vy = (n.vy || 0) + fy2[i] * invM * halfDt

    // 4. Strang 第二段半步阻尼
    if (gamma > 0) {
      const c = Math.exp((-gamma * halfDt) / m)
      vx *= c
      vy *= c
    }

    n.vx = vx
    n.vy = vy

    const v2 = vx * vx + vy * vy
    const speed = Math.sqrt(v2)
    const fNorm = Math.hypot(fx2[i], fy2[i])
    if (speed > maxSpeed) maxSpeed = speed
    if (fNorm > maxForce) maxForce = fNorm
    kineticEnergy += 0.5 * m * v2
  }

  return { maxSpeed, maxForce, kineticEnergy }
}

/**
 * 计算系统物理守恒量：动能 T、弹簧势能 V_s、排斥势能 V_r、总机械能 E、总动量 P 与质心。
 */
export function computePhysicsState(nodes, edges, params = {}) {
  const p = resolveParams(params)
  const nCount = nodes.length
  const indexById = new Map()
  for (let i = 0; i < nCount; i++) indexById.set(nodes[i].id, i)

  let kineticEnergy = 0
  let px = 0
  let py = 0
  let totalMass = 0
  let comX = 0
  let comY = 0

  for (let i = 0; i < nCount; i++) {
    const n = nodes[i]
    const m = nodeMass(n)
    const vx = n.vx || 0
    const vy = n.vy || 0
    kineticEnergy += 0.5 * m * (vx * vx + vy * vy)
    px += m * vx
    py += m * vy
    totalMass += m
    comX += m * n.x
    comY += m * n.y
  }

  let repulsionEnergy = 0
  const kr = p.repulsion * p.repulsionScale
  const eps2 = p.softening * p.softening
  if (kr > 0) {
    for (let i = 0; i < nCount; i++) {
      const a = nodes[i]
      for (let j = i + 1; j < nCount; j++) {
        const b = nodes[j]
        const dx = a.x - b.x
        const dy = a.y - b.y
        repulsionEnergy += kr / Math.sqrt(dx * dx + dy * dy + eps2)
      }
    }
  }

  let springEnergy = 0
  for (const e of edges) {
    const ia = indexById.get(e.u)
    const ib = indexById.get(e.v)
    if (ia === undefined || ib === undefined || ia === ib) continue
    const a = nodes[ia]
    const b = nodes[ib]
    const d = Math.hypot(b.x - a.x, b.y - a.y)
    const le = edgeRestLength(e, p.restLength)
    const ke = edgeStiffness(e, p.stiffness)
    const diff = d - le
    springEnergy += 0.5 * ke * diff * diff
  }

  const potentialEnergy = repulsionEnergy + springEnergy
  const totalEnergy = kineticEnergy + potentialEnergy
  const momentumNorm = Math.hypot(px, py)
  const centerOfMass = totalMass > 0 ? { x: comX / totalMass, y: comY / totalMass } : { x: 0, y: 0 }

  return {
    kineticEnergy,
    springEnergy,
    repulsionEnergy,
    potentialEnergy,
    totalEnergy,
    momentum: { px, py, norm: momentumNorm },
    centerOfMass
  }
}
