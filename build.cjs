const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

async function build() {
    if (!fs.existsSync('dist/assets')) {
        fs.mkdirSync('dist/assets', { recursive: true });
    }

    // Bundle JS
    await esbuild.build({
        entryPoints: ['index.tsx'],
        bundle: true,
        minify: true,
        outfile: 'dist/assets/index.js',
        define: { 'process.env.NODE_ENV': '"production"' },
        loader: { '.tsx': 'tsx', '.ts': 'ts' },
    });

    // Transform index.html
    let html = fs.readFileSync('index.html', 'utf8');
    // Replace development script with bundled one
    html = html.replace('/index.tsx', './assets/index.js');
    // Ensure base is correctly handled if needed (base path for CDN assets is already absolute)

    fs.writeFileSync('dist/index.html', html);

    console.log('Build successful');
}

build().catch((err) => {
    console.error('Build failed:', err);
    process.exit(1);
});
