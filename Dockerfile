FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install --production && npm cache clean --force
COPY . .
RUN npm run build
