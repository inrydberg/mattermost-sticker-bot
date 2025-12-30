# Complete Mattermost + Sticker Bot Setup

This folder contains a complete Docker Compose setup with both Mattermost server and the sticker bot for easy testing and development.

## Quick Start

1. **Start the complete stack**:
   ```bash
   docker compose up -d
   ```

2. **Set up Mattermost**:
   - Open http://localhost:8065
   - Create admin account
   - Navigate to Integrations > Bot Accounts
   - Create a new bot account (e.g., "stickerbot")
   - Copy the generated access token

3. **Configure the bot token**:
   ```bash
   # Edit the parent directory's .env file
   cd ..
   nano .env
   # Add your Mattermost bot token:
   # MM_BOT_TOKEN=your_token_here
   ```

4. **Restart the sticker bot** with the new token:
   ```bash
   cd docker-compose-mm
   docker compose up -d --force-recreate sticker-bot
   ```

5. **Test the bot**:
   - Invite the bot to a channel: `/invite @stickerbot`
   - Type: `@stickerbot help`
   - Try: `@stickerbot ass`

## What's Included

- **PostgreSQL Database** - Persistent storage for Mattermost
- **Mattermost Team Edition** - Complete chat platform
- **Sticker Bot** - Telegram sticker integration

## Services

### Mattermost Server
- **URL**: http://localhost:8065
- **Admin Setup**: First-time setup required
- **CORS**: Enabled for sticker bot integration

### Sticker Bot
- **Web Interface**: http://localhost:3333
- **Configuration**: Loaded from `../.env`
- **Networking**: Uses internal docker networking to communicate with Mattermost

### Database
- **Type**: PostgreSQL 13
- **Credentials**: mmuser/mostest
- **Database**: mattermost_test

## Data Persistence

All data is persisted in Docker volumes:
- Mattermost configuration, data, logs, and plugins
- PostgreSQL database
- Sticker bot GIF cache and custom packs

## Development

This setup is perfect for:
- Testing new bot features
- Developing sticker pack integrations
- Debugging bot functionality
- Demonstrating the bot to others

## Stopping

```bash
docker-compose down
```

To also remove volumes (⚠️ **destroys all data**):
```bash
docker-compose down -v
```

## Troubleshooting

- **Mattermost not starting**: Wait for database to fully initialize
- **Bot not connecting**: Ensure bot token is set in `../.env`
- **Stickers not working**: Check Telegram bot token
- **Check logs**: `docker-compose logs sticker-bot`