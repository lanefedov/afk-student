interface ValidationSuccess {
  value: string;
  error: null;
}
interface ValidationFailure {
  value: null;
  error: string;
}
export type ValidationResult = ValidationSuccess | ValidationFailure;
