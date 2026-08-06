# syntax=docker/dockerfile:1

# ---- deps : installe les dépendances une seule fois -------------------------
FROM node:22-alpine AS deps
WORKDIR /app
# Next.js s'appuie sur des binaires liés à la glibc : sur Alpine (musl), cette
# compatibilité doit être ajoutée explicitement.
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder : compile l'app ------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- runner : image finale, sans sources ni toolchain -----------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# L'app tourne sans privilèges : si quelque chose sort du conteneur, ce n'est
# pas root qui sort avec.
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# `standalone` embarque déjà les node_modules nécessaires ; static et public
# sont copiés à côté car le serveur les sert depuis le disque.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# public/ doit exister dans le dépôt (voir public/.gitkeep) : git ne suivant pas
# les dossiers vides, son absence ferait échouer cette copie.
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Les fichiers de migration sont lus au démarrage par src/instrumentation.ts.
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle

# Les médias sont montés ici par docker compose. Le dossier doit exister et
# appartenir à l'utilisateur applicatif, sinon le premier import échoue.
RUN mkdir -p /data/assets && chown -R nextjs:nodejs /data

USER nextjs
EXPOSE 3000

# Sonde interne : docker compose sait si l'app répond vraiment, pas seulement
# si le process est vivant.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
