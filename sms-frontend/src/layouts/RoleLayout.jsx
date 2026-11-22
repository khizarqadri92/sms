import React, { useState, useEffect } from "react";
import workQueueApi from "../api/workQueueApi";
import messagesApi from "../api/messagesApi";
import AnnouncementTicker from '../components/AnnouncementTicker';
import { NavLink, useLocation, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useRegionalSettings } from "../context/RegionalSettingsContext";
import attendanceApi from "../api/attendanceApi";
import notificationsApi from "../api/notificationsApi";
import campusesApi from "../api/campusesApi";
import { useTheme } from "../auth/ThemeContext";
import "./RoleLayout.css";

// ONE menu for everyone: an item shows only when the user has a permission that opens it
// (roles + acting roles + extra permissions, see Roles & Permissions). Built from the 12 former role menus.
const MENU = [
  { label:"General", cat:"General", items:[
      { label:"Dashboard", path:"/dashboard", always:true },
      { label:"Campuses", path:"/campuses", any:["settings.campuses"] },
      { label:"Setting Governance", path:"/setting-governance", any:["settings.setting_governance"] },
      { label:"Work Queue", path:"/work-queue", any:["workflows_reports.work_queue"] },
      { label:"Messages", path:"/messages", any:["communication.message_my_child_teachers","communication.message_my_students_parents","communication.parent_messages_oversight"] },
      { label:"Activity Stream", path:"/activity", any:["users_access.system_activity_stream","users_access.department_activity_stream"], orHod:true },
      { label:"My Leave", path:"/staff-leave", any:["hr.leave_application"] },
      { label:"My Attendance", path:"/my-attendance", any:["hr.my_attendance"] },
      { label:"My Payslip", path:"/my-payslips", any:["payroll.my_payslips"] },
      { label:"My Resignation", path:"/my-resignation", any:["hr.resignation_submission"] },
      { label:"Department Attendance", path:"/my-department-attendance", any:["hr.my_attendance"], requiresHod:true },
      { label:"Workflow Builder", path:"/workflow-builder", any:["workflows_reports.workflow_builder"] },
      { label:"Report Permissions", path:"/report-permissions", any:["users_access.permission_management"] },
      { label:"Request Permissions", path:"/request-permissions", any:["users_access.permission_management"] },
      { label:"Calendar", path:"/calendar", any:["communication.calendar_view"] },
      { label:"My Admissions", path:"/my-admissions", any:["admissions.my_admissions"] },
      { label:"My Children", path:"/children", any:["students.my_children"] },
      { label:"Timetable", path:"/timetable", any:["academics.timetable_view"] },
  ]},
  { label:"People", cat:"People", items:[
      { label:"Students", path:"/students", any:["students.student_list_view"] },
      { label:"Teachers", path:"/teachers", any:["hr.staff_list_view"] },
      { label:"Users", path:"/users", any:["users_access.user_list_view"] },
  ]},
  { label:"Admissions", cat:"Admissions", items:[
      { label:"Admissions Dashboard", path:"/admissions", any:["admissions.admission_dashboard_view"], end:true },
      { label:"Applications", path:"/admissions/applications", any:["admissions.application_list_view"] },
      { label:"Admission Tests", path:"/admissions/tests", any:["admissions.admission_test_view"] },
      { label:"Interview Panels", path:"/admissions/panels", any:["admissions.interview_panel_setup","admissions.interview_schedule"] },
      { label:"Admission Fees", path:"/admissions/fees", any:["admissions.admission_fee_view"] },
      { label:"Admission Settings", path:"/admissions/settings", any:["admissions.admission_settings_view"] },
  ]},
  { label:"Academic", cat:"Academic", items:[
      { label:"Academics", path:"/academics", any:["academics.class_view","academics.subject_view","academics.timetable_edit"] },
      { label:"Syllabus", path:"/syllabus", any:["academics.syllabus_view"] },
      { label:"Attendance", path:"/attendance", any:["attendance.attendance_view","attendance.attendance_marking","students.my_children","students.my_studies"] },
      { label:"Gate Scan", path:"/gate-scan", any:["attendance.gate_scan"] },
      { label:"Diary", path:"/diary", any:["academics.diary_view"] },
      { label:"Exams", path:"/exams", any:["exams_results.exam_view"] },
      { label:"Academic History", path:"/academic-history", any:["students.student_grades_tab","students.my_children","students.my_studies"] },
      { label:"Promotions", path:"/promotions", any:["exams_results.promotion_view"] },
      { label:"My Classes", path:"/classes", any:["academics.my_classes"] },
      { label:"My Leaves", path:"/leaves", any:["hr.student_leave_application","students.my_studies"] },
  ]},
  { label:"Classroom", cat:"Classroom", items:[
      { label:"Assignments", path:"/assignments", any:["academics.assignment_view"] },
      { label:"Quizzes", path:"/quizzes", any:["academics.quiz_view"] },
      { label:"Materials", path:"/materials", any:["academics.material_view"] },
  ]},
  { label:"Exams", cat:"Exams", items:[
      { label:"Exam Schedule", path:"/datesheet-view", any:["exams_results.exam_view"] },
      { label:"Exam Marks", path:"/exam-marks", any:["exams_results.marks_entry"] },
      { label:"Class Results", path:"/class-results", any:["exams_results.marks_entry"] },
      { label:"Marks History", path:"/marks-history", any:["exams_results.marks_entry"] },
      { label:"Results", path:"/exam-results", any:["students.my_children","students.my_studies"] },
  ]},
  { label:"Management", cat:"Management", items:[
      { label:"Academic", path:"/management/academic", any:["academics.session_management"], all:["settings.campuses"] },
      { label:"HR", path:"/management/hr", any:["hr.staff_list_view"], all:["users_access.user_list_view"] },
      { label:"Library", path:"/library", any:["library.book_search"], all:["users_access.user_list_view"] },
      { label:"Procurement", path:"/management/procurement", any:["procurement_inventory.all_requisitions","procurement_inventory.purchase_orders_grn"], all:["users_access.user_list_view"] },
      { label:"Finance", path:"/management/finance", any:["finance.finance_dashboard"], all:["users_access.user_list_view"] },
      { label:"Academic", path:"/management/academic-admin", any:["academics.session_management","academics.class_management","academics.teacher_assignment"] },
      { label:"Datesheet", path:"/datesheet", any:["exams_results.datesheet_edit"] },
      { label:"Finance", path:"/finance", any:["finance.invoice_view","finance.payment_view","finance.finance_dashboard"] },
      { label:"Vendor Invoices", path:"/procurement/vendor-invoices", any:["procurement_inventory.vendor_invoices"] },
      { label:"Provident Fund", path:"/payroll/provident-fund", any:["payroll.provident_fund"] },
      { label:"Income Tax", path:"/payroll/income-tax", any:["payroll.income_tax_all_staff"] },
      { label:"Payroll Runs", path:"/payroll/runs", any:["payroll.payroll_run_view"] },
      { label:"Staff Management", path:"/hr/staff", any:["hr.staff_list_view"] },
      { label:"Leave Management", path:"/hr/leave", any:["hr.all_leave_requests"] },
      { label:"Employee Attendance", path:"/hr/attendance", any:["hr.staff_attendance_view"] },
      { label:"Catalog", path:"/library/catalog", any:["library.catalogue_management"] },
      { label:"Issue/Return", path:"/library/issue-return", any:["library.book_issue_return"] },
      { label:"Members", path:"/library/members", any:["library.library_members_settings"] },
      { label:"Damaged Books", path:"/library/damaged", any:["library.catalogue_management"] },
      { label:"Lost Books", path:"/library/lost", any:["library.catalogue_management"] },
      { label:"Inventory", path:"/library/inventory", any:["library.catalogue_management"] },
      { label:"Pending Fines", path:"/library/fines", any:["library.library_fines"] },
      { label:"Fine History", path:"/library/fine-history", any:["library.library_fines"] },
      { label:"Procurement", path:"/procurement", any:["procurement_inventory.all_requisitions"] },
      { label:"Requisitions Pipeline", path:"/procurement/pipeline", any:["procurement_inventory.all_requisitions"] },
      { label:"Purchase Orders", path:"/procurement/purchase-orders", any:["procurement_inventory.purchase_orders_grn"] },
      { label:"Goods Receipt (GRN)", path:"/procurement/grn", any:["procurement_inventory.purchase_orders_grn"] },
      { label:"Stock", path:"/procurement/stock", any:["procurement_inventory.stock"] },
  ]},
  { label:"Finance", cat:"Finance", items:[
      { label:"My Fees", path:"/my-fees", any:["finance.fee_payment_online"] },
  ]},
  { label:"Requests", cat:"Requests", items:[
      { label:"Staff Leave Requests", path:"/hr/leave-requests", any:["hr.all_leave_requests"] },
      { label:"Withdrawal", path:"/withdrawal", any:["withdrawal.withdrawal_request","withdrawal.withdrawal_review","withdrawal.withdrawal_clearance","withdrawal.withdrawal_approval","withdrawal.all_withdrawal_requests"] },
      { label:"Discipline", path:"/discipline", any:["hr.discipline_view","hr.discipline_reporting","hr.discipline_appeal"] },
      { label:"Leave Requests", path:"/leave-approval", any:["hr.leave_recommendation","hr.leave_approval","hr.all_leave_requests"] },
      { label:"Resignations", path:"/hr/resignations", any:["hr.resignation_management"] },
  ]},
  { label:"Purchase Requests", cat:"Purchase Requests", items:[
      { label:"My Requisitions", path:"/procurement/my-requisitions", any:["procurement_inventory.requisition_create"] },
      { label:"Pending Approvals", path:"/procurement/pending-approvals", any:["procurement_inventory.requisition_create"] },
  ]},
  { label:"Laboratory", cat:"Laboratory", items:[
      { label:"Lab Dashboard", path:"/lab", end:true, any:["laboratory.lab_view","laboratory.lab_management","laboratory.own_lab_management","laboratory.lab_supervisor_assign"] },
      { label:"Labs", path:"/lab/labs", any:["laboratory.lab_view","laboratory.lab_management","laboratory.own_lab_management","laboratory.lab_supervisor_assign"] },
      { label:"Equipment Register", path:"/lab/equipment", any:["laboratory.equipment_view","laboratory.equipment_management","laboratory.equipment_transfer","laboratory.equipment_issue_return","laboratory.equipment_retire","laboratory.lab_management"] },
      { label:"Issue & Return", path:"/lab/issues", any:["laboratory.equipment_issue_request","laboratory.equipment_issue_return","laboratory.equipment_view","laboratory.lab_management"] },
      { label:"Consumables & Stock", path:"/lab/consumables", any:["laboratory.stock_view","laboratory.stock_receive","laboratory.stock_issue","laboratory.stock_transfer","laboratory.stock_adjust","laboratory.stock_dispose","laboratory.lab_management"] },
      { label:"Stock Transactions", path:"/lab/stock-transactions", any:["laboratory.stock_view","laboratory.stock_receive","laboratory.stock_issue","laboratory.stock_transfer","laboratory.stock_adjust","laboratory.stock_dispose","laboratory.lab_management"] },
      { label:"Lab Settings", path:"/lab/settings", any:["laboratory.settings"] },
  ]},
  { label:"Reports", cat:"Reports", items:[
      { label:"Employee Attendance", path:"/reports/employee-attendance", any:["hr.employee_attendance_report"] },
      { label:"Attendance", path:"/admin-attendance", any:["attendance.attendance_reports"] },
      { label:"By Teacher", path:"/teacher-attendance-report", any:["attendance.attendance_reports"] },
      { label:"By Student", path:"/student-attendance-report", any:["attendance.attendance_reports"] },
      { label:"Employee Salaries", path:"/reports/employee-salaries", any:["payroll.salary_report"] },
      { label:"Expenditure Details", path:"/reports/expenditure-details", any:["procurement_inventory.expenditure_report"] },
      { label:"Fee Report", path:"/fee-report", any:["finance.fee_reports"] },
      { label:"Locked Students", path:"/locked-students", any:["finance.locked_accounts_view"] },
      { label:"General Reports", path:"/reports", any:["workflows_reports.reports_page"] },
      { label:"Attendance Report", path:"/attendance-report", any:["attendance.attendance_marking"] },
      { label:"Withdrawal History", path:"/withdrawal-history", any:["withdrawal.withdrawal_request"] },
  ]},
  { label:"Setup", cat:"Setup", items:[
      { label:"Finance Setup", path:"/setup/finance", any:["finance.fee_setup_edit","finance.fee_setup_view"], all:["settings.campuses"] },
      { label:"HR Setup", path:"/setup/hr", any:["hr.departments_designations_edit","hr.hr_policy_settings","payroll.payroll_setup_view"], all:["settings.campuses"] },
      { label:"Library Setup", path:"/setup/library", any:["library.library_members_settings","library.catalogue_management"], all:["settings.campuses"] },
      { label:"Procurement Setup", path:"/setup/procurement", any:["procurement_inventory.procurement_setup"], all:["settings.campuses"] },
      { label:"Academic Setup", path:"/setup/academic", any:["academics.session_management"], all:["settings.campuses"] },
      { label:"Leave Configuration", path:"/leave-setup", any:["hr.leave_setup"] },
      { label:"Settings", path:"/settings", any:["settings.school_timing","settings.school_information"] },
      { label:"Subject Schedule Setup", path:"/academic-setup", any:["academics.timetable_edit"] },
      { label:"Teacher Assignment", path:"/teacher-assignment", any:["academics.teacher_assignment"] },
      { label:"Fee Setup", path:"/finance/setup", any:["finance.fee_setup_view"] },
      { label:"Salary Setup", path:"/payroll/setup", any:["payroll.payroll_setup_view"] },
      { label:"Payroll Grades", path:"/payroll/grades", any:["payroll.payroll_setup_view"] },
      { label:"Payroll Adjustments", path:"/payroll/adjustments", any:["payroll.payroll_adjustments"] },
      { label:"Designation Grades", path:"/payroll/designation-grades", any:["payroll.payroll_setup_view"] },
      { label:"Income Tax Slabs", path:"/payroll/tax-slabs", any:["payroll.payroll_setup_view"] },
      { label:"HR Setup", path:"/hr/setup", any:["hr.departments_designations_edit"] },
      { label:"Library Settings", path:"/library/settings", any:["library.library_members_settings"] },
      { label:"Authors", path:"/library/authors", any:["library.catalogue_management"] },
      { label:"Publishers", path:"/library/publishers", any:["library.catalogue_management"] },
      { label:"Categories", path:"/library/categories", any:["library.catalogue_management"] },
      { label:"Departments", path:"/procurement/departments", any:["procurement_inventory.procurement_setup"] },
      { label:"Vendors", path:"/procurement/vendors", any:["procurement_inventory.procurement_setup"] },
      { label:"Item Master", path:"/procurement/items", any:["procurement_inventory.procurement_setup"] },
      { label:"Item Categories", path:"/procurement/item-categories", any:["procurement_inventory.procurement_setup"] },
      { label:"Approval Rules", path:"/procurement/approval-rules", any:["procurement_inventory.procurement_setup"] },
  ]},
  { label:"System", cat:"System", items:[
      { label:"Settings", path:"/settings-other", any:["settings.security_settings","settings.regional_format","settings.school_information"] },
      { label:"Roles", path:"/roles", any:["users_access.role_management","users_access.role_assignment","users_access.permission_history"] },
      { label:"Announcements", path:"/announcements", any:["communication.announcement_posting","communication.announcement_management"] },
      { label:"Workflow Config", path:"/workflow-config", any:["workflows_reports.workflow_builder"] },
      { label:"Notification Templates", path:"/notification-templates", any:["communication.notification_templates"] },
  ]},
];
// when the first page is visible, the lighter version of the same page (second) is hidden
const PREFER = [["/settings-other","/settings"], ["/management/academic","/management/academic-admin"], ["/management/finance","/finance"], ["/management/procurement","/procurement"], ["/library","/library/catalog"],
  // department setups contain their individual setup pages
  ["/setup/finance","/finance/setup"], ["/setup/hr","/hr/setup"], ["/setup/hr","/payroll/setup"], ["/setup/hr","/payroll/grades"], ["/setup/hr","/payroll/adjustments"], ["/setup/hr","/payroll/designation-grades"], ["/setup/hr","/payroll/tax-slabs"], ["/setup/library","/library/settings"], ["/setup/library","/library/authors"], ["/setup/library","/library/publishers"], ["/setup/library","/library/categories"], ["/setup/procurement","/procurement/departments"], ["/setup/procurement","/procurement/vendors"], ["/setup/procurement","/procurement/items"], ["/setup/procurement","/procurement/item-categories"], ["/setup/procurement","/procurement/approval-rules"], ["/setup/academic","/leave-setup"], ["/setup/academic","/academic-setup"], ["/setup/academic","/teacher-assignment"]];
// Management: each department's own page (hub) and the pages that belong under it
const MGMT_DEPTS = [
  { hubs:["/management/academic", "/management/academic-admin"], pages:["/datesheet"] },
  { hubs:["/management/hr"], pages:["/hr/staff", "/hr/leave", "/hr/attendance", "/payroll/runs", "/payroll/provident-fund", "/payroll/income-tax"] },
  { hubs:["/management/finance"], pages:["/finance"] },
  { hubs:["/management/procurement"], pages:["/procurement/pipeline", "/procurement/purchase-orders", "/procurement/grn", "/procurement/stock", "/procurement/vendor-invoices", "/procurement"] },
  { hubs:["/library"], pages:["/library/catalog", "/library/issue-return", "/library/members", "/library/damaged", "/library/lost", "/library/inventory", "/library/fines", "/library/fine-history"] },
];

const SUBNAV = {
  "/children": [
    { label:"Overview",    sub:"overview"    },
    { label:"Timetable",   sub:"timetable"   },
    { label:"Attendance",  sub:"attendance"  },
    { label:"Fees",        sub:"fees"        },
  ],
  "/students": [
    { label:"All Students",   sub:"list", any:["students.student_list_view"] },
    { label:"Enroll Student", sub:"enroll", any:["students.student_enrolment"] },
  ],
  "/teachers": [
    { label:"All Teachers",   sub:"list", any:["hr.staff_list_view"] },
    { label:"Add Teacher",    sub:"add", any:["hr.staff_create"] },
  ],
  "/academics": [
    { label:"Academic Years", sub:"years", any:["academics.session_view","academics.session_management"] },
    { label:"Classes",        sub:"classes", any:["academics.class_view","academics.class_management"] },
    { label:"Subjects",       sub:"subjects", any:["academics.subject_view","academics.subject_management"] },
    { label:"Timetable",      sub:"timetable", any:["academics.timetable_view","academics.timetable_edit"] },
    { label:"Class Overview",  sub:"overview", any:["academics.class_view"] },
  ],
  "/academics-other": [
    { label:"Timetable",      sub:"timetable", any:["academics.timetable_view"] },
    { label:"Class Overview",  sub:"overview", any:["academics.class_view"] },
  ],
  "/users": [
    { label:"All Users",      sub:"list", any:["users_access.user_list_view"] },
    { label:"Create User",    sub:"create", any:["users_access.user_create"] },
  ],
  "/finance": [
    { label:"Dashboard",        sub:"dashboard", any:["finance.finance_dashboard"] },
    { label:"Invoices",         sub:"invoices", any:["finance.invoice_view","finance.invoice_generation"] },
    { label:"Payments",         sub:"payments", any:["finance.payment_view","finance.payment_collection","finance.payment_verification"] },
    { label:"Discounts",        sub:"discounts", any:["finance.discount_view","finance.discount_grant"] },
    { label:"Locked Accounts",   sub:"locked-accounts", any:["finance.locked_accounts_view","finance.account_unlock"] },
    { label:"Charge Settlement", sub:"charge-settlement", any:["finance.invoice_generation","finance.payment_collection"] },
  ],
  "/finance/setup": [
    { label:"Auto-Generation",  sub:"fee-automation", any:["finance.invoice_auto_generation_settings"] },
    { label:"Charge Types",     sub:"charge-types", any:["finance.fee_setup_view","finance.fee_setup_edit"] },
    { label:"Fee Types",        sub:"fee-types", any:["finance.fee_setup_view","finance.fee_setup_edit"] },
    { label:"Class Fees",       sub:"class-fees", any:["finance.fee_setup_view","finance.fee_setup_edit"] },
    { label:"Discount Config",  sub:"discount-config", any:["finance.discount_rules","finance.discount_view"] },
    { label:"Extra Charges",    sub:"charges", any:["finance.fee_setup_view","finance.fee_setup_edit"] },
  ],
  "/settings": [
    { label:"ID Formats",     sub:"id_formats", any:["settings.school_information"] },
    { label:"School Info",    sub:"school_info", any:["settings.school_information"] },
    { label:"Fee Settings",   sub:"fee_settings", any:["finance.fee_reminders","finance.invoice_auto_generation_settings"] },
    { label:"School Timing",     sub:"school_timing", any:["settings.school_timing"] },
    { label:"Attendance Config", sub:"attendance_config", any:["attendance.attendance_settings"] },
    { label:"Account Settings",  sub:"account_settings", any:["settings.security_settings"] },
    { label:"Regional & Format", sub:"regional_format", any:["settings.regional_format"] },
  ],
  "/settings-other": [
    { label:"ID Formats",     sub:"id_formats", any:["settings.school_information"] },
    { label:"School Info",    sub:"school_info", any:["settings.school_information"] },
    { label:"Fee Settings",   sub:"fee_settings", any:["finance.fee_reminders","finance.invoice_auto_generation_settings"] },
    { label:"Account Settings",  sub:"account_settings", any:["settings.security_settings"] },
    { label:"Regional & Format", sub:"regional_format", any:["settings.regional_format"] },
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
    { label:"Roles & Permissions", sub:"roles", any:["users_access.role_management","users_access.role_assignment","users_access.permission_history"] },
  ],
  "/exams": [
    { label:"Exams",       path:"/exams",    end:true, any:["exams_results.exam_view"] },
    { label:"Datesheet",   path:"/datesheet", any:["exams_results.datesheet_edit"] },
    { label:"Exam Marks",  path:"/exam-marks", any:["exams_results.marks_entry"] },
  ],

  "/classes": [
    { label:"My Classes",     sub:"list"      },
    { label:"Timetable",      sub:"timetable" },
    { label:"Class Overview",  sub:"overview"  },
  ],

};

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
  const { formatDateTime } = useRegionalSettings();
  const { user, logout }        = useAuth();
  const { theme, colorMode, toggleColorMode } = useTheme();
  const location                = useLocation();
  const navigate                = useNavigate();
  const [activeSub, setActiveSub]       = useState(null);
  const [subGroup,  setSubGroup]         = useState("main");
  const [notifs, setNotifs]             = useState([]);
  const [unreadCount, setUnreadCount]   = useState(0);
  const [queueCount,  setQueueCount]    = useState(0);
  const [msgUnread,   setMsgUnread]     = useState(0);       // parent-teacher messages not yet read
  const [showNotifs, setShowNotifs]     = useState(false);
  const bellRef                         = React.useRef(null);

  const role      = user?.roles?.[0] || "student";
  const userPerms = user?.permissions || [];
  const [isHod, setIsHod] = useState(false);
  useEffect(() => {
    attendanceApi.getMyHodStatus().then(r => setIsHod(!!r.data.data.is_hod)).catch(() => {});
  }, []);
  const allowed = item => (item.always || (item.any || []).some(c => userPerms.includes(c)) || (item.orHod && isHod))
    && (item.all || []).every(c => userPerms.includes(c)) && (!item.requiresHod || isHod);
  const visible = new Set(MENU.flatMap(g => g.items.filter(allowed).map(i => i.path)));
  const hidden = new Set(PREFER.filter(([a]) => visible.has(a)).map(([, b]) => b));
  const navGroups = MENU.map(g => ({
    ...g,
    items: g.items.filter(item => allowed(item) && !hidden.has(item.path))
  })).filter(g => g.items.length > 0);
  const allNavItems = navGroups.flatMap(g => g.items);

  // Management row: departments, then (after a divider) the pages of the department you are in
  const here = location.pathname;
  const deptOf = pth => MGMT_DEPTS.find(d => [...d.hubs, ...d.pages].includes(pth));
  const activeMgmtDept = MGMT_DEPTS.find(d => [...d.hubs, ...d.pages].some(pth => here === pth || here.startsWith(pth + "/")));
  const managementRow = items => {
    const hubs = [], loose = [];
    for (const d of MGMT_DEPTS) {
      const hub = items.find(i => d.hubs.includes(i.path));
      if (hub) hubs.push({ ...hub, deptActive: d === activeMgmtDept });
      else loose.push(...items.filter(i => d.pages.includes(i.path)));            // no department page: show its pages directly
    }
    const other = items.filter(i => !deptOf(i.path));
    const activeHasHub = activeMgmtDept && items.some(i => activeMgmtDept.hubs.includes(i.path));
    const children = activeHasHub ? items.filter(i => activeMgmtDept.pages.includes(i.path))
      .sort((a, b) => activeMgmtDept.pages.indexOf(a.path) - activeMgmtDept.pages.indexOf(b.path))      // department's own order
      .map(i => ({ ...i, parent: true })) : [];
    return [...hubs, ...other, ...loose, ...(children.length ? [{ divider: true, path: "__divider", label: "" }] : []), ...children];
  };

  const currentPath  = "/" + location.pathname.split("/")[1];
  const fullPath = location.pathname;
  const subnavItemsAll  = (() => {
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
  // each tab shows only when the user has a permission that opens it (tabs without "any" are personal / always shown)
  const subnavItems = subnavItemsAll.filter(i => !i.any || i.any.some(code => userPerms.includes(code)));

  // Active category = group that contains the current path
  const activeCat = (navGroups.find(g => g.items.some(i => i.path === location.pathname)) || navGroups.find(g => g.items.some(i => i.path === currentPath)))?.cat || navGroups[0]?.cat;
  const [selCat, setSelCat] = useState(activeCat);

  // When route changes update selCat
  React.useEffect(() => {
    const cat = (navGroups.find(g => g.items.some(i => i.path === location.pathname)) || navGroups.find(g => g.items.some(i => i.path === currentPath)))?.cat;
    if (cat) setSelCat(cat);
    setSubGroup("main");
  }, [fullPath]);

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
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchUnreadCount = () => {
    notificationsApi.getUnreadCount().then(res => setUnreadCount(res.data.data?.count || 0)).catch(() => {});
    workQueueApi.getCount().then(r => setQueueCount(r.data?.data?.count || 0)).catch(()=>{});
    messagesApi.unreadCount().then(r => setMsgUnread(r.data?.data?.count || 0)).catch(()=>{});
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
      // Pages (e.g. Finance.jsx) that render different content per subnav item rely
      // on this event to sync their internal tab state; dispatch it here too, not
      // just from the click handler below, so landing on/switching between routes
      // that share the same top-level currentPath (e.g. /finance vs /finance/setup)
      // still notifies the page which sub-tab should be active.
      const event = new CustomEvent("subnav-change", { detail: { sub: subnavItems[0].sub } });
      window.dispatchEvent(event);
    } else {
      setActiveSub(null);
    }
  }, [fullPath]);

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

  // Load school info
  const [schoolInfo, setSchoolInfo] = React.useState({ name:"SchoolMS", logo:null });
  const [campusInfo, setCampusInfo] = React.useState(null);
  React.useEffect(() => {
    campusesApi.getMyCampus().then(r => setCampusInfo(r.data.data)).catch(() => {});
  }, []);
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
      <nav className="topnav" style={{ background: theme?.primary ? darkenColor(theme.primary, colorMode === "dark" ? 195 : 50) : "#1e3a5f" }}>
        {/* Brand */}
        <div className="topnav-brand">
          {schoolInfo.logo
            ? <img src={schoolInfo.logo} alt="logo" style={{ height:36, width:36, objectFit:"contain", borderRadius:6 }} />
            : <div style={{ width:36, height:36, background:"rgba(255,255,255,0.2)", borderRadius:6, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:16, color:"#fff" }}>S</div>
          }
          <div style={{ display:"flex", flexDirection:"column", justifyContent:"center" }}>
            <div className="topnav-brand-name">{schoolInfo.name}</div>
          </div>
          {campusInfo?.name && (
            <div style={{ display:"flex", alignItems:"center", gap:6, background:"rgba(255,255,255,0.12)", border:"0.5px solid rgba(255,255,255,0.25)", color:"#fff", fontSize:12, padding:"5px 12px", borderRadius:6, marginLeft:14 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><path d="M9 9v.01M9 12v.01M9 15v.01M9 18v.01"/></svg>
              {campusInfo.name}
            </div>
          )}
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
            {/* Messages: unread parent-teacher messages (only for people who can use Messages) */}
            {allNavItems.some(i => i.path === "/messages") && (
              <button
                onClick={() => navigate("/messages")}
                title={msgUnread > 0 ? `${msgUnread} unread message${msgUnread === 1 ? "" : "s"}` : "Messages"}
                aria-label={msgUnread > 0 ? `Messages, ${msgUnread} unread` : "Messages"}
                style={{ background:"none", border:"none", cursor:"pointer", position:"relative", padding:"4px 6px", display:"flex", alignItems:"center", marginRight:4 }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFD700" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z"/></svg>
                {msgUnread > 0 && (
                  <span style={{ position:"absolute", top:-2, right:-2, background:"#ef4444", color:"#fff", borderRadius:"50%", fontSize:10, fontWeight:700, minWidth:16, height:16, display:"flex", alignItems:"center", justifyContent:"center", padding:"0 3px" }}>
                    {msgUnread > 99 ? "99+" : msgUnread}
                  </span>
                )}
              </button>
            )}
            <button
              type="button"
              role="switch"
              aria-checked={colorMode === "dark"}
              aria-label="Dark mode"
              onClick={toggleColorMode}
              title={colorMode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              className={"mode-switch" + (colorMode === "dark" ? " mode-switch--dark" : "")}
            >
              {/* faint icons in the track show what the other side is */}
              <span className="mode-switch-track-icon mode-switch-track-icon--sun" aria-hidden="true">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
              </span>
              <span className="mode-switch-track-icon mode-switch-track-icon--moon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              </span>
              {/* the knob carries the current mode's icon */}
              <span className="mode-switch-knob" aria-hidden="true">
                {colorMode === "dark"
                  ? <svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                  : <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>}
              </span>
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
                          <div style={{ fontSize:11, color:"#94a3b8" }}>{formatDateTime(n.created_at)}</div>
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

          {role === "superadmin" && <CampusSwitcher />}
          <div className="topnav-divider" />
          <Link to="/profile" title="My Profile" aria-label="Open my profile" style={{ textDecoration:"none", display:"flex", alignItems:"center", gap:8 }}>
            <div className="topnav-avatar" style={{ background: theme?.primary || "#2563eb" }}>{initials}</div>
            <div>
              <div className="topnav-name">{user?.name}</div>
              <div className="topnav-role">{role.replace("_", " ")}</div>
            </div>
          </Link>
          <div className="topnav-divider" />
          <button className="topnav-logout" onClick={logout}>Sign Out</button>
        </div>
      </nav>

      {/* Ribbon row 1: category tabs */}
      <div className="ribbon-cats" style={{ background: theme?.primary ? darkenColor(theme.primary, colorMode === "dark" ? 175 : 40) : "#1e3a5f", borderBottom:"1px solid rgba(255,255,255,0.1)", "--nav-active-color": theme?.primary || "#1e3a5f" }}>
        {navGroups.map(g => (
          <button key={g.cat}
            className={"ribbon-cat " + (selCat===g.cat ? "active" : "")}
            onClick={() => { setSelCat(g.cat); navigate((g.items.find(i => i.path === "/dashboard") || g.items[0]).path); }}>
            {g.cat}
            {msgUnread > 0 && g.items.some(i => i.path === "/messages") && (
              <span aria-label="Unread messages" style={{ display:"inline-block", width:7, height:7, borderRadius:"50%", background:"#ef4444", marginLeft:6, verticalAlign:"middle" }} />
            )}
          </button>
        ))}
        <div style={{ flex:1 }} />
      </div>
                  {/* Ribbon row 2: items for active category */}
      <div className="ribbon-items">
        {(activeGroup?.cat === "Management" ? managementRow(activeGroup.items) : activeGroup?.cat === "Setup" ? activeGroup.items.filter(item => {
          if (!item.parent) return true;
          if (location.pathname.startsWith("/payroll")) return item.path.startsWith("/payroll");
          if (location.pathname.startsWith("/finance")) return item.path.startsWith("/finance");
          return true;
        }) : activeGroup?.items || []).map(item => {
          if (item.divider) return <div key="mgmt-divider" className="ribbon-divider" />;
          const isParentActive = item.deptActive ? true : item.end
            ? location.pathname !== item.path &&
              Array.isArray(SUBNAV[item.path]) &&
              SUBNAV[item.path].some(s => s.path === location.pathname)
            : false;
          return (<NavLink key={item.label + "::" + item.path} to={item.path} end={!!item.end}
            className={({ isActive }) => "ribbon-item" + (isActive || isParentActive ? " active" : "")}
            style={item.parent?{paddingLeft:8,fontSize:12,opacity:.85,borderLeft:"2px solid rgba(255,255,255,0.2)",marginLeft:4}:{}}>
            {item.parent&&!item.noArrow&&<span style={{marginRight:4,opacity:.6}}>&#8627;</span>}{item.label}
            {item.path === "/messages" && msgUnread > 0 && (
              <span aria-label={msgUnread + " unread messages"} style={{ marginLeft:6, minWidth:18, height:18, padding:"0 5px", boxSizing:"border-box", borderRadius:9,
                background:"#ef4444", color:"#fff", fontSize:10, fontWeight:700, display:"inline-flex", alignItems:"center", justifyContent:"center" }}>
                {msgUnread > 99 ? "99+" : msgUnread}
              </span>
            )}
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

      <main className="main-content no-hero">
        {children}
      </main>
    </div>
  );
}




function CampusSwitcher() {
  const [campuses, setCampuses] = useState([]);
  const [activeCampusId, setActiveCampusId] = useState(sessionStorage.getItem("active_campus_id") || "");

  useEffect(() => {
    campusesApi.list().then(r => setCampuses(r.data.data || [])).catch(() => {});
  }, []);

  const handleChange = (e) => {
    const val = e.target.value;
    if (val) sessionStorage.setItem("active_campus_id", val);
    else sessionStorage.removeItem("active_campus_id");
    // Full reload rather than local state propagation - simplest way to
    // guarantee every already-mounted page refetches its data under the
    // newly selected campus context, since campus_id flows through a
    // request header rather than React state or route params.
    window.location.reload();
  };

  return (
    <select
      value={activeCampusId}
      onChange={handleChange}
      title="Active campus context"
      style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 6, padding: "6px 10px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
    >
      <option value="" style={{ color: "#000" }}>All Campuses</option>
      {campuses.map(c => (
        <option key={c.id} value={c.id} style={{ color: "#000" }}>{c.name}</option>
      ))}
    </select>
  );
}
