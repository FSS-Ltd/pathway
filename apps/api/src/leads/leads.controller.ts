import {
  Controller,
  Post,
  Body,
  BadRequestException,
  HttpCode,
  HttpStatus,
  Inject,
} from "@nestjs/common";
import { LeadsService } from "./leads.service";
import {
  createDemoLeadDto,
  createHomeschoolLeadDto,
  createToolkitLeadDto,
  createTrialLeadDto,
  createReadinessLeadDto,
  createTeamTrackerLeadDto,
  unsubscribeTeamTrackerDto,
  type CreateDemoLeadDto,
  type CreateHomeschoolLeadDto,
  type CreateToolkitLeadDto,
  type CreateTrialLeadDto,
  type CreateReadinessLeadDto,
  type CreateTeamTrackerLeadDto,
  type UnsubscribeTeamTrackerDto,
} from "./dto/create-lead.dto";
import {
  redeemToolkitTokenDto,
  type RedeemToolkitTokenDto,
} from "./dto/redeem-toolkit-token.dto";

@Controller("leads")
export class LeadsController {
  constructor(@Inject(LeadsService) private readonly leadsService: LeadsService) {}

  @Post("demo")
  @HttpCode(HttpStatus.OK)
  async createDemoLead(@Body() dto: CreateDemoLeadDto) {
    const parsed = createDemoLeadDto.safeParse(dto);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors);
    }

    const lead = await this.leadsService.createDemoLead(parsed.data);
    return { success: true, id: lead.id };
  }

  @Post("toolkit")
  @HttpCode(HttpStatus.OK)
  async createToolkitLead(@Body() dto: CreateToolkitLeadDto) {
    const parsed = createToolkitLeadDto.safeParse(dto);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors);
    }

    await this.leadsService.createToolkitLead(parsed.data);
    return { success: true, message: "Check your email for the download link." };
  }

  @Post("toolkit/redeem-token")
  @HttpCode(HttpStatus.OK)
  async redeemToolkitToken(@Body() dto: RedeemToolkitTokenDto) {
    const parsed = redeemToolkitTokenDto.safeParse(dto);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors);
    }

    const result = await this.leadsService.redeemToolkitToken(parsed.data.token);
    return result;
  }

  @Post("team-tracker")
  @HttpCode(HttpStatus.OK)
  async createTeamTrackerLead(@Body() dto: CreateTeamTrackerLeadDto) {
    const parsed = createTeamTrackerLeadDto.safeParse(dto);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors);
    }

    return this.leadsService.createTeamTrackerLead(parsed.data);
  }

  @Post("team-tracker/unsubscribe")
  @HttpCode(HttpStatus.OK)
  async unsubscribeTeamTracker(@Body() dto: UnsubscribeTeamTrackerDto) {
    const parsed = unsubscribeTeamTrackerDto.safeParse(dto);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors);
    }

    await this.leadsService.unsubscribeTeamTracker(parsed.data.token);
    return { success: true };
  }

  @Post("trial")
  @HttpCode(HttpStatus.OK)
  async createTrialLead(@Body() dto: CreateTrialLeadDto) {
    const parsed = createTrialLeadDto.safeParse(dto);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors);
    }

    const lead = await this.leadsService.createTrialLead(parsed.data);
    return { success: true, id: lead.id };
  }

  @Post("homeschool")
  @HttpCode(HttpStatus.OK)
  async createHomeschoolLead(@Body() dto: CreateHomeschoolLeadDto) {
    const parsed = createHomeschoolLeadDto.safeParse(dto);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors);
    }

    const lead = await this.leadsService.createHomeschoolLead(parsed.data);
    return { success: true, id: lead.id };
  }

  @Post("readiness")
  @HttpCode(HttpStatus.OK)
  async createReadinessLead(@Body() dto: CreateReadinessLeadDto) {
    const parsed = createReadinessLeadDto.safeParse(dto);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors);
    }

    const lead = await this.leadsService.createReadinessLead(parsed.data);
    return { success: true, id: lead.id };
  }
}
