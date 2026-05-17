FROM node:20-alpine AS base
WORKDIR /app

# Install OpenSSL and other required system deps for Prisma on Alpine
RUN apk add --no-cache openssl libc6-compat

# Install dependencies for the whole monorepo
COPY package.json package-lock.json turbo.json ./
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json ./packages/shared/
COPY packages/core/package.json ./packages/core/
COPY apps/shopify/package.json ./apps/shopify/

RUN npm install --legacy-peer-deps

# Copy source
COPY packages/ ./packages/
COPY apps/shopify/ ./apps/shopify/

# Generate Prisma client (with linux-musl binary)
WORKDIR /app/packages/database
RUN npx prisma generate

# Build the Shopify app + worker
WORKDIR /app/apps/shopify
RUN npm run build

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production

CMD ["npm", "run", "start"]

