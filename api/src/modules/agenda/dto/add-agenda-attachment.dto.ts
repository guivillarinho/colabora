import { IsString, MaxLength } from 'class-validator'

export class AddAgendaAttachmentDto {
  @IsString()
  @MaxLength(255)
  reference: string
}
