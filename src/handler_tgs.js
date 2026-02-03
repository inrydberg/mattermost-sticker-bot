const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const pako = require('pako');
const { exec } = require('child_process');
const { createCanvas } = require('@napi-rs/canvas');
const { JSDOM } = require('jsdom');

class TgsHandler {
    constructor() {
        this.cacheDir = path.join(__dirname, '..', 'gif-cache');
        this.tempDir = path.join(__dirname, '..', 'temp');
        this.initDirs();
    }

    async initDirs() {
        try {
            await fs.mkdir(this.cacheDir, { recursive: true });
            await fs.mkdir(this.tempDir, { recursive: true });
        } catch (err) {
            console.error('Failed to create directories:', err);
        }
    }

    generateHash(input) {
        return crypto.createHash('md5').update(input).digest('hex');
    }

    async convertTgsToGif(tgsUrl, fileId = null) {
        const hash = this.generateHash(fileId || tgsUrl);
        const cachedGif = path.join(this.cacheDir, `${hash}.gif`);

        // Check cache first
        try {
            await fs.access(cachedGif);
            console.log(`Using cached TGS GIF for ${hash}`);
            return cachedGif;
        } catch (err) {
            // Not in cache, need to convert
        }

        const framesDir = path.join(this.tempDir, `tgs_${hash}`);

        try {
            console.log(`Converting TGS locally: ${hash}`);

            // Download TGS file
            const response = await axios({
                method: 'GET',
                url: tgsUrl,
                responseType: 'arraybuffer'
            });

            // Decompress TGS (gzipped Lottie JSON)
            const json = pako.ungzip(new Uint8Array(response.data), { to: 'string' });
            const animData = JSON.parse(json);
            const SIZE = 256;

            // Setup minimal DOM for lottie-web
            const dom = new JSDOM('<!DOCTYPE html><html><body><div id="lottie"></div></body></html>');
            const g = global;
            g.window = dom.window;
            g.document = dom.window.document;
            g.navigator = dom.window.navigator;
            g.requestAnimationFrame = (cb) => setTimeout(cb, 0);
            g.cancelAnimationFrame = (id) => clearTimeout(id);

            // Patch createElement to return @napi-rs/canvas for <canvas> tags
            let mainCanvas = null;
            const origCreateElement = dom.window.document.createElement.bind(dom.window.document);
            dom.window.document.createElement = function(tag) {
                if (tag === 'canvas') {
                    const c = createCanvas(SIZE, SIZE);
                    c.style = {};
                    c.setAttribute = function(k, v) {
                        if (k === 'width') c.width = parseInt(v);
                        if (k === 'height') c.height = parseInt(v);
                    };
                    c.getAttribute = function(k) {
                        if (k === 'width') return String(c.width);
                        if (k === 'height') return String(c.height);
                        return null;
                    };
                    if (!mainCanvas) mainCanvas = c;
                    return c;
                }
                return origCreateElement(tag);
            };

            // Load lottie-web canvas renderer (fresh require to avoid cached global state issues)
            delete require.cache[require.resolve('lottie-web/build/player/lottie_canvas.js')];
            const lottie = require('lottie-web/build/player/lottie_canvas.js');

            const container = dom.window.document.getElementById('lottie');
            Object.defineProperty(container, 'offsetWidth', { value: SIZE, configurable: true });
            Object.defineProperty(container, 'offsetHeight', { value: SIZE, configurable: true });
            container.getBoundingClientRect = () => ({ width: SIZE, height: SIZE, top: 0, left: 0 });
            container.appendChild = function(child) { mainCanvas = child; };
            container.removeChild = function() {};

            const anim = lottie.loadAnimation({
                container,
                renderer: 'canvas',
                loop: false,
                autoplay: false,
                animationData: animData
            });

            // Render at 50fps (matches reference quality, max reliable GIF framerate)
            const targetFps = 50;
            const fps = targetFps;
            const step = Math.max(1, Math.round((animData.fr || 60) / targetFps));
            await fs.mkdir(framesDir, { recursive: true });

            let frameNum = 0;
            for (let i = 0; i < anim.totalFrames; i += step) {
                anim.goToAndStop(i, true);
                const buf = mainCanvas.toBuffer('image/png');
                await fs.writeFile(path.join(framesDir, `frame_${String(frameNum).padStart(4, '0')}.png`), buf);
                frameNum++;
            }

            anim.destroy();
            console.log(`Rendered ${frameNum} frames for ${hash}`);

            // Stitch frames into GIF with ffmpeg
            await new Promise((resolve, reject) => {
                const cmd = `gifski --fps ${fps} --width 256 --quality 90 -o "${cachedGif}" ${framesDir}/frame_*.png`;
                exec(cmd, (error) => {
                    if (error) reject(error);
                    else resolve();
                });
            });

            // Cleanup temp frames
            const files = await fs.readdir(framesDir);
            for (const file of files) {
                await fs.unlink(path.join(framesDir, file)).catch(() => {});
            }
            await fs.rmdir(framesDir).catch(() => {});

            // Clean up global DOM pollution
            delete g.window;
            delete g.document;
            delete g.navigator;
            delete g.requestAnimationFrame;
            delete g.cancelAnimationFrame;

            console.log(`TGS converted successfully: ${hash}`);
            return cachedGif;

        } catch (error) {
            console.error('TGS conversion failed:', error.message);
            // Cleanup on failure
            const files = await fs.readdir(framesDir).catch(() => []);
            for (const file of files) {
                await fs.unlink(path.join(framesDir, file)).catch(() => {});
            }
            await fs.rmdir(framesDir).catch(() => {});
            await fs.unlink(cachedGif).catch(() => {});
            return null;
        }
    }
}

module.exports = TgsHandler;
