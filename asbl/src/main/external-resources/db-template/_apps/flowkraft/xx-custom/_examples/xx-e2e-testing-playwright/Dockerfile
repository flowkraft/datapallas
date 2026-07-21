# The official Playwright image already contains Node.js + all three browsers
# (Chromium / Firefox / WebKit) + every OS dependency — so the host only needs Docker.
# IMPORTANT: keep this version tag identical to "@playwright/test" in package.json.
FROM mcr.microsoft.com/playwright:v1.49.1-jammy

WORKDIR /work

# Install the project's node deps into the image (cached until package.json changes).
COPY package.json package-lock.json* ./
RUN npm install

# tests/, playwright.config.ts and tsconfig.json come from the bind mount at runtime
# (see docker-compose.yml), so you can edit *.spec.ts on the host and re-run instantly.
CMD ["npx", "playwright", "test"]
