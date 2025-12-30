const express = require('express');
const path = require('path');
const { uploadFile, sendFileAsPost } = require('./file-upload');

class WebPicker {
    constructor(bot, telegram, port = 3333, gifConverter = null, tgsHandler = null) {
        this.bot = bot;
        this.telegram = telegram;
        this.port = port;
        this.gifConverter = gifConverter;
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
        if (this.gifConverter) {
            this.app.get('/gif/:filename', (req, res) => {
                const gifPath = path.join(__dirname, 'gif-cache', req.params.filename);
                res.sendFile(gifPath);
            });
        }

        // Get sticker packs
        this.app.get('/api/packs', (req, res) => {
            res.json([
                'memezey',
                'pepetop',
                'HotCherry'
            ]);
        });

        // Get stickers from a pack
        this.app.get('/api/pack/:name', async (req, res) => {
            const packName = req.params.name;

            // Check cache first
            if (this.stickerCache.has(packName)) {
                return res.json(this.stickerCache.get(packName));
            }

            const stickers = await this.telegram.getAllStickerUrls(packName);

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

            const sticker = await this.telegram.getStickerUrl(packName, stickerIndex);
            if (sticker) {
                let stickerUrl = sticker;
                let gifFilePath = null;

                // Convert WEBM or TGS to GIF if converter is available
                if (this.gifConverter) {
                    try {
                        const baseUrl = `http://localhost:${this.port}`;

                        // Check if it's a WEBM file
                        if (sticker.includes('.webm')) {
                            gifFilePath = await this.gifConverter.convertWebmToGif(sticker);
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

                            // Send the uploaded file as a post
                            await sendFileAsPost(
                                this.bot.serverUrl,
                                this.bot.botToken,
                                session.channelId,
                                fileInfo,
                                ''
                            );

                            console.log(`Uploaded and sent animated GIF: ${packName}_${stickerIndex}`);
                            res.json({ success: true });
                            return;
                        }
                    } catch (err) {
                        console.error('Failed to convert/upload GIF, falling back to static:', err);
                    }
                }

                // For static images, send as markdown image
                await this.bot.sendMessage(session.channelId, `![sticker](${sticker})`);
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
    }

    start() {
        this.app.listen(this.port, '0.0.0.0', () => {
            console.log(`🌐 Web picker running on http://localhost:${this.port}`);
        });
    }

    async generatePickerLink(channelId, userId) {
        // Create a session
        const sessionId = Math.random().toString(36).substring(7);

        this.sessions.set(sessionId, {
            channelId,
            userId,
            created: Date.now()
        });

        return `http://localhost:${this.port}/?session=${sessionId}`;
    }
}

module.exports = WebPicker;