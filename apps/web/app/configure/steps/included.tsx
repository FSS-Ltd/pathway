import { VERTICAL_LABELS, type Vertical } from "@pathway/types";
import { VERTICAL_FEATURES } from "../../../lib/module-catalog";

type IncludedStepProps = {
  vertical: Vertical;
};

export function IncludedStep({ vertical }: IncludedStepProps) {
  return (
    <section aria-labelledby="configurator-step-title" className="space-y-5">
      <div className="space-y-2">
        <h2
          id="configurator-step-title"
          className="font-heading text-2xl font-bold text-text-primary"
        >
          Built for {VERTICAL_LABELS[vertical]}
        </h2>
        <p className="text-text-muted">
          Every Nexsteps workspace starts with these essential capabilities.
        </p>
      </div>
      <ul
        className="space-y-3 rounded-xl border border-border-subtle bg-surface p-5"
        aria-label="Included capabilities"
      >
        {VERTICAL_FEATURES[vertical].map((feature) => (
          <li key={feature} className="flex gap-3 text-text-primary">
            <span aria-hidden="true" className="text-accent-strong">
              ✓
            </span>
            {feature}
          </li>
        ))}
      </ul>
    </section>
  );
}
