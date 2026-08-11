import React, { useState, useEffect } from "react";
import workQueueApi from "../api/workQueueApi";
import AnnouncementTicker from '../components/AnnouncementTicker';
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import dashboardApi from "../api/dashboardApi";
import attendanceApi from "../api/attendanceApi";
import notificationsApi from "../api/notificationsApi";
import { useTheme } from "../auth/ThemeContext";
import "./RoleLayout.css";

const NAV = {
  superadmin: [
    { label:"General",    cat:"General",    items:[
      { label:"Dashboard", path:"/dashboard" },
      { label:"Work Queue", path:"/work-queue" },
      { label:"My Leave",   path:"/staff-leave"  },
      { label:"My Attendance", path:"/my-attendance" },
      { label:"My Payslip", path:"/my-payslips" },
      { label:"My Resignation", path:"/my-resignation" },
      { label:"Department Attendance", path:"/my-department-attendance", requiresHod:true },
      { label:"My Profile", path:"/my-profile"   },
      { label:"Workflow Builder", path:"/workflow-builder" },
      { label:"Report Permissions", path:"/report-permissions" },
      { label:"Request Permissions", path:"/request-permissions" },
      { label:"Calendar",  path:"/calendar"  },
    ]},
    { label:"People",     cat:"People",     items:[
      { label:"Students",  path:"/students"  },
      { label:"Teachers",  path:"/teachers"  },
      { label:"Users",     path:"/users"     },
    ]},
    { label:"Academic",   cat:"Academic",   items:[
      { label:"Academics",  path:"/academics"      },
      { label:"Syllabus",   path:"/syllabus"       },
      { label:"Exams",      path:"/exams",          perm:"exam.view", end:true },
    ]},
    { label:"Requests", cat:"Requests", items:[
      { label:"Withdrawal", path:"/withdrawal"     },
      { label:"Discipline", path:"/discipline"     },
    ]},
    { label:"Setup", cat:"Setup", items:[
      { label:"Leave Configuration", path:"/leave-setup" },
    ]},
    { label:"HR",         cat:"HR",         items:[
      { label:"Staff Management", path:"/hr/staff",       perm:"hr.view"         },
      { label:"Leave Management",  path:"/hr/leave",       perm:"hr.view"         },
      { label:"Employee Attendance", path:"/hr/attendance", perm:"hr.view" },
      { label:"Resignations", path:"/hr/resignations", perm:"hr.view" },
      { label:"Payroll Setup", path:"/payroll/setup", perm:"payroll.view" },
      { label:"Payroll Grades", path:"/payroll/grades", perm:"payroll.view" },
      { label:"Payroll Adjustments", path:"/payroll/adjustments", perm:"payroll.view" },
      { label:"Designation Grades", path:"/payroll/designation-grades", perm:"payroll.view" },
      { label:"Income Tax Slabs", path:"/payroll/tax-slabs", perm:"payroll.view" },
      { label:"Payroll Runs", path:"/payroll/runs", perm:"payroll.edit" },
      { label:"Provident Fund", path:"/payroll/provident-fund", perm:"payroll.pf.view_all" },
      { label:"Income Tax", path:"/payroll/income-tax", perm:"payroll.income_tax.view_all" },
      { label:"HR Setup",         path:"/hr/setup",       perm:"hr.designations" },
    ]},
    { label:"Reports",    cat:"Reports",    items:[
      { label:"Employee Attendance", path:"/reports/employee-attendance", perm:"reports.employee_attendance" },
      { label:"Attendance", path:"/admin-attendance", perm:"reports.attendance_hub" },
      { label:"By Teacher", path:"/teacher-attendance-report", parent:"/admin-attendance", perm:"reports.attendance_hub" },
      { label:"By Student", path:"/student-attendance-report", parent:"/admin-attendance", perm:"reports.attendance_hub" },
      { label:"Employee Salaries", path:"/reports/employee-salaries", perm:"reports.employee_salaries" },
      { label:"Expenditure Details", path:"/reports/expenditure-details", perm:"reports.expenditure" },
      { label:"Fee Report", path:"/fee-report", perm:"reports.fee_report" },
      { label:"Locked Students", path:"/locked-students", perm:"reports.locked_students" },
    ]},

    { label:"Finance",    cat:"Finance",    items:[
      { label:"Finance",   path:"/finance"   },
      { label:"Vendor Invoices", path:"/procurement/vendor-invoices" },
    ]},
    { label:"Library",    cat:"Library",    items:[
      { label:"Management",   path:"/library",          perm:"library.view",   end:true },
      { label:"Setup",        path:"/library/settings", perm:"library.manage", end:true },
    ]},
    { label:"Procurement", cat:"Procurement", items:[
      { label:"Vendors",      path:"/procurement/vendors", perm:"procurement.view" },
      { label:"Item Master",  path:"/procurement/items",   perm:"procurement.view" },
      { label:"Item Categories", path:"/procurement/item-categories", perm:"procurement.manage" },
      { label:"Requisitions Pipeline", path:"/procurement/pipeline", perm:"procurement.view" },
      { label:"Purchase Orders", path:"/procurement/purchase-orders", perm:"procurement.view" },
      { label:"Goods Receipt (GRN)", path:"/procurement/grn", perm:"procurement.view" },
      { label:"Stock", path:"/procurement/stock", perm:"procurement.view" },
      { label:"Vendor Invoices", path:"/procurement/vendor-invoices", perm:"procurement.view" },
      { label:"Departments",  path:"/procurement/departments", perm:"procurement.manage" },
      { label:"Approval Rules", path:"/procurement/approval-rules", perm:"procurement.manage" },
    ]},
    { label:"System",     cat:"System",     items:[
      { label:"Settings",         path:"/settings"       },
      { label:"Roles",            path:"/roles"          },
      { label:"Announcements",    path:"/announcements"  },
            { label:"Workflow Config",  path:"/workflow-config" },
    ]},
    { label:"Purchase Requests", cat:"Purchase Requests", items:[
      { label:"My Requisitions",    path:"/procurement/my-requisitions",     perm:null },
      { label:"Pending Approvals",  path:"/procurement/pending-approvals",   perm:null },
    ]},
  ],
  admin: [
    { label:"General",    cat:"General",    items:[
      { label:"Dashboard", path:"/dashboard" },
      { label:"Work Queue", path:"/work-queue" },
      { label:"My Leave",   path:"/staff-leave"  },
      { label:"My Attendance", path:"/my-attendance" },
      { label:"My Payslip", path:"/my-payslips" },
      { label:"My Resignation", path:"/my-resignation" },
      { label:"Department Attendance", path:"/my-department-attendance", requiresHod:true },
      { label:"My Profile", path:"/my-profile"   },
      { label:"Calendar",  path:"/calendar"  },
    ]},
    { label:"Reports",    cat:"Reports",    items:[
      { label:"Employee Attendance", path:"/reports/employee-attendance", perm:"reports.employee_attendance" },
      { label:"Attendance", path:"/admin-attendance", perm:"reports.attendance_hub" },
      { label:"By Teacher", path:"/teacher-attendance-report", parent:"/admin-attendance", perm:"reports.attendance_hub" },
      { label:"By Student", path:"/student-attendance-report", parent:"/admin-attendance", perm:"reports.attendance_hub" },
      { label:"Employee Salaries", path:"/reports/employee-salaries", perm:"reports.employee_salaries" },
      { label:"Expenditure Details", path:"/reports/expenditure-details", perm:"reports.expenditure" },
      { label:"Fee Report", path:"/fee-report", perm:"reports.fee_report" },
      { label:"Locked Students", path:"/locked-students", perm:"reports.locked_students" },
    ]},
    { label:"People",     cat:"People",     items:[
      { label:"Students",  path:"/students"  },
      { label:"Teachers",  path:"/teachers"  },
    ]},
    { label:"Academic",   cat:"Academic",   items:[
      { label:"Academics", path:"/academics" },
      { label:"Syllabus",  path:"/syllabus"  },
      { label:"Reports",   path:"/reports"   },
    ]},
    { label:"Requests", cat:"Requests", items:[
      { label:"Withdrawal", path:"/withdrawal" },
    ]},
    { label:"Setup", cat:"Setup", items:[
      { label:"Leave Configuration", path:"/leave-setup" },
    ]},
    { label:"System",     cat:"System",     items:[
            { label:"Workflow Config",  path:"/workflow-config" },
      { label:"Announcements",    path:"/announcements"  },
    ]},
    { label:"Purchase Requests", cat:"Purchase Requests", items:[
      { label:"My Requisitions",    path:"/procurement/my-requisitions",     perm:null },
      { label:"Pending Approvals",  path:"/procurement/pending-approvals",   perm:null },
    ]},
  ],
  principal: [
    { label:"General",    cat:"General",    items:[
      { label:"Dashboard",  path:"/dashboard"  },
      { label:"Work Queue", path:"/work-queue" },
      { label:"My Leave",   path:"/staff-leave"  },
      { label:"My Attendance", path:"/my-attendance" },
      { label:"My Payslip", path:"/my-payslips" },
      { label:"My Resignation", path:"/my-resignation" },
      { label:"Department Attendance", path:"/my-department-attendance", requiresHod:true },
      { label:"My Profile", path:"/my-profile"   },
      { label:"Calendar",   path:"/calendar"   },
    ]},
    { label:"Academic",   cat:"Academic",   items:[
      { label:"Academics",      path:"/academics"      },
      { label:"Syllabus",       path:"/syllabus"       },
      { label:"Staff",          path:"/teachers"       },
      { label:"Attendance",     path:"/attendance" },
      { label:"Diary",          path:"/diary"          },
      { label:"Exams",              path:"/exams"           },
    ]},
    { label:"Requests", cat:"Requests", items:[
      { label:"Leave Requests",     path:"/leave-approval"    },
      { label:"Withdrawal",        path:"/withdrawal"      },
      { label:"Discipline",         path:"/discipline"      },
    ]},
    { label:"Classroom",  cat:"Classroom",  items:[
      { label:"Assignments", path:"/assignments" },
      { label:"Quizzes",     path:"/quizzes"     },
      { label:"Materials",   path:"/materials"   },
    ]},
    { label:"Reports",    cat:"Reports",    items:[
      { label:"Attendance",  path:"/admin-attendance", perm:"reports.attendance_hub"          },
      { label:"By Teacher", path:"/teacher-attendance-report", parent:"/admin-attendance", perm:"reports.attendance_hub" },
      { label:"By Student", path:"/student-attendance-report", parent:"/admin-attendance", perm:"reports.attendance_hub" },
      { label:"Announcements", path:"/announcements" },
      { label:"Locked Students", path:"/locked-students", perm:"reports.locked_students" },
      { label:"Fee Report", path:"/fee-report", perm:"reports.fee_report" },
    ]},
    { label:"Purchase Requests", cat:"Purchase Requests", items:[
      { label:"My Requisitions",    path:"/procurement/my-requisitions",     perm:null },
      { label:"Pending Approvals",  path:"/procurement/pending-approvals",   perm:null },
    ]},
  ],
  academic_coordinator: [
    { label:"General",    cat:"General",    items:[
      { label:"Dashboard", path:"/dashboard" },
      { label:"Work Queue", path:"/work-queue" },
      { label:"Calendar",  path:"/calendar"  },
    ]},
    { label:"Management",   cat:"Management",   items:[
      { label:"Academics",      path:"/academics"      },
      { label:"Syllabus",       path:"/syllabus"       },
      { label:"Diary",          path:"/diary"          },
      { label:"Exams",          path:"/exams"          },
      { label:"Datesheet",       path:"/datesheet",     parent:"/exams" },
    ]},
    { label:"Requests", cat:"Requests", items:[
      { label:"Leave Requests", path:"/leave-approval" },
      { label:"Withdrawal",        path:"/withdrawal"      },
      { label:"Discipline",         path:"/discipline"       },
    ]},
    { label:"Setup", cat:"Setup", items:[
      { label:"Leave Configuration", path:"/leave-setup" },
    ]},
    { label:"Reports",    cat:"Reports",    items:[
      { label:"Attendance",  path:"/admin-attendance"                                     },
      { label:"By Class",   path:"/admin-attendance",          parent:"/admin-attendance"  },
      { label:"By Teacher", path:"/teacher-attendance-report", parent:"/admin-attendance"  },
      { label:"By Student", path:"/student-attendance-report", parent:"/admin-attendance", perm:"reports.attendance_hub"  },
      { label:"Locked Students", path:"/locked-students", perm:"reports.locked_students" },
      { label:"Fee Report", path:"/fee-report", perm:"reports.fee_report" },
    ]},
    { label:"Purchase Requests", cat:"Purchase Requests", items:[
      { label:"My Requisitions",    path:"/procurement/my-requisitions",     perm:null },
      { label:"Pending Approvals",  path:"/procurement/pending-approvals",   perm:null },
    ]},
  ],
  teacher: [
    { label:"General",    cat:"General",    items:[
      { label:"Dashboard",  path:"/dashboard" },
      { label:"Work Queue", path:"/work-queue" },
      { label:"My Profile", path:"/my-profile" },
      { label:"My Leave",   path:"/staff-leave" },
      { label:"My Attendance", path:"/my-attendance" },
      { label:"My Payslip", path:"/my-payslips" },
      { label:"My Resignation", path:"/my-resignation" },
      { label:"Department Attendance", path:"/my-department-attendance", requiresHod:true },
      { label:"Calendar",   path:"/calendar"  },
    ]},
    { label:"Academic",   cat:"Academic",   items:[
      { label:"My Classes",     path:"/classes"        },
      { label:"Syllabus",       path:"/syllabus"       },
      { label:"Attendance",     path:"/attendance"     },
      { label:"Diary",          path:"/diary"          },
    ]},
    { label:"Requests", cat:"Requests", items:[
      { label:"Leave Requests",     path:"/leave-approval"    },
      { label:"Withdrawal",        path:"/withdrawal"      },
      { label:"Discipline",         path:"/discipline"      },
    ]},
    { label:"Exams",      cat:"Exams",      items:[
      { label:"Exams",              path:"/exams"                               },
      { label:"Exam Schedule",       path:"/datesheet-view"                    },
      { label:"Datesheet",          path:"/datesheet",     perm:"exam.manage"  },
      { label:"Exam Marks",          path:"/exam-marks",   perm:"exam.marks"   },
      { label:"Class Results",       path:"/class-results"                     },
      { label:"Marks History",       path:"/marks-history"                     },
    ]},
    { label:"Classroom",  cat:"Classroom",  items:[
      { label:"Assignments", path:"/assignments" },
      { label:"Quizzes",     path:"/quizzes"     },
      { label:"Materials",   path:"/materials"   },
    ]},
    { label:"Reports",    cat:"Reports",    items:[
      { label:"Attendance Report", path:"/attendance-report" },
      { label:"Fee Report", path:"/fee-report", perm:"reports.fee_report" },
    ]},
    { label:"Purchase Requests", cat:"Purchase Requests", items:[
      { label:"My Requisitions",    path:"/procurement/my-requisitions",     perm:null },
      { label:"Pending Approvals",  path:"/procurement/pending-approvals",   perm:null },
    ]},
  ],
  finance_officer: [
    { label:"General",    cat:"General",    items:[
      { label:"Dashboard", path:"/dashboard" },
      { label:"Work Queue", path:"/work-queue" },
      { label:"My Leave",   path:"/staff-leave"  },
      { label:"My Attendance", path:"/my-attendance" },
      { label:"My Payslip", path:"/my-payslips" },
      { label:"My Resignation", path:"/my-resignation" },
      { label:"Payroll Runs", path:"/payroll/runs", perm:"payroll.edit" },
      { label:"Department Attendance", path:"/my-department-attendance", requiresHod:true },
      { label:"My Profile", path:"/my-profile"   },
      { label:"Calendar",  path:"/calendar"  },
    ]},
    { label:"Management",    cat:"Management",    items:[
      { label:"Finance",   path:"/finance"   },
      { label:"Vendor Invoices", path:"/procurement/vendor-invoices" },
    ]},
    { label:"Requests", cat:"Requests", items:[
      { label:"Withdrawal", path:"/withdrawal" },
      { label:"Resignations", path:"/hr/resignations" },
    ]},
    { label:"Setup", cat:"Setup", items:[
      { label:"Fee Setup", path:"/finance/setup" },
      { label:"Salary Setup", path:"/payroll/setup", perm:"payroll.view" },
      { label:"Payroll Grades", path:"/payroll/grades", parent:"/payroll/setup", noArrow:true, perm:"payroll.view" },
      { label:"Payroll Adjustments", path:"/payroll/adjustments", parent:"/payroll/setup", noArrow:true, perm:"payroll.view" },
      { label:"Designation Grades", path:"/payroll/designation-grades", parent:"/payroll/setup", noArrow:true, perm:"payroll.view" },
      { label:"Income Tax Slabs", path:"/payroll/tax-slabs", parent:"/payroll/setup", noArrow:true, perm:"payroll.view" },
      { label:"Provident Fund", path:"/payroll/provident-fund", parent:"/payroll/setup", noArrow:true, perm:"payroll.pf.view_all" },
      { label:"Income Tax", path:"/payroll/income-tax", parent:"/payroll/setup", noArrow:true, perm:"payroll.income_tax.view_all" },
    ]},
    { label:"Reports",    cat:"Reports",    items:[
      { label:"Employee Attendance", path:"/reports/employee-attendance", perm:"reports.employee_attendance" },
      { label:"Attendance", path:"/admin-attendance", perm:"reports.attendance_hub" },
      { label:"By Teacher", path:"/teacher-attendance-report", parent:"/admin-attendance", perm:"reports.attendance_hub" },
      { label:"By Student", path:"/student-attendance-report", parent:"/admin-attendance", perm:"reports.attendance_hub" },
      { label:"Employee Salaries", path:"/reports/employee-salaries", perm:"reports.employee_salaries" },
      { label:"Expenditure Details", path:"/reports/expenditure-details", perm:"reports.expenditure" },
      { label:"Fee Report", path:"/fee-report", perm:"reports.fee_report" },
      { label:"Locked Students", path:"/locked-students", perm:"reports.locked_students" },
    ]},
    { label:"Purchase Requests", cat:"Purchase Requests", items:[
      { label:"My Requisitions",    path:"/procurement/my-requisitions",     perm:null },
      { label:"Pending Approvals",  path:"/procurement/pending-approvals",   perm:null },
    ]},
  ],
  parent: [
    { label:"General",    cat:"General",    items:[
      { label:"Dashboard",   path:"/dashboard" },
      { label:"Work Queue", path:"/work-queue" },
      { label:"Calendar",    path:"/calendar"  },
      { label:"My Children", path:"/children"  },
    ]},
    { label:"Academic",   cat:"Academic",   items:[
      { label:"Attendance",  path:"/attendance" },
      { label:"Syllabus",    path:"/syllabus"   },
      { label:"Diary",       path:"/diary"      },
      { label:"My Leaves",   path:"/leaves"     },
      { label:"Withdrawal",         path:"/withdrawal"         },
      { label:"Discipline",         path:"/discipline"          },
    ]},
    { label:"Exams",      cat:"Exams",      items:[
      { label:"Exams",              path:"/exams"            },
      { label:"Exam Schedule",       path:"/datesheet-view"   },
      { label:"Results",             path:"/exam-results"     },
    ]},
    { label:"Reports",    cat:"Reports",    items:[
      { label:"Withdrawal History", path:"/withdrawal-history"  },
      { label:"Fee Report", path:"/fee-report", perm:"reports.fee_report" },
    ]},
    { label:"Classroom",  cat:"Classroom",  items:[
      { label:"Assignments", path:"/assignments" },
      { label:"Quizzes",     path:"/quizzes"     },
      { label:"Materials",   path:"/materials"   },
    ]},
  ],
  hr: [
    { label:"General",  cat:"General",  items:[
      { label:"Dashboard",      path:"/dashboard",      perm:null           },
      { label:"Work Queue", path:"/work-queue" },
      { label:"My Leave",   path:"/staff-leave"  },
      { label:"My Attendance", path:"/my-attendance" },
      { label:"My Payslip", path:"/my-payslips" },
      { label:"My Resignation", path:"/my-resignation" },
      { label:"Department Attendance", path:"/my-department-attendance", requiresHod:true },
      { label:"My Profile", path:"/my-profile"   },
      { label:"Calendar",       path:"/calendar",       perm:"calendar.view"},
    ]},
    { label:"Management", cat:"Management", items:[
      { label:"Staff Management",  path:"/hr/staff",       perm:"hr.view"        },
      { label:"Leave Management",  path:"/hr/leave",       perm:"hr.view"        },
      { label:"Employee Attendance", path:"/hr/attendance", perm:"hr.view" },
      { label:"Payroll Setup", path:"/payroll/setup", perm:"payroll.view" },
      { label:"Payroll Grades", path:"/payroll/grades", perm:"payroll.view" },
      { label:"Payroll Adjustments", path:"/payroll/adjustments", perm:"payroll.view" },
      { label:"Designation Grades", path:"/payroll/designation-grades", perm:"payroll.view" },
      { label:"Income Tax Slabs", path:"/payroll/tax-slabs", perm:"payroll.view" },
      { label:"Payroll Runs", path:"/payroll/runs", perm:"payroll.edit" },
      { label:"Provident Fund", path:"/payroll/provident-fund", perm:"payroll.pf.view_all" },
      { label:"Income Tax", path:"/payroll/income-tax", perm:"payroll.income_tax.view_all" },
      { label:"Attendance",        path:"/attendance",     perm:"attendance.view"},
    ]},
    { label:"Requests", cat:"Requests", items:[
      { label:"Leave Requests",   path:"/leave-approval", perm:"leave.view_all" },
      { label:"Resignations", path:"/hr/resignations", perm:"hr.view" },
    ]},
    { label:"Reports",    cat:"Reports",    items:[
      { label:"Employee Attendance", path:"/reports/employee-attendance", perm:"reports.employee_attendance" },
      { label:"Attendance", path:"/admin-attendance", perm:"reports.attendance_hub" },
      { label:"By Teacher", path:"/teacher-attendance-report", parent:"/admin-attendance", perm:"reports.attendance_hub" },
      { label:"By Student", path:"/student-attendance-report", parent:"/admin-attendance", perm:"reports.attendance_hub" },
      { label:"Employee Salaries", path:"/reports/employee-salaries", perm:"reports.employee_salaries" },
      { label:"Expenditure Details", path:"/reports/expenditure-details", perm:"reports.expenditure" },
      { label:"Fee Report", path:"/fee-report", perm:"reports.fee_report" },
      { label:"Locked Students", path:"/locked-students", perm:"reports.locked_students" },
    ]},
    { label:"Setup",      cat:"Setup",      items:[
      { label:"HR Setup",         path:"/hr/setup",       perm:"hr.designations"},
    ]},
    { label:"System",   cat:"System",   items:[
      { label:"Settings",       path:"/settings",       perm:"settings.view"  },
    ]},
    { label:"Purchase Requests", cat:"Purchase Requests", items:[
      { label:"My Requisitions",    path:"/procurement/my-requisitions",     perm:null },
      { label:"Pending Approvals",  path:"/procurement/pending-approvals",   perm:null },
    ]},
  ],
  librarian: [
    { label:"General",  cat:"General",  items:[
      { label:"Dashboard",  path:"/dashboard", perm:null             },
      { label:"Work Queue", path:"/work-queue" },
      { label:"My Leave",   path:"/staff-leave"  },
      { label:"My Attendance", path:"/my-attendance" },
      { label:"My Payslip", path:"/my-payslips" },
      { label:"My Resignation", path:"/my-resignation" },
      { label:"Department Attendance", path:"/my-department-attendance", requiresHod:true },
      { label:"My Profile", path:"/my-profile"   },
      { label:"Calendar",   path:"/calendar",  perm:"calendar.view"  },
    ]},
    { label:"Management",    cat:"Management",    items:[
      { label:"Dashboard",    path:"/library",             perm:"library.view" },
      { label:"Catalog",      path:"/library/catalog",     perm:"library.view" },
      { label:"Issue/Return", path:"/library/issue-return", perm:"library.issue" },
      { label:"Members",      path:"/library/members",     perm:"library.manage" },
      { label:"Damaged Books", path:"/library/damaged",     perm:"library.manage" },
      { label:"Lost Books",    path:"/library/lost",       perm:"library.manage" },
      { label:"Inventory",     path:"/library/inventory",  perm:"library.manage" },
      { label:"Pending Fines", path:"/library/fines",      perm:"library.issue" },
      { label:"Fine History",  path:"/library/fine-history", perm:"library.issue" },
      { label:"Students",     path:"/students",  perm:"students.view"  },
    ]},
    { label:"Requests", cat:"Requests", items:[
      { label:"Withdrawal",   path:"/withdrawal", perm:"withdrawal.clear" },
    ]},
    { label:"Setup",      cat:"Setup",      items:[
      { label:"Library Settings", path:"/library/settings",    perm:"library.manage" },
      { label:"Authors",          path:"/library/authors",     perm:"library.manage" },
      { label:"Publishers",       path:"/library/publishers",  perm:"library.manage" },
      { label:"Categories",       path:"/library/categories",  perm:"library.manage" },
    ]},
    { label:"System",   cat:"System",   items:[
      { label:"Settings",   path:"/settings",  perm:"settings.view"  },
    ]},
    { label:"Purchase Requests", cat:"Purchase Requests", items:[
      { label:"My Requisitions",    path:"/procurement/my-requisitions",     perm:null },
      { label:"Pending Approvals",  path:"/procurement/pending-approvals",   perm:null },
    ]},
  ],
  procurement: [
    { label:"General",      cat:"General",      items:[
      { label:"Dashboard",    path:"/dashboard",    perm:null                  },
      { label:"Work Queue", path:"/work-queue" },
      { label:"My Leave",   path:"/staff-leave"  },
      { label:"My Attendance", path:"/my-attendance" },
      { label:"My Payslip", path:"/my-payslips" },
      { label:"My Resignation", path:"/my-resignation" },
      { label:"Department Attendance", path:"/my-department-attendance", requiresHod:true },
      { label:"My Profile", path:"/my-profile"   },
      { label:"Calendar",     path:"/calendar",     perm:"calendar.view"       },
    ]},
    { label:"Management",  cat:"Management",  items:[
      { label:"Procurement",  path:"/procurement",  perm:"procurement.view"    },
      { label:"Vendors",      path:"/procurement/vendors", perm:"procurement.view" },
      { label:"Item Master",  path:"/procurement/items",   perm:"procurement.view" },
      { label:"Item Categories", path:"/procurement/item-categories", perm:"procurement.manage" },
      { label:"Requisitions Pipeline", path:"/procurement/pipeline", perm:"procurement.view" },
      { label:"Purchase Orders", path:"/procurement/purchase-orders", perm:"procurement.view" },
      { label:"Goods Receipt (GRN)", path:"/procurement/grn", perm:"procurement.view" },
      { label:"Stock", path:"/procurement/stock", perm:"procurement.view" },
      { label:"Vendor Invoices", path:"/procurement/vendor-invoices", perm:"procurement.view" },
      { label:"Departments",  path:"/procurement/departments", perm:"procurement.manage" },
      { label:"Approval Rules", path:"/procurement/approval-rules", perm:"procurement.manage" },
    ]},
    { label:"System",       cat:"System",       items:[
      { label:"Settings",     path:"/settings",     perm:"settings.view"       },
    ]},
    { label:"Purchase Requests", cat:"Purchase Requests", items:[
      { label:"My Requisitions",    path:"/procurement/my-requisitions",     perm:null },
      { label:"Pending Approvals",  path:"/procurement/pending-approvals",   perm:null },
    ]},
  ],
  student: [
    { label:"General",    cat:"General",    items:[
      { label:"Dashboard", path:"/dashboard" },
      { label:"Work Queue", path:"/work-queue" },
      { label:"Calendar",  path:"/calendar"  },
      { label:"Timetable", path:"/timetable" },
    ]},
    { label:"Academic",   cat:"Academic",   items:[
      { label:"Diary",        path:"/diary"       },
      { label:"Syllabus",     path:"/syllabus"    },
      { label:"Attendance",   path:"/attendance"  },
      { label:"My Leaves",    path:"/leaves"      },
    ]},
    { label:"Exams",      cat:"Exams",      items:[
      { label:"Exams",         path:"/exams"          },
      { label:"Exam Schedule", path:"/datesheet-view"  },
      { label:"My Results",    path:"/exam-results"   },
    ]},
    { label:"Classroom",  cat:"Classroom",  items:[
      { label:"Assignments", path:"/assignments" },
      { label:"Quizzes",     path:"/quizzes"     },
      { label:"Materials",   path:"/materials"   },
    ]},
    { label:"Finance",    cat:"Finance",    items:[
      { label:"My Fees",   path:"/my-fees"  },
    ]},
    { label:"Reports",    cat:"Reports",    items:[
      { label:"Fee Report", path:"/fee-report", perm:"reports.fee_report" },
    ]},
  ],
};
const SUBNAV = {
  "/children": [
    { label:"Overview",    sub:"overview"    },
    { label:"Timetable",   sub:"timetable"   },
    { label:"Attendance",  sub:"attendance"  },
    { label:"Fees",        sub:"fees"        },
  ],
  "/dashboard": [
    { label:"Overview",       sub:"overview"  },
    { label:"Quick Actions",  sub:"actions"   },
    { label:"Permissions",    sub:"perms"     },
  ],
  "/students": [
    { label:"All Students",   sub:"list"      },
    { label:"Enroll Student", sub:"enroll"    },
  ],
  "/teachers": [
    { label:"All Teachers",   sub:"list"      },
    { label:"Add Teacher",    sub:"add"       },
  ],
  "/academics": [
    { label:"Academic Years", sub:"years"     },
    { label:"Classes",        sub:"classes"   },
    { label:"Subjects",       sub:"subjects"  },
    { label:"Timetable",      sub:"timetable" },
    { label:"Class Overview",  sub:"overview"  },
  ],
  "/users": [
    { label:"All Users",      sub:"list"      },
    { label:"Create User",    sub:"create"    },
  ],
  "/finance": [
    { label:"Dashboard",        sub:"dashboard"  },
    { label:"Invoices",         sub:"invoices"   },
    { label:"Payments",         sub:"payments"   },
    { label:"Discounts",        sub:"discounts"  },
    { label:"Locked Accounts",   sub:"locked-accounts"   },
    { label:"Charge Settlement", sub:"charge-settlement" },
  ],
  "/finance/setup": [
    { label:"Auto-Generation",  sub:"fee-automation"  },
    { label:"Charge Types",     sub:"charge-types"    },
    { label:"Fee Types",        sub:"fee-types"       },
    { label:"Class Fees",       sub:"class-fees"      },
    { label:"Discount Config",  sub:"discount-config" },
    { label:"Extra Charges",    sub:"charges"         },
  ],
  "/settings": [
    { label:"ID Formats",     sub:"id_formats"   },
    { label:"School Info",    sub:"school_info"  },
    { label:"Fee Settings",   sub:"fee_settings" },
    { label:"School Timing",     sub:"school_timing"     },
    { label:"Attendance Config", sub:"attendance_config" },
    { label:"Account Settings",  sub:"account_settings"  },
    { label:"Regional & Format", sub:"regional_format" },
  ],
  "/my-fees": [
    { label:"My Fees",   sub:"fees"    },
    { label:"History",   sub:"history" },
  ],
  "/profile": [
    { label:"My Info",        sub:"info"        },
    { label:"Signature",      sub:"signature"   },
    { label:"Change Password",sub:"password"    },
    { label:"Theme",          sub:"theme"       },
    { label:"Activity",       sub:"activity"    },
  ],
  "/roles": [
    { label:"Roles & Permissions", sub:"roles" },
  ],
  "/exams": [
    { label:"Exams",       path:"/exams",       perm:"exam.view",    end:true },
    { label:"Datesheet",   path:"/datesheet",   perm:"exam.manage"            },
    { label:"Exam Marks",  path:"/exam-marks",  perm:"exam.marks"             },
  ],

  "/classes": [
    { label:"My Classes",     sub:"list"      },
    { label:"Timetable",      sub:"timetable" },
    { label:"Class Overview",  sub:"overview"  },
  ],

};

function buildHeroStats(role, s) {
  if (!s) return [
    { label:"Loading", value:"..." },
    { label:"Loading", value:"..." },
    { label:"Loading", value:"..." },
    { label:"Loading", value:"..." },
  ];

  const attSchool = s.attendance_total > 0
    ? s.attendance_pct + "% (" + s.attendance_present + "/" + s.attendance_total + ")"
    : "Not marked";

  const attTeacher = s.teacher_att_total > 0
    ? s.teacher_att_pct + "% (" + s.teacher_att_present + "/" + s.teacher_att_total + ")"
    : "Not marked";

  switch (role) {
    case "superadmin":
    case "admin":
      return [
        { label:"Total Students",      value: s.total_students },
        { label:"Total Teachers",      value: s.total_teachers },
        { label:"Attendance Today",    value: attSchool },
        { label:"Overdue Fees",        value: s.overdue_fees, warn: s.overdue_fees > 0 },
      ];
    case "principal":
      return [
        { label:"Students",            value: s.total_students },
        { label:"Teachers",            value: s.total_teachers },
        { label:"Classes",             value: s.total_classes  },
        { label:"Attendance Today",    value: attSchool },
      ];
    case "teacher":
      return [
        { label:"My Classes",          value: s.teacher_classes   },
        { label:"My Students",         value: s.teacher_students  },
        { label:"My Subjects",         value: s.teacher_subjects  },
        { label:"My Attendance Today", value: attTeacher },
      ];
    case "finance_officer":
      return [
        { label:"Total Students",      value: s.total_students },
        { label:"Overdue Invoices",    value: s.overdue_fees, warn: s.overdue_fees > 0 },
        { label:"Collected (Month)",   value: "Rs. " + Number(s.collected_month).toLocaleString() },
        { label:"Classes",             value: s.total_classes },
      ];
    case "parent":
      return [
        { label:"My Children",    value: s.parent_children },
        { label:"Academic Year",  value: s.academic_year || "2025-2026" },
        { label:"School",         value: "Active" },
        { label:"Portal",         value: "Parent" },
      ];
    case "student":
      return [
        { label:"My Class",      value: s.student_class  || "—" },
        { label:"Enrollment No", value: s.enrollment_no  || "—" },
        { label:"Academic Year", value: s.academic_year  || "2025-2026" },
        { label:"Status",        value: (s.student_status||"active").charAt(0).toUpperCase()+(s.student_status||"active").slice(1) },
      ];
    case "librarian":
      return [
        { label:"Total Books",       value: s.lib_total_books },
        { label:"Available Copies",  value: s.lib_available_copies },
        { label:"Issued Today",      value: s.lib_issued_today },
        { label:"Overdue Books",     value: s.lib_overdue_count, warn: s.lib_overdue_count > 0 },
      ];
    default:
      return [
        { label:"Students",            value: s.total_students },
        { label:"Teachers",            value: s.total_teachers },
        { label:"Classes",             value: s.total_classes  },
        { label:"Subjects",            value: s.total_subjects },
      ];
  }
}

function darkenColor(hex, amount = 40) {
  try {
    const h = hex.replace("#","");
    const r = Math.max(0, parseInt(h.slice(0,2),16) - amount);
    const g = Math.max(0, parseInt(h.slice(2,4),16) - amount);
    const b = Math.max(0, parseInt(h.slice(4,6),16) - amount);
    return "#" + [r,g,b].map(x=>x.toString(16).padStart(2,"0")).join("");
  } catch { return "#1e3a5f"; }
}

export default function RoleLayout({ children }) {
  const { user, logout }        = useAuth();
  const { theme }               = useTheme();
  const location                = useLocation();
  const navigate                = useNavigate();
  const [stats, setStats]             = useState(null);
  const [activeSub, setActiveSub]       = useState(null);
  const [subGroup,  setSubGroup]         = useState("main");
  const [notifs, setNotifs]             = useState([]);
  const [unreadCount, setUnreadCount]   = useState(0);
  const [queueCount,  setQueueCount]    = useState(0);
  const [showNotifs, setShowNotifs]     = useState(false);
  const bellRef                         = React.useRef(null);

  const role      = user?.roles?.[0] || "student";
  const userPerms = user?.permissions || [];
  const [isHod, setIsHod] = useState(false);
  useEffect(() => {
    attendanceApi.getMyHodStatus().then(r => setIsHod(!!r.data.data.is_hod)).catch(() => {});
  }, []);
  const rawNavGroups = NAV[role] || NAV.student;
  const navGroups = rawNavGroups.map(g => ({
    ...g,
    items: g.items.filter(item => (!item.perm || userPerms.includes(item.perm)) && (!item.requiresHod || isHod))
  })).filter(g => g.items.length > 0);
  const allNavItems = navGroups.flatMap(g => g.items);

  const currentPath  = "/" + location.pathname.split("/")[1];
  const fullPath = location.pathname;
  const subnavItems  = (() => {
    if(SUBNAV[fullPath]) return SUBNAV[fullPath];
    // Check if fullPath appears as a path in any SUBNAV group's items
    const itemKey = Object.keys(SUBNAV).find(k =>
      Array.isArray(SUBNAV[k]) && SUBNAV[k].some(i => i.path === fullPath)
    );
    if(itemKey) return SUBNAV[itemKey];
    // Prefix match: find longest SUBNAV key that is a prefix of fullPath
    const prefixKey = Object.keys(SUBNAV).filter(k=>k!=="/" && fullPath.startsWith(k+"/")).sort((a,b)=>b.length-a.length)[0];
    if(prefixKey) return SUBNAV[prefixKey];
    return SUBNAV[currentPath] || [];
  })();

  // Active category = group that contains the current path
  const activeCat = (navGroups.find(g => g.items.some(i => i.path === location.pathname)) || navGroups.find(g => g.items.some(i => i.path === currentPath)))?.cat || navGroups[0]?.cat;
  const [selCat, setSelCat] = useState(activeCat);

  // When route changes update selCat
  React.useEffect(() => {
    const cat = (navGroups.find(g => g.items.some(i => i.path === location.pathname)) || navGroups.find(g => g.items.some(i => i.path === currentPath)))?.cat;
    if (cat) setSelCat(cat);
    setSubGroup("main");
  }, [currentPath]);

  const activeGroup = navGroups.find(g => g.cat === selCat) || navGroups[0];

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (bellRef.current && !bellRef.current.contains(e.target)) {
        setShowNotifs(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    dashboardApi.getStats()
      .then(res => setStats(res.data.data))
      .catch(() => {});
  }, [currentPath]);

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchUnreadCount = () => {
    notificationsApi.getUnreadCount().then(res => setUnreadCount(res.data.data?.count || 0)).catch(() => {});
    workQueueApi.getCount().then(r => setQueueCount(r.data?.data?.count || 0)).catch(()=>{});
  };

  const fetchNotifs = async () => {
    try {
      const res = await notificationsApi.getAll();
      setNotifs(res.data.data || []);
    } catch {}
  };

  const handleBellClick = () => {
    if (!showNotifs) fetchNotifs();
    setShowNotifs(prev => !prev);
  };

  const handleNotifClick = (n) => {
    handleMarkRead(n.id);
    setShowNotifs(false);
    if (n.link) navigate(n.link);
    else navigate("/notifications");
  };

  const handleMarkRead = async (id) => {
    await notificationsApi.markRead(id);
    setNotifs(prev => prev.map(n => n.id === id ? {...n, is_read: true} : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const handleMarkAllRead = async () => {
    await notificationsApi.markAllRead();
    setNotifs(prev => prev.map(n => ({...n, is_read: true})));
    setUnreadCount(0);
  };

  const handleDelete = async (id) => {
    await notificationsApi.remove(id);
    const n = notifs.find(x => x.id === id);
    setNotifs(prev => prev.filter(x => x.id !== id));
    if (n && !n.is_read) setUnreadCount(prev => Math.max(0, prev - 1));
  };

  useEffect(() => {
    if (subnavItems.length > 0) {
      setActiveSub(subnavItems[0].sub);
    } else {
      setActiveSub(null);
    }
  }, [currentPath]);

  const handleSubNav = (sub) => {
    setActiveSub(sub);
    const event = new CustomEvent("subnav-change", { detail: { sub } });
    window.dispatchEvent(event);
  };

  const visibleSubnavItems = subnavItems.some(i => i.group)
    ? subnavItems.filter(i => i.group === subGroup)
    : subnavItems;

  const handleSubGroupChange = (group) => {
    setSubGroup(group);
    const firstItem = subnavItems.find(i => i.group === group);
    if (firstItem) handleSubNav(firstItem.sub);
  };

  const initials  = user?.name
    ? user.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";
  const firstName = user?.name?.split(" ")[0] || "there";
  const hour      = new Date().getHours();
  const greeting  = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const dateStr   = new Date().toLocaleDateString("en-US", {
    weekday:"long", year:"numeric", month:"long", day:"numeric"
  });
  const heroStats = buildHeroStats(role, stats);

  // Load school info
  const [schoolInfo, setSchoolInfo] = React.useState({ name:"SchoolMS", logo:null });
  React.useEffect(() => {
    fetch(process.env.REACT_APP_API_URL + "/settings/school-info-public", {
      headers: { Authorization: "Bearer " + sessionStorage.getItem("access_token") }
    }).then(r => r.json()).then(d => {
      const s = d.data || {};
      setSchoolInfo({ name: s.school_name || "SchoolMS", logo: s.school_logo || null });
    }).catch(() => {});
  }, []);

  return (
    <div className="shell">
      <nav className="topnav" style={{ background: theme?.primary ? darkenColor(theme.primary, 50) : "#1e3a5f" }}>
        {/* Brand */}
        <div className="topnav-brand">
          {schoolInfo.logo
            ? <img src={schoolInfo.logo} alt="logo" style={{ height:36, width:36, objectFit:"contain", borderRadius:6 }} />
            : <div style={{ width:36, height:36, background:"rgba(255,255,255,0.2)", borderRadius:6, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:16, color:"#fff" }}>S</div>
          }
          <div style={{ display:"flex", flexDirection:"column", justifyContent:"center" }}>
            <div className="topnav-brand-name">{schoolInfo.name}</div>
          </div>
        </div>
        {/* empty flex spacer */}
        <div style={{ flex:1 }} />
        <div className="topnav-user">
          <div className="topnav-divider" />

          <button
              onClick={() => window.location.href='/work-queue'}
              title="Work Queue"
              style={{ background:"none", border:"none", cursor:"pointer", position:"relative", padding:"4px 6px", display:"flex", alignItems:"center", marginRight:4 }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFD700" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
              {queueCount > 0 && (
                <span style={{ position:"absolute", top:-2, right:-2, background:"#ef4444", color:"#fff", borderRadius:"50%", fontSize:10, fontWeight:700, minWidth:16, height:16, display:"flex", alignItems:"center", justifyContent:"center", padding:"0 3px" }}>
                  {queueCount > 99 ? "99+" : queueCount}
                </span>
              )}
            </button>
            <div style={{ position:"relative" }} ref={bellRef}>
            <button
              onClick={handleBellClick}
              style={{ background:"none", border:"none", cursor:"pointer", position:"relative", padding:"4px 6px", display:"flex", alignItems:"center" }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="#FFD700" stroke="#FFD700" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0" fill="none" stroke="#FFD700"/>
              </svg>
              {unreadCount > 0 && (
                <span style={{ position:"absolute", top:0, right:0, background:"#ef4444", color:"#fff", fontSize:9, fontWeight:700, width:16, height:16, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {showNotifs && (
              <div style={{ position:"absolute", right:0, top:"calc(100% + 8px)", width:340, background:"#fff", borderRadius:12, boxShadow:"0 8px 32px rgba(0,0,0,0.15)", border:"1px solid #e2e8f0", zIndex:999, overflow:"hidden" }}>
                <div style={{ padding:"14px 16px", borderBottom:"1px solid #f1f5f9", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span style={{ fontSize:14, fontWeight:700, color:"#0f172a" }}>Notifications</span>
                  <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                    {unreadCount > 0 && (
                      <button onClick={handleMarkAllRead} style={{ fontSize:11, color:"#2563eb", background:"none", border:"none", cursor:"pointer", fontWeight:600 }}>
                        Mark all read
                      </button>
                    )}
                    <button onClick={() => setShowNotifs(false)} style={{ fontSize:16, color:"#94a3b8", background:"none", border:"none", cursor:"pointer", lineHeight:1 }}>x</button>
                  </div>
                </div>
                <div style={{ maxHeight:380, overflowY:"auto" }}>
                  {notifs.length === 0 ? (
                    <div style={{ padding:"32px 16px", textAlign:"center", color:"#94a3b8", fontSize:13 }}>No notifications</div>
                  ) : (
                    notifs.map(n => (
                      <div
                        key={n.id}
                        style={{ padding:"12px 16px", borderBottom:"1px solid #f8fafc", background: n.is_read ? "#fff" : "#f8faff", display:"flex", gap:10, alignItems:"flex-start", cursor:"pointer" }}
                        onClick={() => handleNotifClick(n)}
                      >
                        <div style={{ width:8, height:8, borderRadius:"50%", background: n.is_read ? "#e2e8f0" : (n.type === "success" ? "#22c55e" : n.type === "warning" ? "#f59e0b" : "#2563eb"), flexShrink:0, marginTop:5 }} />
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight: n.is_read ? 500 : 700, color:"#0f172a", marginBottom:2 }}>{n.title}</div>
                          {n.message && <div style={{ fontSize:12, color:"#64748b", marginBottom:4 }}>{n.message}</div>}
                          <div style={{ fontSize:11, color:"#94a3b8" }}>{new Date(n.created_at).toLocaleString("en-US", { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" })}</div>
                        </div>
                        <div style={{ display:"flex", gap:4, flexShrink:0 }} onClick={e => e.stopPropagation()}>
                          {!n.is_read && (
                            <button onClick={() => handleMarkRead(n.id)} title="Mark read" style={{ background:"none", border:"none", color:"#2563eb", cursor:"pointer", fontSize:11, fontWeight:600 }}>Read</button>
                          )}
                          <button onClick={() => handleDelete(n.id)} title="Delete" style={{ background:"none", border:"none", color:"#ef4444", cursor:"pointer", fontSize:11 }}>x</button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="topnav-divider" />
          <a href="/profile" style={{ textDecoration:"none", display:"flex", alignItems:"center", gap:8 }}>
            <div className="topnav-avatar" style={{ background: theme?.primary || "#2563eb" }}>{initials}</div>
            <div>
              <div className="topnav-name">{user?.name}</div>
              <div className="topnav-role">{role.replace("_", " ")}</div>
            </div>
          </a>
          <div className="topnav-divider" />
          <button className="topnav-logout" onClick={logout}>Sign Out</button>
        </div>
      </nav>

      {/* Ribbon row 1: category tabs */}
      <div className="ribbon-cats" style={{ background: theme?.primary ? darkenColor(theme.primary, 40) : "#1e3a5f", borderBottom:"1px solid rgba(255,255,255,0.1)", "--nav-active-color": theme?.primary || "#1e3a5f" }}>
        {navGroups.map(g => (
          <button key={g.cat}
            className={"ribbon-cat " + (selCat===g.cat ? "active" : "")}
            onClick={() => { setSelCat(g.cat); navigate(g.items[0].path); }}>
            {g.cat}
          </button>
        ))}
        <div style={{ flex:1 }} />
      </div>
                  {/* Ribbon row 2: items for active category */}
      <div className="ribbon-items">
        {(activeGroup?.cat === "Setup" ? activeGroup.items.filter(item => {
          if (!item.parent) return true;
          if (location.pathname.startsWith("/payroll")) return item.path.startsWith("/payroll");
          if (location.pathname.startsWith("/finance")) return item.path.startsWith("/finance");
          return true;
        }) : activeGroup?.items || []).map(item => {
          const isParentActive = item.end
            ? location.pathname !== item.path &&
              Array.isArray(SUBNAV[item.path]) &&
              SUBNAV[item.path].some(s => s.path === location.pathname)
            : false;
          return (<NavLink key={item.label + "::" + item.path} to={item.path} end={!!item.end}
            className={({ isActive }) => "ribbon-item" + (isActive || isParentActive ? " active" : "")}
            style={item.parent?{paddingLeft:8,fontSize:12,opacity:.85,borderLeft:"2px solid rgba(255,255,255,0.2)",marginLeft:4}:{}}>
            {item.parent&&!item.noArrow&&<span style={{marginRight:4,opacity:.6}}>&#8627;</span>}{item.label}
          </NavLink>);
        })}
        {/* Page subnav if exists */}
        {subnavItems.length > 0 && (
          <>
            <div className="ribbon-divider" />
            {subnavItems.some(i => i.group) && (
              <>
                <button
                  className={"ribbon-item " + (subGroup==="main" ? "active" : "")}
                  style={{ fontWeight:700 }}
                  onClick={() => handleSubGroupChange("main")}>
                  Main
                </button>
                <button
                  className={"ribbon-item " + (subGroup==="setup" ? "active" : "")}
                  style={{ fontWeight:700 }}
                  onClick={() => handleSubGroupChange("setup")}>
                  Setup
                </button>
                <div className="ribbon-divider" />
              </>
            )}
            {visibleSubnavItems.map(item => (
              item.path ? (
                <NavLink key={item.path} to={item.path} end={!!item.end}
                  className={({ isActive }) => "ribbon-item" + (isActive ? " active" : "")}>
                  {item.label}
                </NavLink>
              ) : (
                <button key={item.sub}
                  className={"ribbon-item " + (activeSub===item.sub ? "active" : "")}
                  onClick={() => handleSubNav(item.sub)}>
                  {item.label}
                </button>
              )
            ))}
          </>
        )}
      </div>


      {/* Announcements Ticker */}
      <div className="no-print"><AnnouncementTicker /></div>
      {heroStats !== null && (<div className="hero-banner">
        <div className="hero-banner-inner">
          <div className="hero-greeting">{greeting}, {firstName}</div>
          <div className="hero-date">{dateStr}</div>
          <div className="hero-stats">
            {heroStats.map((s, i) => (
              <div key={i} className="hero-stat">
                <div className="hero-stat-value" style={{ color: s.warn ? "#fca5a5" : "#fff" }}>
                  {stats ? s.value : "..."}
                </div>
                <div className="hero-stat-label">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>)}

      <main className={"main-content" + (heroStats === null ? " no-hero" : "")}>
        {children}
      </main>
    </div>
  );
}


