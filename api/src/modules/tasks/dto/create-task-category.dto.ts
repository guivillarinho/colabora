import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator'

import { TaskColor } from '../task-color.enum'

export class CreateTaskCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  name: string

  @IsEnum(TaskColor)
  color: TaskColor
}
