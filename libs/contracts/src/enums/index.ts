export enum Role {
  EMPLOYEE = 'EMPLOYEE',
  HRD = 'HRD',
}

export enum EmployeeStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

/** Derived from the attendance row: an open record is CHECKED_IN, a closed one CHECKED_OUT. */
export enum AttendanceStatus {
  CHECKED_IN = 'CHECKED_IN',
  CHECKED_OUT = 'CHECKED_OUT',
}
