FROM node:20-alpine
RUN apk add --no-cache git openssh-client python3 make g++
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist/ ./dist/
COPY prompts/ ./prompts/
COPY skills/ ./skills/
RUN mkdir -p /data/workspaces /data/audit
EXPOSE 8080
CMD ["node", "dist/index.js"]
