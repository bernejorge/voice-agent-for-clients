FROM node:lts-alpine AS build

WORKDIR /app

COPY package*.json pnpm-lock.yaml* ./

RUN npm install -g pnpm \
    && pnpm install --frozen-lockfile

COPY . .

RUN pnpm run build

FROM node:lts-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY package*.json ./

EXPOSE 3000

CMD ["node", "dist/app.js"]
