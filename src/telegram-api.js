const axios = require('axios');

class TelegramAPI {
    constructor(botToken) {
        // You need to create a Telegram bot and get its token from @BotFather
        this.botToken = botToken || process.env.TELEGRAM_BOT_TOKEN;
        this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;
        this.fileUrl = `https://api.telegram.org/file/bot${this.botToken}`;
        this.stickerCache = new Map();
    }

    async getStickerSet(setName) {
        try {
            // Extract the actual set name from URLs like t.me/addstickers/memezey
            const cleanName = setName.replace(/.*addstickers\//, '');

            if (this.stickerCache.has(cleanName)) {
                return this.stickerCache.get(cleanName);
            }

            const response = await axios.get(`${this.baseUrl}/getStickerSet`, {
                params: { name: cleanName }
            });

            if (response.data.ok) {
                const stickerSet = response.data.result;
                this.stickerCache.set(cleanName, stickerSet);
                return stickerSet;
            }

            console.error('Failed to get sticker set:', cleanName, response.data);
            return null;
        } catch (error) {
            console.error('Error fetching sticker set:', cleanName, 'Error:', error.message);
            if (error.response) {
                console.error('Response status:', error.response.status);
                console.error('Response data:', error.response.data);
            }
            return null;
        }
    }

    async getFileUrl(fileId) {
        try {
            const response = await axios.get(`${this.baseUrl}/getFile`, {
                params: { file_id: fileId }
            });

            if (response.data.ok) {
                const filePath = response.data.result.file_path;
                // Return the direct download URL
                return `${this.fileUrl}/${filePath}`;
            }

            return null;
        } catch (error) {
            console.error('Error getting file URL for fileId:', fileId, 'Error:', error.message);
            if (error.response) {
                console.error('Response data:', error.response.data);
            }
            return null;
        }
    }

    async getStickerUrl(setName, stickerIndex) {
        const stickerSet = await this.getStickerSet(setName);
        if (!stickerSet || !stickerSet.stickers) {
            return null;
        }

        const sticker = stickerSet.stickers[stickerIndex];
        if (!sticker) {
            return null;
        }

        // Always get the actual file for animations
        const fileId = sticker.file_id;
        return await this.getFileUrl(fileId);
    }

    async getAllStickerUrls(setName) {
        const stickerSet = await this.getStickerSet(setName);
        if (!stickerSet || !stickerSet.stickers) {
            return [];
        }

        // Fetch all URLs in parallel for much faster loading
        const promises = stickerSet.stickers.map(async (sticker) => {
            // ALWAYS get the actual file, never use thumbnails
            const url = await this.getFileUrl(sticker.file_id);

            if (url) {
                return {
                    url: url,
                    thumbnailUrl: null, // NO THUMBNAILS!
                    emoji: sticker.emoji,
                    isAnimated: sticker.is_animated,
                    isVideo: sticker.is_video,
                    fileId: sticker.file_id
                };
            }
            return null;
        });

        const results = await Promise.all(promises);
        return results.filter(r => r !== null);
    }
}

module.exports = TelegramAPI;