const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');

class StaticHandler {
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

    async resizeStaticImage(imageUrl) {
        const hash = this.generateHash(imageUrl);
        const cachedImage = path.join(this.cacheDir, `${hash}.webp`);

        // Check cache first
        try {
            await fs.access(cachedImage);
            console.log(`Using cached static image for ${hash}`);
            return cachedImage;
        } catch (err) {
            // Not in cache, need to resize
        }

        // Determine file extension from URL
        const urlLower = imageUrl.toLowerCase();
        let ext = 'webp';
        if (urlLower.includes('.png')) ext = 'png';
        else if (urlLower.includes('.jpg') || urlLower.includes('.jpeg')) ext = 'jpg';

        const tempImage = path.join(this.tempDir, `${hash}_orig.${ext}`);

        try {
            console.log(`Downloading static image from ${imageUrl}`);
            await this.downloadFile(imageUrl, tempImage);

            console.log(`Resizing static image: ${hash}`);
            await new Promise((resolve, reject) => {
                // ffmpeg command to resize to 256px width, maintaining aspect ratio, output as webp
                const command = `ffmpeg -i "${tempImage}" -vf "scale=256:-1" -y "${cachedImage}"`;

                exec(command, (error, stdout, stderr) => {
                    if (error) {
                        console.error('FFmpeg resize error:', stderr);
                        reject(error);
                    } else {
                        resolve();
                    }
                });
            });

            // Clean up temp file
            await fs.unlink(tempImage).catch(() => {});

            console.log(`Resized successfully: ${hash}`);
            return cachedImage;
        } catch (error) {
            console.error('Resize failed:', error);
            // Clean up on failure
            await fs.unlink(tempImage).catch(() => {});
            await fs.unlink(cachedImage).catch(() => {});
            throw error;
        }
    }
}

module.exports = StaticHandler;
