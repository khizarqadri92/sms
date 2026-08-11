import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { RegionalSettingsProvider } from "./context/RegionalSettingsContext";
import IdleLock         from "./auth/IdleLock";
import PrivateRoute     from "./auth/PrivateRoute";
import RoleLayout       from "./layouts/RoleLayout";
import Login            from "./pages/Login";
import Dashboard        from "./pages/Dashboard";
import Students         from "./pages/Students";
import StudentProfile   from "./pages/StudentProfile";
import Teachers         from "./pages/Teachers";
import TeacherProfile   from "./pages/TeacherProfile";
import MyClasses        from "./pages/MyClasses";
import Attendance       from "./pages/Attendance";
import Users            from "./pages/Users";
import Roles            from "./pages/Roles";
import Forbidden        from "./pages/Forbidden";
import Academics       from "./pages/Academics";
import Settings       from "./pages/Settings";
import Profile        from "./pages/Profile";
import Finance       from "./pages/Finance";
import LockedStudents from "./pages/LockedStudents";
import FeeReport from "./pages/FeeReport";
import MyFees        from "./pages/MyFees";
import Children          from "./pages/Children";
import StudentTimetable  from "./pages/StudentTimetable";
import Diary             from "./pages/Diary";
import StudyMaterial     from "./pages/StudyMaterial";
import Leaves        from "./pages/Leaves";
import Syllabus       from "./pages/Syllabus";
import Withdrawal        from "./pages/Withdrawal";
import StudentAttendance  from "./pages/StudentAttendance";
import AdminAttendanceReport    from "./pages/AdminAttendanceReport";
import Announcements          from "./pages/Announcements";
import TeacherAttendanceReport  from "./pages/TeacherAttendanceReport";
import StudentAttendanceReport  from "./pages/StudentAttendanceReport";
import MyClassAttendanceReport  from "./pages/MyClassAttendanceReport";
import Discipline         from "./pages/Discipline";
import HRStaff           from "./pages/HRStaff";
import HRLeave           from "./pages/HRLeave";
import AttendanceDashboard from "./pages/AttendanceDashboard";
import PayrollSetup from "./pages/PayrollSetup";
import PayrollGrades from "./pages/PayrollGrades";
import PayrollAdjustments from "./pages/PayrollAdjustments";
import PayrollDesignationGrades from "./pages/PayrollDesignationGrades";
import PayrollTaxSlabs from "./pages/PayrollTaxSlabs";
import PayrollRuns from "./pages/PayrollRuns";
import EmployeeAttendance from "./pages/EmployeeAttendance";
import EmployeeSalariesReport from "./pages/EmployeeSalariesReport";
import ExpenditureDetailsReport from "./pages/ExpenditureDetailsReport";
import StaffLeave        from "./pages/StaffLeave";
import MyAttendance      from "./pages/MyAttendance";
import MyPayslips        from "./pages/MyPayslips";
import MyResignation     from "./pages/MyResignation";
import Resignations      from "./pages/Resignations";
import ProvidentFund     from "./pages/ProvidentFund";
import IncomeTax         from "./pages/IncomeTax";
import MyProfile         from "./pages/MyProfile";
import HRSetup           from "./pages/HRSetup";
import ConfigPage        from "./pages/ConfigPage";
import Exams            from "./pages/Exams";
import Datesheet        from "./pages/Datesheet";
import DatesheetView    from "./pages/DatesheetView";
import ExamMarks        from "./pages/ExamMarks";
import ExamDetail       from "./pages/ExamDetail";
import ExamResults      from "./pages/ExamResults";
import ClassResults     from "./pages/ClassResults";
import MarksHistory     from "./pages/MarksHistory";
import WithdrawalHistory from "./pages/WithdrawalHistory";
import HRDashboard      from "./pages/HRDashboard";
import LibrarianDashboard   from "./pages/LibrarianDashboard";
import LibraryCatalog       from "./pages/LibraryCatalog";
import LibraryMembers       from "./pages/LibraryMembers";
import LibraryIssueReturn   from "./pages/LibraryIssueReturn";
import LibrarySettings      from "./pages/LibrarySettings";
import LibraryAuthors       from "./pages/LibraryAuthors";
import LibraryPublishers    from "./pages/LibraryPublishers";
import LibraryCategories    from "./pages/LibraryCategories";
import LibraryDamagedBooks  from "./pages/LibraryDamagedBooks";
import LibraryPendingFines  from "./pages/LibraryPendingFines";
import LibraryFineHistory   from "./pages/LibraryFineHistory";
import LibraryLostBooks     from "./pages/LibraryLostBooks";
import LibraryInventory     from "./pages/LibraryInventory";
import Departments          from "./pages/Departments";
import Vendors               from "./pages/Vendors";
import Items                 from "./pages/Items";
import ItemCategories        from "./pages/ItemCategories";
import ApprovalRules         from "./pages/ApprovalRules";
import MyRequisitions        from "./pages/MyRequisitions";
import PendingApprovals      from "./pages/PendingApprovals";
import ProcurementRequisitions from "./pages/ProcurementRequisitions";
import PurchaseOrders        from "./pages/PurchaseOrders";
import ProcurementDashboard from "./pages/ProcurementDashboard";
import WorkQueue from "./pages/WorkQueue";
import WorkflowBuilder from "./pages/WorkflowBuilder";
import ReportPermissions from "./pages/ReportPermissions";
import RequestPermissions from "./pages/RequestPermissions";
import GRN from "./pages/GRN";
import Stock from "./pages/Stock";
import VendorInvoices from "./pages/VendorInvoices";
import LeaveApproval from "./pages/LeaveApproval";
import LeaveSetup    from "./pages/LeaveSetup";
import Notifications     from "./pages/Notifications";
import Assignments       from "./pages/Assignments";
import Quizzes           from "./pages/Quizzes";
import Calendar          from "./pages/Calendar";
import { ThemeProvider } from "./auth/ThemeContext";

export default function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
    <RegionalSettingsProvider>
      <IdleLock />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/403"   element={<PrivateRoute><RoleLayout><Forbidden /></RoleLayout></PrivateRoute>} />
          <Route path="/"      element={<Navigate to="/dashboard" replace />} />

          <Route path="/dashboard" element={
            <PrivateRoute><RoleLayout><Dashboard /></RoleLayout></PrivateRoute>
          }/>

          <Route path="/students" element={
            <PrivateRoute permission="students.view">
              <RoleLayout><Students /></RoleLayout>
            </PrivateRoute>
          }/>
          <Route path="/students/:id" element={
            <PrivateRoute permission="students.view">
              <RoleLayout><StudentProfile /></RoleLayout>
            </PrivateRoute>
          }/>

          <Route path="/teachers" element={
            <PrivateRoute permission="teachers.view">
              <RoleLayout><Teachers /></RoleLayout>
            </PrivateRoute>
          }/>
          <Route path="/teachers/:id" element={
            <PrivateRoute permission="teachers.view">
              <RoleLayout><TeacherProfile /></RoleLayout>
            </PrivateRoute>
          }/>

          <Route path="/classes" element={
            <PrivateRoute>
              <RoleLayout><MyClasses /></RoleLayout>
            </PrivateRoute>
          }/>

          <Route path="/attendance" element={
            <PrivateRoute permission="attendance.view">
              <RoleLayout><Attendance /></RoleLayout>
            </PrivateRoute>
          }/>
          <Route path="/reports/student-attendance" element={
            <PrivateRoute permission="attendance.view">
              <RoleLayout><StudentAttendance /></RoleLayout>
            </PrivateRoute>
          }/>
          <Route path="/announcements" element={<PrivateRoute permission="settings.view"><RoleLayout><Announcements /></RoleLayout></PrivateRoute>} />
          <Route path="/admin-attendance"         element={<PrivateRoute permission="reports.attendance_hub"><RoleLayout><AdminAttendanceReport /></RoleLayout></PrivateRoute>} />
          <Route path="/teacher-attendance-report" element={<PrivateRoute permission="reports.attendance_hub"><RoleLayout><TeacherAttendanceReport /></RoleLayout></PrivateRoute>} />
          <Route path="/student-attendance-report" element={<PrivateRoute permission="reports.attendance_hub"><RoleLayout><StudentAttendanceReport /></RoleLayout></PrivateRoute>} />
          <Route path="/attendance-report" element={<PrivateRoute><RoleLayout><MyClassAttendanceReport /></RoleLayout></PrivateRoute>} />

          <Route path="/users" element={
            <PrivateRoute permission="users.view">
              <RoleLayout><Users /></RoleLayout>
            </PrivateRoute>
          }/>
          <Route path="/roles" element={
            <PrivateRoute permission="roles.view">
              <RoleLayout><Roles /></RoleLayout>
            </PrivateRoute>
          }/>

          <Route path="/children" element={
            <PrivateRoute>
              <RoleLayout><Children /></RoleLayout>
            </PrivateRoute>
          }/>

          <Route path="/my-fees" element={
            <PrivateRoute>
              <RoleLayout><MyFees /></RoleLayout>
            </PrivateRoute>
          }/>

          <Route path="/finance" element={
            <PrivateRoute permission="finance.view">
              <RoleLayout><Finance /></RoleLayout>
            </PrivateRoute>
          }/>
          <Route path="/finance/setup" element={
            <PrivateRoute permission="finance.view">
              <RoleLayout><Finance /></RoleLayout>
            </PrivateRoute>
          }/>

          <Route path="/locked-students" element={
            <PrivateRoute permission="reports.locked_students">
              <RoleLayout><LockedStudents /></RoleLayout>
            </PrivateRoute>
          }/>

          <Route path="/fee-report" element={
            <PrivateRoute permission="reports.fee_report">
              <RoleLayout><FeeReport /></RoleLayout>
            </PrivateRoute>
          }/>

          <Route path="/profile" element={
            <PrivateRoute>
              <RoleLayout><Profile /></RoleLayout>
            </PrivateRoute>
          }/>

          <Route path="/settings" element={
            <PrivateRoute permission="roles.manage">
              <RoleLayout><Settings /></RoleLayout>
            </PrivateRoute>
          }/>

          <Route path="/academics" element={
            <PrivateRoute permission="academics.view">
              <RoleLayout><Academics /></RoleLayout>
            </PrivateRoute>
          }/>

          <Route path="/calendar" element={
            <PrivateRoute permission="calendar.view">
              <RoleLayout><Calendar /></RoleLayout>
            </PrivateRoute>
          }/>

          <Route path="/quizzes" element={
            <PrivateRoute permission="quiz.view">
              <RoleLayout><Quizzes /></RoleLayout>
            </PrivateRoute>
          }/>

          <Route path="/assignments" element={
            <PrivateRoute permission="assignment.view">
              <RoleLayout><Assignments /></RoleLayout>
            </PrivateRoute>
          }/>

                    <Route path="/leaves"         element={<PrivateRoute><RoleLayout><Leaves /></RoleLayout></PrivateRoute>} />
          <Route path="/payroll/provident-fund" element={<PrivateRoute permission="payroll.pf.view_all"><RoleLayout><ProvidentFund /></RoleLayout></PrivateRoute>} />
          <Route path="/payroll/income-tax" element={<PrivateRoute permission="payroll.income_tax.view_all"><RoleLayout><IncomeTax /></RoleLayout></PrivateRoute>} />
          <Route path="/syllabus"       element={<PrivateRoute><RoleLayout><Syllabus /></RoleLayout></PrivateRoute>} />
          <Route path="/library"        element={<PrivateRoute><RoleLayout><LibrarianDashboard /></RoleLayout></PrivateRoute>} />
          <Route path="/library/catalog" element={<PrivateRoute permission="library.view"><RoleLayout><LibraryCatalog /></RoleLayout></PrivateRoute>} />
          <Route path="/library/members" element={<PrivateRoute permission="library.manage"><RoleLayout><LibraryMembers /></RoleLayout></PrivateRoute>} />
          <Route path="/library/issue-return" element={<PrivateRoute permission="library.issue"><RoleLayout><LibraryIssueReturn /></RoleLayout></PrivateRoute>} />
          <Route path="/library/settings" element={<PrivateRoute permission="library.manage"><RoleLayout><LibrarySettings /></RoleLayout></PrivateRoute>} />
          <Route path="/library/authors" element={<PrivateRoute permission="library.manage"><RoleLayout><LibraryAuthors /></RoleLayout></PrivateRoute>} />
          <Route path="/library/publishers" element={<PrivateRoute permission="library.manage"><RoleLayout><LibraryPublishers /></RoleLayout></PrivateRoute>} />
          <Route path="/library/categories" element={<PrivateRoute permission="library.manage"><RoleLayout><LibraryCategories /></RoleLayout></PrivateRoute>} />
          <Route path="/library/damaged" element={<PrivateRoute permission="library.manage"><RoleLayout><LibraryDamagedBooks /></RoleLayout></PrivateRoute>} />
          <Route path="/library/fines" element={<PrivateRoute permission="library.issue"><RoleLayout><LibraryPendingFines /></RoleLayout></PrivateRoute>} />
          <Route path="/library/fine-history" element={<PrivateRoute permission="library.issue"><RoleLayout><LibraryFineHistory /></RoleLayout></PrivateRoute>} />
          <Route path="/library/lost" element={<PrivateRoute permission="library.manage"><RoleLayout><LibraryLostBooks /></RoleLayout></PrivateRoute>} />
          <Route path="/library/inventory" element={<PrivateRoute permission="library.manage"><RoleLayout><LibraryInventory /></RoleLayout></PrivateRoute>} />
          <Route path="/procurement/departments" element={<PrivateRoute permission="procurement.manage"><RoleLayout><Departments /></RoleLayout></PrivateRoute>} />
          <Route path="/procurement/vendors" element={<PrivateRoute permission="procurement.view"><RoleLayout><Vendors /></RoleLayout></PrivateRoute>} />
          <Route path="/procurement/items" element={<PrivateRoute permission="procurement.view"><RoleLayout><Items /></RoleLayout></PrivateRoute>} />
          <Route path="/procurement/item-categories" element={<PrivateRoute permission="procurement.manage"><RoleLayout><ItemCategories /></RoleLayout></PrivateRoute>} />
          <Route path="/procurement/approval-rules" element={<PrivateRoute permission="procurement.manage"><RoleLayout><ApprovalRules /></RoleLayout></PrivateRoute>} />
          <Route path="/procurement/my-requisitions" element={<PrivateRoute><RoleLayout><MyRequisitions /></RoleLayout></PrivateRoute>} />
          <Route path="/procurement/pending-approvals" element={<PrivateRoute><RoleLayout><PendingApprovals /></RoleLayout></PrivateRoute>} />
          <Route path="/procurement/pipeline" element={<PrivateRoute permission="procurement.view"><RoleLayout><ProcurementRequisitions /></RoleLayout></PrivateRoute>} />
          <Route path="/procurement/purchase-orders" element={<PrivateRoute permission="procurement.view"><RoleLayout><PurchaseOrders /></RoleLayout></PrivateRoute>} />
          <Route path="/withdrawal"         element={<PrivateRoute><RoleLayout><Withdrawal /></RoleLayout></PrivateRoute>} />
          <Route path="/my-profile"          element={<PrivateRoute><RoleLayout><MyProfile /></RoleLayout></PrivateRoute>} />
              <Route path="/staff-leave"         element={<PrivateRoute><RoleLayout><StaffLeave /></RoleLayout></PrivateRoute>} />
              <Route path="/my-attendance"      element={<PrivateRoute><RoleLayout><MyAttendance /></RoleLayout></PrivateRoute>} />
              <Route path="/my-payslips"        element={<PrivateRoute><RoleLayout><MyPayslips /></RoleLayout></PrivateRoute>} />
              <Route path="/my-resignation"     element={<PrivateRoute><RoleLayout><MyResignation /></RoleLayout></PrivateRoute>} />
              <Route path="/hr/leave"            element={<PrivateRoute permission="hr.view"><RoleLayout><HRLeave /></RoleLayout></PrivateRoute>} />
              <Route path="/hr/attendance"       element={<PrivateRoute permission="hr.view"><RoleLayout><AttendanceDashboard /></RoleLayout></PrivateRoute>} />
              <Route path="/hr/resignations"      element={<PrivateRoute permission="hr.view" requestType="resignation"><RoleLayout><Resignations /></RoleLayout></PrivateRoute>} />
              <Route path="/payroll/setup"       element={<PrivateRoute permission="payroll.view"><RoleLayout><PayrollSetup /></RoleLayout></PrivateRoute>} />
              <Route path="/payroll/grades"       element={<PrivateRoute permission="payroll.view"><RoleLayout><PayrollGrades /></RoleLayout></PrivateRoute>} />
              <Route path="/payroll/adjustments"   element={<PrivateRoute permission="payroll.view"><RoleLayout><PayrollAdjustments /></RoleLayout></PrivateRoute>} />
              <Route path="/payroll/designation-grades" element={<PrivateRoute permission="payroll.view"><RoleLayout><PayrollDesignationGrades /></RoleLayout></PrivateRoute>} />
              <Route path="/payroll/tax-slabs" element={<PrivateRoute permission="payroll.view"><RoleLayout><PayrollTaxSlabs /></RoleLayout></PrivateRoute>} />
              <Route path="/payroll/runs" element={<PrivateRoute permission="payroll.edit"><RoleLayout><PayrollRuns /></RoleLayout></PrivateRoute>} />
              <Route path="/reports/employee-attendance" element={<PrivateRoute permission="reports.employee_attendance"><RoleLayout><EmployeeAttendance /></RoleLayout></PrivateRoute>} />
              <Route path="/reports/employee-salaries" element={<PrivateRoute permission="reports.employee_salaries"><RoleLayout><EmployeeSalariesReport /></RoleLayout></PrivateRoute>} />
              <Route path="/reports/expenditure-details" element={<PrivateRoute permission="reports.expenditure"><RoleLayout><ExpenditureDetailsReport /></RoleLayout></PrivateRoute>} />
              <Route path="/my-department-attendance" element={<PrivateRoute><RoleLayout><AttendanceDashboard /></RoleLayout></PrivateRoute>} />
              <Route path="/hr/staff"            element={<PrivateRoute permission="hr.view"><RoleLayout><HRStaff /></RoleLayout></PrivateRoute>} />
              <Route path="/hr/setup"            element={<PrivateRoute permission="hr.designations"><RoleLayout><HRSetup /></RoleLayout></PrivateRoute>} />
              <Route path="/discipline"          element={<PrivateRoute permission="discipline.view"><RoleLayout><Discipline /></RoleLayout></PrivateRoute>} />
          <Route path="/workflow-config"     element={<PrivateRoute permission="settings.manage"><RoleLayout><ConfigPage /></RoleLayout></PrivateRoute>} />
          <Route path="/exams"               element={<PrivateRoute permission="exam.view"><RoleLayout><Exams /></RoleLayout></PrivateRoute>} />
          <Route path="/datesheet"           element={<PrivateRoute permission="exam.manage"><RoleLayout><Datesheet /></RoleLayout></PrivateRoute>} />
          <Route path="/datesheet-view"      element={<PrivateRoute><RoleLayout><DatesheetView /></RoleLayout></PrivateRoute>} />
          <Route path="/exam-marks"          element={<PrivateRoute permission="exam.marks"><RoleLayout><ExamMarks /></RoleLayout></PrivateRoute>} />
          <Route path="/exams/:id"            element={<PrivateRoute permission="exam.view"><RoleLayout><ExamDetail /></RoleLayout></PrivateRoute>} />
          <Route path="/exam-results"        element={<PrivateRoute permission="exam.view"><RoleLayout><ExamResults /></RoleLayout></PrivateRoute>} />
          <Route path="/class-results"       element={<PrivateRoute permission="exam.view"><RoleLayout><ClassResults /></RoleLayout></PrivateRoute>} />
          <Route path="/marks-history"       element={<PrivateRoute permission="exam.marks"><RoleLayout><MarksHistory /></RoleLayout></PrivateRoute>} />
          <Route path="/withdrawal-history" element={<PrivateRoute><RoleLayout><WithdrawalHistory /></RoleLayout></PrivateRoute>} />
          <Route path="/procurement/vendor-invoices" element={<PrivateRoute permission="procurement.view"><RoleLayout><VendorInvoices /></RoleLayout></PrivateRoute>} />
          <Route path="/procurement/stock" element={<PrivateRoute permission="procurement.view"><RoleLayout><Stock /></RoleLayout></PrivateRoute>} />
          <Route path="/procurement/grn" element={<PrivateRoute permission="procurement.view"><RoleLayout><GRN /></RoleLayout></PrivateRoute>} />
          <Route path="/workflow-builder" element={<PrivateRoute><RoleLayout><WorkflowBuilder /></RoleLayout></PrivateRoute>} />
              <Route path="/report-permissions" element={<PrivateRoute permission="users.manage_roles"><RoleLayout><ReportPermissions /></RoleLayout></PrivateRoute>} />
              <Route path="/request-permissions" element={<PrivateRoute permission="users.manage_roles"><RoleLayout><RequestPermissions /></RoleLayout></PrivateRoute>} />
          <Route path="/work-queue" element={<PrivateRoute><RoleLayout><WorkQueue /></RoleLayout></PrivateRoute>} />
          <Route path="/procurement"    element={<PrivateRoute><RoleLayout><ProcurementDashboard /></RoleLayout></PrivateRoute>} />
          <Route path="/leave-approval" element={<PrivateRoute><RoleLayout><LeaveApproval /></RoleLayout></PrivateRoute>} />
          <Route path="/leave-setup"    element={<PrivateRoute><RoleLayout><LeaveSetup /></RoleLayout></PrivateRoute>} />
          <Route path="/notifications" element={
            <PrivateRoute>
              <RoleLayout><Notifications /></RoleLayout>
            </PrivateRoute>
          }/>

          <Route path="/materials" element={
            <PrivateRoute permission="material.view">
              <RoleLayout><StudyMaterial /></RoleLayout>
            </PrivateRoute>
          }/>

          <Route path="/diary" element={
            <PrivateRoute permission="diary.view">
              <RoleLayout><Diary /></RoleLayout>
            </PrivateRoute>
          }/>

          <Route path="/timetable" element={
            <PrivateRoute permission="timetable.view">
              <RoleLayout><StudentTimetable /></RoleLayout>
            </PrivateRoute>
          }/>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </RegionalSettingsProvider>
    </AuthProvider>
    </ThemeProvider>
  );
}

