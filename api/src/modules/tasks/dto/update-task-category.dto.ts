import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator'

import { TaskColor } from '../task-color.enum'

export class UpdateTaskCategoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  name?: string

  @IsOptional()
  @IsEnum(TaskColor)
  color?: TaskColor
}
