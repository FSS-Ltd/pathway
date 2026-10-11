import type { Dispatch, SetStateAction } from "react";
import type { PublicSignupConfig } from "../../../lib/public-signup-client";
import { ChildCareFields } from "./registration-sections";
import type { ChildEntry } from "./signup-form-model";

type Props = {
  children: ChildEntry[];
  addChild: () => void;
  removeChild: (id: string) => void;
  updateChild: (id: string, updates: Partial<ChildEntry>) => void;
  config: PublicSignupConfig;
  setSubmitError: Dispatch<SetStateAction<string>>;
};
export function ChildrenSignupSection({
  children,
  addChild,
  removeChild,
  updateChild,
  config,
  setSubmitError,
}: Props) {
  return (
    <section className="rounded-xl border border-pw-border bg-white p-6">
      <h2 className="mb-4 text-lg font-semibold text-pw-text">Children *</h2>
      <p className="mb-4 text-sm text-pw-text-muted">
        At least one child required
      </p>
      {children.map((child) => (
        <div
          key={child.id}
          className="mb-6 rounded-lg border border-pw-border p-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-pw-text">
                First name *
              </label>
              <input
                type="text"
                required
                value={child.firstName}
                onChange={(e) =>
                  updateChild(child.id, { firstName: e.target.value })
                }
                className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-pw-text">
                Last name *
              </label>
              <input
                type="text"
                required
                value={child.lastName}
                onChange={(e) =>
                  updateChild(child.id, { lastName: e.target.value })
                }
                className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-pw-text">
                Preferred name
              </label>
              <input
                type="text"
                value={child.preferredName}
                onChange={(e) =>
                  updateChild(child.id, { preferredName: e.target.value })
                }
                placeholder="If different from first name"
                className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-pw-text">
                Date of birth *
              </label>
              <input
                type="date"
                required
                value={child.dateOfBirth}
                onChange={(e) =>
                  updateChild(child.id, { dateOfBirth: e.target.value })
                }
                className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-pw-text">
                Allergies or key medical needs
              </label>
              <input
                type="text"
                value={child.allergies}
                onChange={(e) =>
                  updateChild(child.id, { allergies: e.target.value })
                }
                placeholder="e.g. none, or list allergies / conditions we should know"
                className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
              />
            </div>

            <div className="sm:col-span-2">
              <h3 className="mb-3 text-base font-medium text-pw-text">
                Educational &amp; Medical Information
              </h3>
              <p className="mb-3 text-sm text-pw-text-muted">
                This helps us support your child appropriately. All information
                is confidential.
              </p>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-pw-text">
                School / Nursery name
              </label>
              <input
                type="text"
                value={child.schoolName}
                onChange={(e) =>
                  updateChild(child.id, { schoolName: e.target.value })
                }
                placeholder="e.g. Oak Primary School"
                className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-pw-text">
                Year group
              </label>
              <input
                type="text"
                value={child.yearGroup}
                onChange={(e) =>
                  updateChild(child.id, { yearGroup: e.target.value })
                }
                placeholder="e.g. Reception, Year 3"
                className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-pw-text">
                GP name
              </label>
              <input
                type="text"
                value={child.gpName}
                onChange={(e) =>
                  updateChild(child.id, { gpName: e.target.value })
                }
                placeholder="Doctor or practice name"
                className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-pw-text">
                GP phone number
              </label>
              <input
                type="tel"
                value={child.gpPhone}
                onChange={(e) =>
                  updateChild(child.id, { gpPhone: e.target.value })
                }
                placeholder="e.g. 020 7123 4567"
                className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-pw-text">
                Special needs
              </label>
              <select
                value={child.specialNeedsType}
                onChange={(e) =>
                  updateChild(child.id, {
                    specialNeedsType: e.target.value,
                    specialNeedsOther:
                      e.target.value !== "other" ? "" : child.specialNeedsOther,
                  })
                }
                className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
              >
                <option value="none">None</option>
                <option value="sen_support">SEN Support</option>
                <option value="ehcp">EHCP</option>
                <option value="other">Other</option>
              </select>
            </div>
            {child.specialNeedsType === "other" && (
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-pw-text">
                  Please specify
                </label>
                <input
                  type="text"
                  value={child.specialNeedsOther}
                  onChange={(e) =>
                    updateChild(child.id, { specialNeedsOther: e.target.value })
                  }
                  placeholder="Brief description"
                  className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
                />
              </div>
            )}
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-pw-text">
                Additional needs (optional)
              </label>
              <textarea
                value={child.additionalNeedsNotes}
                onChange={(e) =>
                  updateChild(child.id, {
                    additionalNeedsNotes: e.target.value,
                  })
                }
                placeholder="Any other information we should know to support your child"
                rows={3}
                className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-pw-text">
                Child profile picture (optional)
              </label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="mt-1 block w-full text-sm text-pw-text-muted file:mr-4 file:rounded file:border-0 file:bg-pw-accent-subtle file:px-4 file:py-2 file:text-pw-text"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) {
                    updateChild(child.id, {
                      photoBase64: "",
                      photoContentType: "",
                    });
                    return;
                  }
                  if (file.size > 5 * 1024 * 1024) {
                    setSubmitError("Photo must be 5MB or smaller.");
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => {
                    const data = reader.result as string;
                    if (data.startsWith("data:")) {
                      updateChild(child.id, {
                        photoBase64: data,
                        photoContentType: file.type || "image/jpeg",
                      });
                    }
                  };
                  reader.readAsDataURL(file);
                }}
              />
              <p className="mt-1 text-xs text-pw-text-muted">
                This helps volunteers identify children and mark attendance
                accurately. It is optional, so guests who may not return can be
                added without one. If this child attends regularly, please add a
                clear photo. JPEG, PNG or WebP. Max 5MB.
              </p>
            </div>
            <div className="sm:col-span-2">
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={child.photoConsent}
                  onChange={(e) =>
                    updateChild(child.id, { photoConsent: e.target.checked })
                  }
                  className="mt-0.5 rounded border-pw-border"
                />
                <span className="text-sm font-medium text-pw-text">
                  Organisation photo/video consent: I consent to photos or
                  videos of this child being used by the organisation outside
                  the internal attendance profile.
                </span>
              </label>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-pw-text">
                Who can collect this child (optional)
              </label>
              <input
                type="text"
                value={child.pickupPermissions}
                onChange={(e) =>
                  updateChild(child.id, { pickupPermissions: e.target.value })
                }
                placeholder="Names of people allowed to pick up"
                className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
              />
            </div>
            <ChildCareFields
              child={child}
              onChange={(changes) => updateChild(child.id, changes)}
              aceRegistrationLevels={config.aceRegistrationLevels}
            />
          </div>
          {children.length > 1 && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => removeChild(child.id)}
                className="rounded-md border border-pw-border px-3 py-2 text-sm text-pw-text-muted hover:bg-muted"
              >
                Remove child
              </button>
            </div>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={addChild}
        className="rounded-md border border-pw-border bg-white px-4 py-2 text-sm text-pw-text hover:bg-muted"
      >
        Add another child
      </button>
    </section>
  );
}
