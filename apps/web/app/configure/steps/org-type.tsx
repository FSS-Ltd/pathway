import {
  SelectionCard,
  SelectionCardGroup,
} from "../../../components/configurator/selection-card";
import type { OrgType } from "../state";

type OrgTypeStepProps = {
  orgType: OrgType | null;
  onSelect: (orgType: OrgType) => void;
};

const ORG_TYPE_LABELS: Record<OrgType, string> = {
  SCHOOL: "School",
  CHURCH: "Church",
  CHARITY: "Charity",
  CLUB: "Club",
  NURSERY: "Nursery",
};

export function OrgTypeStep({ orgType, onSelect }: OrgTypeStepProps) {
  return (
    <section aria-labelledby="configurator-step-title" className="space-y-5">
      <div className="space-y-2">
        <h2
          id="configurator-step-title"
          className="font-heading text-2xl font-bold text-text-primary"
        >
          What type of organisation are you?
        </h2>
        <p className="text-text-muted">
          We will tailor the workspace around how your organisation works.
        </p>
      </div>
      <SelectionCardGroup className="grid gap-3 sm:grid-cols-2">
        {(Object.keys(ORG_TYPE_LABELS) as OrgType[]).map((type) => (
          <SelectionCard
            key={type}
            isSelected={orgType === type}
            onClick={() => onSelect(type)}
          >
            <span className="font-semibold text-text-primary">
              {ORG_TYPE_LABELS[type]}
            </span>
          </SelectionCard>
        ))}
      </SelectionCardGroup>
    </section>
  );
}
