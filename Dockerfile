FROM node:20-slim

# Install system dependencies (Python3 for yt-dlp, ffmpeg for processing)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp globally using pip
RUN pip install yt-dlp --break-system-packages

WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --production

# Copy remaining source code
COPY . .

EXPOSE 8080
CMD ["node", "server.js"]
