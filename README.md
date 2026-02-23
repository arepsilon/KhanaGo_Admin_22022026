# 💼 Admin Dashboard

Web application for platform administrators to manage the food delivery ecosystem.

## Setup

```bash
cd admin-dashboard
npm install

# Create .env.local file (see env-template.txt)
cp env-template.txt .env.local
# Edit .env.local with your Supabase credentials

npm run dev
```

Visit `http://localhost:3000`

## Features

- **Authentication**: Admin login with role verification
- **Dashboard**: Platform overview with key metrics
- **Real-time Orders**: Monitor all orders with live updates
- **User Management**: View and manage customers, riders, restaurant owners
- **Restaurant Management**: Approve/reject restaurants, view details
- **Analytics**: Platform statistics and insights

## Key Pages

- `/` - Root redirect
- `/login` - Admin authentication
- `/dashboard` - Main dashboard with stats
- `/dashboard/orders` - Order management
- `/dashboard/restaurants` - Restaurant management
- `/dashboard/users` - User management
- `/dashboard/riders` - Rider management

## Environment Variables

See `env-template.txt` for required variables:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Creating an Admin User

After signing up through the customer app, run this SQL in Supabase:

```sql
UPDATE profiles 
SET role = 'admin' 
WHERE email = 'your-admin-email@example.com';
```

## Deployment

```bash
npm run build
# Deploy to Vercel or any hosting platform
```

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Supabase (Database + Auth + Real-time)
- Recharts (Analytics charts)
