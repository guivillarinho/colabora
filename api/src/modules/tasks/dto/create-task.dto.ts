import {
  ArrayMaxSize,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  IsUUID,
  ValidateIf,
  IsArray,
} from 'class-validator'

import { TaskColor } from '../task-color.enum'
import { TaskPriority } from '../task-priority.enum'

import { ReminderOptionsDto } from '../../notifications/reminder-options'

export class CreateTaskDto extends ReminderOptionsDto {
  @IsOptional()
  @IsUUID()
  assignedToId?: string | null

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title: string

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(2000)
  description?: string

  @ValidateIf((dto: CreateTaskDto) => !dto.categoryId)
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  category?: string

  @IsOptional()
  @IsUUID()
  categoryId?: string

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(TaskPriority)
  priority?: TaskPriority

  @IsEnum(TaskColor)
  color: TaskColor

  @ValidateIf((_object, value: unknown) => value != null && value !== '')
  @IsDateString()
  dueDate?: string | null

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(200)
  location?: string

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsArray()
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  @ArrayMaxSize(10)
  attachments?: string[]

  @IsInt()
  @Min(1)
  @Max(10080)
  estimatedTime: number

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  startImmediately?: boolean

  @IsOptional()
  @IsBoolean()
  syncOptOut?: boolean
}
