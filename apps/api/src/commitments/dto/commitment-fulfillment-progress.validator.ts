import {
  type ValidationArguments,
  type ValidationOptions,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { CommitmentStatus } from '../../../prisma/generated/prisma';

interface CommitmentProgressPayload {
  progress?: number;
}

@ValidatorConstraint({
  name: 'commitmentFulfillmentProgress',
  async: false,
})
export class CommitmentFulfillmentProgressConstraint implements ValidatorConstraintInterface {
  validate(status: unknown, args: ValidationArguments): boolean {
    if (status !== CommitmentStatus.FULFILLED) return true;

    const requireExplicitProgress = args.constraints[0] === true;
    const { progress } = args.object as CommitmentProgressPayload;
    return (
      progress === 100 || (!requireExplicitProgress && progress === undefined)
    );
  }

  defaultMessage(): string {
    return 'El avance debe ser 100 para marcar el compromiso como cumplido';
  }
}

export function IsCommitmentFulfillmentProgressValid(
  requireExplicitProgress: boolean,
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return Validate(
    CommitmentFulfillmentProgressConstraint,
    [requireExplicitProgress],
    validationOptions,
  );
}
