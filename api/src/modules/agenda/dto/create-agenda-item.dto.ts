import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator'

import { ReminderOptionsDto } from '../../notifications/reminder-options'

export class CreateAgendaItemDto extends ReminderOptionsDto {
  @IsString()
  @MaxLength(120)
  title: string

  @IsIn(['event', 'project'])
  type: 'event' | 'project'

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string

  @IsDateString()
  startDate: string

  @IsDateString()
  endDate: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  attachments?: string[]

  @IsOptional()
  @IsString()
  @MaxLength(32)
  icon?: string

  @IsOptional()
  @IsBoolean()
  syncOptOut?: boolean
}
