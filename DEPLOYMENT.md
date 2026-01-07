# Deployment Guide - Intune Hydration Kit Web App

## Overview

This Next.js application is a **Single Page Application (SPA)** with client-side authentication (MSAL) and requires a hosting platform that supports:

- Server-side rendering (SSR) or static site generation (SSG)
- Environment variables
- HTTPS
- OAuth redirect handling

**❌ GitHub Pages is NOT supported** because:
- It only hosts static files
- Cannot handle MSAL OAuth redirects properly
- No support for environment variables
- No server-side capabilities

## Recommended Deployment Options

### Option 1: Vercel (Recommended) ⭐

**Best for**: Easy deployment, automatic HTTPS, excellent Next.js support

#### Steps:

1. **Install Vercel CLI**:
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Deploy**:
   ```bash
   vercel
   ```

4. **Configure Environment Variables** in Vercel Dashboard:
   - Go to your project → Settings → Environment Variables
   - Add:
     ```
     NEXT_PUBLIC_MSAL_CLIENT_ID=your-client-id
     NEXT_PUBLIC_MSAL_AUTHORITY=https://login.microsoftonline.com/common
     NEXT_PUBLIC_MSAL_REDIRECT_URI=https://your-app.vercel.app
     NEXT_PUBLIC_CLOUD_ENVIRONMENT=global
     ```

5. **Update Entra ID App Registration**:
   - Add Vercel URL to redirect URIs: `https://your-app.vercel.app`

6. **Production Deployment**:
   ```bash
   vercel --prod
   ```

#### Vercel Configuration:

Create `vercel.json`:
```json
{
  "buildCommand": "npm run build",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "framework": "nextjs",
  "regions": ["iad1"]
}
```

**Pros**:
- Zero-configuration deployment
- Automatic HTTPS
- Global CDN
- Preview deployments for PRs
- Excellent Next.js optimization

**Cons**:
- Free tier has limits (hobby projects)

**Cost**: Free for personal projects, $20/month for teams

---

### Option 2: Azure Static Web Apps ⭐

**Best for**: Microsoft ecosystem integration, compliance requirements

#### Steps:

1. **Create Azure Static Web App** in Azure Portal

2. **Connect to GitHub**:
   - Select your repository
   - Azure will auto-configure GitHub Actions

3. **Configure Build Settings**:
   - App location: `/`
   - API location: `` (leave empty)
   - Output location: `.next`

4. **Add Environment Variables** in Azure Portal:
   - Configuration → Application settings
   - Add:
     ```
     NEXT_PUBLIC_MSAL_CLIENT_ID
     NEXT_PUBLIC_MSAL_AUTHORITY
     NEXT_PUBLIC_MSAL_REDIRECT_URI
     NEXT_PUBLIC_CLOUD_ENVIRONMENT
     ```

5. **Update Entra ID App Registration**:
   - Add Azure Static Web Apps URL to redirect URIs

#### Azure GitHub Actions Workflow:

Auto-generated at `.github/workflows/azure-static-web-apps-*.yml`:
```yaml
name: Azure Static Web Apps CI/CD

on:
  push:
    branches: [main]
  pull_request:
    types: [opened, synchronize, reopened, closed]
    branches: [main]

jobs:
  build_and_deploy_job:
    runs-on: ubuntu-latest
    name: Build and Deploy Job
    steps:
      - uses: actions/checkout@v3
      - name: Build And Deploy
        uses: Azure/static-web-apps-deploy@v1
        with:
          azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN }}
          repo_token: ${{ secrets.GITHUB_TOKEN }}
          action: "upload"
          app_location: "/"
          api_location: ""
          output_location: ".next"
```

**Pros**:
- Seamless Microsoft integration
- Built-in authentication providers
- Managed certificates
- Global distribution
- Free tier available

**Cons**:
- More complex setup than Vercel

**Cost**: Free tier available, Pay-as-you-go for production

---

### Option 3: Netlify

**Best for**: Alternative to Vercel, similar features

#### Steps:

1. **Install Netlify CLI**:
   ```bash
   npm install -g netlify-cli
   ```

2. **Login**:
   ```bash
   netlify login
   ```

3. **Initialize**:
   ```bash
   netlify init
   ```

4. **Configure Build Settings**:
   - Build command: `npm run build`
   - Publish directory: `.next`

5. **Add Environment Variables** in Netlify Dashboard:
   - Site settings → Environment variables
   - Add all `NEXT_PUBLIC_*` variables

6. **Deploy**:
   ```bash
   netlify deploy --prod
   ```

#### Netlify Configuration:

Create `netlify.toml`:
```toml
[build]
  command = "npm run build"
  publish = ".next"

[build.environment]
  NODE_VERSION = "20"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

**Pros**:
- Easy deployment
- Automatic HTTPS
- Good Next.js support
- Form handling capabilities

**Cons**:
- Not as optimized for Next.js as Vercel

**Cost**: Free for personal, $19/month for teams

---

### Option 4: Self-Hosted (Docker)

**Best for**: On-premises deployment, full control, air-gapped environments

#### Dockerfile:

```dockerfile
# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

CMD ["node", "server.js"]
```

#### Docker Compose:

Create `docker-compose.yml`:
```yaml
version: '3.8'

services:
  intune-hydration-kit:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - NEXT_PUBLIC_MSAL_CLIENT_ID=${MSAL_CLIENT_ID}
      - NEXT_PUBLIC_MSAL_AUTHORITY=${MSAL_AUTHORITY}
      - NEXT_PUBLIC_MSAL_REDIRECT_URI=${MSAL_REDIRECT_URI}
      - NEXT_PUBLIC_CLOUD_ENVIRONMENT=${CLOUD_ENVIRONMENT}
    restart: unless-stopped
```

#### Deploy:

1. **Build Image**:
   ```bash
   docker build -t intune-hydration-kit .
   ```

2. **Run Container**:
   ```bash
   docker run -d \
     -p 3000:3000 \
     -e NEXT_PUBLIC_MSAL_CLIENT_ID=your-client-id \
     -e NEXT_PUBLIC_MSAL_AUTHORITY=https://login.microsoftonline.com/common \
     -e NEXT_PUBLIC_MSAL_REDIRECT_URI=https://your-domain.com \
     -e NEXT_PUBLIC_CLOUD_ENVIRONMENT=global \
     --name intune-hydration-kit \
     intune-hydration-kit
   ```

3. **Set up Reverse Proxy** (Nginx/Caddy):
   ```nginx
   server {
       listen 443 ssl http2;
       server_name your-domain.com;

       ssl_certificate /path/to/cert.pem;
       ssl_certificate_key /path/to/key.pem;

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

**Pros**:
- Full control over infrastructure
- On-premises deployment possible
- No third-party dependencies
- Air-gapped environment support

**Cons**:
- Requires server management
- Manual SSL certificate management
- Need to handle scaling
- Higher maintenance overhead

**Cost**: Infrastructure costs only

---

## Environment Variables

All deployment options require these environment variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_MSAL_CLIENT_ID` | Entra ID App Registration Client ID | `12345678-1234-1234-1234-123456789012` |
| `NEXT_PUBLIC_MSAL_AUTHORITY` | MSAL authority URL | `https://login.microsoftonline.com/common` |
| `NEXT_PUBLIC_MSAL_REDIRECT_URI` | OAuth redirect URI (must match deployment URL) | `https://your-app.vercel.app` |
| `NEXT_PUBLIC_CLOUD_ENVIRONMENT` | Microsoft cloud environment | `global`, `usgov`, `usgovdod`, `germany`, `china` |

**Note**: All variables must be prefixed with `NEXT_PUBLIC_` to be accessible in the browser.

---

## Entra ID App Registration Configuration

After deployment, update your Entra ID App Registration:

1. Go to [Azure Portal](https://portal.azure.com) → Entra ID → App registrations
2. Select your app registration
3. Go to **Authentication** → **Platform configurations** → **Web**
4. Add your deployment URL to **Redirect URIs**:
   - `https://your-app.vercel.app` (Vercel)
   - `https://your-app.azurestaticapps.net` (Azure)
   - `https://your-app.netlify.app` (Netlify)
   - `https://your-domain.com` (Self-hosted)
5. Save changes

---

## Post-Deployment Checklist

- [ ] Environment variables configured correctly
- [ ] HTTPS enabled (required for MSAL)
- [ ] Redirect URI added to Entra ID app registration
- [ ] Admin consent granted for Microsoft Graph permissions
- [ ] Test authentication flow
- [ ] Verify template loading (183+ templates)
- [ ] Test create/delete operations in test tenant
- [ ] Confirm session storage works
- [ ] Check CSP headers
- [ ] Verify dark mode toggle
- [ ] Test on multiple browsers (Chrome, Firefox, Edge, Safari)

---

## Troubleshooting

### "Redirect URI mismatch" Error

**Cause**: Deployment URL doesn't match redirect URI in Entra ID

**Solution**:
- Verify `NEXT_PUBLIC_MSAL_REDIRECT_URI` matches deployment URL exactly
- Add deployment URL to Entra ID app registration redirect URIs
- Ensure using HTTPS (not HTTP)

### "AADSTS50011: The reply URL specified in the request does not match"

**Cause**: Redirect URI case mismatch or trailing slash

**Solution**:
- Remove trailing slashes from redirect URI
- Use exact case matching
- Clear browser cache and try again

### Templates Not Loading

**Cause**: Static files not being served correctly

**Solution**:
- Verify `public/IntuneTemplates/` directory is included in build
- Check build output includes all 183 template files
- Ensure deployment platform serves static files from `public/` directory

### Environment Variables Not Working

**Cause**: Variables not prefixed with `NEXT_PUBLIC_` or not set correctly

**Solution**:
- All browser-accessible variables MUST start with `NEXT_PUBLIC_`
- Rebuild application after adding environment variables
- Verify variables are set in deployment platform settings

---

## Performance Optimization

### Vercel Configuration

Add to `next.config.ts`:
```typescript
export default {
  images: {
    domains: ['your-domain.com'],
  },
  compress: true,
  poweredByHeader: false,
};
```

### CDN Caching

Configure caching headers for static assets:
```typescript
// next.config.ts
async headers() {
  return [
    {
      source: '/IntuneTemplates/:path*',
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=31536000, immutable',
        },
      ],
    },
  ];
}
```

---

## Security Recommendations

1. **HTTPS Only**: Always use HTTPS in production (required for MSAL)
2. **Environment Variables**: Never commit `.env.local` to Git
3. **CSP Headers**: Already configured in `next.config.ts`
4. **Access Tokens**: Stored in sessionStorage (automatic cleanup on close)
5. **Content Security Policy**: Configured to only allow Microsoft domains

---

## Monitoring & Logging

### Vercel Analytics

Enable Vercel Analytics in dashboard for:
- Performance metrics
- Error tracking
- User sessions

### Azure Application Insights

For Azure deployments:
```bash
npm install @microsoft/applicationinsights-web
```

Configure in `app/layout.tsx`:
```typescript
import { ApplicationInsights } from '@microsoft/applicationinsights-web';

const appInsights = new ApplicationInsights({
  config: {
    instrumentationKey: 'your-key'
  }
});
appInsights.loadAppInsights();
```

---

## Cost Comparison

| Platform | Free Tier | Paid Tier | Best For |
|----------|-----------|-----------|----------|
| **Vercel** | 100GB bandwidth/month | $20/month team | Easy deployment, Next.js optimization |
| **Azure Static Web Apps** | 100GB bandwidth/month | Pay-as-you-go | Microsoft ecosystem, compliance |
| **Netlify** | 100GB bandwidth/month | $19/month team | Alternative to Vercel |
| **Self-Hosted** | N/A | Infrastructure cost | On-premises, full control |

---

## Deployment Timeline

| Option | Setup Time | Deployment Time | Total |
|--------|------------|-----------------|-------|
| **Vercel** | 5 minutes | 2 minutes | ~7 minutes |
| **Azure Static Web Apps** | 15 minutes | 5 minutes | ~20 minutes |
| **Netlify** | 5 minutes | 3 minutes | ~8 minutes |
| **Self-Hosted (Docker)** | 30 minutes | 10 minutes | ~40 minutes |

---

## Recommended: Vercel Deployment

For quickest deployment:

```bash
# 1. Install Vercel CLI
npm install -g vercel

# 2. Deploy
vercel

# 3. Add environment variables in Vercel Dashboard

# 4. Deploy to production
vercel --prod

# 5. Update Entra ID redirect URI
```

Done! Your application will be live at `https://your-app.vercel.app`

---

## Support

For deployment issues:
- [Vercel Documentation](https://vercel.com/docs)
- [Azure Static Web Apps Documentation](https://docs.microsoft.com/azure/static-web-apps/)
- [Netlify Documentation](https://docs.netlify.com)
- [Next.js Deployment Documentation](https://nextjs.org/docs/deployment)

---

**Last Updated**: January 7, 2026
**Application Version**: 0.1.0
