# The hosted copy (unit 11.2): the Lab server in public mode. See docs/deploy.md.
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends curl git ca-certificates && rm -rf /var/lib/apt/lists/*
# Foundry, for `forge build`: the server reads each contract's ABI from contracts/out.
RUN curl -L https://foundry.paradigm.xyz | bash && /root/.foundry/bin/foundryup
ENV PATH="/root/.foundry/bin:${PATH}"

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN forge build --root contracts

# Keys and tokens come from the host's variables, never from the image (.env is not copied).
ENV PUBLIC_MODE=1 DATA_DIR=/data PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD curl -fs "http://localhost:${PORT}/health" || exit 1
CMD ["node_modules/.bin/tsx", "src/server/index.ts"]
