import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { parseUserRole } from '@/lib/auth/rbac'
import {
  AUTH_ROUTE_PREFIXES,
  PUBLIC_ROUTE_PREFIXES,
  pathMatches,
  workspaceRedirect,
} from '@/lib/auth/routeAccess'

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

  const isAuthRoute = pathMatches(pathname, AUTH_ROUTE_PREFIXES)
  const isPublicRoute = pathMatches(pathname, PUBLIC_ROUTE_PREFIXES)
  const isApiRoute = pathname.startsWith('/api/')

  // Not authenticated
  if (!user) {
    if (isAuthRoute || isPublicRoute || isApiRoute) return response
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

  const role = parseUserRole(profile?.role)
  const status = profile?.status ?? 'ACTIVE'

  if (!role) {
    await supabase.auth.signOut()
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('error', 'profile')
    return NextResponse.redirect(loginUrl)
  }

  // Suspended users get signed out
  if (status === 'SUSPENDED') {
    await supabase.auth.signOut()
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('error', 'suspended')
    return NextResponse.redirect(loginUrl)
  }

  // API handlers perform their own secure role checks and must return JSON,
  // never an HTML redirect from Proxy.
  if (isApiRoute) return response

  const redirectTo = workspaceRedirect(role, pathname)
  if (redirectTo) return NextResponse.redirect(new URL(redirectTo, request.url))

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
