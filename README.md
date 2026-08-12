<p align="center">
  <img src="./public/IHTLogoClear.png" alt="Intune Hydration Kit logo" width="104" />
</p>

<h1 align="center">Intune Hydration Kit</h1>

<p align="center">
  <strong>A guided Microsoft Graph console for repeatable Intune tenant deployments.</strong>
</p>

<p align="center">
  Bootstrap best-practice configurations, preview every change, and keep clear evidence of each run.
</p>

<p align="center">
  <img alt="Global commercial cloud" src="https://img.shields.io/badge/cloud-Global%20commercial-0ea5e9?style=flat-square&logo=microsoftazure&logoColor=white" />
  <img alt="Commercial license" src="https://img.shields.io/badge/license-commercial-075985?style=flat-square" />
  <img alt="Next.js 15" src="https://img.shields.io/badge/Next.js-15-111827?style=flat-square&logo=nextdotjs" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-2563eb?style=flat-square&logo=typescript&logoColor=white" />
  <img alt="Microsoft Graph" src="https://img.shields.io/badge/Microsoft%20Graph-delegated-0ea5e9?style=flat-square&logo=microsoft" />
</p>

<p align="center">
  <a href="#why-intune-hydration-kit">Why this app</a> ·
  <a href="#getting-started">Quick start</a> ·
  <a href="#wizard-workflow">Workflow</a> ·
  <a href="#security-considerations">Security</a> ·
  <a href="#deployment">Deployment</a>
</p>

<br />

[![Current Intune Hydration Kit landing page](./NewPage.png)](./NewPage.png)

## Why Intune Hydration Kit

The web app brings the proven workflow from the [IntuneHydrationKit PowerShell module](https://github.com/jorgeasaurus/IntuneHydrationKit) to administrators who prefer a guided browser interface.

| Guided deployment | Guarded by default | Operator evidence |
| --- | --- | --- |
| A focused four-stage wizard takes you from tenant sign-in to execution. | Ownership markers, assignment checks, and disabled Conditional Access policies protect destructive operations. | Preview mode, live status, execution logs, and downloadable reports show what changed. |
| **Deployment intelligence** | **Local template catalog** | **Execution control** |
| Existing-object checks and tenant caches keep each run focused on work that can succeed. | Browse import-ready payloads and load 182+ bundled templates without a GitHub API dependency. | Pause, resume, or cancel a run while the sequential queue limits Graph throttling. |

### Coverage at a glance

| Dynamic groups | Device filters | Compliance | App protection | Conditional Access |
| ---: | ---: | ---: | ---: | ---: |
| 47 | 29 | 10 | 10 | 20 |

The web app supports Global commercial tenants. Use the PowerShell module for US Government, Germany, and China tenants.

## Built with

| Layer | Technology |
| --- | --- |
| Application | Next.js 15 App Router and TypeScript strict mode |
| Authentication | MSAL React with delegated Microsoft Graph access |
| Interface | shadcn/ui, Radix UI, Tailwind CSS, and Lucide React |
| State | React Context and local React state |
| Feedback | Sonner notifications and live task status |

## Prerequisites

- Node.js 18.17 or later
- npm 9.0 or later
- Microsoft Entra ID (Azure AD) tenant
- Entra ID app registration with required permissions

## Required Microsoft Graph API Permissions

> **Required Microsoft Graph permissions**
>
> These scopes are required to read policies, assignments, groups, filters, and related Intune objects.
>
> **Delegated permissions:**
>
> - `DeviceManagementConfiguration.ReadWrite.All`
> - `DeviceManagementServiceConfig.ReadWrite.All`
> - `DeviceManagementManagedDevices.ReadWrite.All`
> - `DeviceManagementScripts.ReadWrite.All`
> - `DeviceManagementApps.ReadWrite.All`
> - `Group.ReadWrite.All`
> - `Policy.Read.All`
> - `Policy.ReadWrite.ConditionalAccess`
> - `Application.Read.All`
> - `Directory.ReadWrite.All`
> - `LicenseAssignment.Read.All`
> - `Organization.Read.All`
>
> **Important:** Admin consent is required for these permissions.

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/jorgeasaurus/IntuneHydrationKit-WebApp.git
cd IntuneHydrationKit-WebApp
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env.local` file in the root directory:

```bash
cp .env.local.example .env.local
```

Edit `.env.local` with your values:

```env
NEXT_PUBLIC_MSAL_CLIENT_ID=your-client-id-here
NEXT_PUBLIC_MSAL_AUTHORITY=https://login.microsoftonline.com/common
NEXT_PUBLIC_MSAL_REDIRECT_URI=http://localhost:3000
NEXT_PUBLIC_CLOUD_ENVIRONMENT=global
```

### 4. Set Up Entra ID App Registration

1. Go to [Azure Portal](https://portal.azure.com) > Entra ID > App registrations
2. Create a new registration:
   - **Name**: Intune Hydration Kit Web
   - **Supported account types**: Choose appropriate option
   - **Redirect URI**: Web - `http://localhost:3000`
3. Copy the **Application (client) ID** to `NEXT_PUBLIC_MSAL_CLIENT_ID`
4. Go to **API permissions** > Add the required Graph API permissions listed above
5. Click **Grant admin consent** for your tenant

### 5. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Recent updates

### January 2026

| Area | Update |
| --- | --- |
| Wizard | Reduced the workflow to four stages and moved template loading to the local catalog. |
| App protection | Added 10 policies, PowerShell module parity, platform detection, and a 90% reduction in API requests. |
| Execution | Added duplicate-run protection, pause and resume controls, cancellation, and cache versioning. |
| Interface | Improved mobile layouts, dark mode, live task status, and application branding. |

## Available Scripts

- `npm run dev` - Start development server
- `npm run dev:turbo` - Start development server with Turbopack
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript type checking

## Project Structure

```
├── app/                      # Next.js App Router pages
│   ├── layout.tsx           # Root layout with providers
│   ├── page.tsx             # Landing page
│   ├── wizard/              # 4-step configuration wizard
│   ├── dashboard/           # Real-time execution dashboard
│   └── results/             # Execution results and reporting
├── components/
│   ├── ui/                  # shadcn/ui components
│   ├── auth/                # Authentication components
│   ├── wizard/              # Wizard step components
│   ├── dashboard/           # Dashboard components (progress, task list, controls)
│   └── providers/           # React providers
├── lib/
│   ├── auth/                # MSAL configuration
│   ├── graph/               # Graph API client & operations
│   ├── hydration/           # Task execution engine
│   ├── templates/           # Template loader (local files)
│   └── utils/               # Utility functions
├── public/
│   └── IntuneTemplates/     # 183+ bundled policy templates
├── types/                   # TypeScript type definitions
├── hooks/                   # Custom React hooks
└── templates/               # Template metadata
```

## Wizard Workflow

The application uses a focused four-stage process.

| Stage | Purpose | Result |
| ---: | --- | --- |
| **01** | **Connect** — Enter the tenant, confirm the Global commercial cloud, and sign in with Microsoft Entra ID. | A verified tenant session. |
| **02** | **Choose an operation** — Select Create, Preview, or Delete. | Explicit mutation intent. |
| **03** | **Select targets** — Choose policy categories and individual templates. | A scoped execution queue. |
| **04** | **Review and run** — Check object counts, confirm the operation, and start execution. | Live progress and a downloadable report. |

## Configuration

### Cloud Environments

The web app currently supports the following Microsoft cloud environment:

- **global** - Commercial cloud (default)

For sovereign and government clouds, use the IntuneHydrationKit PowerShell module:

- **usgov** - US Government (GCC High)
- **usgovdod** - US Government (DoD)
- **germany** - Germany cloud
- **china** - China (21Vianet)

### Operation Modes

1. **Create** - Deploy new configurations (skips existing objects)
2. **Preview** - Show what would happen without making changes
3. **Delete** - Remove configurations created by this tool (only deletes items with hydration marker)

## Security Considerations

- Access tokens are stored in `sessionStorage` (never in `localStorage`)
- All Graph API calls use HTTPS
- Content Security Policy headers configured
- No sensitive data logging
- Session timeout after 1 hour of inactivity

## Performance Optimizations

### Template Loading
- **Local Storage**: All 183+ templates load from `public/IntuneTemplates/` in <100ms
- **Session Caching**: Templates cached with automatic version invalidation
- **No Network Dependency**: No GitHub API calls during template loading

### API Efficiency
- **Pre-fetch Optimization**: App Protection operations reduced from 10 API calls to 1 (90% reduction)
- **Smart Caching**: Policies cached in execution context and synchronized after create/delete
- **Rate Limiting Protection**: 2-second delay between tasks + exponential backoff on 429 errors

### Execution Reliability
- **Duplicate Prevention**: Execution lock prevents React Strict Mode double-invocation
- **Error Recovery**: Comprehensive error handling with retry logic (max 3 attempts)
- **Graceful Degradation**: Failed tasks don't block subsequent operations

## Deployment

This application requires a platform that supports Next.js SSR/SSG and cannot be deployed to GitHub Pages.

### Recommended Platforms

1. **Vercel** (recommended)
   - Zero-configuration deployment
   - Automatic HTTPS and global CDN
   - Perfect Next.js optimization
   - Free tier available
   - Deploy: `vercel --prod`

2. **Azure Static Web Apps**
   - Microsoft ecosystem integration
   - Seamless Entra ID integration
   - Built-in authentication providers
   - Free tier available

3. **Netlify**
   - Alternative to Vercel
   - Easy deployment
   - Good Next.js support
   - Free tier available

4. **Self-Hosted (Docker)**
   - Full control
   - On-premises deployment
   - Air-gapped environments
   - Infrastructure costs only

### Quick Deploy to Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel

# Configure environment variables in Vercel Dashboard
# Deploy to production
vercel --prod
```

**Important**: After deployment, update your Entra ID app registration with the production redirect URI.

## Troubleshooting

### "No active account found" Error

Make sure you've signed in through the landing page before accessing the wizard.

### CORS Errors

Ensure your redirect URI in Entra ID matches exactly with `NEXT_PUBLIC_MSAL_REDIRECT_URI`.

### Permission Errors

Verify that:
1. All required Graph API permissions are added to your app registration
2. Admin consent has been granted
3. You're signed in with an account that has Intune Admin or Global Admin role

## Contributing

Code contributions require a separate written contributor agreement. Do not
submit a pull request unless one is in place.

## License

This software is proprietary. Evaluation is permitted only under the terms in
the [Commercial End User License Agreement](LICENSE); production and other
commercial use require a separately purchased written license.

## Related projects

- [IntuneHydrationKit PowerShell Module](https://github.com/jorgeasaurus/IntuneHydrationKit)
- [OpenIntuneBaseline](https://github.com/jorgeasaurus/OpenIntuneBaseline)

## Support

For issues and questions:
- Create an issue on GitHub
- Check the [PowerShell module documentation](https://github.com/jorgeasaurus/IntuneHydrationKit)
- Review Microsoft Graph API documentation

---

<p align="center">
  <img src="./public/IHTLogoClear.png" alt="Intune Hydration Kit" width="48" />
</p>

<p align="center">
  <strong>Guided in the browser. Scriptable in PowerShell.</strong><br />
  Power users can continue to use the PowerShell module for automation scenarios.
</p>
