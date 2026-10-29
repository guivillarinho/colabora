import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'

import {
  PRODUCTIVITY_ADVICE,
  ProductivityAdvisorService,
  buildProductivityAdvice,
} from './productivity-advisor.service'

describe('buildProductivityAdvice', () => {
  it('returns null when the actual time stays within the margin', () => {
    expect(buildProductivityAdvice(60, 72, 20)).toBeNull()
  })

  it('returns advice when the actual time exceeds the margin', () => {
    expect(buildProductivityAdvice(60, 73, 20)).toBe(PRODUCTIVITY_ADVICE)
  })
})

describe('ProductivityAdvisorService', () => {
  it('reads the margin from configuration', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ProductivityAdvisorService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('10'),
          },
        },
      ],
    }).compile()

    const service = moduleRef.get(ProductivityAdvisorService)

    expect(service.advise(100, 110)).toBeNull()
    expect(service.advise(100, 111)).toBe(PRODUCTIVITY_ADVICE)
  })
})
