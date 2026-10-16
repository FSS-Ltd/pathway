import { Inject, Injectable } from "@nestjs/common";
import { InstitutionalCapacityAcceptanceService } from "./institutional-capacity-acceptance.service";
import { InstitutionalCapacityQuoteService } from "./institutional-capacity-quote.service";

@Injectable()
export class InstitutionalCapacityService {
  constructor(
    @Inject(InstitutionalCapacityQuoteService)
    private readonly quotes: InstitutionalCapacityQuoteService,
    @Inject(InstitutionalCapacityAcceptanceService)
    private readonly acceptances: InstitutionalCapacityAcceptanceService,
  ) {}

  createQuote(
    ...args: Parameters<InstitutionalCapacityQuoteService["createQuote"]>
  ) {
    return this.quotes.createQuote(...args);
  }

  acceptQuote(
    ...args: Parameters<InstitutionalCapacityAcceptanceService["acceptQuote"]>
  ) {
    return this.acceptances.acceptQuote(...args);
  }
}
