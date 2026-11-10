FROM node:24-bookworm-slim
WORKDIR /app
COPY local ./local
COPY lib ./lib
COPY selfhost/public ./selfhost/public
ENV NODE_ENV=production DEMO_MODE=false HOST=0.0.0.0 PORT=4310 DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 4310
USER node
CMD ["node", "local/server.mjs"]
