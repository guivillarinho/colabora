import { IsInt, ValidateIf, Max, Min } from 'class-validator'

export class CompleteTaskDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(10080)
  actualTime?: number
}
