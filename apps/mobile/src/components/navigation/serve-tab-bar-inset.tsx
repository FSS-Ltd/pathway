import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

type ServeTabBarInsetValue = {
  inset: number;
  setInset: (inset: number) => void;
};

const ServeTabBarInsetContext = createContext<ServeTabBarInsetValue | null>(
  null,
);

export function ServeTabBarInsetProvider({ children }: PropsWithChildren) {
  const [inset, setInsetState] = useState(0);
  const setInset = useCallback((nextInset: number) => {
    setInsetState((currentInset) =>
      currentInset === nextInset ? currentInset : nextInset,
    );
  }, []);
  const value = useMemo(() => ({ inset, setInset }), [inset, setInset]);

  return (
    <ServeTabBarInsetContext.Provider value={value}>
      {children}
    </ServeTabBarInsetContext.Provider>
  );
}

export function useServeTabBarInset(): number {
  return useContext(ServeTabBarInsetContext)?.inset ?? 0;
}

export function useSetServeTabBarInset(): (inset: number) => void {
  return useContext(ServeTabBarInsetContext)?.setInset ?? ignoreInset;
}

function ignoreInset(): void {}
