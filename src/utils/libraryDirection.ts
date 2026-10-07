import { SharedLibrary } from '../types';

/** A library I am seeding to other people (as opposed to one shared with me). */
export const isOutgoingLibrary = (lib: SharedLibrary): boolean =>
  lib.direction === 'outgoing' || lib.ownerEmail === 'you@example.com' || lib.role === 'owner';

/** A library other people share with me. */
export const isIncomingLibrary = (lib: SharedLibrary): boolean =>
  lib.direction === 'incoming' || (lib.ownerEmail !== 'you@example.com' && lib.role !== 'owner');
