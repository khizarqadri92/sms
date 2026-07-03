import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
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
import AttendanceReport  from "./pages/AttendanceReport";
import AdminAttendanceReport    from "./pages/AdminAttendanceReport";
import Announcements          from "./pages/Announcements";
import TeacherAttendanceReport  from "./pages/TeacherAttendanceReport";
import StudentAttendanceReport  from "./pages/StudentAttendanceReport";
import Discipline         from "./pages/Discipline";
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
import ProcurementDashboard from "./pages/ProcurementDashboard";
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
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/403"   element={<Forbidden />} />
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
          <Route path="/attendance-report" element={
            <PrivateRoute permission="attendance.view">
              <RoleLayout><AttendanceReport /></RoleLayout>
            </PrivateRoute>
          }/>
          <Route path="/announcements" element={<PrivateRoute permission="settings.view"><RoleLayout><Announcements /></RoleLayout></PrivateRoute>} />
          <Route path="/admin-attendance"         element={<PrivateRoute permission="attendance.view"><RoleLayout><AdminAttendanceReport /></RoleLayout></PrivateRoute>} />
          <Route path="/teacher-attendance-report" element={<PrivateRoute permission="attendance.view"><RoleLayout><TeacherAttendanceReport /></RoleLayout></PrivateRoute>} />
          <Route path="/student-attendance-report" element={<PrivateRoute permission="attendance.view"><RoleLayout><StudentAttendanceReport /></RoleLayout></PrivateRoute>} />

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

          <Route path="/locked-students" element={
            <PrivateRoute permission="students.view">
              <RoleLayout><LockedStudents /></RoleLayout>
            </PrivateRoute>
          }/>

          <Route path="/fee-report" element={
            <PrivateRoute>
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
          <Route path="/syllabus"       element={<PrivateRoute><RoleLayout><Syllabus /></RoleLayout></PrivateRoute>} />
          <Route path="/library"        element={<PrivateRoute><RoleLayout><LibrarianDashboard /></RoleLayout></PrivateRoute>} />
          <Route path="/withdrawal"         element={<PrivateRoute><RoleLayout><Withdrawal /></RoleLayout></PrivateRoute>} />
          <Route path="/attendance-report"  element={<PrivateRoute permission="attendance.view"><RoleLayout><AttendanceReport /></RoleLayout></PrivateRoute>} />
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
    </AuthProvider>
    </ThemeProvider>
  );
}

