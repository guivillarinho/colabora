import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

export const PRODUCTIVITY_ADVICE =
  'Considere dividir esta tarefa em partes menores da próxima vez.'

export function buildProductivityAdvice(
  estimatedTime: number,
  actualTime: number,
  marginPercent: number,
): string | null {
  const margin = Number.isFinite(marginPercent) ? marginPercent : 20
  const withinMargin = actualTime * 100 <= estimatedTime * (100 + margin)

  if (withinMargin) {
    return null
  }

  return PRODUCTIVITY_ADVICE
}

@Injectable()
export class ProductivityAdvisorService {
  constructor(private readonly config: ConfigService) {}

  advise(estimatedTime: number, actualTime: number): string | null {
    const margin = Number(
      this.config.get<string>('PRODUCTIVITY_MARGIN_PERCENT', '20'),
    )

    return buildProductivityAdvice(estimatedTime, actualTime, margin)
  }
}
