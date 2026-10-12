// Bound interactive work without duplicating the full cloud in another worker.
export async function forEachChunk(count, visit, {
    isCancelled = () => false,
    now = () => performance.now(),
    yieldTask = () => new Promise(resolve => setTimeout(resolve, 0)),
    budgetMs = 8,
    chunkSize = 4096,
} = {}) {
    let deadline = now() + budgetMs;
    for (let start = 0; start < count; start += chunkSize) {
        if (isCancelled()) return false;
        visit(start, Math.min(start + chunkSize, count));
        if (start + chunkSize < count && now() >= deadline) {
            await yieldTask();
            deadline = now() + budgetMs;
        }
    }
    return !isCancelled();
}
