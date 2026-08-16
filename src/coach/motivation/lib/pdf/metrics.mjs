export function createPdfMetricsTimer() {
    return { start: performance.now() };
}
export function finishPdfMetrics(input) {
    const endedAt = performance.now();
    const metrics = {
        format: input.format,
        durationMs: Math.round((endedAt - input.start) * 100) / 100,
        pageCount: input.pageCount,
        bufferBytes: input.bufferBytes,
        startedAt: input.start,
        endedAt,
    };
    if (process.env.NODE_ENV === "development" || process.env.PDF_METRICS === "1") {
        console.info(`[pdf-metrics] format=${metrics.format} pages=${metrics.pageCount} ms=${metrics.durationMs} bytes=${metrics.bufferBytes}`);
    }
    return metrics;
}
