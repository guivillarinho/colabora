import type { ReactNode } from 'react'
import { render } from '@testing-library/react'
import { AuthContext } from '@/features/auth/auth-context'

export const testUser = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Guilherme',
  email: 'fixture@example.test',
}
export const taskAccess = {
  createdById: testUser.id,
  assignedToId: testUser.id,
  createdBy: { id: testUser.id, name: testUser.name },
  assignedTo: { id: testUser.id, name: testUser.name },
  permissions: { edit: true, assign: true, delete: true, changeStatus: true },
}
export function TestAuth({ children }: { children: ReactNode }) {
  return (
    <AuthContext.Provider
      value={{
        user: testUser,
        checking: false,
        expired: false,
        login: async () => undefined,
        register: async () => undefined,
        logout: async () => undefined,
        updateUser: () => undefined,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
export function renderAuthenticated(ui: ReactNode) {
  return render(ui, { wrapper: TestAuth })
}
