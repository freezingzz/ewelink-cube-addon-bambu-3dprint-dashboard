FROM node:24-alpine@sha256:a34ab6d7f6f4813f4d0c5469d74685604b962fbdbf5793a7bc7b4998ecb867c8
ARG VERSION=0.1.0
ARG VCS_REF=unknown
LABEL org.opencontainers.image.title="Bambu 3DPrint Dashboard eWeLink Cube Add-on" \
      org.opencontainers.image.description="Read-only H2C cloud monitoring, AMS and CAST cards" \
      org.opencontainers.image.version=$VERSION \
      org.opencontainers.image.revision=$VCS_REF
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3030 DATA_DIR=/app/data DASHBOARD_MODE=setup
COPY package*.json ./
COPY LICENSE NOTICE.md ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && mkdir -p /app/data && chown node:node /app/data && chmod 700 /app/data
# Copy runtime paths explicitly; private data and development records stay outside.
COPY apps/server/src ./apps/server/src
COPY apps/web ./apps/web
COPY packages/contracts/src ./packages/contracts/src
COPY packages/cube-client/src ./packages/cube-client/src
COPY packages/printer-bambu/src ./packages/printer-bambu/src
COPY packages/printer-bambu/NOTICE.md packages/printer-bambu/UPSTREAM_LICENSE ./packages/printer-bambu/
USER node
EXPOSE 3030
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3030)+'/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "apps/server/src/index.ts"]
