# Intune Hydration Kit - Web Application

A web-based version of the [IntuneHydrationKit PowerShell module](https://github.com/jorgeasaurus/IntuneHydrationKit) that enables IT administrators to bootstrap Microsoft Intune tenants with best-practice configurations through an intuitive browser interface.

![Intune Hydration Kit Landing Page](./LandingPage.jpeg)

## Features

- **Streamlined 4-Step Wizard**: Guided configuration process from tenant setup to execution
- **MSAL Authentication**: Secure authentication with Microsoft Entra ID
- **Cloud Support**: The web app currently supports Global (Commercial); use the PowerShell module for US Government, Germany, and China tenants
- **Local Templates**: 183+ pre-built templates bundled with the app (no external dependencies)
- **Template Catalog**: Browse every importable item and inspect the import-ready JSON payloads at `/templates`
- **Safety First**: Built-in safeguards prevent accidental deletions
- **Real-time Progress**: Live updates during policy deployment with pause/resume/cancel controls
- **Comprehensive Coverage**: Deploy 47 groups, 24 filters, 10 compliance policies, 10 app protection policies, 21 conditional access policies, and more
- **Optimized Performance**: Pre-fetch optimization reduces API calls by 90% for App Protection operations
- **Execution Control**: Pause, resume, or cancel operations mid-execution

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript (strict mode)
- **Authentication**: MSAL React (@azure/msal-react)
- **UI Components**: shadcn/ui (Radix UI + Tailwind CSS)
- **State Management**: React Context + TanStack Query
- **Styling**: Tailwind CSS with dark mode support
- **Icons**: Lucide React
- **Notifications**: Sonner

## Prerequisites

- Node.js 18.17 or later
- npm 9.0 or later
- Microsoft Entra ID (Azure AD) tenant
- Entra ID app registration with required permissions

## Required Microsoft Graph API Permissions

> **📋 Requested Microsoft Graph Permissions**
>
> These scopes are required to read policies, assignments, groups, filters, and related Intune objects.
>
> **Delegated Permissions:**
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
> **Note:** Admin consent is required for these permissions.

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

## Recent Updates

### January 2026

**Wizard Simplification**
- Reduced wizard from 5 steps to 4 by removing OpenIntuneBaseline configuration
- All templates now load instantly from local `public/IntuneTemplates/` directory
- No external GitHub API dependencies for template loading

**App Protection Policies**
- Updated to 10 App Protection policies (added 2 BYOD baseline templates)
- Implemented pre-fetch optimization reducing API calls by 90%
- Added PowerShell module parity for policy creation
- Fixed platform detection for iOS vs Android policies

**Execution Improvements**
- Added execution lock to prevent duplicate runs in React Strict Mode
- Implemented pause/resume/cancel controls
- Added success items display in results summary
- Cache versioning for automatic invalidation on template updates

**UI Enhancements**
- Added application favicon
- Improved mobile responsiveness
- Enhanced dark mode support
- Real-time task status updates

## Available Scripts

- `npm run dev` - Start development server with Turbopack
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

## Development Status

### ✅ Phase 1: Foundation (Completed)

- [x] Next.js 15 project setup with TypeScript
- [x] MSAL authentication flow
- [x] 4-step wizard with streamlined workflow
- [x] shadcn/ui component library
- [x] Graph API client wrapper with retry logic

### ✅ Phase 2: Core Hydration (Completed)

- [x] Local template system (183+ templates)
- [x] Task execution engine with queue management
- [x] Graph API service functions for all policy types
- [x] Pre-flight validation
- [x] Error handling and retry logic with exponential backoff
- [x] Real-time progress tracking

### ✅ Phase 3: UI & UX (Completed)

- [x] Real-time execution dashboard
- [x] Pause/Resume/Cancel controls
- [x] Task status indicators
- [x] Execution results and summary page
- [x] Dark mode support
- [x] Mobile-responsive design

### ✅ Phase 4: Advanced Features (Completed)

- [x] Session storage caching with version control
- [x] App Protection policy pre-fetch optimization (90% API reduction)
- [x] Duplicate execution prevention
- [x] PowerShell module parity for App Protection policies
- [x] Success items display in results
- [x] Execution lock pattern for React Strict Mode compatibility

### 📋 Phase 5: Testing & Deployment (Current)

- [x] TypeScript strict mode compliance
- [x] Build optimization
- [x] Deployment documentation (see [DEPLOYMENT.md](DEPLOYMENT.md))
- [ ] End-to-end testing
- [ ] Production deployment
- [ ] Final documentation review

## Wizard Workflow

The application guides you through a streamlined 4-step process:

### Step 1: Tenant Configuration
- Enter your Tenant ID and optional display name
- Use the Global (Commercial) cloud environment in the web app
- Authenticate with Microsoft Entra ID

### Step 2: Operation Mode
- **Create**: Deploy new configurations (skips if already exists)
- **Delete**: Remove configurations created by this tool (with safety checks)
- **Preview**: See what would be deployed without making changes

### Step 3: Target Selection
Select which policy categories to deploy:
- **Dynamic Groups** (47 items) - Device categorization groups
- **Device Filters** (24 items) - Assignment filters for targeting
- **Compliance Policies** (10 items) - Platform-specific compliance rules
- **App Protection** (10 items) - MAM policies for iOS and Android
- **Conditional Access** (21 items) - Zero Trust access policies
- **Enrollment Profiles** (3 items) - Autopilot and DEP profiles

### Step 4: Review & Confirm
- Review all selections
- View estimated object count
- Confirm understanding of tenant modifications
- Start execution

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

1. **Vercel** ⭐ (Recommended)
   - Zero-configuration deployment
   - Automatic HTTPS and global CDN
   - Perfect Next.js optimization
   - Free tier available
   - Deploy: `vercel --prod`

2. **Azure Static Web Apps** ⭐
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

**📖 See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment instructions and configuration.**

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

This project is under active development. Contributions are welcome!

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - See LICENSE file for details

## Related Projects

- [IntuneHydrationKit PowerShell Module](https://github.com/jorgeasaurus/IntuneHydrationKit)
- [OpenIntuneBaseline](https://github.com/jorgeasaurus/OpenIntuneBaseline)

## Support

For issues and questions:
- Create an issue on GitHub
- Check the [PowerShell module documentation](https://github.com/jorgeasaurus/IntuneHydrationKit)
- Review Microsoft Graph API documentation

---

**Note**: This is a web interface for the IntuneHydrationKit. Power users can continue using the PowerShell module for automation scenarios.
