FROM node:20-slim
RUN npm install -g pnpm@9
WORKDIR /app
COPY . .
RUN pnpm install --no-frozen-lockfile --ignore-scripts
RUN pnpm --filter @workspace/db run build || true
RUN pnpm --filter @workspace/api-server run build
EXPOSE 8080
CMD ["pnpm", "--filter", "@workspace/api-server", "start"]
