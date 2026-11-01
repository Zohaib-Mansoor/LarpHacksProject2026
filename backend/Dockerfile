FROM node:24-alpine AS build
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/tsconfig*.json ./
COPY backend/src ./src
RUN npm run build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4173 DEMO_MODE=true
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev --omit=optional && npm cache clean --force
COPY --from=build /app/backend/dist ./dist
COPY backend/drizzle ./drizzle
COPY backend/scripts/start-render.sh ./start-render.sh
COPY playcall/public /app/playcall/public
USER node
EXPOSE 4173
CMD ["node", "dist/server.js"]
