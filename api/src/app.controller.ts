import { Controller, Get } from '@nestjs/common'

import { AppService } from './app.service'
import { Public } from './modules/auth/auth.decorators'

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  @Public()
  getHealth(): { status: string } {
    return this.appService.getHealth()
  }
}
