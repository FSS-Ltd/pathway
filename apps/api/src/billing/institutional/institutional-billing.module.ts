import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { EnrolmentsModule } from "../../enrolments/enrolments.module";
import { InstitutionalBillingController } from "./institutional-billing.controller";
import { InstitutionalCensusService } from "./institutional-census.service";
import { InstitutionalQuoteService } from "./institutional-quote.service";

@Module({
  imports: [AuthModule, EnrolmentsModule],
  controllers: [InstitutionalBillingController],
  providers: [InstitutionalQuoteService, InstitutionalCensusService],
  exports: [InstitutionalQuoteService, InstitutionalCensusService],
})
export class InstitutionalBillingModule {}
