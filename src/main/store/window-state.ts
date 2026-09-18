import type { Point } from '../windows/position'

export interface WindowStateBackend {
  read(): unknown
  write(position: Point): void
}

export interface WindowStateRepository {
  getPosition(): Point | null
  savePosition(position: Point): void
}

function isPoint(value: unknown): value is Point {
  if (typeof value !== 'object' || value === null) return false
  const { x, y } = value as Record<string, unknown>
  return Number.isFinite(x) && Number.isFinite(y)
}

export function createWindowStateRepository(backend: WindowStateBackend): WindowStateRepository {
  return {
    getPosition() {
      const value = backend.read()
      return isPoint(value) ? { x: Math.round(value.x), y: Math.round(value.y) } : null
    },
    savePosition(position) {
      backend.write({ x: Math.round(position.x), y: Math.round(position.y) })
    }
  }
}
