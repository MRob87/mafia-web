# Build context must be the monorepo root, e.g.:
#   docker build -f apps/server/Dockerfile -t mafia-server .
FROM node:24-slim AS build
WORKDIR /repo

COPY package.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/server/package.json apps/server/package.json
RUN npm install --workspaces --include-workspace-root

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/server apps/server
RUN npm run build -w packages/shared
RUN npm run build -w apps/server

FROM node:24-slim AS run
WORKDIR /repo
ENV NODE_ENV=production

COPY package.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/server/package.json apps/server/package.json
RUN npm install --workspaces --include-workspace-root --omit=dev

COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/apps/server/dist apps/server/dist

EXPOSE 4000
CMD ["node", "apps/server/dist/index.js"]
