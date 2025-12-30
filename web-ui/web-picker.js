const express = require('express');
const path = require('path');
const { uploadFile, sendFileAsPost } = require('./file-upload');

class WebPicker {
    constructor(bot, telegram, port = 3333, webmHandler = null, tgsHandler = null) {
        this.bot = bot;
        this.telegram = telegram;
        this.port = port;
        this.webmHandler = webmHandler;
        this.tgsHandler = tgsHandler;
        this.app = express();
        this.sessions = new Map();
        this.stickerCache = new Map(); // Cache loaded stickers
        this.setupRoutes();
    }

    setupRoutes() {
        // Serve static files
        this.app.use(express.static(path.join(__dirname)));
        this.app.use(express.json());

        // Serve index.html for root path
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'index.html'));
        });

        // Proxy for TGS files to avoid CORS
        this.app.get('/proxy/tgs', async (req, res) => {
            const url = req.query.url;
            if (!url) {
                return res.status(400).send('Missing URL parameter');
            }

            try {
                const axios = require('axios');
                const response = await axios({
                    method: 'GET',
                    url: url,
                    responseType: 'arraybuffer'
                });

                res.set('Content-Type', 'application/octet-stream');
                res.send(response.data);
            } catch (error) {
                console.error('TGS proxy error:', error.message);
                res.status(500).send('Failed to fetch TGS file');
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

            const stickers = await this.telegram.getAllStickerUrls(telegramPackName);

            // Cache the result
            if (stickers.length > 0) {
                this.stickerCache.set(packName, stickers);
            }

            res.json(stickers);
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

            const sticker = await this.telegram.getStickerUrl(telegramPackName, stickerIndex);
            if (sticker) {
                let stickerUrl = sticker;
                let gifFilePath = null;

                // Convert WEBM or TGS to GIF if converter is available
                if (this.webmHandler) {
                    try {
                        const domain = process.env.DOMAIN || 'http://localhost';
                        const baseUrl = `${domain}:${this.port}`;

                        // Check if it's a WEBM file
                        if (sticker.includes('.webm')) {
                            gifFilePath = await this.webmHandler.convertWebmToGif(sticker);
                            console.log(`Converted WEBM to GIF: ${gifFilePath}`);
                        }
                        // Check if it's a TGS file
                        else if (sticker.includes('.tgs')) {
                            gifFilePath = this.tgsHandler ? await this.tgsHandler.convertTgsToGif(sticker) : null;
                            if (gifFilePath) {
                                console.log(`Converted TGS to GIF: ${gifFilePath}`);
                            } else {
                                console.log('TGS conversion failed, will use static preview');
                            }
                        }

                        // If we have a converted GIF, upload it
                        if (gifFilePath) {
                            // Upload the GIF file to Mattermost
                            const fileInfo = await uploadFile(
                                this.bot.serverUrl,
                                this.bot.botToken,
                                session.channelId,
                                gifFilePath,
                                `sticker_${packName}_${stickerIndex}.gif`
                            );

                            // Send the uploaded file as a post with user mention
                            await sendFileAsPost(
                                this.bot.serverUrl,
                                this.bot.botToken,
                                session.channelId,
                                fileInfo,
                                `@${session.username}\n`
                            );

                            console.log(`Uploaded and sent animated GIF: ${packName}_${stickerIndex}`);
                            res.json({ success: true });
                            return;
                        }
                    } catch (err) {
                        console.error('Failed to convert/upload GIF, falling back to static:', err);
                    }
                }

                // For static images, send as markdown image with user mention
                await this.bot.sendMessage(session.channelId, `@${session.username}\n![sticker](${sticker})`);
                res.json({ success: true });
            } else {
                res.status(400).json({ error: 'Failed to send sticker' });
            }
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

        const customPacksFile = path.join(__dirname, '..', 'custom-packs.json');

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

        const customPacksFile = path.join(__dirname, '..', 'custom-packs.json');

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
        const host = process.env.ASS_HOST || '0.0.0.0';
        this.app.listen(this.port, host, () => {
            console.log(`🌐 Web picker running on http://${host}:${this.port}`);
        });
    }

    async generatePickerLink(channelId, userId, username) {
        // Create a session
        const sessionId = Math.random().toString(36).substring(7);

        this.sessions.set(sessionId, {
            channelId,
            userId,
            username: username || userId, // fallback to userId if username not provided
            created: Date.now()
        });

        console.log(`Generated picker link for user: ${username || userId} (${userId})`);
        const domain = process.env.DOMAIN || 'http://localhost';
        return `${domain}:${this.port}/?session=${sessionId}`;
    }
}

module.exports = WebPicker;