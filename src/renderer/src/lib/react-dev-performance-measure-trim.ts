// Why: React dev builds add an uncapped performance.measure per changed-props
// render; one dev window reached 11M entries and ~14 GB in 20 h. Orca never reads them.
export const REACT_DEV_MEASURE_TRIM_INTERVAL_MS = 60_000

let disposeInstalledTrim: (() => void) | null = null

export function installReactDevPerformanceMeasureTrim(options: {
  dev: boolean
  performance?: Partial<Pick<Performance, 'clearMeasures'>>
  intervalMs?: number
}): () => void {
  if (disposeInstalledTrim) {
    return disposeInstalledTrim
  }
  const perf = options.performance ?? globalThis.performance
  const clearMeasures = perf?.clearMeasures
  if (!options.dev || typeof clearMeasures !== 'function') {
    return () => {}
  }

  // Why a fixed interval and not installWindowVisibilityInterval: a hidden dev window still renders and keeps adding
  // measures, so pausing it would bring the leak back. config/recurring-timer-baseline.txt allows this one interval.
  const timer = setInterval(
    () => clearMeasures.call(perf),
    options.intervalMs ?? REACT_DEV_MEASURE_TRIM_INTERVAL_MS
  )
  const dispose = (): void => {
    clearInterval(timer)
    if (disposeInstalledTrim === dispose) {
      disposeInstalledTrim = null
    }
  }
  disposeInstalledTrim = dispose
  return dispose
}
