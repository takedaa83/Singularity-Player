# Stage 1: Build the TypeScript application
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Production runtime
FROM node:20-slim

# Install system dependencies: python3 (required by yt-dlp), ffmpeg (for audio conversion), and curl/ca-certificates
RUN apt-get update && apt-get install -y \
    python3 \
    curl \
    ffmpeg \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install only production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy compiled JavaScript and data assets
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/data ./data

# Pre-download the Linux yt-dlp binary to the bin directory to avoid runtime downloads
RUN mkdir -p bin && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o bin/yt-dlp && \
    chmod a+rx bin/yt-dlp

# Create dynamic folders for file downloads and custom metadata covers
RUN mkdir -p uploads/tracks uploads/covers

EXPOSE 3001
ENV PORT=3001
ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
