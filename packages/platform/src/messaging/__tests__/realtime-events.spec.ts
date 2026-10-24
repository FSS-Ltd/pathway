import { messageUserRealtimeTopic } from "../realtime-events";

describe("private messaging inbox scopes", () => {
  it("separates users and sites", () => {
    const topic = messageUserRealtimeTopic("site-a", "user-a");
    expect(messageUserRealtimeTopic("site-b", "user-a")).not.toBe(topic);
    expect(messageUserRealtimeTopic("site-a", "user-b")).not.toBe(topic);
    expect(messageUserRealtimeTopic("site-a", "user-a")).toBe(topic);
  });

  it("prevents legacy ID delimiters from colliding across scope boundaries", () => {
    expect(messageUserRealtimeTopic("a:user:b", "c")).not.toBe(
      messageUserRealtimeTopic("a", "b:user:c"),
    );
    expect(messageUserRealtimeTopic("é", "a")).not.toBe(
      messageUserRealtimeTopic("e", "a"),
    );
  });
});
