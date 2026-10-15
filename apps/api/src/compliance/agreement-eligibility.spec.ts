import { isAdult } from "./agreement-record";
import { userAgeStatus } from "./agreement-eligibility";
describe("Agreement adult eligibility", () => {
  const person = {
    id: "user",
    name: null,
    displayName: null,
    firstName: null,
    lastName: null,
    dateOfBirth: null,
    studentIdentities: [],
  };
  it("uses the calendar eighteenth birthday rather than rounded year lengths", () => {
    const now = new Date("2026-10-15T12:00:00Z");
    expect(isAdult(new Date("2008-10-15T00:00:00Z"), now)).toBe(true);
    expect(isAdult(new Date("2008-10-16T00:00:00Z"), now)).toBe(false);
  });
  it("does not infer age from account role and rejects conflicting linked child age", () => {
    expect(userAgeStatus(person)).toBe("NEEDS_CONFIRMATION");
    expect(
      userAgeStatus({ ...person, dateOfBirth: new Date("1990-01-01") }),
    ).toBe("KNOWN_ADULT");
    expect(
      userAgeStatus({
        ...person,
        dateOfBirth: new Date("1990-01-01"),
        studentIdentities: [
          { links: [{ child: { dateOfBirth: new Date("2020-01-01") } }] },
        ],
      }),
    ).toBe("MINOR");
  });
});
