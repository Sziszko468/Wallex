# syntax=docker/dockerfile:1

# ---- build: compile the React app into static files -------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Baked into the bundle at build time (Vite replaces import.meta.env.VITE_*).
# "/api" = same origin: this image's nginx proxies it to the backend.
# An absolute URL (https://api.example.com/api) = the API lives on another domain (needs CORS).
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

# Type-checks (tsc -b) before bundling: a type error fails the image build.
RUN npm run build


# ---- runtime: nginx serves the bundle and proxies the API --------------------------------
# The unprivileged variant runs as uid 101 and listens on 8080 — no root, no port 80.
FROM nginxinc/nginx-unprivileged:1.30-alpine

# API_UPSTREAM: where /api/, /admin/ and /static/ are proxied (the Django container).
# NGINX_ENTRYPOINT_LOCAL_RESOLVERS: the image exposes the container's DNS server as
# NGINX_LOCAL_RESOLVERS, so the backend's name is re-resolved after a redeploy.
ENV API_UPSTREAM=http://backend:8000 \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1

COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
