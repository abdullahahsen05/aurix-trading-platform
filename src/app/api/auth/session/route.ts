import { jsonFail, jsonOk } from '@/lib/api/envelope'
import { getCurrentUser } from '@/lib/auth/session'

export async function GET() {
  const user = await getCurrentUser()

  if (!user) {
    return jsonFail('UNAUTHORIZED', 'Not authenticated', 401)
  }

  return jsonOk({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
  })
}
