import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  installReactDevPerformanceMeasureTrim,
  REACT_DEV_MEASURE_TRIM_INTERVAL_MS
} from './react-dev-performance-measure-trim'

let dispose: (() => void) | null = null

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
})

afterEach(() => {
  dispose?.()
  dispose = null
  vi.useRealTimers()
})

describe('installReactDevPerformanceMeasureTrim', () => {
  it('clears the measure buffer on every interval in dev builds', () => {
    const clearMeasures = vi.fn()
    dispose = installReactDevPerformanceMeasureTrim({ dev: true, performance: { clearMeasures } })

    vi.advanceTimersByTime(REACT_DEV_MEASURE_TRIM_INTERVAL_MS - 1)
    expect(clearMeasures).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(clearMeasures).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(REACT_DEV_MEASURE_TRIM_INTERVAL_MS * 2)
    expect(clearMeasures).toHaveBeenCalledTimes(3)
  })

  it('stays inert outside dev builds', () => {
    const clearMeasures = vi.fn()
    dispose = installReactDevPerformanceMeasureTrim({ dev: false, performance: { clearMeasures } })

    vi.advanceTimersByTime(REACT_DEV_MEASURE_TRIM_INTERVAL_MS * 5)
    expect(clearMeasures).not.toHaveBeenCalled()
  })

  it('keeps a single timer when installed twice and stops after dispose', () => {
    const clearMeasures = vi.fn()
    const first = installReactDevPerformanceMeasureTrim({
      dev: true,
      performance: { clearMeasures }
    })
    const second = installReactDevPerformanceMeasureTrim({
      dev: true,
      performance: { clearMeasures }
    })
    dispose = first

    expect(second).toBe(first)
    vi.advanceTimersByTime(REACT_DEV_MEASURE_TRIM_INTERVAL_MS)
    expect(clearMeasures).toHaveBeenCalledTimes(1)

    first()
    dispose = null
    vi.advanceTimersByTime(REACT_DEV_MEASURE_TRIM_INTERVAL_MS * 3)
    expect(clearMeasures).toHaveBeenCalledTimes(1)
  })

  it('stays inert when the runtime has no clearMeasures', () => {
    dispose = installReactDevPerformanceMeasureTrim({
      dev: true,
      performance: {}
    })

    expect(() => vi.advanceTimersByTime(REACT_DEV_MEASURE_TRIM_INTERVAL_MS * 2)).not.toThrow()
  })

  it('empties the real measure buffer by default', () => {
    performance.measure('react-render', { start: 0, end: 1 })
    performance.measure('react-render', { start: 1, end: 2 })
    dispose = installReactDevPerformanceMeasureTrim({ dev: true })

    expect(performance.getEntriesByType('measure')).toHaveLength(2)
    vi.advanceTimersByTime(REACT_DEV_MEASURE_TRIM_INTERVAL_MS)
    expect(performance.getEntriesByType('measure')).toHaveLength(0)
  })

  it('reinstalls after dispose, as a hot reload of the entry does', () => {
    const clearMeasures = vi.fn()
    installReactDevPerformanceMeasureTrim({ dev: true, performance: { clearMeasures } })()
    dispose = installReactDevPerformanceMeasureTrim({ dev: true, performance: { clearMeasures } })

    vi.advanceTimersByTime(REACT_DEV_MEASURE_TRIM_INTERVAL_MS)
    expect(clearMeasures).toHaveBeenCalledTimes(1)
  })
})
