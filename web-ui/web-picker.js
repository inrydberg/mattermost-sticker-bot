const express = require('express');
const path = require('path');
const { uploadFile, sendFileAsPost } = require('./file-upload');

class WebPicker {
    constructor(bot, telegram, port = 3333, webmHandler = null, tgsHandler = null, staticHandler = null) {
        this.bot = bot;
        this.telegram = telegram;
        this.port = port;
        this.webmHandler = webmHandler;
        this.tgsHandler = tgsHandler;
        this.staticHandler = staticHandler;
        this.app = express();
        this.sessions = new Map();
        this.stickerCache = new Map(); // Cache loaded stickers
        this.setupRoutes();
    }

    setupRoutes() {
        // Serve static files
        this.app.use(express.static(path.join(__dirname)));
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));

        // Serve index.html for root path
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'index.html'));
        });

        // Proxy for sticker files - hash lookup, auto-refresh on expiry
        this.app.get('/proxy/sticker', async (req, res) => {
            const hash = req.query.id;
            if (!hash) return res.status(400).send('Missing id parameter');

            let url = await this.telegram.getUrlFromHash(hash);
            if (!url) return res.status(404).send('Sticker not found');

            const axios = require('axios');
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    const response = await axios({ method: 'GET', url, responseType: 'arraybuffer' });
                    const ext = ['.webp', '.png', '.webm', '.tgs'].find(e => url.includes(e));
                    const types = { '.webp': 'image/webp', '.png': 'image/png', '.webm': 'video/webm' };
                    res.set('Content-Type', types[ext] || 'application/octet-stream');
                    res.set('Cache-Control', 'public, max-age=3600');
                    return res.send(response.data);
                } catch (error) {
                    if (attempt === 0 && error.response?.status === 404) {
                        url = await this.telegram.refreshUrl(hash);
                        if (url) continue;
                    }
                    console.error('Sticker proxy error:', error.message);
                    return res.status(500).send('Failed to fetch sticker');
                }
            }
        });

        // Serve converted GIF files
        if (this.webmHandler) {
            this.app.get('/gif/:filename', (req, res) => {
                const gifPath = path.join(__dirname, '..', 'gif-cache', req.params.filename);
                res.sendFile(gifPath);
            });
        }

        // Get sticker packs
        this.app.get('/api/packs', (req, res) => {
            const defaultPacks = ['memezey', 'pepetop', 'HotCherry'];
            const customPacks = this.getCustomPacks().map(pack => pack.name);
            const allPacks = [...defaultPacks, ...customPacks];
            res.json(allPacks);
        });

        // Get stickers from a pack
        this.app.get('/api/pack/:name', async (req, res) => {
            const packName = req.params.name;

            // Check cache first
            if (this.stickerCache.has(packName)) {
                return res.json(this.stickerCache.get(packName));
            }

            // Check if it's a custom pack and get the telegram name
            let telegramPackName = packName;
            const customPacks = this.getCustomPacks();
            const customPack = customPacks.find(pack => pack.name === packName);
            if (customPack) {
                telegramPackName = customPack.telegramName;
            }

            const stickers = await this.telegram.getAllStickerUrls(telegramPackName, true); // useProxy=true

            // Cache the result
            if (stickers.length > 0) {
                this.stickerCache.set(packName, stickers);
            }

            // Return only safe fields (no realUrl with token)
            res.json(stickers.map(s => ({
                url: s.url,
                emoji: s.emoji,
                isAnimated: s.isAnimated,
                isVideo: s.isVideo
            })));
        });

        // Send sticker to channel
        this.app.post('/api/send', async (req, res) => {
            const { packName, stickerIndex, sessionId } = req.body;

            const session = this.sessions.get(sessionId);
            if (!session) {
                return res.status(400).json({ error: 'Invalid session' });
            }

            // Get cached sticker data to check for thumbnail URL
            const cachedStickers = this.stickerCache.get(packName);
            const stickerData = cachedStickers && cachedStickers[stickerIndex];

            // Check if it's a custom pack and get the telegram name
            let telegramPackName = packName;
            const customPacks = this.getCustomPacks();
            const customPack = customPacks.find(pack => pack.name === packName);
            if (customPack) {
                telegramPackName = customPack.telegramName;
            }

            // Get fresh sticker info (URL + file_id for stable caching)
            const stickerInfo = await this.telegram.getStickerInfo(telegramPackName, stickerIndex);
            if (!stickerInfo) {
                return res.status(400).json({ error: 'Failed to get sticker URL' });
            }
            const { url: stickerUrl, fileId } = stickerInfo;

            // Helper to post file to Mattermost (via response_url or direct)
            const postFile = async (fileInfo) => {
                const fileUrl = `${this.bot.serverUrl}/api/v4/files/${fileInfo.id}`;
                if (session.responseUrl) {
                    if (session.responseUrlDead) {
                        // response_url already known dead, don't waste time
                        return { expired: true };
                    }
                    try {
                        const axios = require('axios');
                        await axios.post(session.responseUrl, {
                            response_type: 'in_channel',
                            text: `![sticker](${fileUrl})`
                        });
                    } catch (err) {
                        console.log('response_url expired for session:', sessionId);
                        session.responseUrlDead = true;
                        return { expired: true };
                    }
                } else {
                    await sendFileAsPost(this.bot.serverUrl, this.bot.botToken, session.channelId, fileInfo, '', session.rootId);
                }
                return { expired: false };
            };

            let gifFilePath = null;

            // Convert animated stickers (WEBM/TGS) to GIF, use file_id for stable cache keys
            if (stickerUrl.includes('.webm') && this.webmHandler) {
                try {
                    gifFilePath = await this.webmHandler.convertWebmToGif(stickerUrl, fileId);
                } catch (err) {
                    console.error('WEBM conversion failed:', err.message);
                }
            } else if (stickerUrl.includes('.tgs') && this.tgsHandler) {
                try {
                    gifFilePath = await this.tgsHandler.convertTgsToGif(stickerUrl, fileId);
                } catch (err) {
                    console.error('TGS conversion failed:', err.message);
                }
            }

            // If we got a GIF, upload and send it
            if (gifFilePath) {
                const fileInfo = await uploadFile(this.bot.serverUrl, this.bot.botToken, session.channelId, gifFilePath, `sticker_${packName}_${stickerIndex}.gif`);
                const result = await postFile(fileInfo);
                if (result.expired) {
                    return res.status(410).json({ error: 'session_expired', message: 'Session expired. Please run /sticker again.' });
                }
                console.log(`Sent animated GIF: ${packName}_${stickerIndex}`);
                return res.json({ success: true });
            }

            // Static images: resize and upload
            if (this.staticHandler && !stickerUrl.includes('.tgs')) {
                try {
                    const resizedPath = await this.staticHandler.resizeStaticImage(stickerUrl, fileId);
                    const fileInfo = await uploadFile(this.bot.serverUrl, this.bot.botToken, session.channelId, resizedPath, `sticker_${packName}_${stickerIndex}.webp`);
                    const result = await postFile(fileInfo);
                    if (result.expired) {
                        return res.status(410).json({ error: 'session_expired', message: 'Session expired. Please run /sticker again.' });
                    }
                    console.log(`Sent resized static: ${packName}_${stickerIndex}`);
                    return res.json({ success: true });
                } catch (err) {
                    console.error('Static resize failed:', err.message);
                }
            }

            // Final fallback: send error, NEVER post raw Telegram URLs
            res.status(500).json({ error: 'Failed to convert sticker' });
        });

        // Create picker session
        this.app.post('/api/session', (req, res) => {
            const { channelId, userId } = req.body;
            const sessionId = Math.random().toString(36).substring(7);

            this.sessions.set(sessionId, {
                channelId,
                userId,
                username: userId, // fallback, should be overridden by generatePickerLink
                created: Date.now()
            });

            // Clean up old sessions
            for (const [id, session] of this.sessions) {
                if (Date.now() - session.created > 10 * 60 * 1000) { // 10 minutes
                    this.sessions.delete(id);
                }
            }

            res.json({ sessionId });
        });

        // Slash command handler - works EVERYWHERE including DMs!
        this.app.post('/api/slash', (req, res) => {
            console.log('[SLASH] Full body:', JSON.stringify(req.body));
            const { user_id, user_name, channel_id, text, root_id, response_url } = req.body;
            console.log(`[SLASH] from ${user_name} in ${channel_id}: "${text}" root_id: ${root_id || 'none'}`);

            const command = (text || '').trim().toLowerCase();

            // Generate sticker picker link
            const sessionId = Math.random().toString(36).substring(7);
            this.sessions.set(sessionId, {
                channelId: channel_id,
                userId: user_id,
                username: user_name,
                rootId: root_id || null,
                responseUrl: response_url || null,
                created: Date.now()
            });

            const domain = process.env.DOMAIN || 'http://localhost';
            const pickerUrl = `${domain}:${this.port}/?session=${sessionId}`;

            return res.json({
                response_type: 'ephemeral',
                text: `🎨 [**Open Sticker Picker**](${pickerUrl})`
            });
        });

        // Verify token for delete mode
        this.app.post('/api/verify-token', (req, res) => {
            const { token } = req.body;
            const validToken = process.env.MM_BOT_TOKEN;

            if (token === validToken) {
                res.json({ valid: true });
            } else {
                res.status(401).json({ valid: false, error: 'Invalid token' });
            }
        });

        // Delete custom sticker pack endpoint
        this.app.post('/api/delete-pack', async (req, res) => {
            const { packName, token } = req.body;

            // Verify token
            if (token !== process.env.MM_BOT_TOKEN) {
                return res.status(401).json({ error: 'Invalid token' });
            }

            try {
                const fs = require('fs');
                const path = require('path');
                const customPacksFile = path.join(__dirname, '..', 'data', 'custom-packs.json');

                let customPacks = [];
                if (fs.existsSync(customPacksFile)) {
                    const data = fs.readFileSync(customPacksFile, 'utf8');
                    customPacks = JSON.parse(data);
                }

                // Find and remove the pack
                const initialLength = customPacks.length;
                customPacks = customPacks.filter(pack => pack.name !== packName);

                if (customPacks.length === initialLength) {
                    return res.status(404).json({ error: 'Pack not found or is a default pack' });
                }

                // Save updated list
                fs.writeFileSync(customPacksFile, JSON.stringify(customPacks, null, 2));

                // Clear from cache
                this.stickerCache.delete(packName);

                console.log(`Deleted custom pack: ${packName}`);
                res.json({ success: true });
            } catch (error) {
                console.error('Error deleting pack:', error);
                res.status(500).json({ error: 'Failed to delete pack' });
            }
        });

        // Get custom packs list (for delete mode)
        this.app.get('/api/custom-packs', (req, res) => {
            const customPacks = this.getCustomPacks();
            res.json(customPacks.map(p => p.name));
        });

        // Add custom sticker pack endpoint
        this.app.post('/api/add-pack', async (req, res) => {
            try {
                const { packName, packUrl } = req.body;

                if (!packName || !packUrl) {
                    return res.status(400).json({ error: 'Pack name and URL are required' });
                }

                // Extract pack name from URL (e.g., https://t.me/addstickers/PackName -> PackName)
                const urlMatch = packUrl.match(/(?:t\.me\/addstickers\/|telegram\.me\/addstickers\/)([^\/\?\#]+)/i);
                if (!urlMatch) {
                    return res.status(400).json({ error: 'Invalid Telegram sticker pack URL. Expected format: https://t.me/addstickers/PackName' });
                }

                const telegramPackName = urlMatch[1];

                // Add pack to custom packs storage
                await this.addCustomPack(packName, telegramPackName);

                res.json({ message: 'Pack added successfully' });
            } catch (error) {
                console.error('Error adding custom pack:', error);
                res.status(500).json({ error: 'Failed to add pack: ' + error.message });
            }
        });
    }

    async addCustomPack(packName, telegramPackName) {
        const fs = require('fs');
        const path = require('path');

        const customPacksFile = path.join(__dirname, '..', 'data', 'custom-packs.json');

        let customPacks = [];
        try {
            if (fs.existsSync(customPacksFile)) {
                const data = fs.readFileSync(customPacksFile, 'utf8');
                customPacks = JSON.parse(data);
            }
        } catch (error) {
            console.error('Error reading custom packs:', error);
        }

        // Check if pack already exists
        const existingPack = customPacks.find(pack =>
            pack.name.toLowerCase() === packName.toLowerCase() ||
            pack.telegramName === telegramPackName
        );

        if (existingPack) {
            throw new Error('Pack already exists');
        }

        // Add new pack
        customPacks.push({
            name: packName,
            telegramName: telegramPackName,
            added: new Date().toISOString()
        });

        // Save to file
        fs.writeFileSync(customPacksFile, JSON.stringify(customPacks, null, 2));

        console.log(`Added custom pack: ${packName} (${telegramPackName})`);
    }

    getCustomPacks() {
        const fs = require('fs');
        const path = require('path');

        const customPacksFile = path.join(__dirname, '..', 'data', 'custom-packs.json');

        try {
            if (fs.existsSync(customPacksFile)) {
                const data = fs.readFileSync(customPacksFile, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('Error reading custom packs:', error);
        }

        return [];
    }

    start() {
        const host = process.env.UI_HOST || '0.0.0.0';
        this.app.listen(this.port, host, () => {
            console.log(`🌐 Web picker running on http://${host}:${this.port}`);
        });
    }

    async generatePickerLink(channelId, userId, username, rootId = null) {
        // Create a session
        const sessionId = Math.random().toString(36).substring(7);

        this.sessions.set(sessionId, {
            channelId,
            userId,
            username: username || userId, // fallback to userId if username not provided
            rootId: rootId || null,
            created: Date.now()
        });

        console.log(`Generated picker link for user: ${username || userId} (${userId}) rootId: ${rootId || 'none'}`);
        const domain = process.env.DOMAIN || 'http://localhost';
        return `${domain}:${this.port}/?session=${sessionId}`;
    }
}

module.exports = WebPicker;