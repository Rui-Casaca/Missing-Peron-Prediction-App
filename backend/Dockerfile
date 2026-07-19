FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY ../frontend/package*.json ./
RUN npm install
COPY ../frontend ./
RUN npm run build

FROM node:20-alpine
WORKDIR /usr/src/app
RUN apk add --no-cache postgresql-client
COPY backend/package*.json ./
RUN npm install --production
COPY backend .
COPY --from=frontend-build /app/build ../frontend/build

COPY backend/docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

ENTRYPOINT ["./docker-entrypoint.sh"]