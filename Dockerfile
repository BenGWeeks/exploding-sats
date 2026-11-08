# Build stage for game client
FROM node:20-alpine AS builder
WORKDIR /app

# Public values only: everything VITE_* ends up in the browser bundle.
# Game pubkey for leaderboard queries (derived from GAME_NSEC)
ARG VITE_GAME_PUBKEY=3b48f54aa578e9bbc39172c0b4395efa2ca2ec78d46d82f5965bb06a9f9eebd1
# Lightning address shown on the payment screen (display only)
ARG VITE_LIGHTNING_ADDRESS=space.zappers@bank.weeksfamily.me
ENV VITE_GAME_PUBKEY=$VITE_GAME_PUBKEY VITE_LIGHTNING_ADDRESS=$VITE_LIGHTNING_ADDRESS

COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage - Nginx + Score Service
FROM node:20-alpine

RUN apk add --no-cache nginx

# Set up score service
WORKDIR /score-service
COPY score-service/package*.json ./
RUN npm ci --only=production
COPY score-service/index.js score-service/lightning.js ./

# Lightning payments are created and checked server-side by the score service.
# LNBITS_INVOICE_KEY must be supplied at runtime (docker compose environment),
# never as a build arg: it must not end up in the image or the browser bundle.
# HOST: the score service only listens on loopback; nginx proxies /api to it.
ENV LIGHTNING_ADDRESS=space.zappers@bank.weeksfamily.me \
    LNBITS_URL=https://bank.weeksfamily.me \
    HOST=127.0.0.1

# Copy built game files and fix permissions
COPY --from=builder /app/dist /usr/share/nginx/html
RUN chmod -R 644 /usr/share/nginx/html/* && chmod 755 /usr/share/nginx/html /usr/share/nginx/html/assets

# Nginx config - serves static files and proxies /api to score service.
# real_ip: behind the reverse proxy (private network), take the client address from
# X-Forwarded-For so the score service's per-IP rate limits see real clients.
RUN mkdir -p /etc/nginx/http.d && echo 'server { \
    listen 80; \
    set_real_ip_from 10.0.0.0/8; \
    set_real_ip_from 172.16.0.0/12; \
    set_real_ip_from 192.168.0.0/16; \
    set_real_ip_from 127.0.0.1; \
    real_ip_header X-Forwarded-For; \
    real_ip_recursive on; \
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

# Start script - runs nginx and the score service; exits if either dies so Docker restarts it
COPY scripts/docker-start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 80

CMD ["/start.sh"]
