import { Module, Controller, Post, Body } from '@nestjs/common'
import { TasksModule } from '../tasks/tasks.module'
import { CurrentUser } from '../auth/auth.decorators'
import type { Identity } from '../auth/entities/user.entity'
import { AssistantService } from './assistant.service'
import { ChatDto, ConfirmDto } from './assistant.dto'
@Controller('assistant')
class AssistantController {
  constructor(private readonly assistant: AssistantService) {}
  @Post('chat') chat(@Body() dto: ChatDto, @CurrentUser() user: Identity) {
    return this.assistant.chat(dto, user.id)
  }

  @Post('confirm') confirm(
    @Body() dto: ConfirmDto,
    @CurrentUser() user: Identity,
  ) {
    return this.assistant.confirm(dto, user.id)
  }
}
@Module({
  imports: [TasksModule],
  controllers: [AssistantController],
  providers: [AssistantService],
})
export class AssistantModule {}
