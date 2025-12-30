FROM node:18-alpine

# Install ffmpeg for WebM to GIF conversion
# Note: If build fails due to network issues, try again or comment out this line temporarily
RUN apk add --no-cache ffmpeg || true

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY src/ ./src/
COPY web-ui/ ./web-ui/

# Create directories for cache and temp files
RUN mkdir -p gif-cache temp custom-packs && \
    echo '[]' > /app/custom-packs.json

# Expose the web interface port
EXPOSE 3333

# Start the bot
CMD ["npm", "start"]