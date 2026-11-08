FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY index.js ./

ENV PORT=3002
# Standalone container: listen on all interfaces (the combined image uses loopback)
ENV HOST=0.0.0.0

EXPOSE 3002

CMD ["node", "index.js"]
