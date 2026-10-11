import type { EmergencyEntry } from "./signup-form-model";

type Props = {
  emergencyContacts: EmergencyEntry[];
  addEmergency: () => void;
  removeEmergency: (id: string) => void;
  updateEmergency: (id: string, updates: Partial<EmergencyEntry>) => void;
};
export function EmergencySignupSection({
  emergencyContacts,
  addEmergency,
  removeEmergency,
  updateEmergency,
}: Props) {
  return (
    <section className="rounded-xl border border-pw-border bg-white p-6">
      <h2 className="mb-4 text-lg font-semibold text-pw-text">
        Emergency contacts *
      </h2>
      <p className="mb-4 text-sm text-pw-text-muted">At least one required</p>
      {emergencyContacts.map((ec) => (
        <div
          key={ec.id}
          className="mb-4 flex flex-wrap items-end gap-4 rounded-lg border border-pw-border p-4"
        >
          <div className="min-w-0 flex-1">
            <label className="block text-sm font-medium text-pw-text">
              Name
            </label>
            <input
              type="text"
              value={ec.name}
              onChange={(e) => updateEmergency(ec.id, { name: e.target.value })}
              className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
            />
          </div>
          <div className="min-w-0 flex-1">
            <label className="block text-sm font-medium text-pw-text">
              Phone
            </label>
            <input
              type="tel"
              value={ec.phone}
              onChange={(e) =>
                updateEmergency(ec.id, { phone: e.target.value })
              }
              className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
            />
          </div>
          <div className="min-w-0 flex-1">
            <label className="block text-sm font-medium text-pw-text">
              Relationship
            </label>
            <input
              type="text"
              value={ec.relationship}
              onChange={(e) =>
                updateEmergency(ec.id, { relationship: e.target.value })
              }
              className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
            />
          </div>
          <div className="min-w-0 flex-1">
            <label className="block text-sm font-medium text-pw-text">
              Secondary phone
            </label>
            <input
              type="tel"
              value={ec.secondaryPhone}
              onChange={(e) =>
                updateEmergency(ec.id, { secondaryPhone: e.target.value })
              }
              className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
            />
          </div>
          <div className="min-w-0 flex-1">
            <label className="block text-sm font-medium text-pw-text">
              Email
            </label>
            <input
              type="email"
              value={ec.email}
              onChange={(e) =>
                updateEmergency(ec.id, { email: e.target.value })
              }
              className="mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-pw-text">
            <input
              type="checkbox"
              checked={ec.canPickUp}
              onChange={(e) =>
                updateEmergency(ec.id, { canPickUp: e.target.checked })
              }
            />
            Can collect child
          </label>
          {emergencyContacts.length > 1 && (
            <button
              type="button"
              onClick={() => removeEmergency(ec.id)}
              className="rounded-md border border-pw-border px-3 py-2 text-sm text-pw-text-muted hover:bg-muted"
            >
              Remove
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={addEmergency}
        className="rounded-md border border-pw-border bg-white px-4 py-2 text-sm text-pw-text hover:bg-muted"
      >
        Add another contact
      </button>
    </section>
  );
}
