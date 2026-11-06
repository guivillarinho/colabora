import { IsIn, ValidateIf } from 'class-validator'

export class PreferencesDto {
  @ValidateIf((value: PreferencesDto) => value.theme !== undefined)
  @IsIn(['system', 'light', 'dark'])
  theme?: 'system' | 'light' | 'dark'

  @ValidateIf((value: PreferencesDto) => value.palette !== undefined)
  @IsIn(['purple', 'green', 'blue', 'yellow', 'red'])
  palette?: 'purple' | 'green' | 'blue' | 'yellow' | 'red'
}
