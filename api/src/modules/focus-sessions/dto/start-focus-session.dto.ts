import { IsOptional, IsString, MaxLength } from 'class-validator'

export class StartFocusSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string
}
