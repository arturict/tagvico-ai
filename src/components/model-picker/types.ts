export type PickerIcon = { path: string; source?: string } | null;

export type PickerProvider = {
  id: string;
  name: string;
  icon: PickerIcon;
  /** Registry badge such as "New"; shown on the provider's model rows. */
  badge?: string | null;
  /** An unavailable provider stays in the rail but cannot be filtered to. */
  available?: boolean;
};

export type PickerModel = {
  providerId: string;
  id: string;
  name: string;
  /** Short labels such as "Default" or "Recommended", shown before the provider's own badge. */
  badges?: string[];
};

export type PickerSelection = { providerId: string; modelId: string };

/** A model together with its provider, the unit the list, the favourites and the shortcuts work on. */
export type PickerEntry = {
  key: string;
  provider: PickerProvider;
  model: PickerModel;
};

export type PickerRail = { kind: 'favorites' } | { kind: 'provider'; providerId: string };
