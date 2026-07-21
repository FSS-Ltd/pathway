"use client";

import { useReducer } from "react";
import {
  ConfiguratorStepper,
  type ConfiguratorProgressStep,
} from "../../components/configurator/stepper";
import {
  firstIncompleteStep,
  INITIAL_CONFIGURATOR_STATE,
  nextStep,
  prevStep,
  progressStepsForOrgType,
  type ConfiguratorState,
  type ConfiguratorStep,
} from "./state";

type NavigationAction = { type: "next" } | { type: "back" };

type StepContent = {
  title: string;
  description: string;
};

const STEP_CONTENT: Record<ConfiguratorStep, StepContent> = {
  "org-type": {
    title: "Choose your organisation type",
    description:
      "Organisation options will be available here in the next stage.",
  },
  vertical: {
    title: "Choose your organisation",
    description: "Select the school type that best describes your setting.",
  },
  included: {
    title: "Start with what is included",
    description:
      "Your core Pathway workspace is ready to shape around your team.",
  },
  modules: {
    title: "Add optional modules",
    description: "Module choices will be available here in the next stage.",
  },
  plan: {
    title: "Choose a plan",
    description: "Plan choices will be available here in the next stage.",
  },
  storage: {
    title: "Choose storage",
    description: "Storage options will be available here in the next stage.",
  },
  summary: {
    title: "Review your configuration",
    description: "Your completed configuration will be ready to review here.",
  },
};

const STEP_LABELS: Record<ConfiguratorStep, string> = {
  "org-type": "Organisation",
  vertical: "Setting",
  included: "Included",
  modules: "Modules",
  plan: "Plan",
  storage: "Storage",
  summary: "Summary",
};

function configuratorReducer(
  state: ConfiguratorState,
  action: NavigationAction,
): ConfiguratorState {
  return action.type === "next" ? nextStep(state) : prevStep(state);
}

function isContinueDisabled(
  state: ConfiguratorState,
  currentStep: ConfiguratorStep,
): boolean {
  if (currentStep === "summary") return true;
  if (currentStep === "org-type") return !state.orgType;
  if (currentStep === "vertical") return !state.vertical;
  if (currentStep === "plan") return !state.planCode;

  return false;
}

export default function ConfigurePage() {
  const [state, dispatch] = useReducer(
    configuratorReducer,
    INITIAL_CONFIGURATOR_STATE,
  );
  const currentStep = firstIncompleteStep(state);
  const progressSteps: ConfiguratorProgressStep[] = progressStepsForOrgType(
    state.orgType,
  ).map((step) => ({ id: step, label: STEP_LABELS[step] }));
  const content = STEP_CONTENT[currentStep];

  return (
    <main className="bg-shell py-10 sm:py-14">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr),minmax(400px,44%)] lg:px-8">
        <section className="max-w-xl space-y-8">
          <header className="space-y-3">
            <p className="text-sm font-semibold text-accent-strong">
              Configure Pathway
            </p>
            <h1 className="font-heading text-3xl font-bold text-text-primary sm:text-4xl">
              Build the right workspace for your organisation.
            </h1>
          </header>

          <ConfiguratorStepper
            steps={progressSteps}
            currentStep={currentStep}
            onBack={() => dispatch({ type: "back" })}
            onContinue={() => dispatch({ type: "next" })}
            isBackDisabled={currentStep === "org-type"}
            isContinueDisabled={isContinueDisabled(state, currentStep)}
          />

          <section
            aria-labelledby="configurator-step-title"
            className="space-y-3"
          >
            <h2
              id="configurator-step-title"
              className="font-heading text-2xl font-bold text-text-primary"
            >
              {content.title}
            </h2>
            <p className="text-text-muted">{content.description}</p>
          </section>
        </section>

        <aside className="sticky top-24 h-fit rounded-2xl bg-muted p-6 shadow-card sm:p-8">
          <h2 className="font-heading text-xl font-bold text-text-primary">
            Your configuration
          </h2>
          <p className="mt-3 text-text-muted">
            Your selections will appear here as you configure your workspace.
          </p>
        </aside>
      </div>
    </main>
  );
}
