FROM node:20-alpine as frontend_build
ARG BACKEND_URL
WORKDIR /app

COPY ./package.json ./package-lock.json ./tsconfig.json ./vite.config.mts ./index.html ./tailwind.config.mjs ./postcss.config.js /app/
RUN npm install
COPY ./src /app/src
RUN npm run build

FROM nginx
COPY --from=frontend_build /app/build/ /usr/share/nginx/html
COPY /nginx.conf /etc/nginx/conf.d/default.conf
COPY start-nginx.sh /start-nginx.sh
RUN chmod +x /start-nginx.sh
ENV BACKEND_URL=$BACKEND_URL
CMD ["/start-nginx.sh"]