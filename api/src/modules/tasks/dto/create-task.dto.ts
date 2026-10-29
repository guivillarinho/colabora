import { Type } from 'class-transformer'
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
} from 'class-validator'

import { TaskColor } from '../task-color.enum'
import { TaskPriority } from '../task-priority.enum'

export class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  category: string

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority

  @IsEnum(TaskColor)
  color: TaskColor

  @IsOptional()
  @IsDateString()
  dueDate?: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string

  @IsOptional()
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  @ArrayMaxSize(10)
  attachments?: string[]

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10080)
  estimatedTime: number

  @IsOptional()
  @IsBoolean()
  startImmediately?: boolean
}
