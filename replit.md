# WhatsApp Bot Backend - Replit Setup

## Project Overview

This is a WhatsApp Bot Backend system built with Next.js 15, TypeScript, and Tailwind CSS. It provides a complete integration with the WhatsApp Business API, allowing you to send and receive messages, manage contacts, and view message history through a web dashboard.

## Current State

**Status**: Fully configured and running on Replit with admin authentication
**Last Updated**: November 26, 2025

The application is now set up and running with:
- Next.js 15 with Turbopack for faster development
- TypeScript for type safety
- Tailwind CSS v4 for styling
- shadcn/ui components for the UI
- WhatsApp Business API integration
- Supabase integration for authentication and storage
- Admin panel with real-time messaging and authentication

## Recent Changes

### November 26, 2025 - Admin Panel with Authentication & Real-time Updates
- Created admin login page with Supabase authentication (`/admin/login`)
- Built interactive admin conversations panel with WhatsApp-style UI (`/admin/conversas`)
- Implemented real-time message polling (every 5 seconds) to see new messages
- Added `/api/admin/messages` endpoint for incremental message fetching
- Added `/api/admin/send-reply` endpoint for admins to respond to customers
- Admin panel requires authentication - redirects unauthorized users to login
- Messages display in chronological order with auto-scroll to latest
- Admin can respond to customer messages directly from the panel
- All responses are saved to Supabase and sent via WhatsApp API

### Earlier - Product Cache & Cart System
- Installed all npm dependencies with `--legacy-peer-deps` flag to resolve React 19 peer dependency conflicts
- Configured Next.js to run on port 5000 (required for Replit)
- Updated dev server to bind to 0.0.0.0 for external access
- Added Cache-Control headers to prevent caching issues in Replit's iframe preview
- System of cache de produtos implementado com tabela `product_cache` no Supabase
- Função `addItemToCart` aprimorada com fallback: busca no cache primeiro, depois na API Flask
- Painel administrativo reformulado com interface estilo WhatsApp
- Carrinho funcionando completamente: adiciona produtos, exibe total formatado, permite finalização

## Project Architecture

### Technology Stack
- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **UI Components**: shadcn/ui (Radix UI primitives)
- **Icons**: Lucide React
- **Forms**: React Hook Form with Zod validation
- **Notifications**: Sonner (toast notifications)
- **Database**: Supabase (PostgreSQL)
- **AI Integration**: Google Gemini API
- **Authentication**: Supabase Auth

### Project Structure
```
src/
├── app/                          # Next.js App Router
│   ├── api/                     # API routes
│   │   ├── whatsapp/           # WhatsApp API endpoints
│   │   │   ├── webhook/        # Receives messages from WhatsApp
│   │   │   ├── send/           # Sends messages
│   │   │   └── test/           # Tests connection
│   │   └── admin/              # Admin API endpoints
│   │       ├── messages/       # Fetch messages for polling
│   │       └── send-reply/     # Send admin replies
│   ├── admin/                   # Admin pages
│   │   ├── login/              # Admin login page
│   │   └── conversas/          # Conversations dashboard
│   ├── page.tsx                # Main chatbot page
│   └── layout.tsx              # Root layout
├── components/                  # React components
│   ├── ui/                     # shadcn/ui components
│   └── whatsapp/              # WhatsApp-specific components
├── lib/                        # Utility functions
│   ├── services/              # Business logic services
│   ├── whatsapp-api.ts       # WhatsApp API client
│   └── whatsapp-storage.ts   # Local storage management
└── types/                     # TypeScript type definitions
```

### Key Features
- **Webhook Integration**: Receives messages from WhatsApp Business API
- **Send Messages**: Support for text, images, videos, audio, and documents
- **Real-time Dashboard**: Statistics and message history
- **Admin Panel**: Manage conversations and respond to customers
- **Contact Management**: List of contacts with unread message counts
- **Configuration Panel**: Manage API credentials
- **Dark/Light Mode**: Theme toggle support
- **Responsive Design**: Works on desktop and mobile
- **Admin Authentication**: Secure login for support team

## Environment Configuration

### Required Environment Variables

The application requires several environment variables to function. Create a `.env.local` file with:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# WhatsApp Configuration
WHATSAPP_WEBHOOK_VERIFY_TOKEN=your_verification_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_ACCESS_TOKEN=your_access_token

# AI Integration
GEMINI_API_KEY=your_gemini_api_key

# Security
CLIENT_DB_PASSWORD_ENCRYPTION_KEY=your_encryption_key
ENCRYPTION_KEY=your_encryption_key
```

See `.env.example` for a complete list of available environment variables.

## Admin Panel Usage

### Accessing the Admin Panel
```
https://chatbotfuncionando.vercel.app/admin/conversas
```

### Authentication
- Admin panel requires Supabase authentication
- UID: `7bd09d46-158d-4fd3-85ac-5267d4c05abe`
- Redirects to `/admin/login` if not authenticated
- Session stored in `sessionStorage` with automatic expiration on browser close

### How It Works
1. Navigate to `/admin/login` and sign in with Supabase credentials
2. After successful authentication, you're redirected to `/admin/conversas`
3. View all customer conversations in the left sidebar (sorted by most recent)
4. Click on a conversation to view message history
5. Type in the message field and click 📤 to respond
6. Messages update automatically every 5 seconds (no manual refresh needed)
7. Click 🔄 to manually refresh or 🚪 to logout

## Development Workflow

### Running the Application
The application is configured to run automatically via the "Next.js Dev Server" workflow, which:
- Runs `npm run dev`
- Starts Next.js on port 5000
- Uses Turbopack for fast refresh
- Binds to 0.0.0.0 for Replit access

### Making Changes
1. Edit files in the `src/` directory
2. Changes are automatically reflected due to hot module replacement
3. Check the workflow logs for any errors

### Dependencies Installation
Dependencies were successfully installed with:
```bash
npm install --legacy-peer-deps
```

### Deployment Configuration
The application is configured for autoscale deployment with:
- **Build command**: `npm run build`
- **Start command**: `npm run start` (runs on 0.0.0.0:5000)
- **Deployment target**: Autoscale (stateless, scales with traffic)

### API Endpoints

All API routes are in `src/app/api/`:

- `GET /api/whatsapp/webhook` - Webhook verification
- `POST /api/whatsapp/webhook` - Receive messages
- `POST /api/whatsapp/send` - Send messages
- `POST /api/whatsapp/test` - Test connection
- `GET /api/admin/messages` - Fetch messages with polling support
- `POST /api/admin/send-reply` - Send admin reply to customer

## User Preferences

No specific user preferences have been set yet.

## Known Issues

### React 19 Peer Dependency Warning
- `react-day-picker@8.10.1` expects React 18, but the project uses React 19
- Resolved by installing with `--legacy-peer-deps`
- The application functions correctly despite this warning
- Consider updating to a React 19 compatible date picker in the future

### Deprecated Packages
The following packages show deprecation warnings but are still functional:
- `@supabase/auth-helpers-*` packages (should migrate to `@supabase/ssr`)
- `eslint@8.57.0` (EOL, should upgrade to v9+)

### Supabase Configuration (Optional)
The application now gracefully handles missing Supabase environment variables:
- If `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are not set, the SupabaseClientProvider will simply pass through the children without wrapping them in SessionContextProvider
- This allows the core chatbot functionality to work without Supabase
- To use Supabase features (authentication, database), add the required environment variables in the Secrets tab
- The application will automatically detect and enable Supabase functionality when the variables are present

## Next Steps

To fully configure the application:
1. Add your environment variables in the Secrets tab
2. Configure WhatsApp Business API webhook URL to point to your Replit URL
3. Test the webhook connection
4. Use the admin panel to manage customer conversations
5. Deploy to production when ready

## Documentation

For more detailed information, see:
- `README.md` - Main project documentation
- `GUIA_COMPLETO.md` - Complete setup guide (Portuguese)
- `README_WEBHOOK_SETUP.md` - Webhook configuration
- `README_WHATSAPP.md` - WhatsApp API documentation
