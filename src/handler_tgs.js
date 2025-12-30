const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const pako = require('pako');
const converter = require('lottie-converter');

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

    generateHash(url) {
        return crypto.createHash('md5').update(url).digest('hex');
    }

    async convertTgsToGif(tgsUrl) {
        const hash = this.generateHash(tgsUrl);
        const cachedGif = path.join(this.cacheDir, `${hash}.gif`);

        // Check cache first
        try {
            await fs.access(cachedGif);
            console.log(`Using cached TGS GIF for ${hash}`);
            return cachedGif;
        } catch (err) {
            // Not in cache, need to convert
        }

        try {
            console.log(`Downloading and converting TGS: ${hash}`);

            // Download TGS file
            const response = await axios({
                method: 'GET',
                url: tgsUrl,
                responseType: 'arraybuffer'
            });

            // Decompress TGS (gzipped Lottie JSON)
            const decompressed = pako.ungzip(new Uint8Array(response.data), { to: 'string' });

            console.log(`Converting TGS to GIF using lottie-converter`);

            // Convert to GIF using lottie-converter
            const gifBase64 = await converter({
                file: Buffer.from(decompressed),
                filename: `${hash}.json`,
                format: 'gif',
                width: 256,  // Good size for stickers
                height: 256
            });

            // Save to cache
            await fs.writeFile(cachedGif, Buffer.from(gifBase64, 'base64'));

            console.log(`TGS converted successfully: ${hash}`);
            return cachedGif;

        } catch (error) {
            console.error('TGS conversion failed:', error.message);

            // Return null to fallback to static image
            return null;
        }
    }
}

module.exports = TgsHandler;