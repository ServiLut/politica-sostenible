import { Type } from 'class-transformer';
import {
  IsNumber,
  IsPositive,
  Max,
  Validate,
  type ValidationArguments,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

const MAX_CAMPAIGN_AMOUNT = 9_999_999_999_999.99;

@ValidatorConstraint({ name: 'publicityWithinTotalBudget', async: false })
class PublicityWithinTotalBudgetConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as UpsertFinanceSettingsDto;
    return (
      typeof value === 'number' &&
      typeof dto.maxTotalBudget === 'number' &&
      value <= dto.maxTotalBudget
    );
  }

  defaultMessage(): string {
    return 'maxPublicityLimit no puede superar maxTotalBudget';
  }
}

export class UpsertFinanceSettingsDto {
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(MAX_CAMPAIGN_AMOUNT)
  maxTotalBudget: number;

  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(MAX_CAMPAIGN_AMOUNT)
  @Validate(PublicityWithinTotalBudgetConstraint)
  maxPublicityLimit: number;
}
