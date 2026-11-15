export type ThemeMode = 'light' | 'dark';
export type DistanceUnit = 'km' | 'mi';

export interface AppSettings {
  theme: ThemeMode;
  unit: DistanceUnit;
  devTestMode: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'light',
  unit: 'km',
  devTestMode: false,
};
