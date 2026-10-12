export function createFrameScheduler(paint, {
    request = callback => requestAnimationFrame(callback),
    cancel = handle => cancelAnimationFrame(handle),
    isVisible = () => true,
} = {}) {
    let pending = null, disposed = false;
    const invalidate = () => {
        if (disposed || pending !== null || !isVisible()) return;
        pending = request(() => {
            pending = null;
            if (!disposed && isVisible()) paint();
        });
    };
    const suspend = () => {
        if (pending !== null) cancel(pending);
        pending = null;
    };
    return { invalidate, suspend, dispose: () => { disposed = true; suspend(); } };
}
