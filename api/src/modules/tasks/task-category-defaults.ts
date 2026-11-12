import { TaskColor } from './task-color.enum'

export const defaultTaskCategorySeed = [
  { name: 'Pessoal', color: TaskColor.Blue },
  { name: 'Trabalho', color: TaskColor.Red },
  { name: 'Estudos', color: TaskColor.Yellow },
  { name: 'Saúde', color: TaskColor.Green },
  { name: 'Casa', color: TaskColor.Purple },
  { name: 'Compras', color: TaskColor.Orange },
] as const
