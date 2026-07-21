import { VERTICAL_OPTIONS, type Vertical } from "@pathway/types";
import {
  SelectionCard,
  SelectionCardGroup,
} from "../../../components/configurator/selection-card";
import { verticalsForOrgType, type OrgType } from "../state";

type VerticalStepProps = {
  orgType: OrgType;
  vertical: Vertical | null;
  onSelect: (vertical: Vertical) => void;
};

export function VerticalStep({
  orgType,
  vertical,
  onSelect,
}: VerticalStepProps) {
  const options = VERTICAL_OPTIONS.filter(({ value }) =>
    verticalsForOrgType(orgType).includes(value),
  );

  return (
    <section aria-labelledby="configurator-step-title" className="space-y-5">
      <div className="space-y-2">
        <h2
          id="configurator-step-title"
          className="font-heading text-2xl font-bold text-text-primary"
        >
          Which setting best describes your school?
        </h2>
        <p className="text-text-muted">
          Choose the setting that most closely matches your daily work.
        </p>
      </div>
      <SelectionCardGroup className="grid gap-3">
        {options.map((option) => (
          <SelectionCard
            key={option.value}
            isSelected={vertical === option.value}
            onClick={() => onSelect(option.value)}
          >
            <span className="font-semibold text-text-primary">
              {option.label}
            </span>
          </SelectionCard>
        ))}
      </SelectionCardGroup>
    </section>
  );
}
