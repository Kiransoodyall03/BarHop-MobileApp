import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

interface AreaSelectionContextValue {
  /** District IDs the user pinned manually. Empty ⇒ automatic resolution. */
  selectedDistrictIds: string[];
  /** True when a manual selection is overriding location-based resolution. */
  hasManualAreas: boolean;
  toggle: (districtId: string) => void;
  setSelection: (districtIds: string[]) => void;
  clear: () => void;
}

const AreaSelectionContext = createContext<AreaSelectionContextValue>({
  selectedDistrictIds: [],
  hasManualAreas: false,
  toggle: () => {},
  setSelection: () => {},
  clear: () => {},
});

/**
 * Manually-pinned districts for the SOLO deck.
 *
 * ⚠️ SESSION-ONLY, deliberately — never persisted to AsyncStorage or the
 * profile. A pin left on a district in another city would silently poison the
 * deck on the next launch, and the user would have no idea why every venue is
 * 1 400 km away. Solo deck filters are session-only for the same reason.
 *
 * Lives in a context rather than route params because the selector is a
 * root-stack modal while the deck it reshapes lives in a tab.
 */
export function AreaSelectionProvider({ children }: PropsWithChildren) {
  const [selectedDistrictIds, setSelectedDistrictIds] = useState<string[]>([]);

  const toggle = useCallback((districtId: string) => {
    setSelectedDistrictIds((current) =>
      current.includes(districtId)
        ? current.filter((id) => id !== districtId)
        : [...current, districtId]
    );
  }, []);

  const clear = useCallback(() => setSelectedDistrictIds([]), []);

  const value = useMemo<AreaSelectionContextValue>(
    () => ({
      selectedDistrictIds,
      hasManualAreas: selectedDistrictIds.length > 0,
      toggle,
      setSelection: setSelectedDistrictIds,
      clear,
    }),
    [selectedDistrictIds, toggle, clear]
  );

  return (
    <AreaSelectionContext.Provider value={value}>{children}</AreaSelectionContext.Provider>
  );
}

export function useAreaSelection(): AreaSelectionContextValue {
  return useContext(AreaSelectionContext);
}
