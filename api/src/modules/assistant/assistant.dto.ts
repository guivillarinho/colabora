import {
  IsBoolean,
  Equals,
  IsString,
  MaxLength,
  IsUUID,
  IsDateString,
  IsEnum,
  IsInt,
  Min,
  Max,
} from 'class-validator'
import { CreateTaskDto } from '../tasks/dto/create-task.dto'
export class ChatDto {
  @IsString() @MaxLength(6000) message: string
  @IsString() @MaxLength(80) timezone: string
  @IsBoolean() @Equals(true) consent: boolean
}
export class ConfirmDto extends CreateTaskDto {
  @IsUUID() requestId: string
  @IsDateString() declare dueDate: string
  @IsBoolean() @Equals(true) confirmed: boolean
}
export class Proposal {
  @IsString() @MaxLength(1000) reply: string
  @IsString() @MaxLength(120) title: string
  @IsString() @MaxLength(2000) description: string
  @IsString() @MaxLength(50) dueDate: string
  @IsEnum(['low', 'medium', 'high']) priority: string
  @IsInt() @Min(1) @Max(10080) estimatedTime: number
}
