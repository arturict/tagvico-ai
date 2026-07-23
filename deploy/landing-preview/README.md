# Tagvico 3.1 landing preview

This image serves only the standalone landing page from `docs/index.html`.
Documentation links are redirected to the currently deployed documentation
site, so this preview can be reviewed without publishing either the application
or its docs.

Build from the repository root:

```sh
docker build -f deploy/landing-preview/Dockerfile -t tagvico-landing-preview .
docker run --rm -p 4173:80 tagvico-landing-preview
```

Open <http://localhost:4173/>. The health check is available at
<http://localhost:4173/health>.
