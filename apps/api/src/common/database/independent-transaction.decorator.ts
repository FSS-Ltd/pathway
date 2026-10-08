import { SetMetadata } from "@nestjs/common";

export const INDEPENDENT_TRANSACTION = "pathway:independent-transaction";

/** The route establishes its own scoped transaction and atomicity boundary. */
export const IndependentTransaction = () =>
  SetMetadata(INDEPENDENT_TRANSACTION, true);
