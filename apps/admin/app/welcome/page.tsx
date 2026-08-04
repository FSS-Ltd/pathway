"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/use-session-compat";
import { Button, Card } from "@pathway/ui";

export default function WelcomePage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [currentStep, setCurrentStep] = React.useState(0);

  // Redirect to login if not authenticated
  React.useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-teal-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-teal-500"></div>
      </div>
    );
  }

  const steps = [
    {
      emoji: "👋",
      title: `Welcome, ${session?.user?.name || "there"}!`,
      description:
        "We're excited to have you on Nexsteps. Let's take a quick tour to help you get started.",
    },
    {
      emoji: "👥",
      title: "Manage Your People",
      description:
        "Add and organize staff, volunteers, parents, and children. Keep everyone connected and informed.",
    },
    {
      emoji: "📅",
      title: "Schedule Sessions",
      description:
        "Create schedules, assign staff to sessions, and manage rotas. Everything your team needs, in one place.",
    },
    {
      emoji: "✓",
      title: "Track Attendance",
      description:
        "Mark attendance digitally, even offline. Sync when you're back online and keep accurate records.",
    },
    {
      emoji: "🛡️",
      title: "Safeguarding & Notes",
      description:
        "Log concerns, track safeguarding notes, and maintain compliance. Secure, private, and role-based.",
    },
    {
      emoji: "📢",
      title: "Send Announcements",
      description:
        "Keep parents and staff informed with announcements. Target specific groups and track engagement.",
    },
  ];

  const currentStepData = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;

  const handleNext = () => {
    if (isLastStep) {
      router.push("/");
    } else {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleSkip = () => {
    router.push("/");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-teal-50 p-4">
      <Card className="p-8 md:p-12 max-w-2xl w-full border-0 shadow-2xl">
        {/* Progress Dots */}
        <div className="flex justify-center gap-2 mb-8">
          {steps.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentStep(index)}
              className={`h-2 rounded-full transition-all ${
                index === currentStep
                  ? "w-8 bg-gradient-to-r from-teal-500 to-blue-600"
                  : "w-2 bg-gray-300 hover:bg-gray-400"
              }`}
              aria-label={`Go to step ${index + 1}`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="flex flex-col items-center text-center gap-6">
          <div className="text-7xl mb-4">{currentStepData?.emoji}</div>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900">
            {currentStepData?.title}
          </h1>
          <p className="text-lg text-gray-600 max-w-md leading-relaxed">
            {currentStepData?.description}
          </p>
        </div>

        {/* Navigation */}
        <div className="flex gap-3 mt-12">
          <Button
            variant="ghost"
            onClick={handleSkip}
            className="flex-1 text-gray-600"
          >
            Skip Tour
          </Button>
          <Button
            onClick={handleNext}
            className="flex-1 bg-gradient-to-r from-teal-500 to-blue-600 hover:from-teal-600 hover:to-blue-700 shadow-lg hover:shadow-xl transition-all"
          >
            {isLastStep ? "Get Started" : "Next"}
          </Button>
        </div>

        {/* Step Counter */}
        <p className="text-center text-sm text-gray-500 mt-6">
          {currentStep + 1} of {steps.length}
        </p>
      </Card>
    </div>
  );
}

