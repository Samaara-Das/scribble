// Per-platform adapters. v1 uses one generic getUserMedia/getDisplayMedia patch for
// all three web clients; this module identifies the platform and is the seam where
// per-client quirks (activation hints, DOM anchors) get added as they surface.
export type Platform = 'zoom' | 'meet' | 'teams' | 'localhost' | 'unknown';

export interface PlatformAdapter {
  id: Platform;
  name: string;
  /** Human hint shown in onboarding for activating Scribble on this client. */
  activationHint: string;
}

const ADAPTERS: Record<Platform, PlatformAdapter> = {
  zoom: { id: 'zoom', name: 'Zoom (web)', activationHint: 'Toggle your camera off then on to activate Scribble.' },
  meet: { id: 'meet', name: 'Google Meet', activationHint: 'Toggle your camera off then on to activate Scribble.' },
  teams: { id: 'teams', name: 'Microsoft Teams (web)', activationHint: 'Toggle your camera off then on to activate Scribble.' },
  localhost: { id: 'localhost', name: 'Local test', activationHint: '' },
  unknown: { id: 'unknown', name: 'Unknown', activationHint: '' },
};

export function detectPlatform(host: string = location.hostname): Platform {
  if (host.endsWith('zoom.us')) return 'zoom';
  if (host === 'meet.google.com') return 'meet';
  if (host === 'teams.microsoft.com') return 'teams';
  if (host === 'localhost' || host === '127.0.0.1') return 'localhost';
  return 'unknown';
}

export function getAdapter(host?: string): PlatformAdapter {
  return ADAPTERS[detectPlatform(host)];
}
