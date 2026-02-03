const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');

class WebmHandler {
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

    generateHash(url) {
        return crypto.createHash('md5').update(url).digest('hex');
    }

    async downloadFile(url, outputPath) {
        const response = await axios({
            method: 'GET',
            url: url,
            responseType: 'stream'
        });

        const writer = require('fs').createWriteStream(outputPath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
    }


    async convertTgsToGif(tgsUrl) {
        // TGS conversion disabled for now - just return null
        console.log('TGS conversion not implemented yet');
        return null;
    }

    async convertWebmToGif(webmUrl, fileId = null) {
        const hash = this.generateHash(fileId || webmUrl);
        const cachedGif = path.join(this.cacheDir, `${hash}.gif`);

        // Check cache first
        try {
            await fs.access(cachedGif);
            console.log(`Using cached GIF for ${hash}`);
            return cachedGif;
        } catch (err) {
            // Not in cache, need to convert
        }

        const tempWebm = path.join(this.tempDir, `${hash}.webm`);

        try {
            console.log(`Downloading WEBM from ${webmUrl}`);
            await this.downloadFile(webmUrl, tempWebm);

            // Extract frames with ffmpeg, then encode with gifski
            const framesDir = path.join(this.tempDir, `webm_${hash}`);
            await fs.mkdir(framesDir, { recursive: true });

            console.log(`Extracting WEBM frames: ${hash}`);
            await new Promise((resolve, reject) => {
                exec(`ffmpeg -i "${tempWebm}" -vf "fps=50,scale=256:-1:flags=lanczos" "${framesDir}/frame_%04d.png"`, (error) => {
                    if (error) reject(error);
                    else resolve();
                });
            });

            console.log(`Encoding GIF with gifski: ${hash}`);
            await new Promise((resolve, reject) => {
                exec(`gifski --fps 50 --width 256 --quality 90 -o "${cachedGif}" ${framesDir}/frame_*.png`, (error) => {
                    if (error) reject(error);
                    else resolve();
                });
            });

            // Clean up temp files
            const frames = await fs.readdir(framesDir);
            for (const f of frames) await fs.unlink(path.join(framesDir, f)).catch(() => {});
            await fs.rmdir(framesDir).catch(() => {});
            await fs.unlink(tempWebm).catch(() => {});

            console.log(`Converted successfully: ${hash}`);
            return cachedGif;
        } catch (error) {
            console.error('Conversion failed:', error);
            // Clean up on failure
            await fs.unlink(tempWebm).catch(() => {});
            await fs.unlink(cachedGif).catch(() => {}); // Remove partial GIF if exists
            throw error;
        }
    }

    async getGifUrl(originalUrl, baseUrl) {
        try {
            if (originalUrl.includes('.webm')) {
                const gifPath = await this.convertWebmToGif(originalUrl);
                const hash = this.generateHash(originalUrl);
                // Return URL to serve the GIF
                return `${baseUrl}/gif/${hash}.gif`;
            }
        } catch (error) {
            console.error('Failed to convert to GIF:', error);
        }
        // Return original URL if conversion fails or not needed
        return originalUrl;
    }
}

module.exports = WebmHandler;