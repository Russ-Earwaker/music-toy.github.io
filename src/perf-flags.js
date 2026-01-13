// Global performance / debugging flags.
// Intentionally centralized so perf instrumentation
// can be enabled without behavior changes.

export const PERF_FLAGS = {
  traceMarks: false,

  // Detect layout / browser work that shows up as frame.nonScript
  traceLayout: false,

  // Log canvas resize churn (very common perf killer)
  traceCanvasResize: false,

  // Warn if DOM writes happen during RAF
  traceDomInRaf: false,
};
