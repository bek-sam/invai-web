# Build context is the workspace root (the parent of all invai-* repos), not this directory:
# package.json links @invai/contracts and @invai/ui via `link:../<repo>`, sibling repos, so
# pnpm and the Vite build need them on disk at those relative paths. See
# invai-infra/local/docker-compose.yml (the `full` profile), which is the only place this
# Dockerfile is built from today (`sst.aws.StaticSite` builds invai-web directly, no Docker).
FROM node:24-slim AS build
WORKDIR /build
RUN corepack enable
COPY invai-contracts ./invai-contracts
COPY invai-ui ./invai-ui
COPY invai-web/package.json invai-web/pnpm-lock.yaml ./invai-web/
WORKDIR /build/invai-web
RUN pnpm install --frozen-lockfile
COPY invai-web/. .
ARG VITE_API_URL=http://localhost:3000
ENV VITE_API_URL=${VITE_API_URL}
RUN pnpm build

FROM nginx:alpine
COPY --from=build /build/invai-web/dist /usr/share/nginx/html
COPY invai-web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
