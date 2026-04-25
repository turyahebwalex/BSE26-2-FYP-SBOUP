FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

# Patient npm config so slow / flaky networks (e.g. campus Wi-Fi) don't fail
# the build with ETIMEDOUT halfway through. Then `npm ci` for a deterministic
# install from the lockfile, with retries baked into the same RUN so each
# attempt benefits from the same image cache layer.
RUN npm config set fetch-retries 5 \
 && npm config set fetch-retry-mintimeout 20000 \
 && npm config set fetch-retry-maxtimeout 600000 \
 && npm config set fetch-timeout 600000 \
 && (npm ci --no-audit --no-fund --prefer-offline \
     || npm ci --no-audit --no-fund --prefer-offline \
     || npm ci --no-audit --no-fund)

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
