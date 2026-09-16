import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { useAuth } from './auth/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { CasesPage } from './pages/CasesPage';
import { NewCasePage } from './pages/NewCasePage';
import { CaseDetailPage } from './pages/CaseDetailPage';
import { NewEvidencePage } from './pages/NewEvidencePage';
import { EvidenceDetailPage } from './pages/EvidenceDetailPage';
import { CustodyPage } from './pages/CustodyPage';
import { ReportsPage } from './pages/ReportsPage';
import { DashboardPage } from './pages/DashboardPage';
import { UsersPage } from './pages/UsersPage';
import { CorrelationGraphPage } from './pages/CorrelationGraphPage';
import { Spinner } from './components/ui';

/** Sends each role to the first page it is actually allowed to open. */
function HomeRedirect() {
  const { officer, loading, can } = useAuth();

  if (loading) return <Spinner label="Restoring session…" />;
  if (!officer) return <Navigate to="/login" replace />;
  if (can('VIEW_CASE_DATA')) return <Navigate to="/cases" replace />;
  if (can('VIEW_DASHBOARD')) return <Navigate to="/dashboard" replace />;
  if (can('UPLOAD_REPORT')) return <Navigate to="/reports" replace />;

  return (
    <div className="fs-card mx-auto max-w-lg text-center">
      <h2 className="text-lg font-semibold text-forensic-900">No pages available</h2>
      <p className="mt-2 text-sm text-slate-600">
        The role <strong>{officer.role}</strong> has no use cases assigned in this build.
      </p>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<HomeRedirect />} />

        {/* Use case: View Case Timeline */}
        <Route
          path="/cases"
          element={
            <ProtectedRoute permission="VIEW_CASE_DATA">
              <CasesPage />
            </ProtectedRoute>
          }
        />
        {/* Cross-Case Intelligence Graph */}
        <Route
          path="/intelligence"
          element={
            <ProtectedRoute permission="VIEW_INTELLIGENCE">
              <CorrelationGraphPage />
            </ProtectedRoute>
          }
        />
        {/* Use case: Create Crime Report */}
        <Route
          path="/cases/new"
          element={
            <ProtectedRoute permission="CREATE_CASE">
              <NewCasePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/cases/:caseId"
          element={
            <ProtectedRoute permission="VIEW_CASE_DATA">
              <CaseDetailPage />
            </ProtectedRoute>
          }
        />
        {/* Use case: Register Evidence Item */}
        <Route
          path="/cases/:caseId/evidence/new"
          element={
            <ProtectedRoute permission="REGISTER_EVIDENCE">
              <NewEvidencePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/evidence/:evidenceId"
          element={
            <ProtectedRoute permission="VIEW_CASE_DATA">
              <EvidenceDetailPage />
            </ProtectedRoute>
          }
        />

        {/* Use case: Log Chain of Custody */}
        <Route
          path="/custody"
          element={
            <ProtectedRoute permission="LOG_CUSTODY">
              <CustodyPage />
            </ProtectedRoute>
          }
        />

        {/* Use case: Upload Laboratory and Witness Reports */}
        <Route
          path="/reports"
          element={
            <ProtectedRoute permission="UPLOAD_REPORT">
              <ReportsPage />
            </ProtectedRoute>
          }
        />

        {/* Use case: View Analytics Dashboard */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute permission="VIEW_DASHBOARD">
              <DashboardPage />
            </ProtectedRoute>
          }
        />

        {/* System Administrator: manage users */}
        <Route
          path="/users"
          element={
            <ProtectedRoute permission="MANAGE_USERS">
              <UsersPage />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<HomeRedirect />} />
      </Route>
    </Routes>
  );
}
