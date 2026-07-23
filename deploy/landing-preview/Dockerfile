FROM nginx:1.27-alpine

COPY docs/index.html /usr/share/nginx/html/index.html
COPY docs/favicon.ico /usr/share/nginx/html/favicon.ico

RUN printf '%s\n' \
  'server {' \
  '  listen 80 default_server;' \
  '  server_name _;' \
  '  root /usr/share/nginx/html;' \
  '  index index.html;' \
  '  location = /health { access_log off; add_header Content-Type text/plain; return 200 "ok\n"; }' \
  '  location = /docs { return 302 https://tagvico.arturf.ch/docs/; }' \
  '  location ^~ /docs/ { return 302 https://tagvico.arturf.ch$request_uri; }' \
  '  location / { try_files $uri $uri/ /index.html; }' \
  '}' \
  > /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=3s --start-period=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1/health || exit 1
