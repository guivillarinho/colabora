import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common'
import type { Request } from 'express'

export const publicRoute = 'colabora:public'
export const Public = () => SetMetadata(publicRoute, true)
export const machineRoute = 'colabora:machine-route'
export const MachineRequest = () => SetMetadata(machineRoute, true)
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    return context.switchToHttp().getRequest<Request>().user
  },
)
