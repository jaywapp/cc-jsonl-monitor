import type { Dispatch, SetStateAction } from 'react';
import { EVENT_LABELS } from '../shared/event-labels';
import type { EventKind } from '../shared/types';

export interface ViewerPreferences {
  query: string;
  titles: EventKind[];
  kind: string;
  session: string;
  order: string;
  timezone: string;
  from: string;
  to: string;
  masked: boolean;
  watching: boolean;
  view: 'conversation' | 'list';
}

export function defaultPreferences(): ViewerPreferences {
  return { query: '', titles: Object.keys(EVENT_LABELS) as EventKind[], kind: 'all', session: '', order: 'asc', timezone: 'local', from: '', to: '', masked: true, watching: true, view: 'conversation' };
}

// Preferences belong to the app; file-specific loading and pagination stay local.
export function bindPreference<K extends keyof ViewerPreferences>(key: K, preferences: ViewerPreferences, setPreferences: Dispatch<SetStateAction<ViewerPreferences>>): [ViewerPreferences[K], Dispatch<SetStateAction<ViewerPreferences[K]>>] {
  return [preferences[key], next => setPreferences(current => ({
    ...current,
    [key]: typeof next === 'function' ? (next as (value: ViewerPreferences[K]) => ViewerPreferences[K])(current[key]) : next,
  }))];
}
