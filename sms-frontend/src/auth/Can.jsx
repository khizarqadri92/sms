// Permission-based rendering utilities
// Usage: import { CanDo } from "../auth/Can";
// <CanDo perm="students.create"><button>Enroll</button></CanDo>

import { useAuth } from "./AuthContext";

export function CanDo({ perm, children, fallback = null }) {
  const { can } = useAuth();
  return can(perm) ? children : fallback;
}

export function usePermissions() {
  const { can, permissions } = useAuth();
  return {
    can,
    // Students
    canViewStudents:    () => can("students.view"),
    canCreateStudent:   () => can("students.create"),
    canEditStudent:     () => can("students.edit"),
    canDeleteStudent:   () => can("students.delete"),
    canLinkParent:      () => can("students.edit"),
    // Teachers
    canViewTeachers:    () => can("teachers.view"),
    canCreateTeacher:   () => can("teachers.create"),
    canEditTeacher:     () => can("teachers.edit"),
    canDeleteTeacher:   () => can("teachers.delete"),
    // Academics
    canViewAcademics:   () => can("academics.view"),
    canManageAcademics: () => can("academics.manage"),
    canManageClasses:   () => can("classes.manage"),
    canManageSubjects:  () => can("subjects.manage"),
    canManageTimetable: () => can("timetable.manage"),
    // Finance
    canViewFinance:     () => can("finance.view"),
    canManageFinance:   () => can("finance.manage"),
    canCollectFees:     () => can("finance.collect"),
    canVerifyPayments:  () => can("finance.verify"),
    canManageDiscounts: () => can("discounts.manage"),
    canDownloadInvoice: () => can("invoices.download"),
    canBulkInvoice:     () => can("finance.bulk"),
    // Users
    canViewUsers:       () => can("users.view"),
    canCreateUser:      () => can("users.create"),
    canEditUser:        () => can("users.edit"),
    canDeleteUser:      () => can("users.delete"),
    canManageRoles:     () => can("users.manage_roles"),
    // Grades & Attendance
    canViewGrades:      () => can("grades.view"),
    canEnterGrades:     () => can("grades.enter"),
    canPublishGrades:   () => can("grades.publish"),
    canViewAttendance:  () => can("attendance.view"),
    canMarkAttendance:  () => can("attendance.create"),
    // Settings
    canViewSettings:    () => can("settings.view"),
    canManageSettings:  () => can("settings.manage"),
    // Roles
    canManageRolePerms: () => can("roles.manage"),
    // Discounts
    canViewDiscounts:   () => can("discounts.view"),
  };
}