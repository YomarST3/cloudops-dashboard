# ─── Build ────────────────────────────────────────────────────────────────────
# Node 22.18+ es necesario: ejecuta los handlers de api/*.ts de forma nativa
# (type stripping). Por eso la imagen de build usa la serie 24.
FROM node:24-alpine AS build

WORKDIR /app

# Primero los manifiestos: si no cambian, la capa de dependencias se reutiliza.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite incrusta las variables VITE_* en tiempo de build.
# Para producción se pasan como --build-arg, no dejarlas en la imagen.
ARG VITE_SUPABASE_URL=""
ARG VITE_SUPABASE_PUBLISHABLE_KEY=""
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY

RUN npm run build

# ─── Runtime ──────────────────────────────────────────────────────────────────
FROM node:24-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Solo lo necesario en produccion: dist/, api/ y el servidor.
COPY --from=build /app/dist ./dist
COPY --from=build /app/api ./api
COPY --from=build /app/server.mjs ./server.mjs
COPY --from=build /app/package.json ./package.json

# api/aws-pricing.ts importa este snapshot como fallback cuando la Price List
# API no responde. Si falta, ese endpoint devuelve 500.
COPY --from=build /app/src/data/awsPriceSnapshot.json ./src/data/awsPriceSnapshot.json

# El servidor usa solo modulos nativos de Node: no hace falta node_modules.
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]