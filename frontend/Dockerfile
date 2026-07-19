FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm install
COPY frontend ./
RUN npm run build

FROM node:20-alpine
WORKDIR /usr/src/app
COPY frontend/package*.json ./**
RUN npm install --production
COPY . .
COPY --from=frontend-build /app/build ../frontend/build

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

ENTRYPOINT ["./docker-entrypoint.sh"]