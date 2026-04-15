FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache yt-dlp ffmpeg

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["node", "index.js"]