import type { DatabaseHandle } from '../db/database.js';
import { EventsService } from '../events/events.service.js';
import { PasswordService } from '../auth/password.service.js';
import { StaffService } from '../auth/staff.service.js';

/** `StaffService` real sobre la base de datos de test. */
export function createStaffService(handle: DatabaseHandle): StaffService {
  return new StaffService(handle.db, new EventsService(handle.db), new PasswordService());
}
