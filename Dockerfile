# Build stage for game client
FROM node:20-alpine AS builder
WORKDIR /app

# Game pubkey for leaderboard queries (public, derived from GAME_NSEC)
ARG VITE_GAME_PUBKEY=3b48f54aa578e9bbc39172c0b4395efa2ca2ec78d46d82f5965bb06a9f9eebd1
ARG VITE_LNBITS_URL=https://bank.weeksfamily.me
ARG VITE_LNBITS_INVOICE_KEY=
ARG VITE_LIGHTNING_ADDRESS=space.zappers@bank.weeksfamily.me
ENV VITE_LNBITS_URL=$VITE_LNBITS_URL VITE_LNBITS_INVOICE_KEY=$VITE_LNBITS_INVOICE_KEY VITE_LIGHTNING_ADDRESS=$VITE_LIGHTNING_ADDRESS
ENV VITE_GAME_PUBKEY=$VITE_GAME_PUBKEY

COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage - Nginx + Score Service
FROM node:20-alpine

# Install nginx and supervisor
RUN apk add --no-cache nginx

# Set up score service
WORKDIR /score-service
COPY score-service/package*.json ./
RUN npm ci --only=production
COPY score-service/index.js ./

# Copy built game files and fix permissions
COPY --from=builder /app/dist /usr/share/nginx/html
RUN chmod -R 644 /usr/share/nginx/html/* && chmod 755 /usr/share/nginx/html /usr/share/nginx/html/assets

# Nginx config - serves static files and proxies /api to score service
RUN mkdir -p /etc/nginx/http.d && echo 'server { \
    listen 80; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
    location /api/ { \
        proxy_pass http://127.0.0.1:3002/; \
        proxy_http_version 1.1; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $remote_addr; \
    } \
}' > /etc/nginx/http.d/default.conf

# Start script - runs both nginx and score service
RUN printf '#!/bin/sh\ncd /score-service && node index.js &\nnginx -g "daemon off;"\n' > /start.sh && \
    chmod +x /start.sh

EXPOSE 80

CMD ["/start.sh"]
