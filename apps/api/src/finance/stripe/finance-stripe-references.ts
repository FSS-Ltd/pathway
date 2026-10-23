import { z } from "zod";

// Stripe uses py_ for non-card Charge objects, including the exercised Bacs path.
export const stripeChargeIdSchema = z
  .string()
  .max(255)
  .regex(/^(?:ch|py)_[A-Za-z0-9_]+$/);
