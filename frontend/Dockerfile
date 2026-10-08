# Next.js con SSR en AWS Lambda (contenedor + Lambda Web Adapter; requiere output: 'standalone' en next.config).
# Las NEXT_PUBLIC_* se inyectan en build por ambiente (CI): docker build --build-arg ...
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_COGNITO_USER_POOL_ID
ARG NEXT_PUBLIC_COGNITO_CLIENT_ID
ARG NEXT_PUBLIC_COGNITO_DOMAIN
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_APP_EXPOSURE=public
ARG NEXT_PUBLIC_REALTIME_ENABLED=false
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
# AWS Lambda: el Lambda Web Adapter traduce las invocaciones a HTTP hacia :3000 (fuera de Lambda no hace nada)
# y la caché de Next (next/image) va a /tmp, lo único escribible en Lambda.
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 /lambda-adapter /opt/extensions/lambda-adapter
ENV AWS_LWA_PORT=3000 AWS_LWA_READINESS_CHECK_PATH=/login
RUN ln -s /tmp /app/.next/cache
USER app
EXPOSE 3000
CMD ["node", "server.js"]
