FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY index.js ./

ENV PORT=3002

EXPOSE 3002

CMD ["node", "index.js"]
