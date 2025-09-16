FROM node:20.19-alpine

WORKDIR /app

ARG VITE_API_BASE
ENV VITE_API_BASE=${VITE_API_BASE}

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV PORT=8080
EXPOSE 8080
CMD ["npm", "start"]


