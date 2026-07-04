import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_ROUTES = ['/login', '/register', '/forgot-password', '/reset-password', '/certificates']
const TRADER_ROUTES = ['/dashboard', '/accounts', '/trades', '/analytics', '/risk', '/reports', '/settings']
const ADMIN_ROUTES = ['/admin']
const PARTNER_ROUTES = ['/partner']

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public assets and Next internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/auth') ||
    pathname.includes('.') // static files
  ) {
    return NextResponse.next()
  }

  let response = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2])
          )
        },
      },
    }
  )

  // Get session (refreshes if needed)
  const { data: { user } } = await supabase.auth.getUser()

  const isPublicRoute = PUBLIC_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'))
  const isAdminRoute = ADMIN_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'))
  const isTraderRoute = TRADER_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'))
  const isPartnerRoute = PARTNER_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'))
  const isApiRoute = pathname.startsWith('/api/')

  // Not authenticated
  if (!user) {
    if (isPublicRoute || isApiRoute) return response
    // Redirect unauthenticated users to login
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Authenticated: get profile role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .single()

  const role = profile?.role ?? 'TRADER'
  const status = profile?.status ?? 'ACTIVE'

  // Suspended users get signed out
  if (status === 'SUSPENDED') {
    await supabase.auth.signOut()
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('error', 'suspended')
    return NextResponse.redirect(loginUrl)
  }

  const home = role === 'ADMIN' ? '/admin' : role === 'PARTNER' ? '/partner' : '/dashboard'

  // Authenticated user on public/auth route -> redirect to their home
  if (isPublicRoute) {
    return NextResponse.redirect(new URL(home, request.url))
  }

  // Partner isolation: partners may only use /partner/* pages. API routes are
  // left to their own requirePartner() guards (never redirect /api/* here, or
  // the partner's own data fetches would be bounced to an HTML page).
  if (role === 'PARTNER') {
    if (isApiRoute) return response
    if (!isPartnerRoute) return NextResponse.redirect(new URL('/partner', request.url))
    return response
  }

  // Non-partners may never enter the partner workspace.
  if (isPartnerRoute) {
    return NextResponse.redirect(new URL(home, request.url))
  }

  // Trader trying admin route -> redirect to dashboard
  if (isAdminRoute && role !== 'ADMIN') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Admin trying trader route -> redirect to admin
  if (isTraderRoute && role === 'ADMIN') {
    return NextResponse.redirect(new URL('/admin', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
