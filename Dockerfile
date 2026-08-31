# syntax=docker/dockerfile:1

# Debian-slim statt Alpine: @node-rs/argon2 und sharp bringen vorgebaute Binaries
# fuer linux-x64-gnu mit. Auf musl muessten beide erst kompiliert werden.
FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# ---------------------------------------------------------------------------
# Abhaengigkeiten — eigene Schicht, damit sie nur bei geaenderter Lockfile neu laeuft
# ---------------------------------------------------------------------------
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Die Env-Validierung laeuft schon im Build (next.config.ts). Hier stehen deshalb
# syntaktisch gueltige Platzhalter — die echten Werte kommen zur Laufzeit aus .env
# und landen bewusst NICHT im Image.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV JWT_SECRET="nur-fuer-den-build-platzhalter-mit-32-zeichen"
ENV BLOB_READ_WRITE_TOKEN="vercel_blob_rw_build_platzhalter_ohne_funktion"
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm build

# ---------------------------------------------------------------------------
# Laufzeit
# ---------------------------------------------------------------------------
FROM node:24-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Nicht als root laufen.
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

# `output: 'standalone'` legt unter .next/standalone einen fertigen Server samt der
# wirklich benoetigten Dateien aus node_modules ab (~28 MB statt ~700 MB).
# Statische Dateien traegt Next dabei nicht mit — die kommen separat.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# /admin/login rendert ohne Datenbankzugriff — taugt damit als Lebenszeichen,
# das nicht an Neon haengt.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/admin/login').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
