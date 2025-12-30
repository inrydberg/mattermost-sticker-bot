# Docker Deployment

This folder contains the Dockerfile to run the Mattermost Sticker Bot as a standalone container alongside your existing production Mattermost deployment.

## QUICKSTART

Assuming your `.env` file is already configured with bot tokens:

```bash
# Build the image (from parent directory)
docker build --network=host -t mattermost-sticker-bot -f docker/Dockerfile .

# Run the bot
docker run -d --name sticker-bot --network host --env-file .env mattermost-sticker-bot

# Check logs
docker logs sticker-bot
```

That's it! Bot should be running at http://localhost:3333

## Detailed Setup

1. **Build the image** (from parent directory):
   ```bash
   docker build --network=host -t mattermost-sticker-bot -f docker/Dockerfile .
   ```
   **Important:** Use `--network=host` during build to avoid Alpine package download issues

2. **Run the container**:

   For **localhost Mattermost** (typical development):
   ```bash
   docker run -d \
     --name sticker-bot \
     --network host \
     --env-file .env \
     -v sticker-cache:/app/gif-cache \
     -v sticker-packs:/app/custom-packs.json \
     --restart unless-stopped \
     mattermost-sticker-bot
   ```

   For **remote Mattermost** (production):
   ```bash
   docker run -d \
     --name sticker-bot \
     --env-file .env \
     -p 3333:3333 \
     -v sticker-cache:/app/gif-cache \
     -v sticker-packs:/app/custom-packs.json \
     --restart unless-stopped \
     mattermost-sticker-bot
   ```

## Configuration

The bot reads all configuration from environment variables. Make sure your `.env` file contains:

- **`MM_BOT_TOKEN`** - Your Mattermost bot access token
- **`TELEGRAM_BOT_TOKEN`** - Telegram bot token for sticker fetching
- **`MM_SERVER_URL`** - Your Mattermost server URL
- **`MM_WS_URL`** - Your Mattermost WebSocket URL

## Production Deployment

For production deployment:

1. **Update `.env`** with your production Mattermost server URLs
2. **Run behind reverse proxy** for secure HTTPS access to port 3333
3. **Monitor logs**: `docker logs sticker-bot`
4. **Update image**: Rebuild and recreate container when updating

## Docker Commands

```bash
# View logs
docker logs -f sticker-bot

# Stop the bot
docker stop sticker-bot

# Remove the container
docker rm sticker-bot

# Update and restart
docker build --network=host -t mattermost-sticker-bot -f docker/Dockerfile .
docker stop sticker-bot
docker rm sticker-bot
docker run -d --name sticker-bot --env-file .env -p 3333:3333 mattermost-sticker-bot
```

## Data Persistence

To persist cache and custom sticker packs, use Docker volumes as shown in the run command above.

## Important Notes & Fixes

### Volume Mount Fix (December 2024)
- **Issue**: WEBM conversion failed with "EXDEV: cross-device link not permitted"
- **Cause**: Docker volumes are on different filesystems, preventing file moves between temp and cache directories
- **Solution**: Updated WEBM handler to output GIF files directly to cache directory, avoiding cross-volume file operations

### Network Configuration

- **For localhost Mattermost**: Use `--network host` when running the container. This allows the bot to connect to Mattermost on localhost:8065
- **For remote/production Mattermost**: Use standard Docker networking with `-p 3333:3333` to expose the web interface
- **Build issues**: Always use `--network=host` during build to avoid Alpine package repository timeouts

### Environment Variables

- The bot uses Docker's `--env-file` to pass environment variables directly
- The dotenv warning "injecting env (0)" is normal - it means no .env file exists inside the container (which is expected)
- All configuration comes from the host's `.env` file passed via Docker

### Common Issues

- **"connect ECONNREFUSED ::1:8065"**: This means the bot is trying to connect to IPv6 localhost. Use `--network host` for local Mattermost
- **"Cannot find module 'dotenv'"**: The Dockerfile uses `npm install` (not `--production`) to ensure all dependencies are installed
- **ffmpeg installation fails**: Network issues during build. The Dockerfile uses `|| true` to continue even if ffmpeg fails (for testing)

## Troubleshooting

- **Bot not connecting**:
  - For localhost: Ensure you're using `--network host`
  - Check `MM_SERVER_URL` and `MM_BOT_TOKEN` in your `.env`
- **Stickers not loading**: Verify `TELEGRAM_BOT_TOKEN` is valid
- **Web interface not accessible**:
  - With `--network host`: Access at http://localhost:3333
  - Without: Ensure `-p 3333:3333` is used
- **Check logs**: `docker logs -f sticker-bot`