import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator'

export class GooglePreferencesDto {
  @IsBoolean()
  autoSync: boolean

  @IsBoolean()
  inboundEnabled: boolean

  @IsString()
  @MaxLength(256)
  defaultCalendarId: string

  @IsObject()
  categoryTaskListMap: Record<string, string>

  @IsOptional()
  @IsBoolean()
  renewWatch?: boolean
}
