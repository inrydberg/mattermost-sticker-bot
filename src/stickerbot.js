// Load .env file if it exists (for local development)
// In Docker, environment variables are passed directly
require('dotenv').config();

const axios = require('axios');
const WebSocket = require('ws');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const TelegramAPI = require('./telegram-api');
const WebPicker = require('../web-ui/web-picker');
const WebmHandler = require('./handler_webm');
const TgsHandler = require('./handler_tgs');
const CacheManager = require('./cache_manager');

class StickerBot {
    constructor(config) {
        this.serverUrl = config.serverUrl;
        this.botToken = config.botToken;
        this.wsUrl = config.wsUrl;
        this.botId = null;
        this.ws = null;

        // Initialize Telegram API
        this.telegram = new TelegramAPI(process.env.TELEGRAM_BOT_TOKEN);

        // Initialize converters
        this.webmHandler = new WebmHandler();
        this.tgsHandler = new TgsHandler();

        // Initialize web picker with both handlers
        this.webPicker = new WebPicker(this, this.telegram, process.env.ASS_PORT || 3333, this.webmHandler, this.tgsHandler);
        this.webPicker.start();

        // Initialize and start cache manager
        this.cacheManager = new CacheManager();
        this.cacheManager.start();
    }

    async connect() {
        try {
            // Get bot user info
            const meResponse = await axios.get(`${this.serverUrl}/api/v4/users/me`, {
                headers: {
                    'Authorization': `Bearer ${this.botToken}`
                }
            });
            this.botId = meResponse.data.id;
            console.log(`Bot connected as: ${meResponse.data.username} (${this.botId})`);

            // Connect to WebSocket for real-time messages
            this.connectWebSocket();

            return true;
        } catch (error) {
            console.error('Failed to connect:', error.response?.data || error.message);
            return false;
        }
    }

    connectWebSocket() {
        this.ws = new WebSocket(this.wsUrl, {
            headers: {
                'Authorization': `Bearer ${this.botToken}`
            }
        });

        this.ws.on('open', () => {
            console.log('WebSocket connected');
            // Send authentication
            this.ws.send(JSON.stringify({
                seq: 1,
                action: 'authentication_challenge',
                data: {
                    token: this.botToken
                }
            }));
        });

        this.ws.on('message', async (data) => {
            const message = JSON.parse(data);

            if (message.event === 'posted') {
                const post = JSON.parse(message.data.post);

                // Ignore own messages
                if (post.user_id === this.botId) return;

                // Handle the message
                await this.handleMessage(post);
            }
        });

        this.ws.on('error', (error) => {
            console.error('WebSocket error:', error);
        });

        this.ws.on('close', () => {
            console.log('WebSocket closed, reconnecting in 5 seconds...');
            setTimeout(() => this.connectWebSocket(), 5000);
        });
    }

    async handleMessage(post) {
        const message = post.message.toLowerCase().trim();

        // Only respond to mentions
        const botMention = `<@${this.botId}>`;
        if (!message.includes(botMention.toLowerCase()) && !message.includes('@stickerbot')) {
            return; // Ignore messages that don't mention the bot
        }

        console.log(`Bot mentioned in channel ${post.channel_id}: ${post.message}`);

        // Delete the user's command message to keep chat clean
        try {
            await axios.delete(`${this.serverUrl}/api/v4/posts/${post.id}`, {
                headers: {
                    'Authorization': `Bearer ${this.botToken}`
                }
            });
            console.log(`Deleted user command: ${post.id}`);
        } catch (error) {
            console.error('Failed to delete user message:', error.response?.data || error.message);
        }

        // Add a small delay to help with client refresh issues
        await new Promise(resolve => setTimeout(resolve, 500));

        // Remove bot mention to get the command
        const cleanMessage = message
            .replace(botMention.toLowerCase(), '')
            .replace('@stickerbot', '')
            .trim();

        const parts = cleanMessage.split(' ').filter(p => p);

        // Only handle 'help' and 'ass' commands
        if (parts.length === 0 || parts[0] === 'help') {
            await this.sendHelpMessageEphemeral(post.user_id, post.channel_id);
            return;
        }

        if (parts[0] === 'ass') {
            // Get username for the picker session
            const userInfo = await this.getUserInfo(post.user_id);
            const username = userInfo ? userInfo.username : post.user_id;

            const pickerUrl = await this.webPicker.generatePickerLink(post.channel_id, post.user_id, username);
            const response = `🎨 **Adaptive Sticker Selector (ASS)**\n\n[**Open ASS Interface**](${pickerUrl})\n\n_Advanced sticker technology at your fingertips!_`;

            await this.sendEphemeralPost(post.user_id, post.channel_id, response);
            return;
        }

        // Unknown command
        await this.sendMessage(post.channel_id, `❌ Unknown command. Try \`@stickerbot help\``);
    }

    async sendMessage(channelId, message) {
        try {
            const response = await axios.post(`${this.serverUrl}/api/v4/posts`, {
                channel_id: channelId,
                message: message
            }, {
                headers: {
                    'Authorization': `Bearer ${this.botToken}`
                }
            });
            console.log(`Message sent to channel ${channelId}`);
            return response.data;
        } catch (error) {
            console.error('Failed to send message:', error.response?.data || error.message);
            console.error('Channel ID:', channelId);
            console.error('Error details:', error.response?.status, error.response?.statusText);
        }
    }

    async sendEphemeralPost(userId, channelId, message) {
        try {
            const response = await axios.post(`${this.serverUrl}/api/v4/posts/ephemeral`, {
                user_id: userId,
                channel_id: channelId,
                post: {
                    channel_id: channelId,
                    message: message
                }
            }, {
                headers: {
                    'Authorization': `Bearer ${this.botToken}`
                }
            });
            console.log(`Ephemeral message sent to user ${userId} in channel ${channelId}`);
            return response.data;
        } catch (error) {
            console.error('Failed to send ephemeral message:', error.response?.data || error.message);
        }
    }

    async getUserInfo(userId) {
        try {
            console.log(`Fetching user info for: ${userId}`);
            const response = await axios.get(`${this.serverUrl}/api/v4/users/${userId}`, {
                headers: {
                    'Authorization': `Bearer ${this.botToken}`
                }
            });

            if (response.status === 200) {
                console.log(`Got user info: ${response.data.username}`);
                return response.data;
            }
        } catch (error) {
            console.error('Failed to get user info:', error.response?.data || error.message);
        }
        return null;
    }

    async sendHelpMessageEphemeral(userId, channelId) {
        const message = `
## 🎉 Telegram Sticker Bot

**Commands:**
• \`@stickerbot help\` - Show this help menu
• \`@stickerbot ass\` - Open Adaptive Sticker Selector (ASS)

_💡 Click stickers in the picker to send them instantly!_
        `;

        await this.sendEphemeralPost(userId, channelId, message);
    }
}

// Configuration
const config = {
    serverUrl: process.env.MM_SERVER_URL || 'http://localhost:8065',
    wsUrl: process.env.MM_WS_URL || 'ws://localhost:8065/api/v4/websocket',
    botToken: process.env.MM_BOT_TOKEN
};

// Check if bot token is provided
if (!config.botToken) {
    console.error('❌ Please set MM_BOT_TOKEN environment variable');
    console.log('\nTo create a bot account:');
    console.log('1. Go to Mattermost > Integrations > Bot Accounts');
    console.log('2. Create a new bot account');
    console.log('3. Copy the access token');
    console.log('4. Run: MM_BOT_TOKEN=<your-token> node stickerbot.js');
    process.exit(1);
}

// Create and start the bot
const bot = new StickerBot(config);

bot.connect().then((success) => {
    if (success) {
        console.log('✅ Sticker Bot is running!');
        console.log('Type "@stickerbot help" in any channel to get started');
    } else {
        console.error('❌ Failed to start bot');
        process.exit(1);
    }
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down bot...');
    if (bot.ws) {
        bot.ws.close();
    }
    if (bot.cacheManager) {
        bot.cacheManager.stop();
    }
    process.exit(0);
});