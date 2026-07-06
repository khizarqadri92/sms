import React, { useState, useEffect } from "react";
import AnnouncementTicker from '../components/AnnouncementTicker';
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import dashboardApi from "../api/dashboardApi";
import notificationsApi from "../api/notificationsApi";
import { useTheme } from "../auth/ThemeContext";
import "./RoleLayout.css";

const NAV = {
  superadmin: [
    { label:"General",    cat:"General",    items:[
      { label:"Dashboard", path:"/dashboard" },
      { label:"Calendar",  path:"/calendar"  },
    ]},
    { label:"People",     cat:"People",     items:[
      { label:"Students",  path:"/students"  },
      { label:"Teachers",  path:"/teachers"  },
      { label:"Users",     path:"/users"     },
    ]},
    { label:"Academic",   cat:"Academic",   items:[
      { label:"Academics",        path:"/academics"      },
      { label:"Syllabus",         path:"/syllabus"       },
      { label:"Withdrawal",       path:"/withdrawal"     },
      { label:"Discipline",       path:"/discipline"     },
    ]},
    { label:"Exams",      cat:"Exams",      items:[
      { label:"Exams",            path:"/exams"                              },
      { label:"Datesheet",         path:"/datesheet",    perm:"exam.manage" },
      { label:"Exam Marks",        path:"/exam-marks",   perm:"exam.marks"  },
    ]},
    { label:"Finance",    cat:"Finance",    items:[
      { label:"Finance",   path:"/finance"   },
    ]},
    { label:"Management", cat:"Management", items:[
      { label:"Dashboard",    path:"/library",             perm:"library.view" },
      { label:"Catalog",      path:"/library/catalog",     perm:"library.view" },
      { label:"Issue/Return", path:"/library/issue-return", perm:"library.issue" },
      { label:"Members",      path:"/library/members",     perm:"library.manage" },
      { label:"Damaged Books", path:"/library/damaged",     perm:"library.manage" },
      { label:"Lost Books",    path:"/library/lost",       perm:"library.manage" },
      { label:"Inventory",     path:"/library/inventory",  perm:"library.manage" },
      { label:"Pending Fines", path:"/library/fines",      perm:"library.issue" },
      { label:"Fine History",  path:"/library/fine-history", perm:"library.issue" },
    ]},
    { label:"Setup",      cat:"Setup",      items:[
      { label:"Library Settings", path:"/library/settings",    perm:"library.manage" },
      { label:"Authors",          path:"/library/authors",     perm:"library.manage" },
      { label:"Publishers",       path:"/library/publishers",  perm:"library.manage" },
      { label:"Categories",       path:"/library/categories",  perm:"library.manage" },
    ]},
    { label:"Procurement", cat:"Procurement", items:[
      { label:"Vendors",      path:"/procurement/vendors", perm:"procurement.view" },
      { label:"Item Master",  path:"/procurement/items",   perm:"procurement.view" },
      { label:"Item Categories", path:"/procurement/item-categories", perm:"procurement.manage" },
      { label:"Requisitions Pipeline", path:"/procurement/pipeline", perm:"procurement.view" },
      { label:"Purchase Orders", path:"/procurement/purchase-orders", perm:"procurement.view" },
      { label:"Departments",  path:"/procurement/departments", perm:"procurement.manage" },
      { label:"Approval Rules", path:"/procurement/approval-rules", perm:"procurement.manage" },
    ]},
    { label:"Reports",    cat:"Reports",    items:[
      { label:"Attendance",  path:"/admin-attendance"          },
      { label:"By Teacher", path:"/teacher-attendance-report", parent:"/admin-attendance" },
      { label:"By Student", path:"/student-attendance-report", parent:"/admin-attendance" },
      { label:"Fee Report", path:"/fee-report" },
    ]},
    { label:"System",     cat:"System",     items:[
      { label:"Settings",         path:"/settings"       },
      { label:"Roles",            path:"/roles"          },
      { label:"Announcements",    path:"/announcements"  },
      { label:"Leave Setup",      path:"/leave-setup"    },
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
      { label:"Calendar",  path:"/calendar"  },
    ]},
    { label:"People",     cat:"People",     items:[
      { label:"Students",  path:"/students"  },
      { label:"Teachers",  path:"/teachers"  },
    ]},
    { label:"Academic",   cat:"Academic",   items:[
      { label:"Academics", path:"/academics" },
      { label:"Syllabus",  path:"/syllabus"  },
      { label:"Reports",   path:"/reports"   },
      { label:"Withdrawal", path:"/withdrawal" },
    ]},
    { label:"Reports",    cat:"Reports",    items:[
      { label:"Attendance",  path:"/admin-attendance"          },
      { label:"By Teacher", path:"/teacher-attendance-report", parent:"/admin-attendance" },
      { label:"By Student", path:"/student-attendance-report", parent:"/admin-attendance" },
      { label:"Fee Report", path:"/fee-report" },
    ]},
    { label:"System",     cat:"System",     items:[
      { label:"Leave Setup",      path:"/leave-setup"    },
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
      { label:"Calendar",   path:"/calendar"   },
    ]},
    { label:"Academic",   cat:"Academic",   items:[
      { label:"Academics",      path:"/academics"      },
      { label:"Syllabus",       path:"/syllabus"       },
      { label:"Staff",          path:"/teachers"       },
      { label:"Attendance",     path:"/attendance" },
      { label:"Diary",          path:"/diary"          },
      { label:"Leave Requests",     path:"/leave-approval"    },
      { label:"Withdrawal",        path:"/withdrawal"      },
      { label:"Discipline",         path:"/discipline"      },
      { label:"Exams",              path:"/exams"           },
    ]},
    { label:"Classroom",  cat:"Classroom",  items:[
      { label:"Assignments", path:"/assignments" },
      { label:"Quizzes",     path:"/quizzes"     },
      { label:"Materials",   path:"/materials"   },
    ]},
    { label:"Reports",    cat:"Reports",    items:[
      { label:"Attendance",  path:"/admin-attendance"          },
      { label:"By Teacher", path:"/teacher-attendance-report", parent:"/admin-attendance" },
      { label:"By Student", path:"/student-attendance-report", parent:"/admin-attendance" },
      { label:"Announcements", path:"/announcements" },
      { label:"Locked Students", path:"/locked-students" },
      { label:"Fee Report", path:"/fee-report" },
    ]},
    { label:"Purchase Requests", cat:"Purchase Requests", items:[
      { label:"My Requisitions",    path:"/procurement/my-requisitions",     perm:null },
      { label:"Pending Approvals",  path:"/procurement/pending-approvals",   perm:null },
    ]},
  ],
  academic_coordinator: [
    { label:"General",    cat:"General",    items:[
      { label:"Dashboard", path:"/dashboard" },
      { label:"Calendar",  path:"/calendar"  },
    ]},
    { label:"Academic",   cat:"Academic",   items:[
      { label:"Academics",      path:"/academics"      },
      { label:"Syllabus",       path:"/syllabus"       },
      { label:"Diary",          path:"/diary"          },
      { label:"Exams",          path:"/exams"          },
      { label:"Datesheet",       path:"/datesheet",     parent:"/exams" },
      { label:"Leave Requests", path:"/leave-approval" },
      { label:"Withdrawal",        path:"/withdrawal"      },
      { label:"Discipline",         path:"/discipline"       },
    ]},
    { label:"Reports",    cat:"Reports",    items:[
      { label:"Attendance",  path:"/admin-attendance"                                     },
      { label:"By Class",   path:"/admin-attendance",          parent:"/admin-attendance"  },
      { label:"By Teacher", path:"/teacher-attendance-report", parent:"/admin-attendance"  },
      { label:"By Student", path:"/student-attendance-report", parent:"/admin-attendance"  },
      { label:"Locked Students", path:"/locked-students" },
      { label:"Fee Report", path:"/fee-report" },
    ]},
    { label:"Purchase Requests", cat:"Purchase Requests", items:[
      { label:"My Requisitions",    path:"/procurement/my-requisitions",     perm:null },
      { label:"Pending Approvals",  path:"/procurement/pending-approvals",   perm:null },
    ]},
  ],
  teacher: [
    { label:"General",    cat:"General",    items:[
      { label:"Dashboard",  path:"/dashboard" },
      { label:"Calendar",   path:"/calendar"  },
    ]},
    { label:"Academic",   cat:"Academic",   items:[
      { label:"My Classes",     path:"/classes"        },
      { label:"Syllabus",       path:"/syllabus"       },
      { label:"Attendance",     path:"/attendance"     },
      { label:"Diary",          path:"/diary"          },
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
      { label:"Fee Report", path:"/fee-report" },
    ]},
    { label:"Purchase Requests", cat:"Purchase Requests", items:[
      { label:"My Requisitions",    path:"/procurement/my-requisitions",     perm:null },
      { label:"Pending Approvals",  path:"/procurement/pending-approvals",   perm:null },
    ]},
  ],
  finance_officer: [
    { label:"General",    cat:"General",    items:[
      { label:"Dashboard", path:"/dashboard" },
      { label:"Calendar",  path:"/calendar"  },
    ]},
    { label:"Finance",    cat:"Finance",    items:[
      { label:"Finance",   path:"/finance"   },
    ]},
    { label:"Academic",   cat:"Academic",   items:[
      { label:"Withdrawal", path:"/withdrawal" },
    ]},
    { label:"Reports",    cat:"Reports",    items:[
      { label:"Fee Report", path:"/fee-report" },
    ]},
    { label:"Purchase Requests", cat:"Purchase Requests", items:[
      { label:"My Requisitions",    path:"/procurement/my-requisitions",     perm:null },
      { label:"Pending Approvals",  path:"/procurement/pending-approvals",   perm:null },
    ]},
  ],
  parent: [
    { label:"General",    cat:"General",    items:[
      { label:"Dashboard",   path:"/dashboard" },
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
      { label:"Fee Report", path:"/fee-report" },
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
      { label:"Calendar",       path:"/calendar",       perm:"calendar.view"},
    ]},
    { label:"Staff",    cat:"Staff",    items:[
      { label:"Teachers",       path:"/teachers",       perm:"teachers.view"  },
      { label:"Attendance",     path:"/attendance",     perm:"attendance.view"},
      { label:"Leave Requests", path:"/leave-approval", perm:"leave.view_all" },
      { label:"Withdrawal",       path:"/withdrawal",      perm:"withdrawal.clear" },
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
      { label:"Calendar",   path:"/calendar",  perm:"calendar.view"  },
    ]},
    { label:"Management", cat:"Management", items:[
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
      { label:"Calendar",     path:"/calendar",     perm:"calendar.view"       },
    ]},
    { label:"Management",  cat:"Management",  items:[
      { label:"Procurement",  path:"/procurement",  perm:"procurement.view"    },
      { label:"Vendors",      path:"/procurement/vendors", perm:"procurement.view" },
      { label:"Item Master",  path:"/procurement/items",   perm:"procurement.view" },
      { label:"Item Categories", path:"/procurement/item-categories", perm:"procurement.manage" },
      { label:"Requisitions Pipeline", path:"/procurement/pipeline", perm:"procurement.view" },
      { label:"Purchase Orders", path:"/procurement/purchase-orders", perm:"procurement.view" },
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
      { label:"Fee Report", path:"/fee-report" },
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
    { label:"Dashboard",        sub:"dashboard",         group:"main"  },
    { label:"Invoices",         sub:"invoices",          group:"main"  },
    { label:"Payments",         sub:"payments",          group:"main"  },
    { label:"Discounts",        sub:"discounts",         group:"main"  },
    { label:"Locked Accounts",   sub:"locked-accounts",   group:"main"  },
    { label:"Charge Settlement", sub:"charge-settlement", group:"main"  },
    { label:"Auto-Generation",  sub:"fee-automation",  group:"setup" },
    { label:"Charge Types",     sub:"charge-types",    group:"setup" },
    { label:"Fee Types",        sub:"fee-types",       group:"setup" },
    { label:"Class Fees",       sub:"class-fees",      group:"setup" },
    { label:"Discount Config",  sub:"discount-config", group:"setup" },
    { label:"Extra Charges",    sub:"charges",         group:"setup" },
  ],
  "/settings": [
    { label:"ID Formats",     sub:"id_formats"   },
    { label:"School Info",    sub:"school_info"  },
    { label:"Fee Settings",   sub:"fee_settings" },
    { label:"School Timing",     sub:"school_timing"     },
    { label:"Attendance Config", sub:"attendance_config" },
    { label:"Account Settings",  sub:"account_settings"  },
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
  const [showNotifs, setShowNotifs]     = useState(false);
  const bellRef                         = React.useRef(null);

  const role      = user?.roles?.[0] || "student";
  const userPerms = user?.permissions || [];
  const rawNavGroups = NAV[role] || NAV.student;
  const navGroups = rawNavGroups.map(g => ({
    ...g,
    items: g.items.filter(item => !item.perm || userPerms.includes(item.perm))
  })).filter(g => g.items.length > 0);
  const allNavItems = navGroups.flatMap(g => g.items);

  const currentPath  = "/" + location.pathname.split("/")[1];
  const subnavItems  = SUBNAV[currentPath] || [];

  // Active category = group that contains the current path
  const activeCat = navGroups.find(g => g.items.some(i => i.path === currentPath))?.cat || navGroups[0]?.cat;
  const [selCat, setSelCat] = useState(activeCat);

  // When route changes update selCat
  React.useEffect(() => {
    const cat = navGroups.find(g => g.items.some(i => i.path === currentPath))?.cat;
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
    notificationsApi.getUnreadCount()
      .then(res => setUnreadCount(res.data.data?.count || 0))
      .catch(() => {});
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
      <div className="ribbon-cats" style={{ background: theme?.primary ? darkenColor(theme.primary, 40) : "#1e3a5f", borderBottom:"1px solid rgba(255,255,255,0.1)" }}>
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
        {activeGroup?.items.map(item => (
          <NavLink key={item.path} to={item.path}
            className={({ isActive }) => "ribbon-item" + (isActive ? " active" : "")}
            style={item.parent?{paddingLeft:8,fontSize:12,opacity:.85,borderLeft:"2px solid rgba(255,255,255,0.2)",marginLeft:4}:{}}>
            {item.parent&&<span style={{marginRight:4,opacity:.6}}>&#8627;</span>}{item.label}
          </NavLink>
        ))}
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
              <button key={item.sub}
                className={"ribbon-item " + (activeSub===item.sub ? "active" : "")}
                onClick={() => handleSubNav(item.sub)}>
                {item.label}
              </button>
            ))}
          </>
        )}
      </div>


      {/* Announcements Ticker */}
      <AnnouncementTicker />
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


