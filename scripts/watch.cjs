const esbuild = require('esbuild');
const { spawn } = require('node:child_process');

async function main() {
    const worker = await esbuild.context({
        entryPoints: ['static/js/pcd-worker-source.js'],
        bundle: true, platform: 'browser', target: 'es2020',
        outfile: 'out/pcd-worker.js', logLevel: 'info',
    });
    await worker.watch();
    const typescript = spawn(process.execPath, [require.resolve('typescript/bin/tsc'), '--watch', '-p', './'], { stdio: 'inherit' });
    for (const signal of ['SIGINT', 'SIGTERM']) {
        process.on(signal, async () => { typescript.kill(); await worker.dispose(); process.exit(0); });
    }
    typescript.on('exit', async code => { await worker.dispose(); process.exit(code || 0); });
}
main().catch(error => { console.error(error); process.exit(1); });
