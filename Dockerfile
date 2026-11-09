FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000 3001
CMD ["sh", "-c", "npx drizzle-kit push --config=src/db/drizzle.config.ts && npm run dev"]
