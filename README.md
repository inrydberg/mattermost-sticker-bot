# Mattermost Sticker Bot

![Web Picker Interface](https://github.com/inrydberg/mattermost-sticker-bot/releases/download/release/example_1.png)

A powerful bot that brings Telegram stickers to your Mattermost channels! Features full support for both static images and animated WebM/TGS stickers with automatic GIF conversion.

## Demo

Watch the bot in action:

![Demo](https://github.com/inrydberg/mattermost-sticker-bot/releases/download/release/usage_demo.gif)

[📹 View Full Video](https://github.com/inrydberg/mattermost-sticker-bot/releases/download/release/usage_example.mp4)

## Quickstart

```bash
# 1. Clone and enter directory
git clone https://github.com/inrydberg/mattermost-sticker-bot
cd mattermost-sticker-bot

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your tokens (see Configuration section)

# 4. Run the bot
npm start &

# 5. Setup slash command in Mattermost Admin Panel
# (See "Setup Slash Command" section below)

# 6. Test in Mattermost
# Type: /sticker
```

Bot will be running on port 3333 for web interface!

## Features

- **Telegram Sticker Integration**: Access real Telegram sticker packs
- **WebM Video Stickers**: Automatic conversion to GIF format
- **TGS Animated Stickers**: Lottie-based animations converted to GIF using lottie-converter
- **Web Interface**: Interactive sticker picker (configurable via UI_PORT, defaults to port 3333)
- **Real-time Updates**: WebSocket integration for instant sticker delivery
- **Thread Support**: Stickers sent from threads stay in threads (via slash commands)
- **User Attribution**: @mentions mode shows who sent each sticker
- **Custom Sticker Packs**: Add your own Telegram sticker packs via the web interface
- **Delete Mode**: Remove custom packs with token-protected delete mode (🗑️ button)
- **Ephemeral Messages**: Commands don't clutter channels - bot messages appear only to you
- **Automatic Cache Management**: Smart 100MB cache limit with auto-cleanup

![Telegram Stickers in Mattermost](https://github.com/inrydberg/mattermost-sticker-bot/releases/download/release/example_2.png)

## Prerequisites

- **Node.js 14+** (18.x recommended)
- **FFmpeg** (for WebM video sticker conversion)
  ```bash
  # Ubuntu/Debian
  sudo apt-get install ffmpeg

  # macOS
  brew install ffmpeg

  # Windows
  # Download from https://ffmpeg.org/download.html
  ```
- **Mattermost server** (tested with 8.1+)
- **Telegram Bot Token** (any token will work - it's only used for fetching stickers)

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/inrydberg/mattermost-sticker-bot
cd mattermost-sticker-bot
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Get a Telegram Bot Token (2 minutes)

**Important:** Any Telegram bot token will work - it's only used to fetch stickers, not to run an actual bot!

1. Open Telegram and search for **@BotFather**
2. Send `/newbot` to BotFather
3. Choose any name (e.g., "MyStickers")
4. Choose any username (e.g., "mystickers123_bot")
5. Copy the token that BotFather gives you

That's it! No webhook, no server, no additional configuration needed.

### 4. Configuration

Create your environment file:
```bash
cp .env.example .env
```

Edit `.env` with your tokens:
```env
# Mattermost Server
MM_SERVER_URL=https://your-mattermost-server.com
MM_WS_URL=wss://your-mattermost-server.com/api/v4/websocket

# Bot Tokens
MM_BOT_TOKEN=your_mattermost_bot_token_here
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here

# Web Picker Configuration
DOMAIN=http://your-sticker-bot-domain.com
UI_PORT=3333
UI_HOST=0.0.0.0
```

See `.env.example` for both local development and remote deployment options.

## Mattermost Bot Setup

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
6. **COPY THE ACCESS TOKEN** and add it to your `.env` file as `MM_BOT_TOKEN`

### 2. Add Bot to Channels

The bot must be invited to channels to respond to commands:
1. Go to the channel where you want to use stickers
2. Type `/invite @stickerbot`

### 3. Setup Slash Command (Recommended)

To enable the `/sticker` command that works everywhere:

1. Log into Mattermost as an admin
2. Go to **Main Menu** → **Integrations** → **Slash Commands**
3. Click **Add Slash Command**
4. Configure with these settings:

| Field | Value |
|-------|-------|
| Title | Sticker Bot |
| Description | Send Telegram stickers |
| Command Trigger Word | `sticker` |
| Request URL | `http://YOUR_DOMAIN:3333/api/slash` |
| Request Method | POST |
| Response Username | sticker-bot |
| Autocomplete | ON |

5. Click **Save**
6. Copy the generated token (for verification if needed)

**Note:** Replace `YOUR_DOMAIN` with your actual server domain/IP where the bot is running.

### 4. Enable Real-time Updates (Docker Users)

If stickers don't appear immediately, add this to your Mattermost `docker-compose.yml`:

```yaml
environment:
  - MM_SERVICESETTINGS_ALLOWCORSFROM=*
```

Then restart Mattermost: `docker-compose down && docker-compose up -d`

## Running the Bot

### Production
```bash
npm start &
# or
node src/stickerbot.js &
```

### Development Mode (with auto-reload)
```bash
npm run dev
```

The bot will:
- ✅ Connect to Mattermost WebSocket
- ✅ Start web picker on configured port (default 3333)
- ✅ Initialize cache manager
- ✅ Begin listening for commands

## Usage

The bot supports **two modes** of operation:

### Mode 1: Slash Commands (Recommended)

Works **everywhere** - channels, DMs, group messages, threads!

- **`/sticker`** - Open Sticker Selector web interface

This is the recommended mode as it works in any context without needing to invite the bot.

**Response format:**
```
YourUsername BOT  12:34 PM
sticker
```

### Mode 2: @Mentions

Works only in **bot DMs** or **channels where the bot was explicitly invited**.

- **`@stickerbot help`** - Show help menu (only visible to you)
- **`@stickerbot s`** - Open Sticker Selector web interface

To use this mode, you must first invite the bot to the channel: `/invite @stickerbot`

**Response format:**
```
sticker-bot BOT  12:34 PM
@YourUsername
sticker
```

### Using the Web Interface

1. Type `/sticker` (or `@stickerbot s` in invited channels)
2. Click the generated link (only visible to you)
3. Browse sticker packs:
   - **memezey** - Popular meme stickers
   - **pepetop** - Top Pepe collection
   - **HotCherry** - Cherry themed stickers
4. Click any sticker to instantly send it to the channel!

### Features in Action

- **Animated Stickers**: TGS files automatically convert to GIF
- **Video Stickers**: WebM files convert to GIF using ffmpeg
- **Clean Chat**: Bot commands are auto-deleted
- **Private Responses**: Help messages only you can see
- **Smart Cache**: Converted GIFs cached for instant reuse

## Architecture

### Components

- **src/stickerbot.js** - Main bot handling Mattermost WebSocket and commands
- **src/telegram-api.js** - Telegram API integration for fetching stickers
- **src/handler_tgs.js** - TGS to GIF converter using lottie-converter
- **src/handler_webm.js** - WebM to GIF converter using ffmpeg
- **src/cache_manager.js** - Automatic cache size management (100MB limit)
- **web-ui/web-picker.js** - Express server for the web interface (port 3333)
- **web-ui/file-upload.js** - Mattermost file upload utilities

### Conversion Pipeline

1. User clicks sticker in web interface
2. Bot fetches sticker from Telegram API
3. Checks cache for existing GIF
4. If not cached, converts to GIF:
   - **TGS**: Decompress with pako → Convert with lottie-converter
   - **WebM**: Extract frames with ffmpeg → Generate optimized GIF
5. Saves to cache for future use
6. Uploads GIF to Mattermost
7. Posts in channel

### Project Structure

```
mattermost-sticker-bot/
├── src/                     # Source code
│   ├── stickerbot.js       # Main bot application
│   ├── telegram-api.js     # Telegram API client
│   ├── handler_tgs.js      # TGS → GIF converter
│   ├── handler_webm.js     # WebM → GIF converter
│   └── cache_manager.js    # Automatic cache cleanup
├── web-ui/                  # Web interface
│   ├── web-picker.js       # Express server (port 3333)
│   ├── file-upload.js      # Mattermost file handling
│   ├── index.html          # Sticker picker UI
│   └── styles.css          # Picker styles
├── docker/                  # Docker configuration
│   └── Dockerfile          # Container build instructions
├── docker-compose-mm/       # Full stack (Mattermost + Bot)
│   └── docker-compose.yml  # Local development setup
├── data/                    # Persistent data (Docker volume)
│   └── custom-packs.json   # User-added sticker packs
├── gif-cache/              # Converted GIF cache (auto-managed)
├── temp/                   # Temporary files during conversion
├── package.json            # Dependencies and scripts
├── .env.example            # Environment template
└── .env                    # Your configuration (git-ignored)
```

### Cache Management

The bot includes intelligent cache management:

- **gif-cache/** - Stores converted GIF files
  - Monitored every 5 minutes
  - Automatically cleared when exceeding 100MB
  - Preserves disk space while maintaining performance

- **temp/** - Temporary conversion workspace
  - Used during WebM/TGS processing
  - Cleaned up after each conversion

## Troubleshooting

### Bot not responding?
- ✅ Verify bot is in the channel (`/invite @stickerbot`)
- ✅ Check bot token in `.env` is correct
- ✅ Ensure bot has System Admin role
- ✅ Check console for connection errors

### Stickers not appearing immediately?
- ✅ Add `MM_SERVICESETTINGS_ALLOWCORSFROM=*` to Mattermost config
- ✅ Restart Mattermost after config change
- ✅ Check browser console for WebSocket errors

### Animated stickers showing as static?
- ✅ Verify ffmpeg is installed: `ffmpeg -version`
- ✅ Check lottie-converter installed: `npm ls lottie-converter`
- ✅ Ensure gif-cache/ directory is writable
- ✅ Look for conversion errors in console

### Web picker not loading?
- ✅ Check port 3333 is not in use
- ✅ Verify firewall allows port 3333
- ✅ Try accessing directly at configured domain and port (default 3333)

### Cache issues?
- ✅ Check cache size: `du -sh gif-cache/`
- ✅ Manual clear if needed: `rm -rf gif-cache/*`
- ✅ Cache manager logs show cleanup status

## Development

### Running Tests
```bash
npm test
```

### Debug Mode
```bash
DEBUG=* npm start
```

### Adding Custom Sticker Packs

You can easily add your own Telegram sticker packs through the web interface:

1. **Open the sticker picker** with `/sticker` or `@stickerbot s`
2. **Click "+ Add Sticker Pack"** (top-right corner)
3. **Enter pack details:**
   - **Pack Name**: A friendly name (e.g., "My Favorites")
   - **Telegram URL**: `https://t.me/addstickers/PackName`
4. **Click "Add Pack"** - your custom pack will appear immediately!

**Finding Telegram Pack URLs:**
- Open any Telegram sticker pack
- Share the pack to get a link like `https://t.me/addstickers/PackName`
- Use that URL in the bot

Custom packs are stored in `data/custom-packs.json` and persist between restarts (via Docker volume).

### Deleting Custom Sticker Packs

To remove custom packs you no longer want:

1. **Click the 🗑️ button** (top-right, light red)
2. **Enter your MM_BOT_TOKEN** when prompted
3. **Delete mode activates** - background turns red, custom packs show trash icons
4. **Click any custom pack** to delete it (default packs cannot be deleted)
5. **Click "← Exit Delete Mode"** to return to normal mode

This token protection prevents accidental deletions.

## Default Sticker Packs

Browse sticker packs:
- **memezey** - Popular meme stickers
- **pepetop** - Top Pepe collection
- **HotCherry** - Cherry themed stickers

These sticker packs are included by default and ready to use immediately.

## npm Dependencies

### Core Dependencies
- `express` - Web server for sticker picker
- `ws` - WebSocket client for Mattermost
- `axios` - HTTP client for APIs
- `dotenv` - Environment configuration
- `form-data` - File upload handling

### Conversion Dependencies
- `lottie-converter` - TGS to GIF conversion
- `pako` - TGS decompression
- `ffmpeg` (system) - WebM to GIF conversion

## Changelog

### v1.1.0 - Slash Commands, Thread Support & Delete Mode

**New Features:**
- **Slash Command Support** (`/sticker`) - Works everywhere: channels, DMs, group messages, threads
- **Thread Support** - Stickers sent from threads now stay in threads (via slash commands)
- **Dual Operation Modes** - Choose between slash commands (recommended) or @mentions
- **Delete Mode** - Token-protected UI for removing custom sticker packs
- **Persistent Data Volume** - Custom packs stored in `/app/data/` with Docker volume support

**Improvements:**
- Added `/api/slash` endpoint for Mattermost slash command integration
- Sessions now store `responseUrl` for proper slash command responses
- Sessions now store `rootId` for thread context preservation
- Bot mention detection improved to handle both `@stickerbot` and `@sticker-bot` usernames
- Added `express.urlencoded()` middleware for slash command POST parsing
- `sendMessage()` and `sendFileAsPost()` now support `rootId` parameter for threads
- Enhanced logging for WebSocket events and message processing
- Added 🗑️ delete button to web picker UI
- Token verification via `MM_BOT_TOKEN` for delete mode access
- Visual delete mode with red theme and trash icons on deletable packs
- Default packs protected from deletion
- Updated `.env.example` with local and remote deployment options

**Technical Changes:**
- `web-picker.js`: Added slash command handler, delete mode endpoints (`/api/verify-token`, `/api/delete-pack`, `/api/custom-packs`)
- `stickerbot.js`: Improved mention detection regex, added rootId to picker links
- `file-upload.js`: Added rootId parameter for thread-aware file posts
- `index.html`: Delete mode UI with token modal and visual feedback
- `Dockerfile`: Creates `/app/data/custom-packs.json` for volume initialization
- `docker-compose.yml`: Uses named volume `bot_data:/app/data` for persistence
- GIFs via slash commands use Mattermost file URLs for proper rendering

## Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## License

MIT License (Non-Commercial) - feel free to use in your own projects!

## Credits

Built with love for the Mattermost community. Special thanks to:
- Telegram Bot API for sticker access
- Mattermost team for the excellent platform
- Contributors and testers

---

**Need help?** Open an issue or contact the maintainers!
