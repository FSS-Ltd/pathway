jest.mock("react-native", () => ({ Platform: { OS: "web" } }));

const mockSecureStore = {
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
};
jest.mock("expo-secure-store", () => mockSecureStore);

describe("session-store on web", () => {
  const localStorageMock = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    (global as unknown as { window: { localStorage: typeof localStorageMock } }).window = {
      localStorage: localStorageMock,
    };
  });

  it("reads the session from localStorage, not expo-secure-store", async () => {
    const snapshot = {
      accessToken: "token-1",
      updatedAt: "2026-08-02T00:00:00.000Z",
    };
    localStorageMock.getItem.mockReturnValue(JSON.stringify(snapshot));

    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.resetModules() isolation needs a fresh require per test
    const { getSessionSnapshot } = require("./session-store");
    const result = await getSessionSnapshot();

    expect(result).toEqual(snapshot);
    expect(localStorageMock.getItem).toHaveBeenCalledWith("nexsteps.home.session");
    expect(mockSecureStore.getItemAsync).not.toHaveBeenCalled();
  });

  it("writes the session to localStorage, not expo-secure-store", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.resetModules() isolation needs a fresh require per test
    const { setSessionSnapshot } = require("./session-store");
    await setSessionSnapshot({ accessToken: "token-2" });

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "nexsteps.home.session",
      expect.stringContaining("token-2"),
    );
    expect(mockSecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it("clears the session from localStorage, not expo-secure-store", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.resetModules() isolation needs a fresh require per test
    const { clearSessionSnapshot } = require("./session-store");
    await clearSessionSnapshot();

    expect(localStorageMock.removeItem).toHaveBeenCalledWith("nexsteps.home.session");
    expect(mockSecureStore.deleteItemAsync).not.toHaveBeenCalled();
  });
});
