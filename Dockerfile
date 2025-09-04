# ベースイメージ
FROM node:20-alpine

# 作業ディレクトリを設定
WORKDIR /app

# プロジェクトの package.json と yarn.lock を作業ディレクトリにコピー
COPY package.json yarn.lock ./

# 依存関係をインストールし、キャッシュをクリーンアップ
RUN yarn install --frozen-lockfile --network-timeout 100000 && \
    yarn add -D wait-on && \
    yarn cache clean

# プロジェクトのソースコードを作業ディレクトリにコピー
COPY . .

# 環境変数を設定
ENV NODE_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_ENABLE_BATCH=true
ENV ENABLE_SERVER_BATCH=true

# ポート 3000 を公開
EXPOSE 3000

# 開発サーバーを直接起動
CMD ["yarn", "dev"]

# コンテナのビルド&実行コマンド
# docker build -t subtitle-translator .
# docker run -d -p 3000:3000 --name subtitle-translator subtitle-translator