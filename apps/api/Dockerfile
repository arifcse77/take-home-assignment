FROM node:22-alpine
RUN apk add --no-cache openssl wget
RUN corepack enable && corepack prepare pnpm@9.14.2 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml turbo.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/database/package.json ./packages/database/
COPY packages/database/prisma ./packages/database/prisma
COPY apps/api/package.json ./apps/api/

RUN pnpm install

COPY packages/shared ./packages/shared
COPY packages/database ./packages/database
COPY apps/api ./apps/api
COPY fixtures ./fixtures
COPY scripts/api-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

RUN pnpm --filter @lomi/shared build && \
    pnpm --filter @lomi/database exec prisma generate && \
    pnpm --filter @lomi/database build && \
    pnpm --filter @lomi/api build

ENV NODE_ENV=production
EXPOSE 3001
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "apps/api/dist/server.js"]