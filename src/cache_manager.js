const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

class CacheManager {
    constructor() {
        this.cacheDir = path.join(__dirname, '..', 'gif-cache');
        this.maxSizeMB = 100;
        this.checkInterval = 300000; // Check every 5 minutes
        this.intervalId = null;
    }

    async getCacheSizeMB() {
        try {
            // Get directory size in bytes using du command
            const sizeOutput = execSync(`du -sb "${this.cacheDir}" 2>/dev/null || echo "0"`, { encoding: 'utf8' });
            const sizeInBytes = parseInt(sizeOutput.split('\t')[0] || '0');
            return sizeInBytes / (1024 * 1024);
        } catch (err) {
            console.error('Error getting cache size:', err.message);
            return 0;
        }
    }

    async cleanCache() {
        try {
            console.log('Cache exceeds 100MB, clearing all cached files...');

            // Remove all files in cache directory
            const files = await fs.readdir(this.cacheDir);
            for (const file of files) {
                const filePath = path.join(this.cacheDir, file);
                try {
                    const stat = await fs.stat(filePath);
                    if (stat.isFile()) {
                        await fs.unlink(filePath);
                    }
                } catch (err) {
                    console.error(`Failed to delete ${filePath}:`, err.message);
                }
            }

            console.log('Cache cleared successfully');
        } catch (err) {
            console.error('Error cleaning cache:', err.message);
        }
    }

    async checkAndClean() {
        const sizeMB = await this.getCacheSizeMB();
        console.log(`Cache size: ${sizeMB.toFixed(2)} MB`);

        if (sizeMB > this.maxSizeMB) {
            await this.cleanCache();
        }
    }

    start() {
        // Initial check
        this.checkAndClean();

        // Set up periodic checks
        this.intervalId = setInterval(() => {
            this.checkAndClean();
        }, this.checkInterval);

        console.log(`Cache manager started (checking every ${this.checkInterval/60000} minutes, max ${this.maxSizeMB} MB)`);
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log('Cache manager stopped');
        }
    }
}

module.exports = CacheManager;