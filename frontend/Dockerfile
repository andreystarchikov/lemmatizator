### Stage 1: Build static assets with Vite
FROM node:20.19-alpine AS build

WORKDIR /app

# Build-time API base (optional). If not provided, client will use same-origin /api
ARG VITE_API_BASE
ENV VITE_API_BASE=${VITE_API_BASE}

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

### Stage 2: Minimal static serving via Nginx
FROM nginx:alpine

ENV PORT=8080

# Install envsubst for runtime PORT templating
RUN apk add --no-cache gettext

# Copy nginx template and entrypoint
COPY nginx/default.conf.template /etc/nginx/conf.d/default.conf.template
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Copy built assets
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
CMD ["/entrypoint.sh"]


