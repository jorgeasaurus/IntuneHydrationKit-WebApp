# Deploying to Vercel

## Prerequisites

1. A [Vercel account](https://vercel.com/signup)
2. A GitHub repository with this project
3. An Entra ID (Azure AD) App Registration configured for your production URL

## Step 1: Connect Your Repository

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **Import Git Repository**
3. Select your GitHub repository
4. Click **Import**

## Step 2: Configure Environment Variables

Before deploying, add the following environment variables in Vercel:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_MSAL_CLIENT_ID` | Your Entra ID App Registration Client ID |
| `NEXT_PUBLIC_MSAL_AUTHORITY` | `https://login.microsoftonline.com/common` |
| `NEXT_PUBLIC_MSAL_REDIRECT_URI` | Your Vercel URL (e.g., `https://your-app.vercel.app`) |
| `NEXT_PUBLIC_CLOUD_ENVIRONMENT` | `global` |

To add these:
1. In Vercel project settings, go to **Settings** → **Environment Variables**
2. Add each variable with the appropriate value
3. Ensure they apply to **Production**, **Preview**, and **Development**

## Step 3: Configure Entra ID App Registration

Add your Vercel URL as a redirect URI:

1. Go to [Azure Portal](https://portal.azure.com) → **App Registrations**
2. Select your app
3. Go to **Authentication** → **Platform configurations**
4. Under **Single-page application**, click **Add URI**
5. Add: `https://your-app.vercel.app`
6. Click **Save**

## Step 4: Deploy

Click **Deploy** in Vercel. The build will:
1. Install dependencies
2. Build the Next.js application
3. Deploy to Vercel's edge network

## Automatic Deployments

After initial setup, Vercel automatically deploys:
- **Production**: When you push to `main` branch
- **Preview**: When you create a pull request

## Managing Deployments

### Redeploy
1. Go to your project in Vercel dashboard
2. Click **Deployments** tab
3. Click the three dots (⋯) on a deployment
4. Select **Redeploy**

### Delete Old Deployments
1. Go to **Deployments** tab
2. Click the three dots (⋯) on the deployment
3. Select **Delete**

Or via CLI:
```bash
npm i -g vercel
vercel login
vercel rm <deployment-url>
```

### Set Deployment Retention
1. Go to **Settings** → **General**
2. Scroll to **Deployment Retention**
3. Configure how long to keep preview deployments

## Troubleshooting

### Sign-in not working
- Verify `NEXT_PUBLIC_MSAL_REDIRECT_URI` matches your Vercel URL exactly
- Ensure the redirect URI is added to your Entra ID app registration as a **Single-page application** (not Web)
- Check browser console for MSAL errors

### Environment variables not loading
- Ensure variables start with `NEXT_PUBLIC_` for client-side access
- Redeploy after adding/changing environment variables

### Build failures
- Check the build logs in Vercel dashboard
- Run `npm run build` locally to reproduce errors
