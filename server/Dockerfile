# Build from the repo root so `shared/` is available to tsc:
#   docker build -f server/Dockerfile .
FROM node:20-slim AS build
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm install
COPY server/tsconfig.json ./
COPY server/src ./src
COPY shared /app/shared
RUN npm run build

FROM node:20-slim
WORKDIR /app/server
ENV NODE_ENV=production
COPY server/package.json server/package-lock.json ./
RUN npm install --omit=dev
COPY --from=build /app/server/dist ./dist
EXPOSE 2567
CMD ["node", "dist/server/src/index.js"]
