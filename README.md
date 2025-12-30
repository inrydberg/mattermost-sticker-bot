# Mattermost Sticker Bot

A powerful bot that brings Telegram animated stickers to your Mattermost channels! Features full support for animated TGS stickers with automatic GIF conversion.

## Features

- **Telegram Sticker Integration**: Access real Telegram sticker packs
- **Animated Sticker Support**: Full TGS (Telegram animated sticker) to GIF conversion
- **Web Interface**: Interactive sticker picker at `http://localhost:3333`
- **Real-time Updates**: WebSocket integration for instant sticker delivery
- **Ephemeral Messages**: Commands don't clutter channels - bot messages appear only to you

## Prerequisites

- Node.js 14+
- Mattermost server (tested with 8.1+)
- Telegram Bot Token (for fetching sticker packs)

## Installation

1. **Clone the repository:**
```bash
git clone <repository-url>
cd mattermost-sticker-bot
```

2. **Install dependencies:**
```bash
npm install
```

3. **Set up environment variables:**
```bash
cp .env.example .env
```

Edit `.env` and add your tokens:
```
MM_BOT_TOKEN=your_mattermost_bot_token_here
MM_SERVER_URL=http://localhost:8065
MM_WS_URL=ws://localhost:8065/api/v4/websocket
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
```

## Mattermost Setup

### 1. Create a Bot Account

1. Log into Mattermost as an admin
2. Go to **Main Menu** → **Integrations** → **Bot Accounts**
3. Click **Add Bot Account**
4. Fill in:
   - **Username**: `stickerbot`
   - **Display Name**: `Sticker Bot`
   - **Description**: `Telegram Sticker Picker`
   - **Role**: `System Admin` (required for message deletion)
5. Click **Create Bot Account**
6. **COPY THE ACCESS TOKEN** and add it to your `.env` file

### 2. Add Bot to Channels

1. Invite the bot to any channels where you want to use it
2. The bot needs to be in the channel to respond to commands

### 3. Fix Real-time Updates (Important!)

If stickers don't appear immediately, add this to your Mattermost `docker-compose.yml`:

```yaml
environment:
  - MM_SERVICESETTINGS_ALLOWCORSFROM=*
```

This enables WebSocket connections for real-time updates.

## Running the Bot

```bash
# Using npm
npm start

# Or directly with Node
node stickerbot.js
```

The bot will connect to Mattermost and start the web picker on port 3333.

## Usage

### Commands

In any channel with the bot:

- `@stickerbot help` - Show help menu (ephemeral)
- `@stickerbot ass` - Open the Adaptive Sticker Selector web interface (ephemeral)

### Web Interface

1. Use the `@stickerbot ass` command to get a personalized link
2. Click the link to open the Telegram sticker picker
3. Browse available sticker packs:
   - **memezey** - Meme collection
   - **pepetop** - Top Pepe stickers
   - **HotCherry** - Cherry themed stickers
4. Click any sticker to instantly send it to the channel

### Features in Action

- **Animated Stickers**: TGS files are automatically converted to GIFs for proper display
- **WebM Support**: Video stickers are converted to GIFs
- **Clean Chat**: User commands are automatically deleted to keep channels tidy
- **Ephemeral Responses**: Bot help messages appear only to you

## Architecture

### Components

- **stickerbot.js** - Main bot handling Mattermost WebSocket and commands
- **web-picker.js** - Express server for the web interface (port 3333)
- **telegram-api.js** - Telegram API integration for fetching stickers
- **handler_tgs.js** - TGS to GIF converter using lottie-converter
- **handler_webm.js** - WebM to GIF converter
- **file-upload.js** - Mattermost file upload utilities

### Conversion Pipeline

1. User selects sticker in web interface
2. Bot fetches sticker from Telegram
3. If animated (TGS/WebM), converts to GIF:
   - TGS: Decompresses with pako → Converts with lottie-converter
   - WebM: Extracts frames → Creates GIF
4. Uploads GIF to Mattermost
5. Sends as post in channel

## Development

### Running in Development Mode

```bash
npm run dev
```

Uses nodemon for auto-restart on file changes.

### Project Structure

```
mattermost-sticker-bot/
├── stickerbot.js          # Main bot application
├── web-picker.js          # Web interface server
├── telegram-api.js        # Telegram API client
├── handler_tgs.js         # TGS → GIF converter
├── handler_webm.js        # WebM → GIF converter
├── file-upload.js         # Mattermost file handling
├── public/               # Web interface assets
│   ├── index.html       # Sticker picker UI
│   └── styles.css       # Picker styles
├── gif-cache/           # Converted GIF cache
├── tgs-cache/           # TGS file cache
└── .env                 # Environment variables (git-ignored)
```

## Troubleshooting

### Bot not responding?
- Check if the bot is in the channel
- Verify the bot token in `.env` is correct
- Ensure bot has System Admin role for message deletion

### Stickers not appearing immediately?
- Add `MM_SERVICESETTINGS_ALLOWCORSFROM=*` to Mattermost config
- Check WebSocket connection in browser console

### Animated stickers showing as static images?
- Verify lottie-converter is properly installed
- Check gif-cache directory has write permissions
- Look for conversion errors in console logs

### Connection errors?
- Verify Mattermost is accessible at the configured URL
- Check firewall settings for ports 8065 (Mattermost) and 3333 (picker)

## Credits

Built with love for the Mattermost community. Special thanks to the Telegram Bot API for providing access to their amazing sticker ecosystem.

## License

MIT