FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY config ./config
COPY public ./public
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
EXPOSE 3001
CMD ["npm", "start"]
